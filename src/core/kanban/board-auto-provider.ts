function metadataKey(boardId: string): string {
  return `kanbanAutoProvider:${boardId}`;
}

function normalizeProviderId(providerId: string | null | undefined): string | undefined {
  const normalized = providerId?.trim();
  return normalized ? normalized : undefined;
}

export function getKanbanAutoProvider(
  metadata: Record<string, string> | undefined,
  boardId: string,
): string | undefined {
  return normalizeProviderId(metadata?.[metadataKey(boardId)]);
}

export function setKanbanAutoProvider(
  metadata: Record<string, string> | undefined,
  boardId: string,
  providerId: string | null | undefined,
): Record<string, string> {
  const nextMetadata = { ...(metadata ?? {}) };
  const normalizedProviderId = normalizeProviderId(providerId);

  if (normalizedProviderId) {
    nextMetadata[metadataKey(boardId)] = normalizedProviderId;
  } else {
    delete nextMetadata[metadataKey(boardId)];
  }

  return nextMetadata;
}
