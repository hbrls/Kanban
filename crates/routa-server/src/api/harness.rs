use std::path::Path;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use regex::Regex;
use routa_core::spec_detector::detect_spec_sources;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::api::harness_instructions_audit::run_instruction_audit;
use crate::api::repo_context::{
    extract_frontmatter, json_error, read_to_string, resolve_repo_root, RepoContextQuery,
    ResolveRepoRootOptions,
};
use crate::error::ServerError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/design-decisions", get(get_design_decisions))
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

async fn get_design_decisions(
    State(state): State<AppState>,
    Query(query): Query<RepoContextQuery>,
) -> Result<Json<Value>, ServerError> {
    let repo_root = resolve_repo_root(
        &state,
        query.workspace_id.as_deref(),
        query.codebase_id.as_deref(),
        query.repo_path.as_deref(),
        "Missing design decisions context. Provide workspaceId, codebaseId, or repoPath.",
        ResolveRepoRootOptions::default(),
    )
    .await?;

    let report = detect_design_decisions(&repo_root).map_err(ServerError::Internal)?;
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesignDecisionReport {
    generated_at: String,
    repo_root: String,
    sources: Vec<DesignDecisionSource>,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesignDecisionSource {
    kind: String,
    label: String,
    root_path: String,
    confidence: String,
    status: String,
    artifacts: Vec<DesignDecisionArtifact>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesignDecisionArtifact {
    id: String,
    title: String,
    path: String,
    #[serde(rename = "type")]
    artifact_type: String,
    status: String,
    summary: Option<String>,
    code_refs: Vec<String>,
}

fn detect_design_decisions(repo_root: &Path) -> Result<DesignDecisionReport, String> {
    let mut warnings = Vec::new();
    let mut sources = Vec::new();

    if let Some(source) = read_architecture_source(repo_root, &mut warnings)? {
        sources.push(source);
    }
    if let Some(source) = read_adr_source(repo_root, &mut warnings)? {
        sources.push(source);
    }

    Ok(DesignDecisionReport {
        generated_at: chrono::Utc::now().to_rfc3339(),
        repo_root: repo_root.display().to_string(),
        sources,
        warnings,
    })
}

fn read_architecture_source(
    repo_root: &Path,
    warnings: &mut Vec<String>,
) -> Result<Option<DesignDecisionSource>, String> {
    let candidates = [
        (
            "docs/ARCHITECTURE.md",
            repo_root.join("docs/ARCHITECTURE.md"),
        ),
        (
            "docs/architecture.md",
            repo_root.join("docs/architecture.md"),
        ),
        ("docs/architcture.md", repo_root.join("docs/architcture.md")),
    ];

    let Some((relative_path, absolute_path)) = candidates
        .iter()
        .find(|(_, absolute_path)| absolute_path.is_file())
    else {
        warnings.push(
            "No canonical architecture document found under docs/ARCHITECTURE.md.".to_string(),
        );
        return Ok(None);
    };

    let source = std::fs::read_to_string(absolute_path)
        .map_err(|error| format!("Failed to read {}: {error}", absolute_path.display()))?;
    let artifact = build_architecture_artifact(relative_path, &source);

    Ok(Some(DesignDecisionSource {
        kind: "canonical-doc".to_string(),
        label: "Architecture".to_string(),
        root_path: "docs".to_string(),
        confidence: "high".to_string(),
        status: "documents-present".to_string(),
        artifacts: vec![artifact],
    }))
}

fn read_adr_source(
    repo_root: &Path,
    warnings: &mut Vec<String>,
) -> Result<Option<DesignDecisionSource>, String> {
    let adr_dir = repo_root.join("docs/adr");
    if !adr_dir.is_dir() {
        warnings.push("No docs/adr directory found for design decision loading.".to_string());
        return Ok(None);
    }

    let mut artifacts = Vec::new();
    let mut entries = std::fs::read_dir(&adr_dir)
        .map_err(|error| format!("Failed to read {}: {error}", adr_dir.display()))?
        .flatten()
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if file_name.eq_ignore_ascii_case("README.md")
            || !file_name.to_ascii_lowercase().ends_with(".md")
        {
            continue;
        }
        if !path.is_file() {
            continue;
        }

        let source = std::fs::read_to_string(&path)
            .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
        let Some(artifact) = build_adr_artifact(&format!("docs/adr/{file_name}"), &source) else {
            warnings.push(format!(
                "Skipped ADR without recognizable title format: docs/adr/{file_name}"
            ));
            continue;
        };
        artifacts.push(artifact);
    }

    if artifacts.is_empty() {
        return Ok(None);
    }

    Ok(Some(DesignDecisionSource {
        kind: "decision-records".to_string(),
        label: "ADRs".to_string(),
        root_path: "docs/adr".to_string(),
        confidence: "high".to_string(),
        status: "documents-present".to_string(),
        artifacts,
    }))
}

fn build_architecture_artifact(source_path: &str, source: &str) -> DesignDecisionArtifact {
    let purpose = extract_frontmatter_value(source, "purpose");
    let core_principles = extract_section_body(source, "Core Principles");
    let summary = purpose
        .or_else(|| extract_first_paragraph(core_principles.as_deref()))
        .or_else(|| {
            Some(
                "Canonical architecture overview for runtime boundaries and cross-backend invariants.".to_string(),
            )
        });

    DesignDecisionArtifact {
        id: "architecture-top-level".to_string(),
        title: "Top-level architecture contract".to_string(),
        path: source_path.to_string(),
        artifact_type: "architecture".to_string(),
        status: "canonical".to_string(),
        summary,
        code_refs: extract_list_items(core_principles.as_deref()),
    }
}

fn build_adr_artifact(source_path: &str, source: &str) -> Option<DesignDecisionArtifact> {
    let title_regex = Regex::new(r"(?m)^#\s+ADR\s+(\d+):\s+(.+)$").ok()?;
    let captures = title_regex.captures(source)?;
    let adr_number = captures.get(1)?.as_str();
    let title = captures.get(2)?.as_str().trim().to_string();

    let decision_section = extract_section_body(source, "Decision");
    let consequences_section = extract_section_body(source, "Consequences");
    let code_refs_section = extract_section_body(source, "Code References");
    let summary = extract_first_paragraph(decision_section.as_deref())
        .or_else(|| extract_first_paragraph(consequences_section.as_deref()))
        .or_else(|| Some("Accepted design decision recorded in ADR.".to_string()));

    Some(DesignDecisionArtifact {
        id: format!("adr-{adr_number}"),
        title,
        path: source_path.to_string(),
        artifact_type: "adr".to_string(),
        status: normalize_adr_status(source),
        summary,
        code_refs: extract_code_references(code_refs_section.as_deref()),
    })
}

fn extract_frontmatter_value(source: &str, key: &str) -> Option<String> {
    let (frontmatter, _) = extract_frontmatter(source)?;
    frontmatter.lines().find_map(|line| {
        let (candidate_key, candidate_value) = line.split_once(':')?;
        if candidate_key.trim() == key {
            Some(
                candidate_value
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_string(),
            )
        } else {
            None
        }
    })
}

fn extract_section_body(source: &str, heading: &str) -> Option<String> {
    let pattern = format!(
        r"(?ms)^##\s+{}\s*$\n(.*?)(?=\n##\s+|\z)",
        regex::escape(heading)
    );
    let regex = Regex::new(&pattern).ok()?;
    let captures = regex.captures(source)?;
    Some(captures.get(1)?.as_str().trim().to_string())
}

fn extract_first_paragraph(source: Option<&str>) -> Option<String> {
    let source = source?.trim();
    if source.is_empty() {
        return None;
    }

    for paragraph in source.split("\n\n") {
        let candidate = paragraph.trim();
        let bytes = candidate.as_bytes();
        let digit_prefix_len = bytes
            .iter()
            .take_while(|byte| byte.is_ascii_digit())
            .count();
        let is_ordered_list_item = digit_prefix_len > 0
            && bytes.get(digit_prefix_len) == Some(&b'.')
            && bytes.get(digit_prefix_len + 1) == Some(&b' ');
        if candidate.is_empty()
            || candidate.starts_with("- ")
            || candidate.starts_with("```")
            || is_ordered_list_item
        {
            continue;
        }
        return Some(
            candidate
                .lines()
                .map(str::trim)
                .collect::<Vec<_>>()
                .join(" "),
        );
    }
    None
}

fn extract_list_items(source: Option<&str>) -> Vec<String> {
    let Some(source) = source else {
        return Vec::new();
    };
    let line_regex = Regex::new(r"^\s*(?:-|\d+\.)\s+(.+)$").ok();
    source
        .lines()
        .filter_map(|line| {
            line_regex
                .as_ref()?
                .captures(line)
                .and_then(|captures| captures.get(1))
                .map(|item| item.as_str().trim().to_string())
        })
        .collect()
}

fn extract_code_references(source: Option<&str>) -> Vec<String> {
    let backtick_regex = Regex::new(r"`([^`]+)`").ok();
    extract_list_items(source)
        .into_iter()
        .map(|item| {
            if let Some(regex) = &backtick_regex {
                if let Some(captures) = regex.captures(&item) {
                    if let Some(value) = captures.get(1) {
                        return value.as_str().trim().to_string();
                    }
                }
            }

            item.split('—')
                .next()
                .unwrap_or(&item)
                .split('-')
                .next()
                .unwrap_or(&item)
                .trim()
                .to_string()
        })
        .collect()
}

fn normalize_adr_status(source: &str) -> String {
    let Some(regex) = Regex::new(r"(?mi)^- Status:\s+(.+)$").ok() else {
        return "unknown".to_string();
    };
    let Some(captures) = regex.captures(source) else {
        return "unknown".to_string();
    };
    let Some(status) = captures
        .get(1)
        .map(|value| value.as_str().trim().to_ascii_lowercase())
    else {
        return "unknown".to_string();
    };
    match status.as_str() {
        "accepted" => "accepted".to_string(),
        "superseded" => "superseded".to_string(),
        "deprecated" => "deprecated".to_string(),
        _ => "unknown".to_string(),
    }
}
