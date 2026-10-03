import { taskStatusToColumnId } from "../models/kanban";
import type { Task } from "../models/task";
import type { RoutaSystem } from "../routa-system";
import { ensureDefaultBoard } from "./boards";

export async function ensureTaskBoardContext(system: RoutaSystem, task: Task): Promise<Task> {
  const nextTask = { ...task };

  if (!nextTask.boardId) {
    const defaultBoard = await ensureDefaultBoard(system, nextTask.workspaceId);
    nextTask.boardId = defaultBoard.id;
  }

  if (!nextTask.columnId) {
    nextTask.columnId = taskStatusToColumnId(nextTask.status);
  }

  return nextTask;
}
