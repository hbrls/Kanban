use super::support::{format_percent, level_change_label};
use super::types::{AutonomyBand, HarnessFluencyReport, LevelChange, ReportFraming};

pub fn format_text_report(report: &HarnessFluencyReport) -> String {
    let is_harnessability = matches!(report.framing, ReportFraming::Harnessability);
    let report_title = if is_harnessability {
        "HARNESSABILITY BASELINE REPORT"
    } else {
        "HARNESS FLUENCY REPORT"
    };
    let current_readiness_label = if is_harnessability {
        "Current Harnessability Readiness"
    } else {
        "Current Level Readiness"
    };
    let next_level_label = if is_harnessability {
        "Next Band Target"
    } else {
        "Next Level"
    };
    let next_level_readiness_label = if is_harnessability {
        "Next Band Readiness"
    } else {
        "Next Level Readiness"
    };
    let next_level_readiness_line = if report.next_level_name.is_some()
        && report.next_level_readiness.is_none()
        && report.blocking_target_level == Some(report.overall_level.clone())
    {
        format!(
            "{next_level_readiness_label}: Blocked until {} is stable",
            report.overall_level_name
        )
    } else {
        format!(
            "{next_level_readiness_label}: {}",
            format_percent(report.next_level_readiness)
        )
    };
    let blocking_header = match &report.blocking_target_level_name {
        Some(name) if report.blocking_target_level == Some(report.overall_level.clone()) => {
            format!("Blocking Gaps To Stabilize {name}:")
        }
        Some(name) => format!("Blocking Gaps To {name}:"),
        None => "Blocking Gaps: none".to_string(),
    };

    let mut lines = vec![
        report_title.to_string(),
        String::new(),
        format!("Repository: {}", report.repo_root),
        format!("Profile: {}", report.profile),
        format!("Mode: {:?}", report.mode),
        format!("Framing: {:?}", report.framing),
        format!("Model Version: {}", report.model_version),
        format!("Overall Level: {}", report.overall_level_name),
        format!(
            "{current_readiness_label}: {}",
            format_percent(Some(report.current_level_readiness))
        ),
        format!(
            "{next_level_label}: {}",
            report
                .next_level_name
                .clone()
                .unwrap_or_else(|| "Reached top level".to_string())
        ),
        next_level_readiness_line,
    ];

    if is_harnessability {
        lines.extend([
            format!(
                "Baseline Score: {}",
                format_percent(Some(report.baseline.summary.score))
            ),
            format!(
                "Autonomy Recommendation: {} — {}",
                autonomy_band_label(&report.baseline.autonomy_recommendation.band),
                report.baseline.autonomy_recommendation.rationale
            ),
        ]);
    }

    lines.extend([String::new(), "Dimensions:".to_string()]);

    let mut dimensions = report.dimensions.values().cloned().collect::<Vec<_>>();
    dimensions.sort_by(|left, right| left.name.cmp(&right.name));
    for dimension in dimensions {
        lines.push(format!(
            "- {}: {} ({})",
            dimension.name,
            dimension.level_name,
            format_percent(Some(dimension.score))
        ));
    }

    if !report.capability_groups.is_empty() {
        lines.push(String::new());
        lines.push("Capability Groups:".to_string());
        let mut capability_groups = report
            .capability_groups
            .values()
            .cloned()
            .collect::<Vec<_>>();
        capability_groups.sort_by(|left, right| left.name.cmp(&right.name));
        for group in capability_groups {
            lines.push(format!(
                "- {}: {} ({} criteria, {} critical failures)",
                group.name,
                format_percent(Some(group.score)),
                group.criterion_count,
                group.critical_failures
            ));
        }
    }

    if !report.evidence_packs.is_empty() {
        lines.push(String::new());
        lines.push("Evidence Packs Prepared:".to_string());
        lines.push(format!(
            "- {} packs ready for adjudication",
            report.evidence_packs.len()
        ));
    }

    lines.push(String::new());
    if is_harnessability {
        lines.push("Dominant Gaps:".to_string());
        if report.baseline.dominant_gaps.is_empty() {
            lines.push("- None".to_string());
        } else {
            for gap in &report.baseline.dominant_gaps {
                lines.push(format!(
                    "- {}: {} ({} failing, {} critical)",
                    gap.capability_group_name,
                    format_percent(Some(gap.score)),
                    gap.failing_criteria,
                    gap.critical_failures
                ));
            }
        }
    } else {
        lines.push(blocking_header);
        if report.blocking_target_level_name.is_some() {
            if report.blocking_criteria.is_empty() {
                lines.push("- None".to_string());
            } else {
                for criterion in &report.blocking_criteria {
                    lines.push(format!("- {} — {}", criterion.id, criterion.evidence_hint));
                }
            }
        }
    }

    lines.push(String::new());
    lines.push(if is_harnessability {
        "Top Actions (Top 3):".to_string()
    } else {
        "Recommended Next Actions:".to_string()
    });
    let actions = if is_harnessability {
        &report.baseline.top_actions
    } else {
        &report.recommendations
    };
    if actions.is_empty() {
        lines.push("- None".to_string());
    } else {
        for recommendation in actions {
            lines.push(format!("- {}", recommendation.action));
        }
    }

    if let Some(comparison) = &report.comparison {
        lines.push(String::new());
        lines.push("Comparison To Last Snapshot:".to_string());
        lines.push(format!(
            "- Overall: {} ({} -> {})",
            level_change_label(&comparison.overall_change),
            comparison.previous_overall_level,
            report.overall_level
        ));
        lines.push(format!(
            "- Dimensions changed: {}",
            comparison
                .dimension_changes
                .iter()
                .filter(|entry| entry.change != LevelChange::Same)
                .count()
        ));
        lines.push(format!(
            "- Criteria changed: {}",
            comparison.criteria_changes.len()
        ));
    }

    lines.push(String::new());
    lines.push(format!("Snapshot: {}", report.snapshot_path));
    lines.join("\n")
}

fn autonomy_band_label(band: &AutonomyBand) -> &'static str {
    match band {
        AutonomyBand::Low => "low",
        AutonomyBand::Medium => "medium",
        AutonomyBand::High => "high",
    }
}
