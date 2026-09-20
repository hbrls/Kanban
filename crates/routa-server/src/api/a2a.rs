//! A2A Protocol API
//!
//! /api/a2a/sessions - List active sessions
//! /api/a2a/rpc     - JSON-RPC endpoint + SSE stream
//! /api/a2a/card    - Agent card discovery

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use chrono::Utc;
use routa_core::models::task::{Task, TaskStatus};
use serde::Deserialize;
use std::convert::Infallible;
use std::time::Duration;
use tokio_stream::StreamExt as _;

use crate::error::ServerError;
use crate::state::AppState;

#[derive(Debug)]
enum A2AApiError {
    Server(ServerError),
    Unauthorized(String),
    Forbidden(String),
}

impl From<ServerError> for A2AApiError {
    fn from(error: ServerError) -> Self {
        Self::Server(error)
    }
}

impl IntoResponse for A2AApiError {
    fn into_response(self) -> Response {
        match self {
            Self::Server(error) => error.into_response(),
            Self::Unauthorized(message) => (
                StatusCode::UNAUTHORIZED,
                [("www-authenticate", "A2A-Session")],
                Json(serde_json::json!({ "error": message })),
            )
                .into_response(),
            Self::Forbidden(message) => (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({ "error": message })),
            )
                .into_response(),
        }
    }
}

#[derive(Debug)]
struct A2ARequestAuthority {
    session_id: String,
    workspace_id: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sessions", get(list_sessions))
        .route("/rpc", get(rpc_sse).post(rpc_handler))
        .route("/card", get(agent_card))
        .route("/message", axum::routing::post(send_message))
        .route("/tasks", get(list_tasks))
        .route("/tasks/{id}", get(get_task).post(update_task))
}

// ─── /api/a2a/sessions ────────────────────────────────────────────────

async fn list_sessions(
    State(state): State<AppState>,
    Query(query): Query<RpcQuery>,
) -> Result<Json<serde_json::Value>, A2AApiError> {
    let authority = require_session_authority(&state, query.session_id.as_deref(), None).await?;
    let sessions = state
        .acp_manager
        .get_session(&authority.session_id)
        .await
        .into_iter()
        .collect::<Vec<_>>();

    let a2a_sessions: Vec<serde_json::Value> = sessions
        .iter()
        .map(|s| {
            serde_json::json!({
                "id": s.session_id,
                "agentName": format!("routa-{}-{}", s.provider.as_deref().unwrap_or("agent"), &s.session_id[..8.min(s.session_id.len())]),
                "provider": s.provider.as_deref().unwrap_or("unknown"),
                "status": "connected",
                "capabilities": [
                    "initialize", "method_list",
                    "session/new", "session/prompt", "session/cancel", "session/load",
                    "list_agents", "create_agent", "delegate_task", "message_agent"
                ],
                "rpcUrl": format!("/api/a2a/rpc?sessionId={}", s.session_id),
                "eventStreamUrl": format!("/api/a2a/rpc?sessionId={}", s.session_id),
                "createdAt": s.created_at,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "sessions": a2a_sessions,
        "count": a2a_sessions.len(),
    })))
}

// ─── /api/a2a/card ────────────────────────────────────────────────────

async fn agent_card() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "name": "Routa Multi-Agent Coordinator",
        "description": "Multi-agent coordination platform with ACP and MCP support",
        "protocolVersion": "0.3.0",
        "version": "0.1.0",
        "url": "/api/a2a/rpc",
        "skills": [
            {
                "id": "coordination",
                "name": "Agent Coordination",
                "description": "Create, delegate tasks to, and coordinate multiple AI agents",
                "tags": ["coordination", "multi-agent", "orchestration"],
            },
            {
                "id": "acp-proxy",
                "name": "ACP Session Proxy",
                "description": "Proxy access to backend ACP agent sessions",
                "tags": ["acp", "session", "proxy"],
            }
        ],
        "capabilities": { "pushNotifications": true },
        "defaultInputModes": ["text"],
        "defaultOutputModes": ["text"],
        "additionalInterfaces": [{
            "url": "/api/a2a/rpc",
            "transport": "JSONRPC",
        }],
    }))
}

