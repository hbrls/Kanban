use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use routa_core::spec_detector::detect_spec_sources;
use serde_json::Value;

use crate::api::repo_context::{resolve_repo_root, RepoContextQuery, ResolveRepoRootOptions};
use crate::error::ServerError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
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
