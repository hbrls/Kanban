//! Single source of truth for all ACP coding-agent presets shipped with Routa.
//!
//! The list below intentionally merges the pre-existing built-in presets
//! (claude, opencode, gemini, codex-acp, copilot, auggie, kimi, kiro, qoder)
//! with every entry that was published by the upstream ACP agent registry
//! when this file was last refreshed.
//!
//! Refresh workflow:
//!
//!   1. Download the upstream registry snapshot with
//!        curl -sSL "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json"
//!             -o acp-registry.json
//!   2. Convert each agent entry below to one of the three boot forms:
//!        - npx  : command = "npx",  args = ["-y", <package>, ...extraArgs]
//!        - uvx  : command = "uvx",  args = [<package>, ...extraArgs]
//!        - bin  : pre-installed binary on PATH (existing entries) or
//!                 binary archive without an automatic launcher (note=...)
//!   3. Update `REGISTRY_DOWNLOADED_AT` below with the download wall clock.
//!   4. Preserve IDs, aliases and special launch configuration of the
//!      pre-existing built-ins; never silently overwrite them.
//!   5. Submit the change through code review. The application runtime must
//!      never reach the CDN at startup or fall back to remote lookup.
//!
//! Source URL : <https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json>
//! Refreshed  : 2026-10-19 18:19 +08:00 (Asia/Shanghai, downloaded with `curl` on macOS)

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Wall-clock timestamp of the upstream snapshot used to author the entries in this file.
pub const REGISTRY_DOWNLOADED_AT: &str = "2026-10-19 18:19 +08:00";
pub const REGISTRY_SOURCE_URL: &str =
    "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

/// Distribution chosen for each preset in the merged catalog.
///
/// The application only honors `Path`, `Npx`, and `Uvx` at runtime. `Binary`
/// presets are kept in the catalog for completeness but cannot be launched
/// without first manually downloading and extracting their archive, so they
/// carry a `note` that the resolver surfaces back to the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DistributionKind {
    /// Resolve the binary through `which` / the `env_bin_override` env var.
    Path,
    /// Launch via `npx -y <package> [...args]`.
    Npx,
    /// Launch via `uvx <package> [...args]`.
    Uvx,
    /// Archive distribution with no automatic launcher configured.
    Binary,
}

/// Resume capability advertised by a preset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResumeCapability {
    pub supported: bool,
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supports_fork: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supports_list: Option<bool>,
}

/// ACP provider preset as exposed to the rest of the codebase.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpPreset {
    /// Unique identifier (lowercase, e.g., "claude", "opencode").
    pub id: String,
    /// Human-readable display name.
    pub name: String,
    /// Display description.
    pub description: String,
    /// Launch command, e.g. `npx`, `uvx`, `claude`, `opencode`.
    pub command: String,
    /// Launch arguments (already includes package + extra args for npx/uvx presets).
    pub args: Vec<String>,
    /// Distribution we resolve the preset through.
    pub distribution: DistributionKind,
    /// Optional env var that overrides the resolved binary path.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env_bin_override: Option<String>,
    /// Optional resume capabilities advertised by this provider.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resume: Option<ResumeCapability>,
    /// Optional launch / bootstrap note shown to the UI when the preset cannot
    /// be started as-is (e.g. binary-archive entries without an extracted
    /// launcher).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

// ─── Aliases preserved for backward compatibility ─────────────────────────
//
// These keep the historical IDs that callers (CLI flags, AcpSessionRow.provider,
// saved selections, configs) still send.
fn normalize_id(id: &str) -> &str {
    match id {
        "codex" => "codex-acp",
        "qodercli" => "qoder",
        other => other,
    }
}

// ─── Construction helpers ─────────────────────────────────────────────────

/// Build a preset entry with a uniform shape.
fn entry(
    id: &str,
    name: &str,
    description: &str,
    command: &str,
    args: Vec<String>,
    distribution: DistributionKind,
    env_bin_override: Option<&str>,
    resume: Option<ResumeCapability>,
    note: Option<&str>,
) -> AcpPreset {
    AcpPreset {
        id: id.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        command: command.to_string(),
        args,
        distribution,
        env_bin_override: env_bin_override.map(|value| value.to_string()),
        resume,
        note: note.map(|value| value.to_string()),
    }
}

fn replay_resume() -> Option<ResumeCapability> {
    Some(ResumeCapability {
        supported: true,
        mode: "replay".to_string(),
        supports_fork: None,
        supports_list: None,
    })
}

fn both_resume(supports_list: bool) -> Option<ResumeCapability> {
    Some(ResumeCapability {
        supported: true,
        mode: "both".to_string(),
        supports_fork: None,
        supports_list: if supports_list { Some(true) } else { None },
    })
}