// ─── /api/a2a/rpc POST ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RpcQuery {
    session_id: Option<String>,
}

async fn rpc_handler(
    State(state): State<AppState>,
    Query(query): Query<RpcQuery>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, A2AApiError> {
    let method = body.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let id = body.get("id").cloned().unwrap_or(serde_json::json!(null));
    let params = body.get("params").cloned().unwrap_or_default();

    let claimed_workspace_id = claimed_workspace_id(method, &params);
    let authority = if matches!(method, "method_list" | "initialize") {
        None
    } else {
        Some(
            require_session_authority(&state, query.session_id.as_deref(), claimed_workspace_id)
                .await?,
        )
    };

    let result = match method {
        "method_list" => serde_json::json!({
            "methods": [
                "SendMessage", "GetTask", "ListTasks", "CancelTask",
                "method_list", "initialize",
                "session/new", "session/prompt", "session/cancel", "session/load",
                "list_agents", "create_agent", "delegate_task", "message_agent",
            ]
        }),

        "initialize" => serde_json::json!({
            "protocolVersion": "0.3.0",
            "agentInfo": { "name": "routa-a2a-bridge", "version": "0.1.0" },
            "capabilities": { "sessions": true, "coordination": true, "tasks": true },
        }),

        "SendMessage" => {
            let workspace_id = require_authority(authority.as_ref())?.workspace_id.clone();
            let prompt = extract_a2a_prompt(&params)?;
            let task_id = uuid::Uuid::new_v4().to_string();
            let context_id = params
                .get("message")
                .and_then(|value| value.get("contextId"))
                .and_then(|value| value.as_str())
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let title = prompt
                .lines()
                .find(|line| !line.trim().is_empty())
                .map(|line| truncate_text(line.trim(), 80))
                .filter(|line| !line.is_empty())
                .unwrap_or_else(|| "A2A task".to_string());

            let task = Task::new(
                task_id.clone(),
                title,
                prompt,
                workspace_id,
                Some(context_id.clone()),
                None,
                None,
                None,
                None,
                None,
                None,
            );
            state.task_store.save(&task).await?;

            let state_clone = state.clone();
            let task_id_clone = task_id.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(200)).await;
                let _ = state_clone
                    .task_store
                    .update_status(&task_id_clone, &TaskStatus::Completed)
                    .await;
            });

            build_a2a_task_payload(&task, "submitted", Some(Utc::now().to_rfc3339()))
        }

        "GetTask" => {
            let task_id = params
                .get("id")
                .and_then(|value| value.as_str())
                .ok_or_else(|| ServerError::BadRequest("Missing task id".into()))?;
            let workspace_id = &require_authority(authority.as_ref())?.workspace_id;
            let task = get_task_in_workspace(&state, task_id, workspace_id).await?;
            build_a2a_task_payload(
                &task,
                map_task_status_to_a2a_state(&task.status),
                Some(task.updated_at.to_rfc3339()),
            )
        }

        "ListTasks" => {
            let workspace_id = &require_authority(authority.as_ref())?.workspace_id;
            let tasks = state.task_store.list_by_workspace(workspace_id).await?;
            serde_json::json!({
                "tasks": tasks
                    .iter()
                    .map(|task| {
                        build_a2a_task_payload(
                            task,
                            map_task_status_to_a2a_state(&task.status),
                            Some(task.updated_at.to_rfc3339()),
                        )["task"].clone()
                    })
                    .collect::<Vec<_>>()
            })
        }

        "CancelTask" => {
            let task_id = params
                .get("id")
                .and_then(|value| value.as_str())
                .ok_or_else(|| ServerError::BadRequest("Missing task id".into()))?;
            let workspace_id = &require_authority(authority.as_ref())?.workspace_id;
            get_task_in_workspace(&state, task_id, workspace_id).await?;
            state
                .task_store
                .update_status(task_id, &TaskStatus::Cancelled)
                .await?;
            let task = get_task_in_workspace(&state, task_id, workspace_id).await?;
            build_a2a_task_payload(&task, "canceled", Some(task.updated_at.to_rfc3339()))
        }

        "list_agents" => {
            let workspace_id = &require_authority(authority.as_ref())?.workspace_id;
            let agents = state.agent_store.list_by_workspace(workspace_id).await?;
            serde_json::json!({ "agents": agents })
        }

        "create_agent" => {
            let name = params
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| ServerError::BadRequest("Missing name".into()))?;
            let role = params
                .get("role")
                .and_then(|v| v.as_str())
                .ok_or_else(|| ServerError::BadRequest("Missing role".into()))?;
            let workspace_id = &require_authority(authority.as_ref())?.workspace_id;

            let agent_role = crate::models::agent::AgentRole::from_str(role)
                .ok_or_else(|| ServerError::BadRequest(format!("Invalid role: {role}")))?;

            let agent = crate::models::agent::Agent::new(
                uuid::Uuid::new_v4().to_string(),
                name.to_string(),
                agent_role,
                workspace_id.clone(),
                None,
                None,
                None,
            );
            state.agent_store.save(&agent).await?;
            serde_json::json!({ "success": true, "agentId": agent.id })
        }

        "delegate_task" | "message_agent" => {
            // Acknowledge and return stub
            serde_json::json!({
                "status": "forwarded",
                "sessionId": query.session_id,
                "method": method,
                "message": "Request forwarded to backend session",
            })
        }

        _ => {
            return Ok(Json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": format!("Unknown method: {}", method) }
            })));
        }
    };

    Ok(Json(serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    })))
}

