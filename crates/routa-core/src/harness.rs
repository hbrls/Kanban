use std::fs;
use std::path::{Path, PathBuf};

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};

const LOCKFILE_CANDIDATES: [&str; 3] = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessScriptSignal {
    pub name: String,
    pub command: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessOverviewRow {
    pub id: String,
    pub label: String,
    pub items: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessEntrypointGroup {
    pub id: String,
    pub label: String,
    pub category: String,
    pub scripts: Vec<HarnessScriptSignal>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessSurfaceSignals {
    pub config_path: String,
    pub title: String,
    pub summary: String,
    pub overview_rows: Vec<HarnessOverviewRow>,
    pub entrypoint_groups: Vec<HarnessEntrypointGroup>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarnessRepoSignalsReport {
    pub generated_at: String,
    pub repo_root: String,
    pub package_manager: Option<String>,
    pub lockfiles: Vec<String>,
    pub build: HarnessSurfaceSignals,
    pub test: HarnessSurfaceSignals,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MatchCondition {
    #[serde(default)]
    file_exists: Option<String>,
    #[serde(default)]
    script_name_matches: Option<String>,
    #[serde(default)]
    script_command_matches: Option<String>,
    #[serde(default)]
    any: Vec<MatchCondition>,
    #[serde(default)]
    all: Vec<MatchCondition>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DerivedRule {
    label: String,
    #[serde(default)]
    when_any: Vec<MatchCondition>,
    #[serde(default)]
    when_all: Vec<MatchCondition>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverviewRowConfig {
    id: String,
    label: String,
    source: String,
    #[serde(default)]
    paths: Vec<String>,
    #[serde(default)]
    rules: Vec<DerivedRule>,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntrypointGroupConfig {
    id: String,
    label: String,
    category: String,
    #[serde(default)]
    script_name_patterns: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HarnessSurfaceConfig {
    title: String,
    summary: String,
    #[serde(default)]
    overview: Vec<OverviewRowConfig>,
    #[serde(default)]
    entrypoint_groups: Vec<EntrypointGroupConfig>,
}

#[derive(Debug, Clone)]
struct ScriptEntry {
    name: String,
    command: String,
}

pub fn detect_repo_signals(repo_root: &Path) -> Result<HarnessRepoSignalsReport, String> {
    let mut warnings = Vec::new();
    let package_json = load_package_json(repo_root, &mut warnings);
    let scripts = collect_scripts(&package_json);
    let lockfiles = LOCKFILE_CANDIDATES
        .iter()
        .filter_map(|path| {
            if repo_root.join(path).exists() {
                Some(path.to_string())
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    Ok(HarnessRepoSignalsReport {
        generated_at: chrono::Utc::now().to_rfc3339(),
        repo_root: repo_root.display().to_string(),
        package_manager: resolve_package_manager(&package_json, &lockfiles),
        lockfiles,
        build: detect_surface_signals(repo_root, "build", &scripts, &mut warnings)?,
        test: detect_surface_signals(repo_root, "test", &scripts, &mut warnings)?,
        warnings,
    })
}

fn load_package_json(repo_root: &Path, warnings: &mut Vec<String>) -> JsonValue {
    let package_json_path = repo_root.join("package.json");
    if !package_json_path.exists() {
        warnings.push("Missing package.json at repository root.".to_string());
        return JsonValue::Object(JsonMap::new());
    }

    let raw = match fs::read_to_string(&package_json_path) {
        Ok(raw) => raw,
        Err(error) => {
            warnings.push(format!("Failed to read package.json: {error}"));
            return JsonValue::Object(JsonMap::new());
        }
    };

    match serde_json::from_str::<JsonValue>(&raw) {
        Ok(value) => value,
        Err(error) => {
            warnings.push(format!("Failed to parse package.json: {error}"));
            JsonValue::Object(JsonMap::new())
        }
    }
}

fn collect_scripts(package_json: &JsonValue) -> Vec<ScriptEntry> {
    package_json
        .get("scripts")
        .and_then(JsonValue::as_object)
        .map(|scripts| {
            scripts
                .iter()
                .filter_map(|(name, command)| {
                    command.as_str().map(|command| ScriptEntry {
                        name: name.to_string(),
                        command: command.to_string(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn resolve_package_manager(package_json: &JsonValue, lockfiles: &[String]) -> Option<String> {
    if let Some(raw) = package_json
        .get("packageManager")
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(raw.to_string());
    }

    if lockfiles.iter().any(|path| path == "pnpm-lock.yaml") {
        return Some("pnpm".to_string());
    }
    if lockfiles.iter().any(|path| path == "package-lock.json") {
        return Some("npm".to_string());
    }
    if lockfiles.iter().any(|path| path == "yarn.lock") {
        return Some("yarn".to_string());
    }
    None
}

fn detect_surface_signals(
    repo_root: &Path,
    surface: &str,
    scripts: &[ScriptEntry],
    warnings: &mut Vec<String>,
) -> Result<HarnessSurfaceSignals, String> {
    let config_path = PathBuf::from("docs")
        .join("harness")
        .join(format!("{surface}.yml"));
    let config = load_surface_config(repo_root, &config_path)?;

    Ok(HarnessSurfaceSignals {
        config_path: config_path.display().to_string(),
        title: config.title,
        summary: config.summary,
        overview_rows: build_overview_rows(repo_root, scripts, &config.overview, warnings),
        entrypoint_groups: build_entrypoint_groups(scripts, &config.entrypoint_groups, warnings),
    })
}

fn load_surface_config(
    repo_root: &Path,
    relative_path: &Path,
) -> Result<HarnessSurfaceConfig, String> {
    let absolute_path = repo_root.join(relative_path);
    let raw = fs::read_to_string(&absolute_path)
        .map_err(|error| format!("failed to read {}: {error}", absolute_path.display()))?;
    serde_yaml::from_str::<HarnessSurfaceConfig>(&raw)
        .map_err(|error| format!("failed to parse {}: {error}", absolute_path.display()))
}

fn build_overview_rows(
    repo_root: &Path,
    scripts: &[ScriptEntry],
    rows: &[OverviewRowConfig],
    warnings: &mut Vec<String>,
) -> Vec<HarnessOverviewRow> {
    rows.iter()
        .map(|row| {
            let items = match row.source.as_str() {
                "files" => row
                    .paths
                    .iter()
                    .filter(|relative_path| repo_root.join(relative_path).exists())
                    .cloned()
                    .collect::<Vec<_>>(),
                "derived" => row
                    .rules
                    .iter()
                    .filter_map(|rule| {
                        let any_pass = rule.when_any.is_empty()
                            || rule.when_any.iter().any(|condition| {
                                evaluate_condition(
                                    condition,
                                    repo_root,
                                    scripts,
                                    warnings,
                                    &format!("{}:{}", row.id, rule.label),
                                )
                            });
                        let all_pass = rule.when_all.is_empty()
                            || rule.when_all.iter().all(|condition| {
                                evaluate_condition(
                                    condition,
                                    repo_root,
                                    scripts,
                                    warnings,
                                    &format!("{}:{}", row.id, rule.label),
                                )
                            });

                        if any_pass && all_pass {
                            Some(rule.label.clone())
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>(),
                other => {
                    warnings.push(format!(
                        "Unsupported overview source '{other}' in {}",
                        row.id
                    ));
                    Vec::new()
                }
            };

            HarnessOverviewRow {
                id: row.id.clone(),
                label: row.label.clone(),
                items: clamp_items(items, row.limit),
            }
        })
        .collect()
}

fn build_entrypoint_groups(
    scripts: &[ScriptEntry],
    groups: &[EntrypointGroupConfig],
    warnings: &mut Vec<String>,
) -> Vec<HarnessEntrypointGroup> {
    groups
        .iter()
        .filter_map(|group| {
            let matched = scripts
                .iter()
                .filter(|script| {
                    group.script_name_patterns.iter().any(|pattern| {
                        matches_script_pattern(
                            script,
                            pattern,
                            warnings,
                            &format!("entrypointGroup:{}", group.id),
                            PatternField::Name,
                        )
                    })
                })
                .map(|script| HarnessScriptSignal {
                    name: script.name.clone(),
                    command: script.command.clone(),
                    category: group.category.clone(),
                })
                .collect::<Vec<_>>();

            if matched.is_empty() {
                None
            } else {
                Some(HarnessEntrypointGroup {
                    id: group.id.clone(),
                    label: group.label.clone(),
                    category: group.category.clone(),
                    scripts: matched,
                })
            }
        })
        .collect()
}

fn clamp_items(items: Vec<String>, limit: Option<usize>) -> Vec<String> {
    match limit {
        Some(limit) if items.len() > limit => {
            let total = items.len();
            let mut clipped = items.into_iter().take(limit).collect::<Vec<_>>();
            let hidden = total.saturating_sub(limit);
            if hidden > 0 {
                clipped.push(format!("+{hidden} more"));
            }
            clipped
        }
        _ => items,
    }
}

#[derive(Copy, Clone)]
enum PatternField {
    Name,
    Command,
}

fn matches_script_pattern(
    script: &ScriptEntry,
    pattern: &str,
    warnings: &mut Vec<String>,
    scope: &str,
    field: PatternField,
) -> bool {
    let regex = match Regex::new(pattern) {
        Ok(regex) => regex,
        Err(error) => {
            warnings.push(format!("Invalid regex in {scope}: {pattern} ({error})"));
            return false;
        }
    };

    match field {
        PatternField::Name => regex.is_match(&script.name),
        PatternField::Command => regex.is_match(&script.command),
    }
}

fn evaluate_condition(
    condition: &MatchCondition,
    repo_root: &Path,
    scripts: &[ScriptEntry],
    warnings: &mut Vec<String>,
    scope: &str,
) -> bool {
    let mut checks = Vec::new();

    if let Some(relative_path) = &condition.file_exists {
        checks.push(repo_root.join(relative_path).exists());
    }

    if let Some(pattern) = &condition.script_name_matches {
        checks.push(scripts.iter().any(|script| {
            matches_script_pattern(script, pattern, warnings, scope, PatternField::Name)
        }));
    }

    if let Some(pattern) = &condition.script_command_matches {
        checks.push(scripts.iter().any(|script| {
            matches_script_pattern(script, pattern, warnings, scope, PatternField::Command)
        }));
    }

    if !condition.any.is_empty() {
        checks.push(
            condition
                .any
                .iter()
                .any(|child| evaluate_condition(child, repo_root, scripts, warnings, scope)),
        );
    }

    if !condition.all.is_empty() {
        checks.push(
            condition
                .all
                .iter()
                .all(|child| evaluate_condition(child, repo_root, scripts, warnings, scope)),
        );
    }

    !checks.is_empty() && checks.into_iter().all(|value| value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn detects_build_and_test_surfaces_from_yaml() {
        let temp_dir = tempdir().expect("temp dir");
        let repo_root = temp_dir.path();

        fs::create_dir_all(repo_root.join("docs/harness")).expect("docs/harness");
        fs::write(
            repo_root.join("package.json"),
            r#"{
              "packageManager": "pnpm",
              "scripts": {
                "dev": "next dev",
                "build": "next build",
                "test:run": "vitest run",
                "test:e2e": "playwright test"
              }
            }"#,
        )
        .expect("package json");
        fs::write(repo_root.join("pnpm-lock.yaml"), "lock").expect("lockfile");
        fs::write(repo_root.join("next.config.ts"), "export default {}").expect("next config");
        fs::write(repo_root.join("vitest.config.ts"), "export default {}").expect("vitest config");

        fs::write(
            repo_root.join("docs/harness/build.yml"),
            r#"
title: Build
summary: Build summary
overview:
  - id: repository
    label: Repository
    source: files
    paths: [package.json, pnpm-lock.yaml]
  - id: targets
    label: Targets
    source: derived
    rules:
      - label: Next.js web
        whenAny:
          - fileExists: next.config.ts
entrypointGroups:
  - id: dev
    label: Dev
    category: dev
    scriptNamePatterns: ["^dev$"]
"#,
        )
        .expect("build config");

        fs::write(
            repo_root.join("docs/harness/test.yml"),
            r#"
title: Test
summary: Test summary
overview:
  - id: config
    label: Config
    source: files
    paths: [vitest.config.ts]
entrypointGroups:
  - id: unit
    label: Unit
    category: unit
    scriptNamePatterns: ["^test:run$"]
  - id: e2e
    label: E2E
    category: e2e
    scriptNamePatterns: ["^test:e2e$"]
"#,
        )
        .expect("test config");

        let report = detect_repo_signals(repo_root).expect("report");
        assert_eq!(report.package_manager.as_deref(), Some("pnpm"));
        assert_eq!(
            report.build.overview_rows[0].items,
            vec!["package.json", "pnpm-lock.yaml"]
        );
        assert_eq!(report.build.overview_rows[1].items, vec!["Next.js web"]);
        assert_eq!(report.build.entrypoint_groups[0].scripts[0].name, "dev");
        assert_eq!(report.test.entrypoint_groups.len(), 2);
    }
}
