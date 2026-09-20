use std::collections::HashMap;

use super::types::{
    AutonomyBand, AutonomyRecommendation, BaselineSummary, CapabilityGroupResult, CriterionResult,
    CriterionStatus, DominantGap, FluencyLevel, HarnessabilityBaseline, Recommendation,
};

const MAX_BASELINE_GAPS: usize = 3;
const MAX_BASELINE_ACTIONS: usize = 3;

pub(super) struct BaselineInputs<'a> {
    pub overall_level: &'a FluencyLevel,
    pub next_level: Option<&'a FluencyLevel>,
    pub overall_level_index: usize,
    pub total_levels: usize,
    pub current_level_readiness: f64,
    pub blocking_criteria: &'a [CriterionResult],
    pub capability_groups: &'a HashMap<String, CapabilityGroupResult>,
    pub recommendations: &'a [Recommendation],
}

pub(super) fn build_harnessability_baseline(inputs: BaselineInputs<'_>) -> HarnessabilityBaseline {
    let score = normalized_baseline_score(
        inputs.overall_level_index,
        inputs.total_levels,
        inputs.current_level_readiness,
    );
    let dominant_gaps = collect_dominant_gaps(inputs.capability_groups, inputs.blocking_criteria);
    let top_actions = inputs
        .recommendations
        .iter()
        .take(MAX_BASELINE_ACTIONS)
        .cloned()
        .collect::<Vec<_>>();
    let autonomy_recommendation = derive_autonomy_recommendation(
        score,
        inputs.overall_level_index,
        inputs.total_levels,
        inputs.current_level_readiness,
        inputs.blocking_criteria,
    );

    HarnessabilityBaseline {
        summary: BaselineSummary {
            score,
            overall_level: inputs.overall_level.id.clone(),
            overall_level_name: inputs.overall_level.name.clone(),
            current_readiness: inputs.current_level_readiness,
            next_level: inputs.next_level.map(|level| level.id.clone()),
            next_level_name: inputs.next_level.map(|level| level.name.clone()),
        },
        dominant_gaps,
        top_actions,
        autonomy_recommendation,
    }
}

fn normalized_baseline_score(
    overall_level_index: usize,
    total_levels: usize,
    current_level_readiness: f64,
) -> f64 {
    let level_count = total_levels.max(1) as f64;
    let readiness = current_level_readiness.clamp(0.0, 1.0);
    ((overall_level_index as f64) + readiness) / level_count
}

fn collect_dominant_gaps(
    capability_groups: &HashMap<String, CapabilityGroupResult>,
    blocking_criteria: &[CriterionResult],
) -> Vec<DominantGap> {
    if capability_groups.is_empty() {
        return collect_dominant_gaps_from_blockers(blocking_criteria);
    }

    let mut groups = capability_groups
        .values()
        .filter(|group| group.failing_criteria > 0 || group.critical_failures > 0)
        .cloned()
        .collect::<Vec<_>>();
    groups.sort_by(|left, right| {
        right
            .critical_failures
            .cmp(&left.critical_failures)
            .then(left.score.total_cmp(&right.score))
            .then(right.failing_criteria.cmp(&left.failing_criteria))
            .then(left.name.cmp(&right.name))
    });

    groups
        .into_iter()
        .take(MAX_BASELINE_GAPS)
        .map(|group| {
            let rationale = if group.critical_failures > 0 {
                format!(
                    "{} critical failures across {} failing criteria",
                    group.critical_failures, group.failing_criteria
                )
            } else {
                format!(
                    "{} failing criteria need remediation",
                    group.failing_criteria
                )
            };
            DominantGap {
                capability_group: group.capability_group,
                capability_group_name: group.name,
                score: group.score,
                failing_criteria: group.failing_criteria,
                critical_failures: group.critical_failures,
                rationale,
            }
        })
        .collect()
}

fn collect_dominant_gaps_from_blockers(blocking_criteria: &[CriterionResult]) -> Vec<DominantGap> {
    let mut grouped = HashMap::<String, DominantGap>::new();
    for criterion in blocking_criteria
        .iter()
        .filter(|criterion| criterion.status == CriterionStatus::Fail)
    {
        let group_id = criterion
            .capability_group
            .clone()
            .unwrap_or_else(|| criterion.dimension.clone());
        let group_name = criterion
            .capability_group_name
            .clone()
            .unwrap_or_else(|| group_id.clone());

        let entry = grouped.entry(group_id.clone()).or_insert(DominantGap {
            capability_group: group_id,
            capability_group_name: group_name,
            score: 0.0,
            failing_criteria: 0,
            critical_failures: 0,
            rationale: String::new(),
        });
        entry.failing_criteria += 1;
        if criterion.critical {
            entry.critical_failures += 1;
        }
    }

    let mut gaps = grouped.into_values().collect::<Vec<_>>();
    gaps.sort_by(|left, right| {
        right
            .critical_failures
            .cmp(&left.critical_failures)
            .then(right.failing_criteria.cmp(&left.failing_criteria))
            .then(left.capability_group_name.cmp(&right.capability_group_name))
    });

    gaps.into_iter()
        .take(MAX_BASELINE_GAPS)
        .map(|mut gap| {
            gap.rationale = if gap.critical_failures > 0 {
                format!(
                    "{} critical failures across {} failing criteria",
                    gap.critical_failures, gap.failing_criteria
                )
            } else {
                format!("{} failing criteria need remediation", gap.failing_criteria)
            };
            gap
        })
        .collect()
}

fn derive_autonomy_recommendation(
    score: f64,
    overall_level_index: usize,
    total_levels: usize,
    current_level_readiness: f64,
    blocking_criteria: &[CriterionResult],
) -> AutonomyRecommendation {
    let critical_blockers = blocking_criteria
        .iter()
        .filter(|criterion| criterion.status == CriterionStatus::Fail && criterion.critical)
        .count();
    let level_ratio = ((overall_level_index + 1) as f64) / (total_levels.max(1) as f64);
    let readiness = current_level_readiness.clamp(0.0, 1.0);
    let band = if critical_blockers > 0 {
        AutonomyBand::Low
    } else if level_ratio >= 0.8 && readiness >= 0.85 && score >= 0.8 {
        AutonomyBand::High
    } else if level_ratio >= 0.4 && score >= 0.45 {
        AutonomyBand::Medium
    } else {
        AutonomyBand::Low
    };

    let rationale = match band {
        AutonomyBand::Low if critical_blockers > 0 => format!(
            "Critical blockers remain ({critical_blockers}); keep autonomy conservative until they are resolved."
        ),
        AutonomyBand::High => format!(
            "Baseline score {:.0}% with stable readiness supports high autonomy.",
            score * 100.0
        ),
        AutonomyBand::Medium => format!(
            "Baseline score {:.0}% indicates partial readiness; keep a human-in-the-loop for riskier changes.",
            score * 100.0
        ),
        AutonomyBand::Low => format!(
            "Baseline score {:.0}% is below medium confidence; prioritize remediation before autonomous execution.",
            score * 100.0
        ),
    };

    AutonomyRecommendation { band, rationale }
}