// ─── /api/a2a/rpc GET (SSE) ──────────────────────────────────────────

async fn rpc_sse(
    State(state): State<AppState>,
    Query(query): Query<RpcQuery>,
) -> Result<Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>>, A2AApiError> {
    let session_id = require_session_authority(&state, query.session_id.as_deref(), None)
        .await?
        .session_id;

    let connected_event = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "notification",
        "params": {
            "type": "connected",
            "sessionId": session_id,
            "message": "A2A event stream connected",
        }
    });

    let initial = tokio_stream::once(Ok::<_, Infallible>(
        Event::default().data(connected_event.to_string()),
    ));

    let heartbeat = tokio_stream::wrappers::IntervalStream::new(tokio::time::interval(
        std::time::Duration::from_secs(30),
    ))
    .map(|_| Ok(Event::default().comment("keep-alive")));

    let stream = initial.chain(heartbeat);

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

// ─── /api/a2a/message ────────────────────────────────────────────────

/// POST /api/a2a/message — Send a message via the A2A protocol
async fn send_message(
    State(state): State<AppState>,
    Query(query): Query<RpcQuery>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, A2AApiError> {
    let authority = require_session_authority(&state, query.session_id.as_deref(), None).await?;
    let method = body
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("sendMessage");

    let session_id = &authority.session_id;

    Ok(Json(serde_json::json!({
        "jsonrpc": "2.0",
        "id": body.get("id"),
        "result": {
            "status": "accepted",
            "method": method,
            "sessionId": session_id,
        }
    })))
}

// ─── /api/a2a/tasks ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TasksQuery {
    session_id: Option<String>,
    workspace_id: Option<String>,
}

/// GET /api/a2a/tasks — List A2A tasks (mapped from Routa tasks)
async fn list_tasks(
    State(state): State<AppState>,
    Query(q): Query<TasksQuery>,
) -> Result<Json<serde_json::Value>, A2AApiError> {
    let authority =
        require_session_authority(&state, q.session_id.as_deref(), q.workspace_id.as_deref())
            .await?;
    let tasks = state
        .task_store
        .list_by_workspace(&authority.workspace_id)
        .await?;
    Ok(Json(serde_json::json!({ "tasks": tasks })))
}

