import type { SessionKanbanContext as CoreSessionKanbanContext, SessionRelatedLaneHandoff } from "@/core/kanban/session-kanban-context";
import type { TaskLaneSession } from "@/core/models/task";

export type LaneSessionInfo = TaskLaneSession;
export type LaneHandoffInfo = SessionRelatedLaneHandoff;
export type SessionKanbanContext = CoreSessionKanbanContext;
