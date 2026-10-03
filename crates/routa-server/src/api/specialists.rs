use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::Value;

use routa_core::workflow::specialist::{SpecialistDef, SpecialistLoader};

use crate::error::ServerError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(list_specialists)
            .post(create_specialist)
            .put(update_specialist)
            .delete(delete_specialist),
    )
}

#[derive(Debug, Deserialize)]
struct SpecialistQuery {
    id: Option<String>,
    locale: Option<String>,
}

/// GET /api/specialists — List all specialists or get a specific one.
///
/// For desktop/SQLite version, we return bundled specialists only.
/// Full CRUD operations require Postgres (Vercel deployment).
async fn list_specialists(
    State(_state): State<AppState>,
    Query(query): Query<SpecialistQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let specialists = load_specialists(query.locale.as_deref());

    if let Some(id) = query.id {
        let specialist = specialists.iter().find(|s| s["id"] == id);
        if let Some(s) = specialist {
            return Ok(Json(s.clone()));
        }
        return Err(ServerError::NotFound("Specialist not found".to_string()));
    }

    Ok(Json(serde_json::json!({ "specialists": specialists })))
}

/// POST /api/specialists — Create a new specialist.
///
/// Not supported in desktop/SQLite version.
async fn create_specialist(
    State(_state): State<AppState>,
    Json(_body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    Err(ServerError::NotImplemented(
        "Specialist creation requires Postgres database (Vercel deployment)".to_string(),
    ))
}

/// PUT /api/specialists — Update a specialist.
///
/// Not supported in desktop/SQLite version.
async fn update_specialist(
    State(_state): State<AppState>,
    Json(_body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    Err(ServerError::NotImplemented(
        "Specialist updates require Postgres database (Vercel deployment)".to_string(),
    ))
}

/// DELETE /api/specialists — Delete a specialist.
///
/// Not supported in desktop/SQLite version.
async fn delete_specialist(
    State(_state): State<AppState>,
    Query(_query): Query<SpecialistQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    Err(ServerError::NotImplemented(
        "Specialist deletion requires Postgres database (Vercel deployment)".to_string(),
    ))
}

fn load_specialists(locale: Option<&str>) -> Vec<Value> {
    let mut loader = SpecialistLoader::new();
    if let Some(locale) = locale.filter(|locale| !locale.is_empty() && *locale != "en") {
        loader.load_default_dirs_with_locale(locale);
    } else {
        loader.load_default_dirs();
    }

    let mut specialists = loader.all().values().cloned().collect::<Vec<_>>();

    if specialists.is_empty() {
        specialists = SpecialistLoader::builtin_specialists();
    } else {
        for builtin in SpecialistLoader::builtin_specialists() {
            if !specialists
                .iter()
                .any(|specialist| specialist.id == builtin.id)
            {
                specialists.push(builtin);
            }
        }
    }

    specialists.sort_by(|left, right| left.id.cmp(&right.id));
    specialists.into_iter().map(specialist_to_json).collect()
}

fn specialist_to_json(specialist: SpecialistDef) -> Value {
    serde_json::json!({
        "id": specialist.id,
        "name": specialist.name,
        "description": specialist.description,
        "role": specialist.role,
        "defaultModelTier": specialist.model_tier.to_uppercase(),
        "systemPrompt": specialist.system_prompt,
        "roleReminder": specialist.role_reminder,
        "defaultProvider": specialist.default_provider,
        "defaultAdapter": specialist.default_adapter,
        "defaultModel": specialist.default_model,
        "metadata": specialist.metadata,
        "source": "bundled",
        "enabled": true
    })
}

#[cfg(test)]
mod tests {
    use super::load_specialists;
    use std::ffi::OsString;
    use std::path::Path;
    use std::sync::{Mutex, MutexGuard, OnceLock};

    static ROUTA_SPECIALISTS_RESOURCE_DIR_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

    fn specialists_resource_dir_lock() -> &'static Mutex<()> {
        ROUTA_SPECIALISTS_RESOURCE_DIR_LOCK.get_or_init(|| Mutex::new(()))
    }

    struct EnvVarGuard {
        key: &'static str,
        previous: Option<OsString>,
    }

    impl EnvVarGuard {
        fn set_var_and_restore(value: &Path) -> Self {
            let key = "ROUTA_SPECIALISTS_RESOURCE_DIR";
            let previous = std::env::var_os(key);
            std::env::set_var(key, value);
            Self { key, previous }
        }
    }

    impl Drop for EnvVarGuard {
        fn drop(&mut self) {
            if let Some(prev) = self.previous.clone() {
                std::env::set_var(self.key, prev);
            } else {
                std::env::remove_var(self.key);
            }
        }
    }

    struct SpecialistsResourceDirScope {
        _lock: MutexGuard<'static, ()>,
        _restore: EnvVarGuard,
    }

    fn with_specialists_resource_dir(path: &Path) -> SpecialistsResourceDirScope {
        let lock = specialists_resource_dir_lock().lock().unwrap();
        let restore = EnvVarGuard::set_var_and_restore(path);
        SpecialistsResourceDirScope {
            _lock: lock,
            _restore: restore,
        }
    }

    #[test]
    fn load_specialists_uses_locale_overlays_when_requested() {
        let temp_dir = tempfile::tempdir().unwrap();
        let bundled_root = temp_dir.path().join("resources").join("specialists");
        std::fs::create_dir_all(bundled_root.join("core")).unwrap();
        std::fs::create_dir_all(bundled_root.join("locales").join("zh-CN").join("core")).unwrap();
        std::fs::write(
            bundled_root.join("core").join("developer.yaml"),
            r#"id: "developer"
name: "Developer"
role: "DEVELOPER"
model_tier: "smart"
system_prompt: "English prompt"
"#,
        )
        .unwrap();
        std::fs::write(
            bundled_root
                .join("locales")
                .join("zh-CN")
                .join("core")
                .join("developer.yaml"),
            r#"id: "developer"
name: "开发者"
role: "DEVELOPER"
model_tier: "smart"
system_prompt: "中文 prompt"
"#,
        )
        .unwrap();

        let _scope = with_specialists_resource_dir(temp_dir.path());

        let specialists = load_specialists(Some("zh-CN"));
        let developer = specialists
            .iter()
            .find(|specialist| specialist["id"] == "developer")
            .unwrap();

        assert_eq!(developer["name"], "开发者");
        assert_eq!(developer["systemPrompt"], "中文 prompt");
    }
}
