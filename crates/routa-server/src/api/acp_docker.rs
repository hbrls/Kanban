//! Docker-based ACP agent API routes.
//!
//! Provides endpoints for Docker environment status, image management,
//! and Docker-based agent execution.

use axum::{
    extract::{Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::error::ServerError;
use crate::state::AppState;
use routa_core::acp::docker::{DockerContainerConfig, DockerStatus};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/status", get(docker_status))
        .route("/pull", post(docker_pull))
        .route("/containers", get(list_containers))
        .route("/container/start", post(start_container))
        .route("/container/stop", post(stop_container))
}

/// Query params for Docker status.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerStatusQuery {
    #[serde(default)]
    force_refresh: bool,
}

/// GET /api/acp/docker/status — Check Docker availability.
async fn docker_status(
    State(state): State<AppState>,
    Query(query): Query<DockerStatusQuery>,
) -> Result<Json<DockerStatus>, ServerError> {
    let status = state
        .docker_state
        .detector
        .check_availability(query.force_refresh)
        .await;

    Ok(Json(status))
}

/// Request body for Docker image pull.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DockerPullRequest {
    pub image: String,
}

/// POST /api/acp/docker/pull — Pull a Docker image.
async fn docker_pull(
    State(state): State<AppState>,
    Json(body): Json<DockerPullRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let result = state.docker_state.detector.pull_image(&body.image).await;

    Ok(Json(serde_json::json!({
        "ok": result.ok,
        "image": result.image,
        "output": result.output,
        "error": result.error,
    })))
}

/// GET /api/acp/docker/containers — List running Docker containers.
async fn list_containers(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let containers = state.docker_state.process_manager.list_containers().await;

    Ok(Json(serde_json::json!({
        "containers": containers,
    })))
}

/// Request body for starting a Docker container.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartContainerRequest {
    pub session_id: String,
    pub image: String,
    pub workspace_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_json: Option<String>,
}

/// POST /api/acp/docker/container/start — Start a Docker container for an agent session.
async fn start_container(
    State(state): State<AppState>,
    Json(body): Json<StartContainerRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let config = DockerContainerConfig {
        session_id: body.session_id.clone(),
        image: body.image,
        workspace_path: body.workspace_path,
        env: None,
        additional_volumes: None,
        labels: None,
        container_port: None,
        auth_json: body.auth_json,
    };

    match state
        .docker_state
        .process_manager
        .start_container(config)
        .await
    {
        Ok(info) => Ok(Json(serde_json::json!({
            "ok": true,
            "container": info,
        }))),
        Err(e) => Ok(Json(serde_json::json!({
            "ok": false,
            "error": e,
        }))),
    }
}

/// Request body for stopping a Docker container.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StopContainerRequest {
    pub session_id: String,
}

/// POST /api/acp/docker/container/stop — Stop a Docker container.
async fn stop_container(
    State(state): State<AppState>,
    Json(body): Json<StopContainerRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    match state
        .docker_state
        .process_manager
        .stop_container(&body.session_id)
        .await
    {
        Ok(()) => Ok(Json(serde_json::json!({ "ok": true }))),
        Err(e) => Ok(Json(serde_json::json!({ "ok": false, "error": e }))),
    }
}