/// GET /api/a2a/tasks/{id} — Get an A2A task by ID
async fn get_task(
    State(state): State<AppState>,
    Query(q): Query<TasksQuery>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, A2AApiError> {
    let authority =
        require_session_authority(&state, q.session_id.as_deref(), q.workspace_id.as_deref())
            .await?;
    let task = get_task_in_workspace(&state, &id, &authority.workspace_id).await?;
    Ok(Json(serde_json::json!(task)))
}

/// POST /api/a2a/tasks/{id} — Update / respond to an A2A task
async fn update_task(
    State(state): State<AppState>,
    Query(q): Query<TasksQuery>,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, A2AApiError> {
    let authority =
        require_session_authority(&state, q.session_id.as_deref(), q.workspace_id.as_deref())
            .await?;
    get_task_in_workspace(&state, &id, &authority.workspace_id).await?;
    if let Some(status) = body.get("status").and_then(|v| v.as_str()) {
        let task_status = crate::models::task::TaskStatus::from_str(status)
            .ok_or_else(|| ServerError::BadRequest(format!("Invalid status: {status}")))?;
        state.task_store.update_status(&id, &task_status).await?;
        Ok(Json(
            serde_json::json!({ "updated": true, "id": id, "status": status }),
        ))
    } else {
        Ok(Json(
            serde_json::json!({ "updated": false, "id": id, "message": "No status change requested" }),
        ))
    }
}

async fn require_session_authority(
    state: &AppState,
    session_id: Option<&str>,
    claimed_workspace_id: Option<&str>,
) -> Result<A2ARequestAuthority, A2AApiError> {
    let session_id = session_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| A2AApiError::Unauthorized("A2A session authority is required".into()))?;
    let workspace_id = if let Some(session) = state.acp_manager.get_session(session_id).await {
        session.workspace_id
    } else {
        state
            .acp_session_store
            .get(session_id)
            .await?
            .map(|session| session.workspace_id)
            .ok_or_else(|| A2AApiError::Unauthorized("A2A session authority is invalid".into()))?
    };

    if claimed_workspace_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some_and(|claimed| claimed != workspace_id)
    {
        return Err(A2AApiError::Forbidden(
            "The requested workspace is outside the A2A session authority".into(),
        ));
    }

    Ok(A2ARequestAuthority {
        session_id: session_id.to_string(),
        workspace_id,
    })
}

fn require_authority(
    authority: Option<&A2ARequestAuthority>,
) -> Result<&A2ARequestAuthority, A2AApiError> {
    authority.ok_or_else(|| A2AApiError::Unauthorized("A2A session authority is required".into()))
}

fn claimed_workspace_id<'a>(method: &str, params: &'a serde_json::Value) -> Option<&'a str> {
    if method == "SendMessage" {
        params
            .get("metadata")
            .and_then(|metadata| metadata.get("workspaceId"))
            .and_then(|value| value.as_str())
    } else {
        params.get("workspaceId").and_then(|value| value.as_str())
    }
}

async fn get_task_in_workspace(
    state: &AppState,
    task_id: &str,
    workspace_id: &str,
) -> Result<Task, A2AApiError> {
    let task = state
        .task_store
        .get(task_id)
        .await?
        .filter(|task| task.workspace_id == workspace_id)
        .ok_or_else(|| ServerError::NotFound(format!("Task {task_id} not found")))?;
    Ok(task)
}

fn extract_a2a_prompt(params: &serde_json::Value) -> Result<String, ServerError> {
    let parts = params
        .get("message")
        .and_then(|value| value.get("parts"))
        .and_then(|value| value.as_array())
        .ok_or_else(|| ServerError::BadRequest("Missing message parts".into()))?;
    let prompt = parts
        .iter()
        .filter_map(|part| part.get("text").and_then(|value| value.as_str()))
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if prompt.is_empty() {
        return Err(ServerError::BadRequest(
            "A2A message must contain at least one text part".into(),
        ));
    }
    Ok(prompt)
}

fn truncate_text(text: &str, max_len: usize) -> String {
    if text.chars().count() <= max_len {
        return text.to_string();
    }
    text.chars().take(max_len).collect()
}

fn map_task_status_to_a2a_state(status: &TaskStatus) -> &'static str {
    match status {
        TaskStatus::Completed => "completed",
        TaskStatus::Cancelled => "canceled",
        TaskStatus::Blocked | TaskStatus::NeedsFix => "failed",
        TaskStatus::Pending => "submitted",
        TaskStatus::InProgress | TaskStatus::ReviewRequired => "working",
    }
}

