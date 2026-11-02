export type MessageRole = "user" | "assistant" | "thought" | "tool" | "plan" | "info" | "terminal";

export interface PlanEntry {
  content: string;
  priority?: "high" | "medium" | "low";
  status?: "pending" | "in_progress" | "completed";
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  toolName?: string;
  toolStatus?: string;
  toolCallId?: string;
  toolKind?: string;
  toolRawInput?: Record<string, unknown>;
  toolRawOutput?: unknown;
  delegatedTaskId?: string;
  completionSummary?: string;
  rawData?: Record<string, unknown>;
  planEntries?: PlanEntry[];
  usageUsed?: number;
  usageSize?: number;
  costAmount?: number;
  costCurrency?: string;
  terminalId?: string;
  terminalCommand?: string;
  terminalArgs?: string[];
  terminalInteractive?: boolean;
  terminalExited?: boolean;
  terminalExitCode?: number | null;
}

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