fn claude_resume() -> Option<ResumeCapability> {
    Some(ResumeCapability {
        supported: true,
        mode: "replay".to_string(),
        supports_fork: Some(true),
        supports_list: None,
    })
}

fn npx_args(package: &str, extra: &[&str]) -> Vec<String> {
    let mut args = vec!["-y".to_string(), package.to_string()];
    args.extend(extra.iter().map(|s| s.to_string()));
    args
}

fn uvx_args(package: &str, extra: &[&str]) -> Vec<String> {
    let mut args = vec![package.to_string()];
    args.extend(extra.iter().map(|s| s.to_string()));
    args
}

// ─── Preset table ───────────────────────────────────────────────────────────

fn build_presets() -> Vec<AcpPreset> {
    vec![
        // ─── Pre-existing built-in presets (kept unchanged to preserve IDs) ──
        entry(
            "opencode", "OpenCode", "OpenCode AI coding agent",
            "opencode", vec!["acp".to_string()],
            DistributionKind::Path, Some("OPENCODE_BIN"),
            replay_resume(), None,
        ),
        entry(
            "gemini", "Gemini", "Google Gemini CLI",
            "gemini", vec!["--experimental-acp".to_string()],
            DistributionKind::Path, None,
            None, None,
        ),
        entry(
            "codex-acp", "Codex", "OpenAI Codex CLI (codex-acp wrapper)",
            "codex-acp", vec![],
            DistributionKind::Path, Some("CODEX_ACP_BIN"),
            both_resume(true), None,
        ),
        entry(
            "copilot", "GitHub Copilot", "GitHub Copilot CLI",
            "copilot", vec![
                "--acp".to_string(),
                "--allow-all-tools".to_string(),
                "--no-ask-user".to_string(),
            ],
            DistributionKind::Path, Some("COPILOT_BIN"),
            None, None,
        ),
        entry(
            "auggie", "Auggie", "Augment Code's AI agent",
            "auggie", vec!["--acp".to_string()],
            DistributionKind::Path, None,
            None, None,
        ),
        entry(
            "kimi", "Kimi", "Moonshot AI's Kimi CLI",
            // Kimi Code CLI exposes ACP as a subcommand; `kimi --acp` was removed.
            "kimi", vec!["acp".to_string()],
            DistributionKind::Path, None,
            None, None,
        ),
        entry(
            "kiro", "Kiro", "Amazon Kiro AI coding agent",
            "kiro-cli", vec!["acp".to_string()],
            DistributionKind::Path, Some("KIRO_BIN"),
            None, None,
        ),
        entry(
            "qoder", "Qoder", "Qoder AI coding agent",
            "qodercli", vec![
                "--acp".to_string(),
                "--experimental-mcp-load".to_string(),
            ],
            DistributionKind::Path, Some("QODER_BIN"),
            None, None,
        ),
        entry(
            "claude", "Claude Code", "Anthropic Claude Code (stream-json protocol)",
            // Claude Code uses stream-json protocol, not ACP flags.
            // Args are unused since we use ClaudeCodeProcess directly.
            "claude", vec![],
            DistributionKind::Path, Some("CLAUDE_BIN"),
            claude_resume(), None,
        ),

        // ─── Catalog entries added from the ACP registry snapshot ───────────
        // Each block documents the upstream `id` and the distribution we use
        // to launch it. Binary-archive presets keep `command = ""` so the
        // runtime refuses them with a clear note rather than launching nothing.
        entry(
            "agoragentic-acp", "Agoragentic",
            "Agent marketplace with 174+ AI capabilities. Browse, invoke, and pay for agent services settled in USDC on Base L2.",
            "npx", npx_args("agoragentic-mcp@1.3.0", &["--acp"]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "amp-acp", "Amp",
            "ACP wrapper for Amp - the frontier coding agent.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./amp-acp inside the upstream tarball. Routa does not auto-extract archive binaries, so this preset cannot be launched from the fixed catalog until a manual install is performed."),
        ),
        entry(
            "antigravity-acp", "Google Antigravity",
            "Google's AI coding agent.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./agy_acp_server.par inside the upstream macOS package. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "autohand", "Autohand Code",
            "Autohand Code - AI coding agent powered by Autohand AI.",
            "npx", npx_args("@autohandai/autohand-acp@0.2.1", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "bob", "Bob",
            "IBM Bob is your AI-Powered Development Partner.",
            "npx", npx_args("@ibm/bob@2.0.8", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "claude-acp", "Claude Agent",
            "ACP wrapper for Anthropic's Claude.",
            "npx", npx_args("@agentclientprotocol/claude-agent-acp@0.93.0", &[]),
            DistributionKind::Npx, None, None,
            Some("Use the stream-json-based 'claude' preset by default; this npx preset is included for completeness only."),
        ),
        entry(
            "cline", "Cline",
            "Autonomous coding agent CLI - capable of creating/editing files, running commands, and using the browser.",
            "npx", npx_args("cline@3.0.73", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "codebuddy-code", "Codebuddy Code",
            "Tencent Cloud's official intelligent coding tool.",
            "npx", npx_args("@tencent-ai/codebuddy-code@2.169.0", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "cortex-code", "Cortex Code",
            "Snowflake's Cortex Code coding agent.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./coco-1.0.73+*/darwin-arm64/cortex. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "corust-agent", "Corust Agent",
            "Co-building with a seasoned Rust partner.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./corust-agent-acp. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "crow-cli", "crow-cli",
            "Minimal ACP Native Coding Agent.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./crow-cli. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "cursor", "Cursor",
            "Cursor's coding agent.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./dist-package/cursor-agent. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "deepagents", "DeepAgents",
            "Batteries-included AI coding and general purpose agent powered by Composio.",
            "npx", npx_args("deepagents-acp@0.1.7", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "devin", "Devin",
            "Devin CLI coding agent by Cognition.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./bin/devin. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "dimcode", "DimCode",
            "A coding agent that puts leading models at your command.",
            "npx", npx_args("dimcode@0.5.19", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "dirac", "Dirac",
            "Reduces API costs by more than 50%, produces better and faster results, and unlocks powerful new capabilities for any LLM agent.",
            "npx", npx_args("dirac-cli@0.5.22", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "factory-droid", "Factory Droid",
            "Factory Droid - AI coding agent powered by Factory AI.",
            "npx", npx_args("droid@0.244.0", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "fast-agent", "fast-agent",
            "Code and build agents with comprehensive multi-provider support using the Model Context Protocol.",
            "uvx", uvx_args("fast-agent-acp==0.10.1", &[]),
            DistributionKind::Uvx, None, None, None,
        ),
        entry(
            "github-copilot-cli", "GitHub Copilot CLI",
            "GitHub's AI pair programmer (registry-distributed wrapper).",
            "npx", npx_args("@github/copilot@1.0.98", &[]),
            DistributionKind::Npx, None, None,
            Some("Distinct from the native 'copilot' preset which uses the GitHub Copilot CLI binary."),
        ),
        entry(
            "glm-acp-agent", "GLM Agent",
            "ACP agent powered by Zhipu AI's GLM Coding Plan models (glm-4.6 / glm-4.5 / z1-air).",
            "npx", npx_args("glm-acp-agent@1.15.0", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "goose", "goose",
            "A local, extensible, open source AI agent that automates engineering tasks.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./goose. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "grok-build", "Grok Build",
            "xAI's coding agent and CLI.",
            "npx", npx_args("@xai-official/grok@1.0.63", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "harn", "Harn",
            "Harn runs .harn agent pipelines as a native ACP coding agent.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./harn. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "junie", "Junie",
            "AI Coding Agent by JetBrains.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./Applications/junie.app/Contents/MacOS/junie. Routa does not auto-extract archive binaries; macOS only."),
        ),
        entry(
            "kilo", "Kilo",
            "The open source coding agent.",
            "npx", npx_args("@kilocode/cli@7.8.12", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "kimchi", "Kimchi",
            "Coding agent powered by multi-model orchestration.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./bin/kimchi. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "MiniMax-code", "MiniMax Code",
            "MiniMax Code is an AI coding agent with Agent Client Protocol support.",
            "npx", npx_args("@minimax-ai/code@0.2.7", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "minion-code", "Minion Code",
            "An enhanced AI code assistant built on the Minion framework.",
            "uvx", uvx_args("minion-code@0.1.44", &[]),
            DistributionKind::Uvx, None, None, None,
        ),
        entry(
            "mistral-vibe", "Mistral Vibe",
            "Mistral's open-source coding assistant.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./vibe-acp. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "nova", "Nova",
            "Nova by Compass AI - a fully-fledged software engineer at your fingertips.",
            "npx", npx_args("@compass-ai/nova@1.1.55", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "pi-acp", "pi ACP",
            "ACP adapter for pi coding agent.",
            "npx", npx_args("pi-acp@0.0.34", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "poolside", "Poolside",
            "Poolside's coding agent.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./pool-darwin-arm64. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "qwen-code", "Qwen Code",
            "Alibaba's Qwen coding assistant.",
            "npx", npx_args("@qwen-code/qwen-code@0.25.2", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "sigit", "siGit Code",
            "Local-first coding agent. Runs entirely on your machine with any model.",
            "npx", npx_args("@smbcloud/sigit@1.7.1", &[]),
            DistributionKind::Npx, None, None, None,
        ),
        entry(
            "stakpak", "Stakpak",
            "Open-source DevOps agent in Rust with enterprise-grade security.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./stakpak. Routa does not auto-extract archive binaries."),
        ),
        entry(
            "vtcode", "VT Code",
            "An open-source coding agent with LLM-native code understanding.",
            "", vec![],
            DistributionKind::Binary, None, None,
            Some("Binary archive distribution only; ./vtcode. Routa does not auto-extract archive binaries."),
        ),
    ]
}

static PRESETS: std::sync::LazyLock<Vec<AcpPreset>> = std::sync::LazyLock::new(build_presets);

/// The complete preset catalog.
pub fn get_presets() -> Vec<AcpPreset> {
    PRESETS.clone()
}

/// Synchronous preset lookup with backward-compatible aliases.
///
/// Both `codex` (aliased to `codex-acp`) and `qodercli` (aliased to `qoder`)
/// are resolved transparently. Unknown IDs return `None`.
pub fn get_preset_by_id(id: &str) -> Option<AcpPreset> {
    let normalized = normalize_id(id);
    PRESETS.iter().find(|p| p.id == normalized).cloned()
}

/// Same as [`get_preset_by_id`] but returns a clear error string instead of
/// `None`. The runtime uses this when starting or resuming ACP sessions so
/// unknown IDs surface a predictable error to the UI.
pub fn require_preset(id: &str) -> Result<AcpPreset, String> {
    let normalized = normalize_id(id);
    if let Some(preset) = PRESETS.iter().find(|p| p.id == normalized).cloned() {
        if preset.command.is_empty() {
            let reason = preset
                .note
                .clone()
                .unwrap_or_else(|| "no launch command configured for this preset".to_string());
            return Err(format!(
                "Provider '{}' is in the catalog but cannot be launched: {reason}",
                preset.id
            ));
        }
        return Ok(preset);
    }
    Err(format!(
        "Unknown provider '{id}'. The provider list is fixed to the presets in this module; \
         no remote lookup is attempted."
    ))
}

/// Resume capability advertised by a provider, synchronously.
pub fn get_resume_capability(id: &str) -> Option<ResumeCapability> {
    get_preset_by_id(id).and_then(|preset| preset.resume)
}

/// Indexed view of the catalog, computed lazily for callers that need O(1)
/// lookups across many presets.
pub fn preset_index() -> HashMap<&'static str, &'static AcpPreset> {
    let mut index = HashMap::new();
    for preset in PRESETS.iter() {
        index.insert(preset.id.as_str(), preset);
    }
    index
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_include_pre_existing_builtin_entries() {
        for id in [
            "opencode",
            "gemini",
            "codex-acp",
            "copilot",
            "auggie",
            "kimi",
            "kiro",
            "qoder",
            "claude",
        ] {
            assert!(
                get_preset_by_id(id).is_some(),
                "missing pre-existing preset: {id}"
            );
        }
    }

    #[test]
    fn codex_alias_maps_to_codex_acp() {
        assert!(get_preset_by_id("codex").is_some());
        assert_eq!(get_preset_by_id("codex").unwrap().id, "codex-acp");
    }

    #[test]
    fn qodercli_alias_maps_to_qoder() {
        assert_eq!(get_preset_by_id("qodercli").unwrap().id, "qoder");
    }

    #[test]
    fn unknown_provider_is_rejected_with_no_remote_lookup() {
        let err = require_preset("nope-provider").unwrap_err();
        assert!(err.contains("nope-provider"));
        assert!(err.contains("fixed to the presets"));
    }

    #[test]
    fn binary_archive_presets_are_listed_but_cannot_be_launched() {
        let binary_only_ids = [
            "amp-acp",
            "antigravity-acp",
            "cortex-code",
            "corust-agent",
            "crow-cli",
            "cursor",
            "devin",
            "goose",
            "harn",
            "junie",
            "kimchi",
            "mistral-vibe",
            "poolside",
            "stakpak",
            "vtcode",
        ];
        for id in binary_only_ids {
            let preset = get_preset_by_id(id)
                .unwrap_or_else(|| panic!("missing preset {id}"));
            assert!(preset.command.is_empty(), "{id} should have no command");
            assert!(preset.note.is_some(), "{id} should explain its launch gap");
            assert!(require_preset(id).is_err(), "{id} must refuse to launch");
        }
    }

    #[test]
    fn no_two_presets_share_the_same_id() {
        let mut seen = std::collections::HashSet::new();
        for preset in PRESETS.iter() {
            assert!(seen.insert(preset.id.as_str()), "duplicate id: {}", preset.id);
        }
    }

    #[test]
    fn resume_capability_surfaced_for_known_providers() {
        assert!(get_resume_capability("claude").is_some());
        assert!(get_resume_capability("opencode").is_some());
        assert!(get_resume_capability("gemini").is_none());
    }

    #[test]
    fn registry_metadata_constants_present() {
        assert!(REGISTRY_DOWNLOADED_AT.starts_with("2026-10-19"));
        assert!(REGISTRY_SOURCE_URL.contains("agentclientprotocol.com"));
    }
}
