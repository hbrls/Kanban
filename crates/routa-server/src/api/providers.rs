//! Providers API - Fast provider listing with lazy status checking
//!
//! GET /api/providers - List all providers (instant, status may be "checking")
//! GET /api/providers?check=true&id=<provider> - Check selected provider statuses

use axum::{routing::get, Json, Router};
use axum_extra::extract::Query;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime};

use crate::error::ServerError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
struct ProviderInfo {
    id: String,
    name: String,
    description: String,
    command: String,
    status: String, // "available" | "unavailable" | "checking"
    source: String, // "static" | "registry"
}

#[derive(Debug, Deserialize)]
struct ProvidersQuery {
    #[serde(default)]
    check: bool,
    /// Provider IDs to check. Supports repeated query parameters and comma-separated values.
    #[serde(default)]
    id: Vec<String>,
}

// Simple in-memory cache
struct Cache {
    providers: Option<Vec<ProviderInfo>>,
    timestamp: SystemTime,
}

static CACHE: OnceLock<Arc<Mutex<Cache>>> = OnceLock::new();

fn get_cache() -> &'static Arc<Mutex<Cache>> {
    CACHE.get_or_init(|| {
        Arc::new(Mutex::new(Cache {
            providers: None,
            timestamp: SystemTime::UNIX_EPOCH,
        }))
    })
}

const CACHE_TTL: Duration = Duration::from_secs(30);

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list_providers))
}

async fn list_providers(
    Query(query): Query<ProvidersQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    // Fast path: return cached or unchecked providers
    if !query.check {
        // Check cache first
        let _should_return_cached = {
            let cache = get_cache().lock().unwrap();
            if let Some(ref providers) = cache.providers {
                if cache.timestamp.elapsed().unwrap_or(CACHE_TTL) < CACHE_TTL {
                    // Clone the providers to return after releasing lock
                    return Ok(Json(serde_json::json!({ "providers": providers })));
                }
            }
            false
        };

        // Return unchecked providers immediately
        let providers = get_providers_without_checking().await;

        return Ok(Json(serde_json::json!({ "providers": providers })));
    }

    // A real status check must always be explicitly scoped to provider IDs.
    let check_ids = parse_check_ids(&query.id);
    if check_ids.is_empty() {
        return Err(ServerError::BadRequest(
            "check=true requires at least one non-empty provider id".to_string(),
        ));
    }

    // Targeted checks are deliberately never written to the fast-query cache.
    let providers = get_providers_with_checking(&check_ids).await;

    Ok(Json(serde_json::json!({ "providers": providers })))
}

