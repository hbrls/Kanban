//! MCP Tools API - /api/mcp/tools
//!
//! GET  /api/mcp/tools - List all MCP tool definitions
//! POST /api/mcp/tools - Execute a specific tool by name

use axum::{
    extract::{Query, State},
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::error::ServerError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(list_tools)
            .post(execute_tool)
            .patch(update_tools_config),
    )
}

async fn list_tools(State(_state): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "tools": super::mcp_routes::build_tool_list_public()
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecuteToolRequest {
    name: Option<String>,
    args: Option<serde_json::Value>,
    workspace_id: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecuteToolQuery {
    #[serde(rename = "wsId")]
    ws_id: Option<String>,
}

async fn execute_tool(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ExecuteToolQuery>,
    Json(body): Json<ExecuteToolRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let name = body
        .name
        .as_deref()
        .ok_or_else(|| ServerError::BadRequest("Tool name is required".into()))?;

    let mut args = body.args.unwrap_or(serde_json::json!({}));
    let workspace_id = args
        .get("workspaceId")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or(body.workspace_id)
        .or_else(|| {
            headers
                .get("routa-workspace-id")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .or(query.ws_id);
    if let Some(workspace_id) = workspace_id.as_deref() {
        super::mcp_routes::inject_workspace_id(&mut args, workspace_id);
    }

    let normalized_name = super::mcp_routes::normalize_tool_name_public(name);
    let known_tool = super::mcp_routes::build_tool_list_public()
        .iter()
        .filter_map(|tool| tool.get("name").and_then(|value| value.as_str()))
        .any(|tool_name| tool_name == normalized_name);

    if !known_tool {
        return Err(ServerError::BadRequest(format!("Unknown tool: {name}")));
    }

    let result = super::mcp_routes::execute_tool_public(&state, normalized_name, &args).await;
    Ok(Json(result))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct UpdateToolsConfigRequest {
    enabled: Option<Vec<String>>,
    disabled: Option<Vec<String>>,
}

/// PATCH /api/mcp/tools — Update tool enable/disable config (no-op stub; config not persisted)
async fn update_tools_config(
    Json(_body): Json<UpdateToolsConfigRequest>,
) -> Json<serde_json::Value> {
    // Tool configuration is stateless in the embedded Rust backend.
    // This endpoint exists for API parity; changes take effect transiently.
    Json(serde_json::json!({ "updated": true }))
}
