use super::types::{AutonomyBand, FluencyMode, ReportFraming};
use super::{evaluate_harness_fluency, format_text_report, EvaluateOptions};
use std::fs::{create_dir_all, write};
use tempfile::tempdir;

#[test]
fn hybrid_mode_prepares_evidence_packs() {
    let repo = tempdir().unwrap();
    let repo_root = repo.path();
    create_dir_all(repo_root.join("docs/fitness")).unwrap();
    write(repo_root.join("README.md"), "# repo\nline2\nline3\n").unwrap();

    let model_path = repo_root.join("docs/fitness/model.yaml");
    let snapshot_path = repo_root.join("docs/fitness/latest.json");
    write(
        &model_path,
        r#"version: 1
levels:
  - id: awareness
    name: Awareness
dimensions:
  - id: collaboration
    name: Collaboration
criteria:
  - id: collaboration.awareness.hybrid_signal
    level: awareness
    dimension: collaboration
    capability_group: collaboration
    weight: 1
    critical: true
    evidence_mode: hybrid
    why_it_matters: hybrid signal
    recommended_action: hybrid action
    evidence_hint: README.md
    ai_check:
      prompt_template: fluency-capability-scorer
      requires: [code_excerpt]
    detector:
      type: file_exists
      path: README.md
  - id: collaboration.awareness.static_signal
    level: awareness
    dimension: collaboration
    weight: 1
    critical: false
    why_it_matters: static signal
    recommended_action: static action
    evidence_hint: README.md
    detector:
      type: file_exists
      path: README.md
"#,
    )
    .unwrap();

    let report = evaluate_harness_fluency(&EvaluateOptions {
        repo_root: repo_root.to_path_buf(),
        model_path,
        profile: "generic".to_string(),
        mode: FluencyMode::Hybrid,
        framing: ReportFraming::Fluency,
        snapshot_path,
        compare_last: false,
        save: false,
    })
    .expect("report");

    assert_eq!(report.mode, FluencyMode::Hybrid);
    assert_eq!(report.evidence_packs.len(), 1);
    let pack = report.evidence_packs.first().expect("evidence pack");
    assert_eq!(pack.criterion_id, "collaboration.awareness.hybrid_signal");
    assert!(pack
        .selection_reasons
        .iter()
        .any(|reason| reason == "non_static_evidence"));
    assert!(pack
        .selection_reasons
        .iter()
        .any(|reason| reason == "ai_check_requested"));
    assert_eq!(
        pack.ai_prompt_template.as_deref(),
        Some("fluency-capability-scorer")
    );
    assert_eq!(pack.ai_requires, vec!["code_excerpt".to_string()]);
    assert_eq!(pack.excerpts.len(), 1);
    assert_eq!(pack.excerpts[0].path, "README.md");
    assert!(pack.excerpts[0].content.contains("# repo"));
}

#[test]
fn emits_harnessability_baseline_projection_shape() {
    let repo = tempdir().unwrap();
    let repo_root = repo.path();
    create_dir_all(repo_root.join("docs/fitness")).unwrap();
    write(repo_root.join("README.md"), "# repo\n").unwrap();

    let model_path = repo_root.join("docs/fitness/model.yaml");
    let snapshot_path = repo_root.join("docs/fitness/latest.json");
    write(
        &model_path,
        r#"version: 1
capability_groups:
  - id: governance
    name: Governance
  - id: quality
    name: Quality
levels:
  - id: awareness
    name: Awareness
dimensions:
  - id: collaboration
    name: Collaboration
criteria:
  - id: collaboration.awareness.contract_surface
    level: awareness
    dimension: collaboration
    capability_group: governance
    weight: 2
    critical: true
    why_it_matters: contract
    recommended_action: add AGENTS.md contract
    evidence_hint: AGENTS.md
    detector:
      type: file_exists
      path: AGENTS.md
  - id: collaboration.awareness.ownership_surface
    level: awareness
    dimension: collaboration
    capability_group: governance
    weight: 2
    critical: true
    why_it_matters: ownership
    recommended_action: add CODEOWNERS routing
    evidence_hint: .github/CODEOWNERS
    detector:
      type: file_exists
      path: .github/CODEOWNERS
  - id: collaboration.awareness.lint_surface
    level: awareness
    dimension: collaboration
    capability_group: quality
    weight: 1
    critical: false
    why_it_matters: lint
    recommended_action: define lint script
    evidence_hint: package.json scripts.lint
    detector:
      type: json_path_exists
      path: package.json
      jsonPath: [scripts, lint]
  - id: collaboration.awareness.test_surface
    level: awareness
    dimension: collaboration
    capability_group: quality
    weight: 1
    critical: false
    why_it_matters: test
    recommended_action: define test script
    evidence_hint: package.json scripts.test
    detector:
      type: json_path_exists
      path: package.json
      jsonPath: [scripts, test]
"#,
    )
    .unwrap();

    let report = evaluate_harness_fluency(&EvaluateOptions {
        repo_root: repo_root.to_path_buf(),
        model_path,
        profile: "generic".to_string(),
        mode: FluencyMode::Deterministic,
        framing: ReportFraming::Harnessability,
        snapshot_path,
        compare_last: false,
        save: false,
    })
    .expect("report");

    assert_eq!(report.framing, ReportFraming::Harnessability);
    assert_eq!(report.baseline.summary.overall_level, report.overall_level);
    assert_eq!(
        report.baseline.summary.overall_level_name,
        report.overall_level_name
    );
    assert_eq!(
        report.baseline.summary.current_readiness,
        report.current_level_readiness
    );
    assert_eq!(report.baseline.top_actions.len(), 3);
    assert_eq!(
        report.baseline.autonomy_recommendation.band,
        AutonomyBand::Low
    );
    assert!(!report.baseline.dominant_gaps.is_empty());

    let text = format_text_report(&report);
    assert!(text.contains("HARNESSABILITY BASELINE REPORT"));
    assert!(text.contains("Dominant Gaps:"));
    assert!(text.contains("Top Actions (Top 3):"));

    let serialized = serde_json::to_value(&report).expect("json report");
    assert_eq!(serialized["framing"], "harnessability");
    assert!(serialized["baseline"]["summary"]["score"].is_number());
    assert!(serialized["baseline"]["summary"]["overallLevel"].is_string());
    assert!(serialized["baseline"]["dominantGaps"].is_array());
    assert!(serialized["baseline"]["topActions"].is_array());
    assert_eq!(
        serialized["baseline"]["autonomyRecommendation"]["band"],
        "low"
    );
    assert!(serialized["baseline"]["autonomyRecommendation"]["rationale"].is_string());
}
