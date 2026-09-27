import { columnIdForTaskStatus, type KanbanBoard } from "../models/kanban";
import type { Task } from "../models/task";
import type { RoutaSystem } from "../routa-system";
import { ensureDefaultBoard } from "./boards";

export async function ensureTaskBoardContext(system: RoutaSystem, task: Task): Promise<Task> {
  const nextTask = { ...task };

  let board: KanbanBoard | null | undefined;
  if (!nextTask.boardId) {
    board = await ensureDefaultBoard(system, nextTask.workspaceId);
    nextTask.boardId = board.id;
  }

  if (!nextTask.columnId) {
    board = board ?? await system.kanbanBoardStore.get(nextTask.boardId);
    nextTask.columnId = columnIdForTaskStatus(board?.columns ?? [], nextTask.status) ?? "backlog";
  }

  return nextTask;
}
