use std::ffi::OsString;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use serde_json::json;
use tempfile::TempDir;
use tokio::sync::{Mutex, MutexGuard};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

pub struct FeatureExplorerHistoryFixture {
    _home: EnvVarGuard,
    _claude: EnvVarGuard,
    _qoder: EnvVarGuard,
    _augment: EnvVarGuard,
    _transcript_home: TempDir,
    _env_lock: MutexGuard<'static, ()>,
}

impl FeatureExplorerHistoryFixture {
    pub async fn install(repo_root: &Path) -> Self {
        let env_lock = env_lock().lock().await;
        let transcript_home = tempfile::tempdir().expect("transcript home");
        let codex_sessions = transcript_home.path().join(".codex").join("sessions");
        fs::create_dir_all(&codex_sessions).expect("codex sessions dir");

        let transcript = [
            json!({
                "type": "session_meta",
                "payload": {
                    "id": "feature-explorer-fixture-session",
                    "cwd": repo_root.to_string_lossy(),
                    "model": "fixture",
                    "source": "rust_api_end_to_end"
                }
            }),
            json!({
                "type": "event_msg",
                "payload": {
                    "type": "task_started",
                    "turn_id": "turn-1"
                }
            }),
            json!({
                "type": "event_msg",
                "payload": {
                    "type": "user_message",
                    "turn_id": "turn-1",
                    "message": "Update feature explorer file signals"
                }
            }),
            json!({
                "type": "response_item",
                "payload": {
                    "type": "function_call",
                    "name": "apply_patch",
                    "arguments": "{\"path\":\"crates/routa-server/src/api/feature_explorer.rs\"}"
                }
            }),
            json!({
                "type": "event_msg",
                "payload": {
                    "type": "task_complete",
                    "turn_id": "turn-1"
                }
            }),
        ]
        .into_iter()
        .map(|entry| entry.to_string())
        .collect::<Vec<_>>()
        .join("\n");
        fs::write(
            codex_sessions.join("feature-explorer-fixture.jsonl"),
            format!("{transcript}\n"),
        )
        .expect("write transcript fixture");

        let home = EnvVarGuard::set("HOME", transcript_home.path());
        let claude = EnvVarGuard::remove("CLAUDE_CONFIG_DIR");
        let qoder = EnvVarGuard::remove("QODER_PROJECTS_DIR");
        let augment = EnvVarGuard::remove("AUGMENT_SESSIONS_DIR");

        Self {
            _home: home,
            _claude: claude,
            _qoder: qoder,
            _augment: augment,
            _transcript_home: transcript_home,
            _env_lock: env_lock,
        }
    }
}

struct EnvVarGuard {
    key: &'static str,
    previous: Option<OsString>,
}

impl EnvVarGuard {
    fn set(key: &'static str, value: impl AsRef<std::ffi::OsStr>) -> Self {
        let previous = std::env::var_os(key);
        // SAFETY: tests that mutate process environment hold env_lock().
        unsafe {
            std::env::set_var(key, value);
        }
        Self { key, previous }
    }

    fn remove(key: &'static str) -> Self {
        let previous = std::env::var_os(key);
        // SAFETY: tests that mutate process environment hold env_lock().
        unsafe {
            std::env::remove_var(key);
        }
        Self { key, previous }
    }
}

impl Drop for EnvVarGuard {
    fn drop(&mut self) {
        // SAFETY: tests that mutate process environment hold env_lock().
        unsafe {
            if let Some(value) = &self.previous {
                std::env::set_var(self.key, value);
            } else {
                std::env::remove_var(self.key);
            }
        }
    }
}
