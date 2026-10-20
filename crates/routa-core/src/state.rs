//! Shared application state for the axum server.

use std::sync::Arc;

use acp_manager::AcpManager;
use crate::db::Database;
use crate::events::EventBus;
use crate::skills::SkillRegistry;
use crate::store::{
    AcpSessionStore, AgentStore, ArtifactStore, CodebaseStore, ConversationStore, KanbanStore,
    NoteStore, ScheduleStore, TaskStore, WorkspaceStore, WorktreeStore,
};

/// Shared state accessible by all API handlers.
pub struct AppStateInner {
    pub db: Database,
    pub workspace_store: WorkspaceStore,
    pub codebase_store: CodebaseStore,
    pub worktree_store: WorktreeStore,
    pub agent_store: AgentStore,
    pub artifact_store: ArtifactStore,
    pub task_store: TaskStore,
    pub kanban_store: KanbanStore,
    pub note_store: NoteStore,
    pub schedule_store: ScheduleStore,
    pub conversation_store: ConversationStore,
    pub acp_session_store: AcpSessionStore,
    pub skill_registry: SkillRegistry,
    pub acp_manager: AcpManager,
    pub event_bus: EventBus,
}

pub type AppState = Arc<AppStateInner>;

impl AppStateInner {
    pub fn new(db: Database) -> Self {
        Self {
            workspace_store: WorkspaceStore::new(db.clone()),
            codebase_store: CodebaseStore::new(db.clone()),
            worktree_store: WorktreeStore::new(db.clone()),
            agent_store: AgentStore::new(db.clone()),
            artifact_store: ArtifactStore::new(db.clone()),
            task_store: TaskStore::new(db.clone()),
            kanban_store: KanbanStore::new(db.clone()),
            note_store: NoteStore::new(db.clone()),
            schedule_store: ScheduleStore::new(db.clone()),
            conversation_store: ConversationStore::new(db.clone()),
            acp_session_store: AcpSessionStore::new(db.clone()),
            skill_registry: SkillRegistry::new(),
            acp_manager: AcpManager::new(),
            event_bus: EventBus::new(),
            db,
        }
    }
}
