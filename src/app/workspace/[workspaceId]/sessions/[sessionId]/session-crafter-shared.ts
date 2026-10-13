"use client";

import type { CrafterAgent, CrafterMessage } from "@/client/components/task-panel";
import type { RepoSelection } from "@/client/components/repo-picker";
import type { UseNotesReturn } from "@/client/hooks/use-notes";
import type { ParsedTask } from "@/client/utils/task-block-parser";
import type { AgentRole, SpecialistOption } from "./use-session-page-bootstrap";

export type NoteTaskQueueItem = { noteId: string; mode: "quick-access" | "provider" };

export interface ResolveAgentConfigResult {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface UseSessionCraftersParams {
  sessionId: string;
  workspaceId: string;
  isResolved: boolean;
  acpConnected: boolean;
  acpUpdates: unknown[];
  notesHook: UseNotesReturn;
  repoSelection: RepoSelection | null;
  focusedSessionId: string | null;
  setFocusedSessionId: (sessionId: string | null) => void;
  bumpRefresh: () => void;
  resolveAgentConfig: (
    role?: AgentRole,
    explicitProvider?: string,
    explicitModel?: string,
    specialist?: SpecialistOption | null,
  ) => ResolveAgentConfigResult;
}

export interface UseSessionCraftersResult {
  routaTasks: ParsedTask[];
  crafterAgents: CrafterAgent[];
  activeCrafterId: string | null;
  concurrency: number;
  handleTasksDetected: (tasks: ParsedTask[]) => Promise<void>;
  handleConfirmAllTasks: () => void;
  handleConfirmTask: (taskId: string) => void;
  handleEditTask: (taskId: string, updated: Partial<ParsedTask>) => void;
  handleExecuteTask: (taskId: string) => Promise<CrafterAgent | null>;
  handleExecuteAllTasks: (requestedConcurrency: number) => Promise<void>;
  handleSelectCrafter: (agentId: string) => void;
  handleSelectNoteTask: (noteId: string) => void;
  handleConcurrencyChange: (n: number) => void;
  handleExecuteProviderNoteTask: (noteId: string) => Promise<CrafterAgent | null>;
  handleOpenOrExecuteNoteTask: (noteId: string) => Promise<CrafterAgent | null>;
  handleExecuteAllNoteTasks: (requestedConcurrency: number) => Promise<void>;
  handleExecuteSelectedNoteTasks: (noteIds: string[], requestedConcurrency: number) => Promise<void>;
  handleUpdateAgentMessages: (agentId: string, messages: CrafterMessage[]) => void;
}

export function extractResultId(resultText: string): string | undefined {
  try {
    const parsed = JSON.parse(resultText);
    return parsed.taskId ?? parsed.id;
  } catch {
    const match = resultText.match(/"(?:taskId|id)"\s*:\s*"([^"]+)"/);
    return match?.[1];
  }
}

export function extractDelegationPayload(delegateText: string): {
  agentId?: string;
  sessionId?: string;
  error?: string;
} {
  try {
    const parsed = JSON.parse(delegateText);
    return {
      agentId: parsed.agentId,
      sessionId: parsed.sessionId,
      error: parsed.error,
    };
  } catch {
    const agentMatch = delegateText.match(/"agentId"\s*:\s*"([^"]+)"/);
    const sessionMatch = delegateText.match(/"sessionId"\s*:\s*"([^"]+)"/);
    const errorMatch = delegateText.match(/"error"\s*:\s*"([^"]+)"/);
    return {
      agentId: agentMatch?.[1],
      sessionId: sessionMatch?.[1],
      error: errorMatch?.[1],
    };
  }
}

export function extractUpdateText(update: Record<string, unknown>): string {
  const content = update.content as { type?: string; text?: string } | undefined;
  if (content?.text) return content.text;
  if (typeof update.text === "string") return update.text;
  return "";
}

export function appendStreamMessage(
  messages: CrafterMessage[],
  role: "assistant" | "thought",
  text: string,
): CrafterMessage[] {
  if (!text) return messages;
  const nextMessages = [...messages];
  const lastMessage = nextMessages[nextMessages.length - 1];
  if (lastMessage && lastMessage.role === role && !lastMessage.toolName) {
    nextMessages[nextMessages.length - 1] = {
      ...lastMessage,
      content: lastMessage.content + text,
    };
    return nextMessages;
  }

  nextMessages.push({
    id: crypto.randomUUID(),
    role,
    content: text,
    timestamp: new Date(),
  });
  return nextMessages;
}
