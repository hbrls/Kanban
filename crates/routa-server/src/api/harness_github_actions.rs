use std::path::Path;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};

use crate::api::repo_context::{
    json_error, resolve_repo_root, RepoContextQuery, ResolveRepoRootOptions,
};
use crate::error::ServerError;
use crate::state::AppState;

pub async fn get_github_actions(
    State(state): State<AppState>,
    Query(query): Query<RepoContextQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
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
        "GitHub Actions 上下文无效",
        "读取 GitHub Actions workflows 失败",
    ))?;

    let workflows_dir = repo_root.join(".github/workflows");
    if !workflows_dir.is_dir() {
        return Ok(Json(json!({
            "generatedAt": chrono::Utc::now().to_rfc3339(),
            "repoRoot": repo_root,
            "workflowsDir": workflows_dir,
            "flows": [],
            "warnings": ["No \".github/workflows\" directory found for this repository."],
        })));
    }

    let mut flows = Vec::new();
    let mut warnings = Vec::new();
    let entries = std::fs::read_dir(&workflows_dir)
        .map_err(map_io_error("读取 GitHub Actions workflows 失败"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !path.is_file() || !(name.ends_with(".yaml") || name.ends_with(".yml")) {
            continue;
        }

        match parse_workflow_flow(&repo_root, &path) {
            Ok(Some(flow)) => flows.push(flow),
            Ok(None) => warnings.push(format!(
                "Skipped {name} because it does not define any jobs."
            )),
            Err(error) => warnings.push(format!("Failed to parse {name}: {error}")),
        }
    }

    Ok(Json(json!({
        "generatedAt": chrono::Utc::now().to_rfc3339(),
        "repoRoot": repo_root,
        "workflowsDir": workflows_dir,
        "flows": flows,
        "warnings": warnings,
    })))
}

fn parse_workflow_flow(repo_root: &Path, path: &Path) -> Result<Option<Value>, String> {
    let source = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    let parsed =
        serde_yaml::from_str::<serde_yaml::Value>(&source).map_err(|error| error.to_string())?;
    let trigger = parsed.get("on").or_else(|| parsed.get("true"));
    let event = summarize_event(trigger);
    let jobs = parsed
        .get("jobs")
        .and_then(serde_yaml::Value::as_mapping)
        .map(|jobs| {
            jobs.iter()
                .filter_map(|(job_id, job)| {
                    let job_id = job_id.as_str()?;
                    let job = job.as_mapping()?;
                    Some(json!({
                        "id": job_id,
                        "name": yaml_str(job.get(serde_yaml::Value::String("name".to_string()))).unwrap_or(job_id),
                        "runner": summarize_runner(job.get(serde_yaml::Value::String("runs-on".to_string()))),
                        "kind": infer_job_kind(job),
                        "stepCount": job.get(serde_yaml::Value::String("steps".to_string())).and_then(serde_yaml::Value::as_sequence).map(|steps| steps.len()),
                        "needs": normalize_yaml_string_list(job.get(serde_yaml::Value::String("needs".to_string()))),
                    }))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if jobs.is_empty() {
        return Ok(None);
    }

    let id = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("workflow");
    let relative_path = path
        .strip_prefix(repo_root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();
    Ok(Some(json!({
        "id": id,
        "name": parsed.get("name").and_then(serde_yaml::Value::as_str).unwrap_or(id),
        "event": event,
        "yaml": source,
        "jobs": jobs,
        "relativePath": relative_path,
    })))
}

fn summarize_runner(value: Option<&serde_yaml::Value>) -> String {
    match value {
        Some(serde_yaml::Value::String(value)) if !value.trim().is_empty() => {
            value.trim().to_string()
        }
        Some(serde_yaml::Value::Sequence(values)) => {
            let parts = values
                .iter()
                .filter_map(serde_yaml::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>();
            if parts.is_empty() {
                "unspecified".to_string()
            } else {
                parts.join(" + ")
            }
        }
        Some(serde_yaml::Value::Mapping(_)) => "expression".to_string(),
        _ => "unspecified".to_string(),
    }
}

fn infer_job_kind(job: &serde_yaml::Mapping) -> &'static str {
    if job.contains_key(serde_yaml::Value::String("environment".to_string())) {
        "approval"
    } else if summarize_runner(job.get(serde_yaml::Value::String("runs-on".to_string())))
        .to_lowercase()
        .contains("release")
    {
        "release"
    } else {
        "job"
    }
}

fn summarize_event(value: Option<&serde_yaml::Value>) -> String {
    match value {
        Some(serde_yaml::Value::String(value)) => value.to_string(),
        Some(serde_yaml::Value::Sequence(values)) => values
            .iter()
            .filter_map(serde_yaml::Value::as_str)
            .collect::<Vec<_>>()
            .join(", "),
        Some(serde_yaml::Value::Mapping(values)) => values
            .keys()
            .filter_map(serde_yaml::Value::as_str)
            .collect::<Vec<_>>()
            .join(", "),
        _ => "unknown".to_string(),
    }
}

fn normalize_yaml_string_list(value: Option<&serde_yaml::Value>) -> Vec<String> {
    match value {
        Some(serde_yaml::Value::String(value)) if !value.trim().is_empty() => {
            vec![value.trim().to_string()]
        }
        Some(serde_yaml::Value::Sequence(values)) => values
            .iter()
            .filter_map(serde_yaml::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn yaml_str(value: Option<&serde_yaml::Value>) -> Option<&str> {
    value.and_then(serde_yaml::Value::as_str)
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

fn map_io_error(
    public_error: &'static str,
) -> impl Fn(std::io::Error) -> (StatusCode, Json<Value>) + Clone {
    move |error| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json_error(public_error, error.to_string())),
        )
    }
}
