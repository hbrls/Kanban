/**
 * Trace Replay — Converts stored TraceRecord[] into higher-level event streams.
 *
 * Two replay modes are provided:
 *
 * 1. **EventBridge Replay** — Feeds TraceRecords through AgentEventBridge
 *    to produce WorkspaceAgentEvent[] (semantic block layer).
 *
 * 2. **AG-UI Replay** — Feeds TraceRecords through RoutaToAGUIAdapter
 *    to produce AGUIBaseEvent[] (AG-UI protocol events).
 *
 * This avoids duplicating the conversion logic that currently lives in
 * trace-panel.tsx (inferToolName, mergeToolTraces, etc.), and instead
 * re-uses the single-source-of-truth converters.
 */

import type { TraceRecord } from "./types";
import type { NormalizedSessionUpdate, NormalizedToolCall } from "../acp/provider-adapter/types";
import { AgentEventBridge, makeStartedEvent } from "../acp/agent-event-bridge";
import type { WorkspaceAgentEvent } from "../acp/agent-event-bridge/types";
import { RoutaToAGUIAdapter, type AGUIBaseEvent } from "../ag-ui/event-adapter";
import type { SessionUpdateNotification } from "../acp/http-session-store";

// ─── TraceRecord → NormalizedSessionUpdate ────────────────────────────────────

/**
 * Map a TraceRecord to a NormalizedSessionUpdate that AgentEventBridge can
 * process. This is the "replay adapter" — it recreates the wire format from
 * the persisted trace.
 */
export function traceToNormalizedUpdate(trace: TraceRecord): NormalizedSessionUpdate | null {
  const base = {
    sessionId: trace.sessionId,
    provider: (trace.contributor?.provider ?? "unknown") as NormalizedSessionUpdate["provider"],
    timestamp: new Date(trace.timestamp),
  };

  switch (trace.eventType) {
    case "user_message":
      return {
        ...base,
        eventType: "user_message",
        message: {
          role: "user",
          content: trace.conversation?.fullContent ?? trace.conversation?.contentPreview ?? "",
          isChunk: false,
        },
      };

    case "agent_message":
      return {
        ...base,
        eventType: "agent_message",
        message: {
          role: "assistant",
          content: trace.conversation?.fullContent ?? trace.conversation?.contentPreview ?? "",
          isChunk: false,
        },
      };

    case "agent_thought":
      return {
        ...base,
        eventType: "agent_thought",
        message: {
          role: "assistant",
          content: trace.conversation?.fullContent ?? trace.conversation?.contentPreview ?? "",
          isChunk: false,
        },
      };

    case "tool_call": {
      const toolCall: NormalizedToolCall = {
        toolCallId: trace.tool?.toolCallId ?? trace.id,
        name: trace.tool?.name ?? "unknown",
        status: mapTraceToolStatus(trace.tool?.status ?? "running"),
        input: normalizeToolInput(trace.tool?.input),
        output: trace.tool?.output,
        inputFinalized: true,
      };
      return {
        ...base,
        eventType: "tool_call",
        toolCall,
      };
    }

    case "tool_result": {
      const toolCall: NormalizedToolCall = {
        toolCallId: trace.tool?.toolCallId ?? trace.id,
        name: trace.tool?.name ?? "unknown",
        status: mapTraceToolStatus(trace.tool?.status ?? "completed"),
        input: normalizeToolInput(trace.tool?.input),
        output: trace.tool?.output,
        inputFinalized: true,
      };
      return {
        ...base,
        eventType: "tool_call_update",
        toolCall,
      };
    }

    case "session_start":
      // Not a NormalizedSessionUpdate event type — handled separately
      return null;

    case "session_end":
      return {
        ...base,
        eventType: "turn_complete",
        turnComplete: {
          stopReason: "end_turn",
        },
      };

    default:
      return null;
  }
}

/**
 * Map a TraceRecord to the ACP-style notification that RoutaToAGUIAdapter expects.
 * The adapter reads `.update.sessionUpdate` and other flat fields from the update object.
 */
export function traceToACPNotification(trace: TraceRecord): SessionUpdateNotification | null {
  const sessionId = trace.sessionId;

  switch (trace.eventType) {
    case "agent_message":
      return {
        sessionId,
        update: {
          sessionUpdate: "agent_message",
          content: {
            type: "text",
            text: trace.conversation?.fullContent ?? trace.conversation?.contentPreview ?? "",
          },
        },
      };

    case "agent_thought":
      return {
        sessionId,
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: {
            type: "text",
            text: trace.conversation?.fullContent ?? trace.conversation?.contentPreview ?? "",
          },
        },
      };

    case "tool_call":
      return {
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: trace.tool?.toolCallId ?? trace.id,
          toolName: trace.tool?.name ?? "unknown",
          input: trace.tool?.input,
          rawInput: trace.tool?.input,
        },
      };

    case "tool_result":
      return {
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: trace.tool?.toolCallId ?? trace.id,
          status: trace.tool?.status === "failed" ? "error" : "completed",
          result: trace.tool?.output,
          output: trace.tool?.output,
        },
      };

    case "session_end":
      return {
        sessionId,
        update: {
          sessionUpdate: "turn_complete",
          stopReason: "end_turn",
        },
      };

    case "user_message":
    case "session_start":
      // These don't produce AG-UI events
      return null;

    default:
      return null;
  }
}

// ─── High-level Replay Functions ──────────────────────────────────────────────

/**
 * Replay an array of TraceRecords through AgentEventBridge.
 * Returns a time-ordered array of WorkspaceAgentEvent[].
 */
export function replayTracesAsEventBridge(
  traces: TraceRecord[],
  sessionId: string,
): WorkspaceAgentEvent[] {
  const bridge = new AgentEventBridge(sessionId);
  const events: WorkspaceAgentEvent[] = [];
  const sorted = [...traces].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const provider = sorted[0]?.contributor?.provider ?? "unknown";
  const startedAt = sorted[0]?.timestamp ? new Date(sorted[0].timestamp) : new Date();

  // Emit agent_started with the persisted trace timestamp for deterministic replay.
  events.push(makeStartedEvent(sessionId, provider, startedAt));

  for (const trace of sorted) {
    const update = traceToNormalizedUpdate(trace);
    if (update) {
      const generated = bridge.process(update);
      events.push(...generated);
    }
  }

  bridge.cleanup();
  return events;
}

/**
 * Replay an array of TraceRecords through RoutaToAGUIAdapter.
 * Returns a time-ordered array of AGUIBaseEvent[].
 */
export function replayTracesAsAGUI(
  traces: TraceRecord[],
  threadId: string,
  runId: string,
): AGUIBaseEvent[] {
  const adapter = new RoutaToAGUIAdapter(threadId, runId);
  const events: AGUIBaseEvent[] = [];

  // Sort by timestamp
  const sorted = [...traces].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  for (const trace of sorted) {
    const notification = traceToACPNotification(trace);
    if (notification) {
      // The adapter expects SessionUpdateNotification shape
      const generated = adapter.convert(notification);
      events.push(...generated);
    }
  }

  // Flush remaining open streams
  events.push(...adapter.flush());
  return events;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapTraceToolStatus(status: string): NormalizedToolCall["status"] {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "pending":
      return "pending";
    case "running":
    default:
      return "running";
  }
}

function normalizeToolInput(input: unknown): Record<string, unknown> | undefined {
  if (!input) return undefined;
  if (typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input === "string") {
    try {
      return JSON.parse(input);
    } catch {
      return { raw: input };
    }
  }
  return { value: input };
}
