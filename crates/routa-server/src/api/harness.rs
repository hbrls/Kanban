use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use routa_core::spec_detector::detect_spec_sources;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::harness_instructions_audit::run_instruction_audit;
use crate::api::repo_context::{json_error, read_to_string, resolve_repo_root, RepoContextQuery, ResolveRepoRootOptions};
use crate::error::ServerError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/instructions", get(get_harness_instructions))
        .route("/spec-sources", get(get_spec_sources))
}

async fn get_spec_sources(
    State(state): State<AppState>,
    Query(query): Query<RepoContextQuery>,
) -> Result<Json<Value>, ServerError> {
    let repo_root = resolve_repo_root(
        &state,
        query.workspace_id.as_deref(),
        query.codebase_id.as_deref(),
        query.repo_path.as_deref(),
        "Missing spec sources context. Provide workspaceId, codebaseId, or repoPath.",
        ResolveRepoRootOptions::default(),
    )
    .await?;

    let report = detect_spec_sources(&repo_root).map_err(ServerError::Internal)?;
    Ok(Json(serde_json::to_value(report).map_err(|error| {
        ServerError::Internal(format!("Failed to serialize report: {error}"))
    })?))
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstructionsQuery {
    workspace_id: Option<String>,
    codebase_id: Option<String>,
    repo_path: Option<String>,
    include_audit: Option<String>,
    audit_provider: Option<String>,
}

async fn get_harness_instructions(
    State(state): State<AppState>,
    Query(query): Query<InstructionsQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let include_audit = parse_bool_param(query.include_audit.as_deref());
    let audit_provider = query
        .audit_provider
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .or_else(|| {
            std::env::var("HARNESS_INSTRUCTION_AUDIT_PROVIDER")
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| "codex".to_string());
    let workspace_id = query
        .workspace_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("default")
        .to_string();

    let repo_root = resolve_repo_root(
        &state,
        query.workspace_id.as_deref(),
        query.codebase_id.as_deref(),
        query.repo_path.as_deref(),
        "缺少 harness 上下文，请提供 workspaceId / codebaseId / repoPath 之一",
        ResolveRepoRootOptions::default(),
    )
    .await
    .map_err(map_context_error(
        "Harness 指导文档上下文无效",
        "读取 Harness 指导文档失败",
    ))?;

    for file_name in ["CLAUDE.md", "AGENTS.md"] {
        let absolute_path = repo_root.join(file_name);
        if absolute_path.is_file() {
            let source = read_to_string(&absolute_path)
                .map_err(map_internal_error("读取 Harness 指导文档失败"))?;
            let relative_path = absolute_path
                .strip_prefix(&repo_root)
                .unwrap_or(&absolute_path)
                .to_string_lossy()
                .to_string();
            let audit = if include_audit {
                run_instruction_audit(&repo_root, &workspace_id, &source, &audit_provider).await
            } else {
                Value::Null
            };
            return Ok(Json(json!({
                "generatedAt": chrono::Utc::now().to_rfc3339(),
                "repoRoot": repo_root,
                "fileName": file_name,
                "relativePath": relative_path,
                "source": source,
                "fallbackUsed": file_name != "CLAUDE.md",
                "audit": audit,
            })));
        }
    }

    Err((
        StatusCode::NOT_FOUND,
        Json(json!({
            "error": "未找到仓库指导文档",
            "details": "Expected one of: CLAUDE.md, AGENTS.md",
        })),
    ))
}

fn parse_bool_param(value: Option<&str>) -> bool {
    value
        .map(str::trim)
        .map(str::to_lowercase)
        .is_some_and(|normalized| matches!(normalized.as_str(), "1" | "true" | "yes" | "on"))
}

fn map_context_error(
    public_error: &'static str,
    internal_error: &'static str,
) -> impl Fn(ServerError) -> (StatusCode, Json<Value>) + Clone {
    move |error| match error {
        ServerError::BadRequest(details) => (
            StatusCode::BAD_REQUEST,
            Json(json_error(public_error, details)),
        ),
        other => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json_error(internal_error, other.to_string())),
        ),
    }
}

fn map_internal_error(
    public_error: &'static str,
) -> impl Fn(ServerError) -> (StatusCode, Json<Value>) + Clone {
    move |error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json_error(public_error, error.to_string())),
        )
    }
}
