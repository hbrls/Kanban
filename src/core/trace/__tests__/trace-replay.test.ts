/**
 * Tests for trace-replay module.
 *
 * Verifies that TraceRecords are correctly converted to:
 * 1. NormalizedSessionUpdate (for AgentEventBridge)
 * 2. SessionUpdateNotification (for AG-UI adapter)
 * 3. End-to-end replay produces correct WorkspaceAgentEvent[]
 * 4. End-to-end replay produces correct AGUIBaseEvent[]
 */

import { describe, expect, it } from "vitest";
import type { TraceRecord } from "../types";
import {
  traceToNormalizedUpdate,
  traceToACPNotification,
  replayTracesAsEventBridge,
  replayTracesAsAGUI,
} from "../trace-replay";

// ─── Test Data Factory ────────────────────────────────────────────────────────

function makeTrace(
  eventType: TraceRecord["eventType"],
  overrides: Partial<TraceRecord> = {},
): TraceRecord {
  return {
    version: "0.1.0",
    id: `trace-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    sessionId: "test-session-001",
    contributor: { provider: "claude", model: "claude-sonnet-4-20250514" },
    eventType,
    ...overrides,
  };
}

// ─── traceToNormalizedUpdate ──────────────────────────────────────────────────

describe("traceToNormalizedUpdate", () => {
  it("converts user_message trace", () => {
    const trace = makeTrace("user_message", {
      conversation: { role: "user", fullContent: "Hello world" },
    });
    const update = traceToNormalizedUpdate(trace);
    expect(update).not.toBeNull();
    expect(update!.eventType).toBe("user_message");
    expect(update!.message?.role).toBe("user");
    expect(update!.message?.content).toBe("Hello world");
    expect(update!.message?.isChunk).toBe(false);
  });

  it("converts agent_message trace", () => {
    const trace = makeTrace("agent_message", {
      conversation: { role: "assistant", fullContent: "Hi! How can I help?" },
    });
    const update = traceToNormalizedUpdate(trace);
    expect(update).not.toBeNull();
    expect(update!.eventType).toBe("agent_message");
    expect(update!.message?.role).toBe("assistant");
    expect(update!.message?.content).toBe("Hi! How can I help?");
  });

  it("converts agent_thought trace", () => {
    const trace = makeTrace("agent_thought", {
      conversation: { fullContent: "Let me think about this..." },
    });
    const update = traceToNormalizedUpdate(trace);
    expect(update).not.toBeNull();
    expect(update!.eventType).toBe("agent_thought");
    expect(update!.message?.content).toBe("Let me think about this...");
  });

  it("converts tool_call trace", () => {
    const trace = makeTrace("tool_call", {
      tool: {
        name: "read_file",
        toolCallId: "tc-001",
        status: "running",
        input: { path: "/src/index.ts" },
      },
    });
    const update = traceToNormalizedUpdate(trace);
    expect(update).not.toBeNull();
    expect(update!.eventType).toBe("tool_call");
    expect(update!.toolCall?.name).toBe("read_file");
    expect(update!.toolCall?.toolCallId).toBe("tc-001");
    expect(update!.toolCall?.status).toBe("running");
    expect(update!.toolCall?.input).toEqual({ path: "/src/index.ts" });
  });

  it("converts tool_result trace to tool_call_update", () => {
    const trace = makeTrace("tool_result", {
      tool: {
        name: "read_file",
        toolCallId: "tc-001",
        status: "completed",
        output: "file contents here",
      },
    });
    const update = traceToNormalizedUpdate(trace);
    expect(update).not.toBeNull();
    expect(update!.eventType).toBe("tool_call_update");
    expect(update!.toolCall?.status).toBe("completed");
    expect(update!.toolCall?.output).toBe("file contents here");
  });

  it("converts session_end trace to turn_complete", () => {
    const trace = makeTrace("session_end");
    const update = traceToNormalizedUpdate(trace);
    expect(update).not.toBeNull();
    expect(update!.eventType).toBe("turn_complete");
    expect(update!.turnComplete?.stopReason).toBe("end_turn");
  });

  it("returns null for session_start", () => {
    const trace = makeTrace("session_start");
    const update = traceToNormalizedUpdate(trace);
    expect(update).toBeNull();
  });

  it("falls back to contentPreview when fullContent is absent", () => {
    const trace = makeTrace("agent_message", {
      conversation: { contentPreview: "Preview text..." },
    });
    const update = traceToNormalizedUpdate(trace);
    expect(update!.message?.content).toBe("Preview text...");
  });
});

// ─── traceToACPNotification ──────────────────────────────────────────────────

describe("traceToACPNotification", () => {
  it("converts agent_message to sessionUpdate notification", () => {
    const trace = makeTrace("agent_message", {
      conversation: { fullContent: "Response text" },
    });
    const notif = traceToACPNotification(trace);
    expect(notif).not.toBeNull();
    expect(notif!.sessionId).toBe("test-session-001");
    expect(notif!.update?.sessionUpdate).toBe("agent_message");
    expect((notif!.update?.content as { text: string })?.text).toBe("Response text");
  });

  it("converts agent_thought to agent_thought_chunk", () => {
    const trace = makeTrace("agent_thought", {
      conversation: { fullContent: "Thinking..." },
    });
    const notif = traceToACPNotification(trace);
    expect(notif!.update?.sessionUpdate).toBe("agent_thought_chunk");
  });

  it("converts tool_call notification", () => {
    const trace = makeTrace("tool_call", {
      tool: { name: "bash", toolCallId: "tc-002", input: { command: "ls" } },
    });
    const notif = traceToACPNotification(trace);
    expect(notif!.update?.sessionUpdate).toBe("tool_call");
    expect(notif!.update?.toolName).toBe("bash");
    expect(notif!.update?.toolCallId).toBe("tc-002");
  });

  it("converts tool_result to tool_call_update", () => {
    const trace = makeTrace("tool_result", {
      tool: { name: "bash", toolCallId: "tc-002", status: "completed", output: "file1\nfile2" },
    });
    const notif = traceToACPNotification(trace);
    expect(notif!.update?.sessionUpdate).toBe("tool_call_update");
    expect(notif!.update?.status).toBe("completed");
  });

  it("returns null for user_message", () => {
    const trace = makeTrace("user_message");
    expect(traceToACPNotification(trace)).toBeNull();
  });

  it("returns null for session_start", () => {
    const trace = makeTrace("session_start");
    expect(traceToACPNotification(trace)).toBeNull();
  });
});

// ─── replayTracesAsEventBridge ───────────────────────────────────────────────

describe("replayTracesAsEventBridge", () => {
  it("replays a simple conversation into semantic events", () => {
    const traces: TraceRecord[] = [
      makeTrace("session_start", { timestamp: "2025-01-01T00:00:00Z" }),
      makeTrace("user_message", {
        timestamp: "2025-01-01T00:00:01Z",
        conversation: { fullContent: "Hello" },
      }),
      makeTrace("agent_thought", {
        timestamp: "2025-01-01T00:00:02Z",
        conversation: { fullContent: "Thinking about greeting" },
      }),
      makeTrace("agent_message", {
        timestamp: "2025-01-01T00:00:03Z",
        conversation: { fullContent: "Hi there!" },
      }),
      makeTrace("session_end", { timestamp: "2025-01-01T00:00:04Z" }),
    ];

    const events = replayTracesAsEventBridge(traces, "test-session-001");

    // Should have agent_started + user_message + thought_block + message_block + agent_completed
    const types = events.map((e) => e.type);
    expect(types).toContain("agent_started");
    expect(types).toContain("thought_block");
    expect(types).toContain("message_block");
    expect(types).toContain("agent_completed");
  });

  it("replays tool calls into typed blocks", () => {
    const traces: TraceRecord[] = [
      makeTrace("tool_call", {
        timestamp: "2025-01-01T00:00:01Z",
        tool: { name: "read_file", toolCallId: "tc-001", status: "running", input: { path: "/src/index.ts" } },
      }),
      makeTrace("tool_result", {
        timestamp: "2025-01-01T00:00:02Z",
        tool: { name: "read_file", toolCallId: "tc-001", status: "completed", output: "content" },
      }),
      makeTrace("tool_call", {
        timestamp: "2025-01-01T00:00:03Z",
        tool: { name: "bash", toolCallId: "tc-002", status: "running", input: { command: "ls" } },
      }),
      makeTrace("tool_result", {
        timestamp: "2025-01-01T00:00:04Z",
        tool: { name: "bash", toolCallId: "tc-002", status: "completed", output: "file1" },
      }),
    ];

    const events = replayTracesAsEventBridge(traces, "test-session-001");
    const types = events.map((e) => e.type);

    // read_file should produce read_block
    expect(types).toContain("read_block");
    // bash should produce terminal_block
    expect(types).toContain("terminal_block");
  });

  it("replays MCP tool calls into mcp_block", () => {
    const traces: TraceRecord[] = [
      makeTrace("tool_call", {
        timestamp: "2025-01-01T00:00:01Z",
        tool: { name: "mcp__server__tool", toolCallId: "tc-mcp", status: "running", input: { query: "test" } },
      }),
      makeTrace("tool_result", {
        timestamp: "2025-01-01T00:00:02Z",
        tool: { name: "mcp__server__tool", toolCallId: "tc-mcp", status: "completed", output: "result" },
      }),
    ];

    const events = replayTracesAsEventBridge(traces, "test-session-001");
    const types = events.map((e) => e.type);
    expect(types).toContain("mcp_block");
  });
});

// ─── replayTracesAsAGUI ──────────────────────────────────────────────────────

describe("replayTracesAsAGUI", () => {
  it("replays a conversation into AG-UI events", () => {
    const traces: TraceRecord[] = [
      makeTrace("agent_thought", {
        timestamp: "2025-01-01T00:00:01Z",
        conversation: { fullContent: "Let me think..." },
      }),
      makeTrace("agent_message", {
        timestamp: "2025-01-01T00:00:02Z",
        conversation: { fullContent: "Hello!" },
      }),
      makeTrace("session_end", { timestamp: "2025-01-01T00:00:03Z" }),
    ];

    const events = replayTracesAsAGUI(traces, "thread-1", "run-1");
    const types = events.map((e) => e.type);

    // Should have reasoning events
    expect(types).toContain("REASONING_START");
    expect(types).toContain("REASONING_MESSAGE_CONTENT");

    // Should have text message events
    expect(types).toContain("TEXT_MESSAGE_START");
    expect(types).toContain("TEXT_MESSAGE_CONTENT");
    expect(types).toContain("TEXT_MESSAGE_END");

    // Should have run finished
    expect(types).toContain("RUN_FINISHED");
  });

  it("replays tool calls into AG-UI tool events", () => {
    const traces: TraceRecord[] = [
      makeTrace("tool_call", {
        timestamp: "2025-01-01T00:00:01Z",
        tool: { name: "search", toolCallId: "tc-001", status: "running", input: { query: "test" } },
      }),
      makeTrace("tool_result", {
        timestamp: "2025-01-01T00:00:02Z",
        tool: { name: "search", toolCallId: "tc-001", status: "completed", output: "found it" },
      }),
    ];

    const events = replayTracesAsAGUI(traces, "thread-1", "run-1");
    const types = events.map((e) => e.type);

    expect(types).toContain("TOOL_CALL_START");
    expect(types).toContain("TOOL_CALL_ARGS");
    expect(types).toContain("TOOL_CALL_END");
    expect(types).toContain("TOOL_CALL_RESULT");
  });

  it("flushes open streams at the end", () => {
    const traces: TraceRecord[] = [
      makeTrace("agent_message", {
        timestamp: "2025-01-01T00:00:01Z",
        conversation: { fullContent: "Hello" },
      }),
      // No session_end — adapter should flush
    ];

    const events = replayTracesAsAGUI(traces, "thread-1", "run-1");
    const types = events.map((e) => e.type);

    // The message should end with TEXT_MESSAGE_END from flush
    expect(types.filter((t) => t === "TEXT_MESSAGE_END").length).toBeGreaterThanOrEqual(1);
  });
});
