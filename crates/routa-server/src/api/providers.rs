//! Providers API - Fast provider listing with lazy status checking
//!
//! GET /api/providers                       - List providers from the fixed preset catalog
//! GET /api/providers?check=true&id=…       - Check availability of specific provider IDs
//!
//! The catalog is the single source of truth (see `routa_core::acp::presets`).
//! There is no CDN-backed registry fetch and no `-registry` alias suffix.

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
    status: String,    // "available" | "unavailable" | "checking"
    source: String,    // always "static" in the fixed-preset model
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
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
        let _should_return_cached = {
            let cache = get_cache().lock().unwrap();
            if let Some(ref providers) = cache.providers {
                if cache.timestamp.elapsed().unwrap_or(CACHE_TTL) < CACHE_TTL {
                    return Ok(Json(serde_json::json!({ "providers": providers })));
                }
            }
            false
        };

        let providers = get_providers_without_checking().await;
        let mut guard = get_cache().lock().unwrap();
        guard.providers = Some(providers.clone());
        guard.timestamp = SystemTime::now();
        return Ok(Json(serde_json::json!({ "providers": providers })));
    }

    // A real status check must always be explicitly scoped to provider IDs.
    let check_ids = parse_check_ids(&query.id);
    if check_ids.is_empty() {
        return Err(ServerError::BadRequest(
            "check=true requires at least one non-empty provider id".to_string(),
        ));
    }

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

/// Fast: Return all providers without checking command availability.
async fn get_providers_without_checking() -> Vec<ProviderInfo> {
    use crate::acp::get_presets;

    get_presets()
        .into_iter()
        .map(|preset| ProviderInfo {
            id: preset.id.clone(),
            name: preset.name.clone(),
            description: preset.description.clone(),
            command: preset.command.clone(),
            status: if preset.command.is_empty() {
                "unavailable".to_string()
            } else {
                "checking".to_string()
            },
            source: "static".to_string(),
            note: preset.note.clone(),
        })
        .collect()
}

/// Slow: Check `check_ids` provider command availability. Static providers
/// are checked with `which` after honoring any `env_bin_override`. Binary
/// presets with no command are reported as "unavailable" without an extra
/// process spawn.
async fn get_providers_with_checking(check_ids: &HashSet<String>) -> Vec<ProviderInfo> {
    use crate::{acp::get_presets, shell_env};

    get_presets()
        .into_iter()
        .map(|preset| {
            let selected = should_check_provider(&preset.id, check_ids);
            let resolved_command = preset
                .env_bin_override
                .as_ref()
                .and_then(|var| std::env::var(var).ok())
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| preset.command.clone());

            let status = if !selected {
                String::new()
            } else if resolved_command.is_empty() {
                "unavailable".to_string()
            } else if shell_env::which(&resolved_command).is_some() {
                "available".to_string()
            } else {
                "unavailable".to_string()
            };

            ProviderInfo {
                id: preset.id.clone(),
                name: preset.name.clone(),
                description: preset.description.clone(),
                command: preset.command.clone(),
                status,
                source: "static".to_string(),
                note: preset.note.clone(),
            }
        })
        .collect()
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

    #[tokio::test]
    async fn fast_path_returns_all_presets() {
        let result = list_providers(Query(ProvidersQuery {
            check: false,
            id: Vec::new(),
        }))
        .await
        .expect("fast path should succeed");

        let providers = result
            .0
            .get("providers")
            .and_then(|value| value.as_array())
            .expect("providers array");
        // The merged catalog keeps the 9 pre-existing built-ins at a minimum.
        assert!(providers.len() >= 9, "catalog too small: {}", providers.len());
        // Sources are uniform in the fixed-preset model.
        for entry in providers {
            assert_eq!(entry.get("source").and_then(|v| v.as_str()), Some("static"));
        }
    }
}