fn parse_check_ids(raw_ids: &[String]) -> HashSet<String> {
    raw_ids
        .iter()
        .flat_map(|raw| raw.split(','))
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn should_check_provider(provider_id: &str, check_ids: &HashSet<String>) -> bool {
    check_ids.contains(provider_id)
}

/// Helper to get command from agent distribution
fn get_agent_command(agent: &super::acp_registry::RegistryAgent, platform: &str) -> String {
    // Try npx first
    if let Some(npx_val) = agent.distribution.get("npx") {
        if let Some(package) = npx_val.get("package").and_then(|v| v.as_str()) {
            return format!("npx {package}");
        }
    }

    // Try uvx
    if let Some(uvx_val) = agent.distribution.get("uvx") {
        if let Some(package) = uvx_val.get("package").and_then(|v| v.as_str()) {
            return format!("uvx {package}");
        }
    }

    // Try binary
    if let Some(binary_val) = agent.distribution.get("binary") {
        if let Some(platform_bin) = binary_val.get(platform) {
            if let Some(cmd) = platform_bin.get("cmd").and_then(|v| v.as_str()) {
                return cmd.to_string();
            }
        }
    }

    // Fallback to agent id
    agent.id.clone()
}

/// Fast: Return all providers without checking command availability
async fn get_providers_without_checking() -> Vec<ProviderInfo> {
    use crate::acp;

    let presets = acp::get_presets();
    let mut providers: Vec<ProviderInfo> = presets
        .iter()
        .map(|p| ProviderInfo {
            id: p.id.clone(),
            name: p.name.clone(),
            description: p.description.clone(),
            command: p.command.clone(),
            status: "checking".to_string(),
            source: "static".to_string(),
        })
        .collect();

    // Add registry agents (without checking)
    if let Ok(registry) = super::acp_registry::fetch_registry().await {
        let static_ids: HashSet<_> = providers.iter().map(|p| p.id.clone()).collect();
        let platform =
            super::acp_registry::detect_platform().unwrap_or_else(|| "unknown".to_string());

        for agent in registry.agents {
            let command = get_agent_command(&agent, &platform);

            let provider_id = if static_ids.contains(&agent.id) {
                format!("{}-registry", agent.id)
            } else {
                agent.id.clone()
            };

            let provider_name = if static_ids.contains(&agent.id) {
                format!("{} (Registry)", agent.name)
            } else {
                agent.name.clone()
            };

            providers.push(ProviderInfo {
                id: provider_id,
                name: provider_name,
                description: agent.description,
                command,
                status: "checking".to_string(),
                source: "registry".to_string(),
            });
        }
    }

    providers
}

/// Slow: Check all provider command availability
async fn get_providers_with_checking(check_ids: &HashSet<String>) -> Vec<ProviderInfo> {
    use crate::{acp, shell_env};

    let presets = acp::get_presets();
    let mut providers: Vec<ProviderInfo> = Vec::new();

    // Check static presets
    for preset in &presets {
        let selected = should_check_provider(&preset.id, check_ids);
        let installed = selected && shell_env::which(&preset.command).is_some();
        providers.push(ProviderInfo {
            id: preset.id.clone(),
            name: preset.name.clone(),
            description: preset.description.clone(),
            command: preset.command.clone(),
            status: if !selected {
                String::new()
            } else if installed {
                "available".to_string()
            } else {
                "unavailable".to_string()
            },
            source: "static".to_string(),
        });
    }

    // Add registry agents with checking
    let static_ids: HashSet<_> = providers.iter().map(|p| p.id.clone()).collect();

    if let Ok(registry) = super::acp_registry::fetch_registry().await {
        let mut npx_available: Option<bool> = None;
        let mut uvx_available: Option<bool> = None;
        let platform =
            super::acp_registry::detect_platform().unwrap_or_else(|| "unknown".to_string());

        for agent in registry.agents {
            let provider_id = if static_ids.contains(&agent.id) {
                format!("{}-registry", agent.id)
            } else {
                agent.id.clone()
            };

            let (command, status) = if !should_check_provider(&provider_id, check_ids) {
                (get_agent_command(&agent, &platform), String::new())
            } else if agent.distribution.get("npx").is_some() {
                let cmd = get_agent_command(&agent, &platform);
                let available =
                    *npx_available.get_or_insert_with(|| shell_env::which("npx").is_some());
                let status_str = if available {
                    "available"
                } else {
                    "unavailable"
                };
                (cmd, status_str.to_string())
            } else if agent.distribution.get("uvx").is_some() {
                let cmd = get_agent_command(&agent, &platform);
                let available =
                    *uvx_available.get_or_insert_with(|| shell_env::which("uv").is_some());
                let status_str = if available {
                    "available"
                } else {
                    "unavailable"
                };
                (cmd, status_str.to_string())
            } else if agent.distribution.get("binary").is_some() {
                let cmd = get_agent_command(&agent, &platform);
                (cmd, "unavailable".to_string())
            } else {
                (agent.id.clone(), "unavailable".to_string())
            };

            let provider_name = if static_ids.contains(&agent.id) {
                format!("{} (Registry)", agent.name)
            } else {
                agent.name.clone()
            };

            providers.push(ProviderInfo {
                id: provider_id,
                name: provider_name,
                description: agent.description,
                command,
                status,
                source: "registry".to_string(),
            });
        }
    }

    // Sort: available first, then alphabetical
    providers.sort_by(|a, b| {
        if a.status == b.status {
            a.name.cmp(&b.name)
        } else if a.status == "available" {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    providers
}

#[cfg(test)]
mod tests {
    use super::{list_providers, parse_check_ids, should_check_provider, ProvidersQuery};
    use crate::error::ServerError;
    use axum_extra::extract::Query;

    #[test]
    fn parses_repeated_and_comma_separated_provider_ids() {
        let ids = parse_check_ids(&[
            "claude,codex".to_string(),
            "codex".to_string(),
            " opencode ".to_string(),
        ]);

        assert_eq!(ids.len(), 3);
        assert!(ids.contains("claude"));
        assert!(ids.contains("codex"));
        assert!(ids.contains("opencode"));
    }

    #[test]
    fn empty_provider_ids_are_rejected_for_real_checks() {
        assert!(parse_check_ids(&[]).is_empty());
        assert!(parse_check_ids(&[" , ".to_string()]).is_empty());
    }

    #[test]
    fn only_requested_provider_ids_are_checked() {
        let ids = parse_check_ids(&["codex".to_string()]);
        assert!(should_check_provider("codex", &ids));
        assert!(!should_check_provider("claude", &ids));
    }

    #[tokio::test]
    async fn real_check_without_provider_ids_returns_bad_request() {
        let result = list_providers(Query(ProvidersQuery {
            check: true,
            id: Vec::new(),
        }))
        .await;

        assert!(matches!(result, Err(ServerError::BadRequest(_))));
    }
}
