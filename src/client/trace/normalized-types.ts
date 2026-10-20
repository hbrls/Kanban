/** Intermediate events used only to convert persisted traces into display blocks. */
export interface NormalizedToolCall {
  toolCallId: string;
  name: string;
  title?: string;
  status: "pending" | "running" | "completed" | "failed";
  input?: Record<string, unknown>;
  output?: unknown;
  inputFinalized: boolean;
}

export interface NormalizedSessionUpdate {
  sessionId: string;
  provider: string;
  eventType:
    | "tool_call"
    | "tool_call_update"
    | "agent_message"
    | "agent_thought"
    | "user_message"
    | "plan_update"
    | "turn_complete"
    | "error";
  timestamp: Date;
  toolCall?: NormalizedToolCall;
  message?: {
    role: "user" | "assistant";
    content: string;
    isChunk: boolean;
  };
  turnComplete?: {
    stopReason: string;
    usage?: { inputTokens?: number; outputTokens?: number };
  };
  planItems?: Array<{ description: string; status: string }>;
  error?: { code: string; message: string };
}
