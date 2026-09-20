use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use super::types::{
    CriterionResult, CriterionStatus, EvidenceExcerpt, EvidenceMode, EvidencePack,
    FluencyCriterion, FluencyMode,
};

const MAX_EVIDENCE_FILES: usize = 3;
const MAX_EXCERPT_CHARS: usize = 2_000;
const MAX_EXCERPT_LINES: usize = 40;

pub(super) fn build_evidence_packs(
    repo_root: &Path,
    criteria: &[FluencyCriterion],
    results: &[CriterionResult],
    mode: &FluencyMode,
) -> Vec<EvidencePack> {
    if matches!(mode, FluencyMode::Deterministic) {
        return Vec::new();
    }

    let criteria_by_id = criteria
        .iter()
        .map(|criterion| (criterion.id.as_str(), criterion))
        .collect::<HashMap<_, _>>();

    let mut packs = Vec::new();
    for result in results {
        let Some(criterion) = criteria_by_id.get(result.id.as_str()) else {
            continue;
        };

        let selection_reasons = collect_selection_reasons(criterion, result, mode);
        if selection_reasons.is_empty() {
            continue;
        }

        packs.push(EvidencePack {
            criterion_id: result.id.clone(),
            capability_group: result
                .capability_group
                .clone()
                .unwrap_or_else(|| criterion.capability_group.clone()),
            capability_group_name: result
                .capability_group_name
                .clone()
                .unwrap_or_else(|| criterion.capability_group.clone()),
            status: result.status.clone(),
            evidence_mode: result.evidence_mode.clone(),
            detector_type: result.detector_type.clone(),
            selection_reasons,
            detail: result.detail.clone(),
            evidence: result.evidence.clone(),
            excerpts: build_excerpts(repo_root, &result.evidence),
            why_it_matters: result.why_it_matters.clone(),
            recommended_action: result.recommended_action.clone(),
            evidence_hint: result.evidence_hint.clone(),
            ai_prompt_template: criterion
                .ai_check
                .as_ref()
                .map(|check| check.prompt_template.clone()),
            ai_requires: criterion
                .ai_check
                .as_ref()
                .map(|check| check.requires.clone())
                .unwrap_or_default(),
        });
    }

    packs.sort_by(|left, right| left.criterion_id.cmp(&right.criterion_id));
    packs
}

fn collect_selection_reasons(
    criterion: &FluencyCriterion,
    result: &CriterionResult,
    mode: &FluencyMode,
) -> Vec<String> {
    let mut reasons = Vec::new();

    if result.status == CriterionStatus::Fail && criterion.critical {
        reasons.push("critical_failure".to_string());
    }

    if result.status == CriterionStatus::Fail {
        reasons.push("failed_check".to_string());
    }

    if !matches!(result.evidence_mode, EvidenceMode::Static) {
        reasons.push("non_static_evidence".to_string());
    }

    if criterion.ai_check.is_some() {
        reasons.push("ai_check_requested".to_string());
    }

    if matches!(mode, FluencyMode::Ai) && result.status != CriterionStatus::Skipped {
        reasons.push("ai_mode_selected".to_string());
    }

    reasons.sort();
    reasons.dedup();
    reasons
}

fn build_excerpts(repo_root: &Path, evidence_paths: &[String]) -> Vec<EvidenceExcerpt> {
    let mut excerpts = Vec::new();
    for path in evidence_paths.iter().take(MAX_EVIDENCE_FILES) {
        let Some(resolved) = resolve_evidence_path(repo_root, path) else {
            continue;
        };
        let Ok(content) = fs::read_to_string(&resolved) else {
            continue;
        };

        let excerpt = truncate_excerpt(&content);
        excerpts.push(EvidenceExcerpt {
            path: relative_display_path(repo_root, &resolved, path),
            content: excerpt.0,
            truncated: excerpt.1,
        });
    }
    excerpts
}

fn resolve_evidence_path(repo_root: &Path, raw_path: &str) -> Option<PathBuf> {
    let canonical_repo_root = repo_root
        .canonicalize()
        .unwrap_or_else(|_| repo_root.to_path_buf());
    let candidate = Path::new(raw_path);
    let resolved = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        repo_root.join(candidate)
    };

    let canonical = resolved.canonicalize().ok()?;
    if !canonical.starts_with(&canonical_repo_root) || !canonical.is_file() {
        return None;
    }

    Some(canonical)
}

fn truncate_excerpt(content: &str) -> (String, bool) {
    let mut excerpt = content
        .lines()
        .take(MAX_EXCERPT_LINES)
        .collect::<Vec<_>>()
        .join("\n");
    let mut truncated = content.lines().count() > MAX_EXCERPT_LINES;

    if excerpt.len() > MAX_EXCERPT_CHARS {
        excerpt.truncate(MAX_EXCERPT_CHARS);
        truncated = true;
    }

    if truncated {
        excerpt.push_str("\n…");
    }

    (excerpt, truncated)
}

fn relative_display_path(repo_root: &Path, resolved: &Path, fallback: &str) -> String {
    let canonical_repo_root = repo_root
        .canonicalize()
        .unwrap_or_else(|_| repo_root.to_path_buf());
    resolved
        .strip_prefix(&canonical_repo_root)
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| fallback.to_string())
}
