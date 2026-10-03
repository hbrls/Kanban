export interface KanbanWorktreeNaming {
  shortTaskId: string;
  branch: string;
  label: string;
}

export function buildKanbanWorktreeNaming(taskId: string): KanbanWorktreeNaming {
  const normalizedTaskId = taskId.trim();
  const shortTaskId = normalizedTaskId.slice(0, 8) || "task";

  return {
    shortTaskId,
    branch: `issue/${shortTaskId}`,
    label: shortTaskId,
  };
}
