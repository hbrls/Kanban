use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, patch, post},
    Json, Router,
};
use serde::Deserialize;

use crate::api::repo_context::{
    canonical_repo_path_for_response, normalize_local_repo_path, validate_local_git_repo_path,
    validate_repo_path,
};
use crate::error::ServerError;
use crate::models::codebase::{Codebase, CodebaseSourceType};
use crate::state::AppState;

fn repo_label_from_path(repo_path: &str) -> String {
    std::path::Path::new(repo_path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| repo_path.to_string())
}

fn should_set_new_codebase_as_default(has_existing_default: bool, requested_default: bool) -> bool {
    requested_default || !has_existing_default
}

fn normalize_codebase_for_response(mut codebase: Codebase) -> Codebase {
    codebase.repo_path = canonical_repo_path_for_response(&codebase.repo_path);
    codebase
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/workspaces/{workspace_id}/codebases",
            get(list_codebases).post(add_codebase),
        )
        .route(
            "/workspaces/{workspace_id}/codebases/{codebase_id}",
            axum::routing::delete(delete_workspace_codebase),
        )
        .route(
            "/workspaces/{workspace_id}/codebases/changes",
            get(list_codebase_changes),
        )
        .nest(
            "/workspaces/{workspace_id}/codebases/{codebase_id}/git",
            crate::api::git::router(),
        )
        .route(
            "/codebases/{id}",
            patch(update_codebase).delete(delete_codebase),
        )
        .route("/codebases/{id}/default", post(set_default_codebase))
}

async fn list_codebases(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let codebases = state
        .codebase_store
        .list_by_workspace(&workspace_id)
        .await?
        .into_iter()
        .map(normalize_codebase_for_response)
        .collect::<Vec<_>>();
    Ok(Json(serde_json::json!({ "codebases": codebases })))
}

async fn list_codebase_changes(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let codebases = state
        .codebase_store
        .list_by_workspace(&workspace_id)
        .await?;

    let repos = codebases
        .into_iter()
        .map(|codebase| {
            let repo_path = canonical_repo_path_for_response(&codebase.repo_path);
            let label = codebase
                .label
                .clone()
                .unwrap_or_else(|| repo_label_from_path(&repo_path));

            if repo_path.is_empty() {
                return serde_json::json!({
                    "codebaseId": codebase.id,
                    "repoPath": repo_path,
                    "label": label,
                    "branch": codebase.branch.unwrap_or_else(|| "unknown".to_string()),
                    "status": { "clean": true, "ahead": 0, "behind": 0, "modified": 0, "untracked": 0 },
                    "files": [],
                    "error": "Missing repository path",
                });
            }

            if !crate::git::is_git_repository(&repo_path) {
                return serde_json::json!({
                    "codebaseId": codebase.id,
                    "repoPath": repo_path,
                    "label": label,
                    "branch": codebase.branch.unwrap_or_else(|| "unknown".to_string()),
                    "status": { "clean": true, "ahead": 0, "behind": 0, "modified": 0, "untracked": 0 },
                    "files": [],
                    "error": "Repository is missing or not a git repository",
                });
            }

            let changes = crate::git::get_repo_changes(&repo_path);
            serde_json::json!({
                "codebaseId": codebase.id,
                "repoPath": repo_path,
                "label": label,
                "branch": changes.branch,
                "status": changes.status,
                "files": changes.files,
            })
        })
        .collect::<Vec<_>>();

    Ok(Json(serde_json::json!({
        "workspaceId": workspace_id,
        "repos": repos,
    })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCodebaseRequest {
    repo_path: String,
    branch: Option<String>,
    label: Option<String>,
    source_type: Option<CodebaseSourceType>,
    source_url: Option<String>,
    #[serde(default)]
    is_default: bool,
}

async fn add_codebase(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
    Json(body): Json<AddCodebaseRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ServerError> {
    let source_type = body.source_type.unwrap_or(CodebaseSourceType::Local);
    let repo_path = normalize_local_repo_path(&body.repo_path);
    match source_type {
        CodebaseSourceType::Local => validate_local_git_repo_path(&repo_path)?,
        CodebaseSourceType::Github => validate_repo_path(&repo_path, "Path ")?,
    }
    let repo_path = repo_path.to_string_lossy().to_string();

    // Check for duplicate repo_path within the workspace
    if let Some(_existing) = state
        .codebase_store
        .find_by_repo_path(&workspace_id, &repo_path)
        .await?
    {
        return Err(ServerError::Conflict(
            "Codebase with this repoPath already exists in the workspace".to_string(),
        ));
    }

    let has_existing_default = state
        .codebase_store
        .get_default(&workspace_id)
        .await?
        .is_some();
    let should_set_default =
        should_set_new_codebase_as_default(has_existing_default, body.is_default);

    let codebase = Codebase::new(
        uuid::Uuid::new_v4().to_string(),
        workspace_id,
        repo_path,
        body.branch,
        body.label,
        false,
        Some(source_type),
        body.source_url,
    );

    state.codebase_store.save(&codebase).await?;

    if should_set_default {
        state
            .codebase_store
            .set_default(&codebase.workspace_id, &codebase.id)
            .await?;
    }

    let saved_codebase = state
        .codebase_store
        .get(&codebase.id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("Codebase {} not found", codebase.id)))?;

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "codebase": saved_codebase })),
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCodebaseRequest {
    branch: Option<String>,
    label: Option<String>,
    repo_path: Option<String>,
    source_type: Option<CodebaseSourceType>,
    source_url: Option<String>,
}

async fn update_codebase(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(body): Json<UpdateCodebaseRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let existing = state
        .codebase_store
        .get(&id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("Codebase {id} not found")))?;
    let requested_source_type = body
        .source_type
        .clone()
        .or_else(|| existing.source_type.clone())
        .unwrap_or(CodebaseSourceType::Local);

    let repo_path = if let Some(repo_path) = body.repo_path.as_deref() {
        let normalized = normalize_local_repo_path(repo_path);
        match requested_source_type {
            CodebaseSourceType::Local => validate_local_git_repo_path(&normalized)?,
            CodebaseSourceType::Github => validate_repo_path(&normalized, "Path ")?,
        }
        let normalized = normalized.to_string_lossy().to_string();

        if let Some(duplicate) = state
            .codebase_store
            .find_by_repo_path(&existing.workspace_id, &normalized)
            .await?
        {
            if duplicate.id != id {
                return Err(ServerError::Conflict(
                    "Codebase with this repoPath already exists in the workspace".to_string(),
                ));
            }
        }

        Some(normalized)
    } else {
        None
    };

    state
        .codebase_store
        .update(
            &id,
            body.branch.as_deref(),
            body.label.as_deref(),
            repo_path.as_deref(),
            body.source_type.as_ref().map(CodebaseSourceType::as_str),
            body.source_url.as_deref(),
        )
        .await?;

    let codebase = state
        .codebase_store
        .get(&id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("Codebase {id} not found")))?;

    Ok(Json(serde_json::json!({ "codebase": codebase })))
}

