use chrono::Utc;
use rusqlite::OptionalExtension;
use std::collections::HashMap;

use crate::db::Database;
use crate::error::ServerError;
use crate::models::workspace::{Workspace, WorkspaceStatus};

pub struct WorkspaceStore {
    db: Database,
}

impl WorkspaceStore {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    pub async fn save(&self, workspace: &Workspace) -> Result<(), ServerError> {
        let ws = workspace.clone();
        self.db
            .with_conn_async(move |conn| {
                conn.execute(
                    "INSERT INTO workspaces (id, title, status, metadata, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                     ON CONFLICT(id) DO UPDATE SET
                       title = excluded.title,
                       status = excluded.status,
                       metadata = excluded.metadata,
                       updated_at = excluded.updated_at",
                    rusqlite::params![
                        ws.id,
                        ws.title,
                        ws.status.as_str(),
                        serde_json::to_string(&ws.metadata).unwrap_or_default(),
                        ws.created_at.timestamp_millis(),
                        ws.updated_at.timestamp_millis(),
                    ],
                )?;
                Ok(())
            })
            .await
    }

    pub async fn get(&self, id: &str) -> Result<Option<Workspace>, ServerError> {
        let id = id.to_string();
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, title, status, metadata, created_at, updated_at
                     FROM workspaces WHERE id = ?1",
                )?;
                stmt.query_row(rusqlite::params![id], |row| Ok(row_to_workspace(row)))
                    .optional()
            })
            .await
    }

    pub async fn list(&self) -> Result<Vec<Workspace>, ServerError> {
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, title, status, metadata, created_at, updated_at
                     FROM workspaces ORDER BY created_at DESC",
                )?;
                let rows = stmt
                    .query_map([], |row| Ok(row_to_workspace(row)))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await
    }

    pub async fn list_by_status(
        &self,
        status: WorkspaceStatus,
    ) -> Result<Vec<Workspace>, ServerError> {
        let status_str = status.as_str().to_string();
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, title, status, metadata, created_at, updated_at
                     FROM workspaces WHERE status = ?1 ORDER BY created_at DESC",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![status_str], |row| {
                        Ok(row_to_workspace(row))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await
    }

    pub async fn update_title(&self, id: &str, title: &str) -> Result<(), ServerError> {
        let id = id.to_string();
        let title = title.to_string();
        let now = Utc::now().timestamp_millis();
        self.db
            .with_conn_async(move |conn| {
                conn.execute(
                    "UPDATE workspaces SET title = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![title, now, id],
                )?;
                Ok(())
            })
            .await
    }

    pub async fn update_status(&self, id: &str, status: &str) -> Result<(), ServerError> {
        let id = id.to_string();
        let status = status.to_string();
        let now = Utc::now().timestamp_millis();
        self.db
            .with_conn_async(move |conn| {
                conn.execute(
                    "UPDATE workspaces SET status = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![status, now, id],
                )?;
                Ok(())
            })
            .await
    }

    pub async fn delete(&self, id: &str) -> Result<(), ServerError> {
        let id = id.to_string();
        self.db
            .with_conn_async(move |conn| {
                conn.execute(
                    "DELETE FROM workspaces WHERE id = ?1",
                    rusqlite::params![id],
                )?;
                Ok(())
            })
            .await
    }

    pub async fn ensure_default(&self) -> Result<Workspace, ServerError> {
        if let Some(ws) = self.get("default").await? {
            return Ok(ws);
        }
        let ws = Workspace::new("default".to_string(), "Default Workspace".to_string(), None);
        self.save(&ws).await?;
        Ok(ws)
    }
}

use rusqlite::Row;

fn row_to_workspace(row: &Row<'_>) -> Workspace {
    let metadata_str: String = row.get(3).unwrap_or_default();
    let metadata: HashMap<String, String> = serde_json::from_str(&metadata_str).unwrap_or_default();
    let created_ms: i64 = row.get(4).unwrap_or(0);
    let updated_ms: i64 = row.get(5).unwrap_or(0);

    Workspace {
        id: row.get(0).unwrap_or_default(),
        title: row.get(1).unwrap_or_default(),
        status: WorkspaceStatus::from_str(&row.get::<_, String>(2).unwrap_or_default()),
        metadata,
        created_at: chrono::DateTime::from_timestamp_millis(created_ms).unwrap_or_else(Utc::now),
        updated_at: chrono::DateTime::from_timestamp_millis(updated_ms).unwrap_or_else(Utc::now),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    async fn setup() -> WorkspaceStore {
        let db = Database::open_in_memory().expect("in-memory db should open");
        WorkspaceStore::new(db)
    }

    #[tokio::test]
    async fn save_get_and_list_roundtrip() {
        let store = setup().await;
        let mut metadata = HashMap::new();
        metadata.insert("env".to_string(), "dev".to_string());
        let ws = Workspace::new(
            "ws-1".to_string(),
            "Workspace 1".to_string(),
            Some(metadata),
        );

        store.save(&ws).await.expect("save should succeed");

        let loaded = store
            .get("ws-1")
            .await
            .expect("get should succeed")
            .expect("workspace should exist");
        assert_eq!(loaded.id, "ws-1");
        assert_eq!(loaded.title, "Workspace 1");
        assert_eq!(loaded.status, WorkspaceStatus::Active);
        assert_eq!(loaded.metadata.get("env").map(String::as_str), Some("dev"));

        let all = store.list().await.expect("list should succeed");
        assert_eq!(all.len(), 1);
    }

    #[tokio::test]
    async fn update_title_and_status_then_filter() {
        let store = setup().await;
        let ws = Workspace::new("ws-2".to_string(), "Old".to_string(), None);
        store.save(&ws).await.expect("save should succeed");

        store
            .update_title("ws-2", "New Title")
            .await
            .expect("update_title should succeed");
        store
            .update_status("ws-2", "archived")
            .await
            .expect("update_status should succeed");

        let archived = store
            .list_by_status(WorkspaceStatus::Archived)
            .await
            .expect("list_by_status should succeed");
        assert_eq!(archived.len(), 1);
        assert_eq!(archived[0].id, "ws-2");
        assert_eq!(archived[0].title, "New Title");
        assert_eq!(archived[0].status, WorkspaceStatus::Archived);
    }

    #[tokio::test]
    async fn ensure_default_is_idempotent() {
        let store = setup().await;

        let first = store
            .ensure_default()
            .await
            .expect("ensure_default should succeed");
        let second = store
            .ensure_default()
            .await
            .expect("ensure_default second call should succeed");

        assert_eq!(first.id, "default");
        assert_eq!(second.id, "default");
        let all = store.list().await.expect("list should succeed");
        assert_eq!(all.len(), 1);
    }

    #[tokio::test]
    async fn delete_removes_workspace() {
        let store = setup().await;
        let ws = Workspace::new("ws-3".to_string(), "To Delete".to_string(), None);
        store.save(&ws).await.expect("save should succeed");

        store.delete("ws-3").await.expect("delete should succeed");

        let loaded = store.get("ws-3").await.expect("get should succeed");
        assert!(loaded.is_none());
    }
}