fn build_a2a_task_payload(
    task: &Task,
    state: &str,
    timestamp: Option<String>,
) -> serde_json::Value {
    let timestamp = timestamp.unwrap_or_else(|| Utc::now().to_rfc3339());
    serde_json::json!({
        "task": {
            "id": task.id,
            "contextId": task.session_id,
            "status": {
                "state": state,
                "timestamp": timestamp,
            },
            "history": [{
                "messageId": format!("msg-{}", task.id),
                "role": "user",
                "parts": [{ "text": task.objective }],
                "contextId": task.session_id,
                "taskId": task.id,
            }],
            "artifacts": [],
            "metadata": {
                "workspaceId": task.workspace_id,
                "columnId": task.column_id,
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::{Query, State};
    use routa_core::db::Database;
    use routa_core::models::workspace::Workspace;
    use routa_core::state::AppStateInner;
    use routa_core::store::acp_session_store::CreateAcpSessionParams;
    use serde_json::json;
    use std::sync::Arc;

    async fn test_state() -> AppState {
        let state = Arc::new(AppStateInner::new(
            Database::open_in_memory().expect("in-memory database"),
        ));
        for (workspace_id, title) in [("ws-alice", "Alice"), ("ws-bob", "Bob")] {
            state
                .workspace_store
                .save(&Workspace::new(
                    workspace_id.to_string(),
                    title.to_string(),
                    None,
                ))
                .await
                .expect("persist workspace");
        }
        for (session_id, workspace_id) in [("alice-session", "ws-alice"), ("bob-session", "ws-bob")]
        {
            state
                .acp_session_store
                .create(CreateAcpSessionParams {
                    id: session_id,
                    cwd: "/tmp",
                    branch: None,
                    workspace_id,
                    provider: Some("test"),
                    role: Some("ROUTA"),
                    custom_command: None,
                    custom_args: None,
                    parent_session_id: None,
                })
                .await
                .expect("persist session authority");
        }
        state
    }

    fn task(id: &str, workspace_id: &str) -> Task {
        Task::new(
            id.to_string(),
            format!("{workspace_id} task"),
            "authority regression".to_string(),
            workspace_id.to_string(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
    }

    #[tokio::test]
    async fn persisted_session_defines_workspace_authority() {
        let state = test_state().await;

        let bob = require_session_authority(&state, Some("bob-session"), None)
            .await
            .expect("Bob authority");
        assert_eq!(bob.workspace_id, "ws-bob");

        let error = require_session_authority(&state, Some("bob-session"), Some("ws-alice"))
            .await
            .expect_err("caller metadata cannot widen authority");
        assert!(matches!(error, A2AApiError::Forbidden(_)));
    }

    #[tokio::test]
    async fn bob_cannot_get_or_cancel_alice_task() {
        let state = test_state().await;
        let alice_task = task("alice-task", "ws-alice");
        state
            .task_store
            .save(&alice_task)
            .await
            .expect("save Alice task");

        let response = rpc_handler(
            State(state.clone()),
            Query(RpcQuery {
                session_id: Some("bob-session".to_string()),
            }),
            Json(json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "CancelTask",
                "params": { "id": "alice-task" },
            })),
        )
        .await;

        assert!(matches!(
            response,
            Err(A2AApiError::Server(ServerError::NotFound(_)))
        ));
        let persisted = state
            .task_store
            .get("alice-task")
            .await
            .expect("read task")
            .expect("Alice task exists");
        assert_eq!(persisted.status, TaskStatus::Pending);
    }

    #[tokio::test]
    async fn list_tasks_only_returns_the_authorized_workspace() {
        let state = test_state().await;
        state
            .task_store
            .save(&task("alice-task", "ws-alice"))
            .await
            .expect("save Alice task");
        state
            .task_store
            .save(&task("bob-task", "ws-bob"))
            .await
            .expect("save Bob task");

        let Json(response) = rpc_handler(
            State(state),
            Query(RpcQuery {
                session_id: Some("bob-session".to_string()),
            }),
            Json(json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "ListTasks",
                "params": { "workspaceId": "ws-bob" },
            })),
        )
        .await
        .expect("list Bob tasks");

        let tasks = response["result"]["tasks"].as_array().expect("tasks array");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0]["id"].as_str(), Some("bob-task"));
    }
}