async fn delete_codebase(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    delete_codebase_by_id(&state, &id, None).await
}

async fn delete_workspace_codebase(
    State(state): State<AppState>,
    axum::extract::Path((workspace_id, codebase_id)): axum::extract::Path<(String, String)>,
) -> Result<Json<serde_json::Value>, ServerError> {
    delete_codebase_by_id(&state, &codebase_id, Some(&workspace_id)).await
}

async fn delete_codebase_by_id(
    state: &AppState,
    id: &str,
    workspace_id: Option<&str>,
) -> Result<Json<serde_json::Value>, ServerError> {
    // Clean up worktrees on disk before deleting the codebase
    let codebase = state.codebase_store.get(id).await?;
    if let Some(codebase) = codebase {
        if workspace_id.is_some_and(|workspace_id| codebase.workspace_id != workspace_id) {
            return Err(ServerError::NotFound("Codebase not found".to_string()));
        }

        let repo_path = &codebase.repo_path;

        // Acquire repo lock to prevent races with concurrent worktree operations
        let lock = {
            let mut locks = crate::api::worktrees::get_repo_locks().lock().await;
            locks
                .entry(repo_path.to_string())
                .or_insert_with(|| std::sync::Arc::new(tokio::sync::Mutex::new(())))
                .clone()
        };
        let _guard = lock.lock().await;

        let worktrees = state
            .worktree_store
            .list_by_codebase(id)
            .await
            .map_err(|e| ServerError::Internal(format!("Failed to list worktrees: {e}")))?;
        for wt in &worktrees {
            if let Err(e) = crate::git::worktree_remove(repo_path, &wt.worktree_path, true) {
                tracing::warn!(
                    "[Codebase DELETE] Failed to remove worktree {}: {}",
                    wt.id,
                    e
                );
            }
        }
        if !worktrees.is_empty() {
            let _ = crate::git::worktree_prune(repo_path);
        }
    } else if workspace_id.is_some() {
        return Err(ServerError::NotFound("Codebase not found".to_string()));
    }

    state.codebase_store.delete(id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

async fn set_default_codebase(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let codebase = state
        .codebase_store
        .get(&id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("Codebase {id} not found")))?;

    state
        .codebase_store
        .set_default(&codebase.workspace_id, &id)
        .await?;

    let updated = state
        .codebase_store
        .get(&id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("Codebase {id} not found")))?;

    Ok(Json(serde_json::json!({ "codebase": updated })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_codebase_becomes_default_when_workspace_has_no_default() {
        assert!(should_set_new_codebase_as_default(false, false));
    }

    #[test]
    fn requested_default_overrides_existing_default_presence() {
        assert!(should_set_new_codebase_as_default(true, true));
        assert!(!should_set_new_codebase_as_default(true, false));
    }
}
