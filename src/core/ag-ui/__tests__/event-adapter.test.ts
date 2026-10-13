/**
 * Tests for RoutaToAGUIAdapter — Routa ACP → AG-UI event conversion
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RoutaToAGUIAdapter, AGUIEventType } from "@/core/ag-ui/event-adapter";
import type { SessionUpdateNotification } from "@/core/acp/http-session-store";

function makeNotification(
  sessionId: string,
  update: Record<string, unknown>,
): SessionUpdateNotification {
  return { sessionId, update };
}

describe("RoutaToAGUIAdapter", () => {
  let adapter: RoutaToAGUIAdapter;

  beforeEach(() => {
    adapter = new RoutaToAGUIAdapter("thread-1", "run-1");
  });

  describe("agent_message_chunk", () => {
    it("emits TEXT_MESSAGE_START + TEXT_MESSAGE_CONTENT on first chunk", () => {
      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello" },
        }),
      );

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(AGUIEventType.TEXT_MESSAGE_START);
      expect(events[0].role).toBe("assistant");
      expect(events[1].type).toBe(AGUIEventType.TEXT_MESSAGE_CONTENT);
      expect(events[1].delta).toBe("Hello");
    });

    it("emits only TEXT_MESSAGE_CONTENT on subsequent chunks", () => {
      // First chunk opens the message
      adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello" },
        }),
      );

      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: " world" },
        }),
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(AGUIEventType.TEXT_MESSAGE_CONTENT);
      expect(events[0].delta).toBe(" world");
    });

    it("skips empty content", () => {
      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "" },
        }),
      );

      expect(events).toHaveLength(0);
    });
  });

  describe("agent_message (full)", () => {
    it("emits START + CONTENT + END for full message", () => {
      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "agent_message",
          content: { type: "text", text: "Complete response" },
        }),
      );

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe(AGUIEventType.TEXT_MESSAGE_START);
      expect(events[1].type).toBe(AGUIEventType.TEXT_MESSAGE_CONTENT);
      expect(events[1].delta).toBe("Complete response");
      expect(events[2].type).toBe(AGUIEventType.TEXT_MESSAGE_END);
    });
  });

  describe("agent_thought_chunk", () => {
    it("emits REASONING_START + REASONING_MESSAGE_START + REASONING_MESSAGE_CONTENT", () => {
      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "Thinking..." },
        }),
      );

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe(AGUIEventType.REASONING_START);
      expect(events[1].type).toBe(AGUIEventType.REASONING_MESSAGE_START);
      expect(events[1].role).toBe("reasoning");
      expect(events[2].type).toBe(AGUIEventType.REASONING_MESSAGE_CONTENT);
      expect(events[2].delta).toBe("Thinking...");
    });

    it("closes text message before starting reasoning", () => {
      // Open a text message first
      adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello" },
        }),
      );

      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "Hmm..." },
        }),
      );

      // Should include TEXT_MESSAGE_END before reasoning
      expect(events[0].type).toBe(AGUIEventType.TEXT_MESSAGE_END);
      expect(events[1].type).toBe(AGUIEventType.REASONING_START);
    });
  });

  describe("tool_call", () => {
    it("emits TOOL_CALL_START + TOOL_CALL_ARGS", () => {
      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          toolName: "read_file",
          input: { path: "/foo.ts" },
        }),
      );

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(AGUIEventType.TOOL_CALL_START);
      expect(events[0].toolCallId).toBe("tc-1");
      expect(events[0].toolCallName).toBe("read_file");
      expect(events[1].type).toBe(AGUIEventType.TOOL_CALL_ARGS);
      expect(events[1].delta).toBe('{"path":"/foo.ts"}');
    });
  });

  describe("tool_call_update", () => {
    it("emits TOOL_CALL_END + TOOL_CALL_RESULT on completion", () => {
      // Start tool call first
      adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "tool_call",
          toolCallId: "tc-1",
          toolName: "read_file",
          input: {},
        }),
      );

      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-1",
          status: "completed",
          result: "file content here",
        }),
      );

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(AGUIEventType.TOOL_CALL_END);
      expect(events[0].toolCallId).toBe("tc-1");
      expect(events[1].type).toBe(AGUIEventType.TOOL_CALL_RESULT);
      expect(events[1].content).toBe("file content here");
      expect(events[1].role).toBe("tool");
    });
  });

  describe("turn_complete", () => {
    it("flushes open messages and emits RUN_FINISHED", () => {
      // Open a text message
      adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello" },
        }),
      );

      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "turn_complete",
          stopReason: "end_turn",
          usage: { inputTokens: 100, outputTokens: 50 },
        }),
      );

      // Should include TEXT_MESSAGE_END + RUN_FINISHED
      const types = events.map((e) => e.type);
      expect(types).toContain(AGUIEventType.TEXT_MESSAGE_END);
      expect(types).toContain(AGUIEventType.RUN_FINISHED);

      const finished = events.find(
        (e) => e.type === AGUIEventType.RUN_FINISHED,
      );
      expect(finished?.threadId).toBe("thread-1");
      expect(finished?.runId).toBe("run-1");
    });
  });

  describe("error", () => {
    it("emits RUN_ERROR", () => {
      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "error",
          message: "Something went wrong",
        }),
      );

      const errorEvent = events.find((e) => e.type === AGUIEventType.RUN_ERROR);
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.message).toBe("Something went wrong");
    });
  });

  describe("flush", () => {
    it("closes all open streams", () => {
      // Open message, reasoning, and tool call
      adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hi" },
        }),
      );

      const events = adapter.flush();
      const types = events.map((e) => e.type);
      expect(types).toContain(AGUIEventType.TEXT_MESSAGE_END);
    });

    it("returns empty array when nothing is open", () => {
      const events = adapter.flush();
      expect(events).toHaveLength(0);
    });
  });

  describe("unknown/skipped events", () => {
    it("returns empty array for user_message", () => {
      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "user_message",
          content: { type: "text", text: "user input" },
        }),
      );
      expect(events).toHaveLength(0);
    });

    it("returns RAW event for unknown update types", () => {
      const events = adapter.convert(
        makeNotification("s1", {
          sessionUpdate: "something_new",
          data: "foo",
        }),
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(AGUIEventType.RAW);
      expect(events[0].source).toBe("routa-acp");
    });

    it("returns empty array when update is missing", () => {
      const events = adapter.convert({ sessionId: "s1" });
      expect(events).toHaveLength(0);
    });
  });
});
