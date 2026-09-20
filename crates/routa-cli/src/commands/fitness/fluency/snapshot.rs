use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use super::types::{
    CriterionChange, DimensionChange, HarnessFluencyReport, LevelChange, ReportComparison,
};

pub(super) fn load_previous_snapshot(
    snapshot_path: &Path,
) -> Result<Option<HarnessFluencyReport>, String> {
    if !snapshot_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(snapshot_path).map_err(|error| {
        format!(
            "unable to read snapshot {}: {error}",
            snapshot_path.display()
        )
    })?;
    let report = serde_json::from_str::<HarnessFluencyReport>(&content).map_err(|error| {
        format!(
            "unable to parse snapshot {}: {error}",
            snapshot_path.display()
        )
    })?;
    Ok(Some(report))
}

pub(super) fn build_comparison(
    previous_report: &HarnessFluencyReport,
    current_report: &HarnessFluencyReport,
    level_order: &HashMap<String, usize>,
) -> ReportComparison {
    let mut dimension_changes = current_report
        .dimensions
        .values()
        .map(|dimension| {
            let previous_dimension = previous_report.dimensions.get(&dimension.dimension);
            DimensionChange {
                dimension: dimension.dimension.clone(),
                previous_level: previous_dimension
                    .map(|entry| entry.level.clone())
                    .unwrap_or_else(|| "unknown".to_string()),
                current_level: dimension.level.clone(),
                change: previous_dimension
                    .map(|entry| compare_level_ids(&entry.level, &dimension.level, level_order))
                    .unwrap_or(LevelChange::Up),
            }
        })
        .collect::<Vec<_>>();
    dimension_changes.sort_by(|left, right| left.dimension.cmp(&right.dimension));

    let previous_criteria = previous_report
        .criteria
        .iter()
        .map(|criterion| (criterion.id.clone(), criterion.status.clone()))
        .collect::<HashMap<_, _>>();
    let current_criteria = current_report
        .criteria
        .iter()
        .map(|criterion| (criterion.id.clone(), criterion.status.clone()))
        .collect::<HashMap<_, _>>();

    let mut all_ids = previous_criteria
        .keys()
        .chain(current_criteria.keys())
        .cloned()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    all_ids.sort();

    let criteria_changes = all_ids
        .into_iter()
        .filter_map(|id| {
            let previous_status = previous_criteria.get(&id).cloned();
            let current_status = current_criteria.get(&id).cloned();
            if previous_status == current_status {
                None
            } else {
                Some(CriterionChange {
                    id,
                    previous_status,
                    current_status,
                })
            }
        })
        .collect::<Vec<_>>();

    ReportComparison {
        previous_generated_at: previous_report.generated_at.clone(),
        previous_overall_level: previous_report.overall_level.clone(),
        overall_change: compare_level_ids(
            &previous_report.overall_level,
            &current_report.overall_level,
            level_order,
        ),
        dimension_changes,
        criteria_changes,
    }
}

pub(super) fn can_compare_reports(
    previous_report: &HarnessFluencyReport,
    current_report: &HarnessFluencyReport,
) -> bool {
    previous_report.model_version == current_report.model_version
        && previous_report.profile == current_report.profile
}

pub(super) fn persist_snapshot(
    report: &HarnessFluencyReport,
    snapshot_path: &Path,
) -> Result<(), String> {
    if let Some(parent) = snapshot_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("unable to create {}: {error}", parent.display()))?;
    }
    let json = serde_json::to_string_pretty(report)
        .map_err(|error| format!("unable to serialize report: {error}"))?;
    fs::write(snapshot_path, format!("{json}\n"))
        .map_err(|error| format!("unable to write {}: {error}", snapshot_path.display()))
}

fn compare_level_ids(
    previous_level: &str,
    current_level: &str,
    order: &HashMap<String, usize>,
) -> LevelChange {
    let previous_index = order.get(previous_level).copied().unwrap_or(usize::MAX);
    let current_index = order.get(current_level).copied().unwrap_or(usize::MAX);
    if previous_index == current_index {
        LevelChange::Same
    } else if current_index > previous_index {
        LevelChange::Up
    } else {
        LevelChange::Down
    }
}
