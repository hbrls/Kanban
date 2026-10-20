/**
 * Session history compaction helpers — merge consecutive
 * agent_message_chunk notifications into single agent_message entries.
 */

export type SessionHistoryNotification = {
  sessionId?: string;
  update?: {
    sessionUpdate?: string;
    content?: {
      type?: string;
      text?: string;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export interface SessionHistoryCompactionResult {
  history: SessionHistoryNotification[];
  originalCount: number;
  compactedCount: number;
  mergedChunks: number;
  mergedGroups: number;
}

export function getSessionHistoryChunkText(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const notification = value as SessionHistoryNotification & {
    text?: unknown;
    content?: unknown;
  };
  const directText = typeof notification.text === "string" ? notification.text : "";
  if (directText) {
    return directText;
  }

  if (typeof notification.content === "string") {
    return notification.content;
  }

  const updateContent = notification.update?.content;
  return typeof updateContent?.text === "string" ? updateContent.text : "";
}

export function isSessionHistoryChunk(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  const notification = value as SessionHistoryNotification & {
    type?: unknown;
    eventType?: unknown;
  };
  return notification.update?.sessionUpdate === "agent_message_chunk"
    || notification.type === "agent_message_chunk"
    || notification.eventType === "agent_message_chunk";
}

export function compactSessionHistoryNotifications(
  history: SessionHistoryNotification[],
): SessionHistoryCompactionResult {
  const compacted: SessionHistoryNotification[] = [];
  let currentChunks: SessionHistoryNotification[] = [];
  let currentSessionId: string | undefined;
  let mergedChunks = 0;
  let mergedGroups = 0;

  const flushChunks = () => {
    if (currentChunks.length === 0) {
      return;
    }

    if (currentChunks.length === 1) {
      compacted.push(currentChunks[0]);
      currentChunks = [];
      return;
    }

    const first = currentChunks[0];
    const firstRecord = first as SessionHistoryNotification & {
      content?: unknown;
      eventType?: unknown;
      text?: unknown;
      type?: unknown;
    };
    const text = currentChunks.map(getSessionHistoryChunkText).join("");
    const merged: SessionHistoryNotification = {
      ...first,
      sessionId: currentSessionId ?? first.sessionId,
      update: {
        ...(first.update ?? {}),
        sessionUpdate: "agent_message",
        content: {
          type: "text",
          text,
        },
        mergedFrom: currentChunks.length,
      },
    };
    if (firstRecord.type === "agent_message_chunk") {
      merged.type = "agent_message";
    }
    if (firstRecord.eventType === "agent_message_chunk") {
      merged.eventType = "agent_message";
    }
    if (typeof firstRecord.text === "string") {
      merged.text = text;
    }
    if (typeof firstRecord.content === "string") {
      merged.content = text;
    }
    compacted.push(merged);
    mergedChunks += currentChunks.length;
    mergedGroups++;
    currentChunks = [];
  };

  for (const notification of history) {
    if (isSessionHistoryChunk(notification)) {
      if (currentSessionId !== notification.sessionId) {
        flushChunks();
        currentSessionId = notification.sessionId;
      }
      currentChunks.push(notification);
      continue;
    }

    flushChunks();
    currentSessionId = notification.sessionId;
    compacted.push(notification);
  }

  flushChunks();

  return {
    history: compacted,
    originalCount: history.length,
    compactedCount: compacted.length,
    mergedChunks,
    mergedGroups,
  };
}
