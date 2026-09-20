//! Evidence and finding aggregation helpers for `routa review`.

use std::collections::{HashMap, HashSet};

use super::shared::{
    SecurityCandidate, SecurityCandidateBucket, SecurityEvidencePack, SecurityRootFinding,
    SecuritySpecialistOutput, SecuritySpecialistReport,
};

pub(crate) fn parse_specialist_output(raw_output: &str) -> Option<SecuritySpecialistOutput> {
    let trimmed = raw_output.trim();
    if let Ok(parsed) = serde_json::from_str::<SecuritySpecialistOutput>(trimmed) {
        return Some(parsed);
    }

    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    if end <= start {
        return None;
    }
    let candidate = &trimmed[start..=end];
    serde_json::from_str(candidate).ok()
}

pub(crate) fn merge_specialist_findings(
    pre_merged_findings: &[SecurityRootFinding],
    specialist_reports: &[SecuritySpecialistReport],
) -> Vec<SecurityRootFinding> {
    let mut merged: HashMap<String, SecurityRootFinding> = HashMap::new();

    for finding in pre_merged_findings {
        let key = finding.root_cause.to_lowercase();
        merged.insert(key, finding.clone());
    }

    for report in specialist_reports {
        for finding in &report.findings {
            let key = finding.root_cause.to_lowercase();
            match merged.get_mut(&key) {
                Some(existing) => {
                    existing.affected_locations = merge_unique_strings(
                        &existing.affected_locations,
                        &finding.affected_locations,
                    );
                    existing.attack_path = if finding.attack_path.len() > existing.attack_path.len()
                    {
                        finding.attack_path.clone()
                    } else {
                        existing.attack_path.clone()
                    };
                    existing.recommended_fix =
                        if finding.recommended_fix.len() > existing.recommended_fix.len() {
                            finding.recommended_fix.clone()
                        } else {
                            existing.recommended_fix.clone()
                        };
                    existing.related_variants =
                        merge_unique_strings(&existing.related_variants, &finding.related_variants);
                    existing.guardrails_present = merge_unique_strings(
                        &existing.guardrails_present,
                        &finding.guardrails_present,
                    );
                    existing.why_it_matters =
                        if finding.why_it_matters.len() > existing.why_it_matters.len() {
                            finding.why_it_matters.clone()
                        } else {
                            existing.why_it_matters.clone()
                        };
                    existing.confidence = higher_confidence(
                        existing.confidence.as_deref(),
                        finding.confidence.as_deref(),
                    );
                    existing.severity = max_severity(&existing.severity, &finding.severity);
                }
                None => {
                    merged.insert(key, finding.clone());
                }
            }
        }
    }

    merged.into_values().collect::<Vec<_>>()
}

fn merge_unique_strings(target: &[String], additions: &[String]) -> Vec<String> {
    let mut merged = target.to_vec();
    let mut existing = merged
        .iter()
        .map(|entry| entry.to_lowercase())
        .collect::<HashSet<_>>();
    for item in additions {
        let key = item.to_lowercase();
        if existing.insert(key) {
            merged.push(item.clone());
        }
    }
    merged
}

fn higher_confidence(current: Option<&str>, candidate: Option<&str>) -> Option<String> {
    let ranked = ["", "LOW", "MEDIUM", "HIGH", "VERY_HIGH", "CONFIRMED"];
    let score = |value: &str| {
        ranked
            .iter()
            .position(|candidate| value.eq_ignore_ascii_case(candidate))
            .unwrap_or(0)
    };
    match (current, candidate) {
        (None, Some(value)) => Some(value.to_string()),
        (Some(current), None) => Some(current.to_string()),
        (Some(current), Some(candidate)) => {
            if score(candidate) >= score(current) {
                Some(candidate.to_string())
            } else {
                Some(current.to_string())
            }
        }
        _ => None,
    }
}

fn max_severity(current: &str, candidate: &str) -> String {
    let weights = ["", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
    let rank = |value: &str| {
        let upper = value.to_uppercase();
        weights
            .iter()
            .position(|entry| entry == &upper)
            .unwrap_or(0)
    };
    if rank(candidate) >= rank(current) {
        candidate.to_string()
    } else {
        current.to_string()
    }
}

pub(crate) fn group_candidates_by_category(
    candidates: Vec<SecurityCandidate>,
) -> Vec<SecurityCandidateBucket> {
    let mut buckets: HashMap<String, Vec<SecurityCandidate>> = HashMap::new();
    for candidate in candidates {
        let key = candidate.category.trim().to_lowercase();
        if key.is_empty() {
            continue;
        }
        buckets.entry(key).or_default().push(candidate);
    }

    let mut grouped = buckets
        .into_iter()
        .map(|(category, mut candidates)| {
            candidates.sort_by_key(|candidate| std::cmp::Reverse(candidate.severity.clone()));
            SecurityCandidateBucket {
                category,
                candidate_count: candidates.len(),
                candidates,
            }
        })
        .collect::<Vec<_>>();

    grouped.sort_by_key(|bucket| std::cmp::Reverse(bucket.candidate_count));
    grouped
}

pub(crate) fn build_security_evidence_pack(
    heuristic_candidates: &[SecurityCandidate],
    semgrep_candidates: &[SecurityCandidate],
) -> SecurityEvidencePack {
    let mut merged = Vec::new();
    let mut seen = HashSet::new();

    for candidate in heuristic_candidates.iter().chain(semgrep_candidates.iter()) {
        if candidate.category.trim().is_empty() {
            continue;
        }
        let fingerprint = format!(
            "{}|{}|{}",
            candidate.category,
            candidate.rule_id,
            candidate.locations.first().cloned().unwrap_or_default()
        );
        if seen.insert(fingerprint) {
            merged.push(candidate.clone());
        }
    }

    SecurityEvidencePack {
        total_candidates: merged.len(),
        buckets: group_candidates_by_category(merged),
    }
}

pub(crate) fn build_pre_merged_findings_from_evidence(
    security_guidance: &Option<String>,
    evidence_pack: &SecurityEvidencePack,
) -> Vec<SecurityRootFinding> {
    let mut findings = Vec::new();

    for bucket in &evidence_pack.buckets {
        for candidate in &bucket.candidates {
            findings.push(SecurityRootFinding {
                title: format!("{}: {}", bucket.category, candidate.rule_id),
                severity: candidate.severity.clone(),
                root_cause: if bucket.category.is_empty() {
                    candidate.summary.clone()
                } else {
                    format!("{} in changed code path", bucket.category)
                },
                affected_locations: candidate.locations.clone(),
                attack_path: candidate.summary.clone(),
                why_it_matters: candidate.summary.clone(),
                guardrails_present: Vec::new(),
                recommended_fix: "Validate with a scoped specialist before finalizing".to_string(),
                related_variants: Vec::new(),
                confidence: Some("LOW".to_string()),
            });
        }
    }

    if security_guidance.is_some() {
        findings.push(SecurityRootFinding {
            title: "Security guidance loaded".to_string(),
            severity: "LOW".to_string(),
            root_cause: "Security guidance was loaded and treated as a workflow hint".to_string(),
            affected_locations: Vec::new(),
            attack_path: "Security policy and guidance were included in payload".to_string(),
            why_it_matters: "Policy references can change review confidence and required depth"
                .to_string(),
            guardrails_present: Vec::new(),
            recommended_fix: "Keep guidance aligned with current security policy".to_string(),
            related_variants: Vec::new(),
            confidence: Some("LOW".to_string()),
        });
    }

    findings
}
