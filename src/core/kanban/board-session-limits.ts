const DEFAULT_KANBAN_SESSION_CONCURRENCY_LIMIT = 1;

function metadataKey(boardId: string): string {
  return `kanbanSessionConcurrencyLimit:${boardId}`;
}

export function getKanbanSessionConcurrencyLimit(
  metadata: Record<string, string> | undefined,
  boardId: string,
): number {
  const raw = metadata?.[metadataKey(boardId)];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_KANBAN_SESSION_CONCURRENCY_LIMIT;
  }
  return parsed;
}

export function setKanbanSessionConcurrencyLimit(
  metadata: Record<string, string> | undefined,
  boardId: string,
  limit: number,
): Record<string, string> {
  const normalizedLimit = Number.isFinite(limit) && limit >= 1
    ? Math.max(1, Math.floor(limit))
    : DEFAULT_KANBAN_SESSION_CONCURRENCY_LIMIT;
  return {
    ...(metadata ?? {}),
    [metadataKey(boardId)]: String(normalizedLimit),
  };
}

export function getDefaultKanbanSessionConcurrencyLimit(): number {
  return DEFAULT_KANBAN_SESSION_CONCURRENCY_LIMIT;
}
