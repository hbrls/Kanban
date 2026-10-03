/**
 * AG-UI Event Adapter
 *
 * Converts Routa ACP session update events (JSON-RPC notifications) into
 * AG-UI protocol events (SSE stream).
 *
 * Mapping:
 *   ACP sessionUpdate          →  AG-UI EventType
 *   ──────────────────────────────────────────────────
 *   agent_message_chunk        →  TEXT_MESSAGE_CONTENT
 *   agent_message              →  TEXT_MESSAGE_START + TEXT_MESSAGE_CONTENT + TEXT_MESSAGE_END
 *   agent_thought_chunk        →  REASONING_MESSAGE_CONTENT
 *   tool_call                  →  TOOL_CALL_START + TOOL_CALL_ARGS + TOOL_CALL_END
 *   tool_call_update           →  TOOL_CALL_RESULT (when completed)
 *   turn_complete              →  RUN_FINISHED
 *   error                      →  RUN_ERROR
 *   user_message               →  (skipped — client-side only)
 */

import { v4 as uuidv4 } from "uuid";
import type { SessionUpdateNotification } from "@/core/acp/http-session-store";

/** AG-UI event types (subset used in the adapter) */
export enum AGUIEventType {
  TEXT_MESSAGE_START = "TEXT_MESSAGE_START",
  TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT",
  TEXT_MESSAGE_END = "TEXT_MESSAGE_END",
  TOOL_CALL_START = "TOOL_CALL_START",
  TOOL_CALL_ARGS = "TOOL_CALL_ARGS",
  TOOL_CALL_END = "TOOL_CALL_END",
  TOOL_CALL_RESULT = "TOOL_CALL_RESULT",
  REASONING_START = "REASONING_START",
  REASONING_MESSAGE_START = "REASONING_MESSAGE_START",
  REASONING_MESSAGE_CONTENT = "REASONING_MESSAGE_CONTENT",
  REASONING_MESSAGE_END = "REASONING_MESSAGE_END",
  REASONING_END = "REASONING_END",
  RUN_STARTED = "RUN_STARTED",
  RUN_FINISHED = "RUN_FINISHED",
  RUN_ERROR = "RUN_ERROR",
  STEP_STARTED = "STEP_STARTED",
  STEP_FINISHED = "STEP_FINISHED",
  RAW = "RAW",
  CUSTOM = "CUSTOM",
}

export interface AGUIBaseEvent {
  type: AGUIEventType;
  timestamp?: number;
  [key: string]: unknown;
}

/**
 * Stateful adapter that tracks open messages/tool calls and emits
 * the corresponding START / END bookend events automatically.
 */
export class RoutaToAGUIAdapter {
  private currentMessageId: string | null = null;
  private currentReasoningId: string | null = null;
  private isReasoningOpen = false;
  private openToolCalls = new Set<string>();

  constructor(
    private threadId: string,
    private runId: string,
  ) {}

  /**
   * Convert one ACP session-update notification into zero or more AG-UI events.
   */
  convert(notification: SessionUpdateNotification): AGUIBaseEvent[] {
    const update = notification.update;
    if (!update) return [];

    const sessionUpdate = update.sessionUpdate as string | undefined;
    if (!sessionUpdate) return [];

    const now = Date.now();

    switch (sessionUpdate) {
      case "agent_message_chunk":
        return this.handleMessageChunk(update, now);

      case "agent_message":
        return this.handleFullMessage(update, now);

      case "agent_thought_chunk":
        return this.handleThoughtChunk(update, now);

      case "tool_call":
        return this.handleToolCall(update, now);

      case "tool_call_update":
        return this.handleToolCallUpdate(update, now);

      case "turn_complete":
        return this.handleTurnComplete(update, now);

      case "error":
        return this.handleError(update, now);

      case "plan":
        return this.handlePlan(update, now);

      case "terminal_output":
        return this.handleTerminalOutput(update, now);

      case "session_renamed":
      case "current_mode_update":
      case "user_message":
        // Client-side only events, skip
        return [];

      default:
        // Forward as RAW event for debugging
        return [{
          type: AGUIEventType.RAW,
          timestamp: now,
          event: update,
          source: "routa-acp",
        }];
    }
  }

  /**
   * Generate events to close any open message/reasoning/tool streams.
   * Call this when the run finishes.
   */
  flush(): AGUIBaseEvent[] {
    const events: AGUIBaseEvent[] = [];
    const now = Date.now();

    if (this.currentMessageId) {
      events.push({
        type: AGUIEventType.TEXT_MESSAGE_END,
        timestamp: now,
        messageId: this.currentMessageId,
      });
      this.currentMessageId = null;
    }

    if (this.isReasoningOpen && this.currentReasoningId) {
      events.push({
        type: AGUIEventType.REASONING_MESSAGE_END,
        timestamp: now,
        messageId: this.currentReasoningId,
      });
      events.push({
        type: AGUIEventType.REASONING_END,
        timestamp: now,
        messageId: this.currentReasoningId,
      });
      this.isReasoningOpen = false;
      this.currentReasoningId = null;
    }

    for (const toolCallId of this.openToolCalls) {
      events.push({
        type: AGUIEventType.TOOL_CALL_END,
        timestamp: now,
        toolCallId,
      });
    }
    this.openToolCalls.clear();

    return events;
  }

  // ─── Private handlers ────────────────────────────────────────────────────

  private handleMessageChunk(
    update: Record<string, unknown>,
    now: number,
  ): AGUIBaseEvent[] {
    const events: AGUIBaseEvent[] = [];
    const content = update.content as { type?: string; text?: string } | undefined;
    const text = content?.text ?? "";

    if (!text) return [];

    // Close reasoning if open before starting text
    if (this.isReasoningOpen) {
      events.push(...this.closeReasoning(now));
    }

    // Auto-open text message if not already open
    if (!this.currentMessageId) {
      this.currentMessageId = uuidv4();
      events.push({
        type: AGUIEventType.TEXT_MESSAGE_START,
        timestamp: now,
        messageId: this.currentMessageId,
        role: "assistant",
      });
    }

    events.push({
      type: AGUIEventType.TEXT_MESSAGE_CONTENT,
      timestamp: now,
      messageId: this.currentMessageId,
      delta: text,
    });

    return events;
  }

  private handleFullMessage(
    update: Record<string, unknown>,
    now: number,
  ): AGUIBaseEvent[] {
    const events: AGUIBaseEvent[] = [];
    const content = update.content as { type?: string; text?: string } | undefined;
    const text = content?.text ?? "";

    if (!text) return [];

    // Close any existing message
    if (this.currentMessageId) {
      events.push({
        type: AGUIEventType.TEXT_MESSAGE_END,
        timestamp: now,
        messageId: this.currentMessageId,
      });
    }

    const messageId = uuidv4();
    this.currentMessageId = messageId;

    events.push(
      {
        type: AGUIEventType.TEXT_MESSAGE_START,
        timestamp: now,
        messageId,
        role: "assistant",
      },
      {
        type: AGUIEventType.TEXT_MESSAGE_CONTENT,
        timestamp: now,
        messageId,
        delta: text,
      },
      {
        type: AGUIEventType.TEXT_MESSAGE_END,
        timestamp: now,
        messageId,
      },
    );

    this.currentMessageId = null;
    return events;
  }

  private handleThoughtChunk(
    update: Record<string, unknown>,
    now: number,
  ): AGUIBaseEvent[] {
    const events: AGUIBaseEvent[] = [];
    const content = update.content as { type?: string; text?: string } | undefined;
    const text = content?.text ?? "";

    if (!text) return [];

    // Close text message if open before starting reasoning
    if (this.currentMessageId) {
      events.push({
        type: AGUIEventType.TEXT_MESSAGE_END,
        timestamp: now,
        messageId: this.currentMessageId,
      });
      this.currentMessageId = null;
    }

    // Auto-open reasoning block if not already open
    if (!this.isReasoningOpen) {
      this.currentReasoningId = uuidv4();
      this.isReasoningOpen = true;
      events.push(
        {
          type: AGUIEventType.REASONING_START,
          timestamp: now,
          messageId: this.currentReasoningId,
        },
        {
          type: AGUIEventType.REASONING_MESSAGE_START,
          timestamp: now,
          messageId: this.currentReasoningId,
          role: "reasoning",
        },
      );
    }

    events.push({
      type: AGUIEventType.REASONING_MESSAGE_CONTENT,
      timestamp: now,
      messageId: this.currentReasoningId!,
      delta: text,
    });

    return events;
  }

  private handleToolCall(
    update: Record<string, unknown>,
    now: number,
  ): AGUIBaseEvent[] {
    const events: AGUIBaseEvent[] = [];

    // Close text message if open
    if (this.currentMessageId) {
      events.push({
        type: AGUIEventType.TEXT_MESSAGE_END,
        timestamp: now,
        messageId: this.currentMessageId,
      });
      this.currentMessageId = null;
    }

    // Close reasoning if open
    if (this.isReasoningOpen) {
      events.push(...this.closeReasoning(now));
    }

    const toolCallId = (update.toolCallId as string) || uuidv4();
    const toolName = (update.toolName as string) || "unknown";
    const input = update.input ?? update.rawInput;
    const argsString = typeof input === "string" ? input : JSON.stringify(input ?? {});

    this.openToolCalls.add(toolCallId);

    events.push(
      {
        type: AGUIEventType.TOOL_CALL_START,
        timestamp: now,
        toolCallId,
        toolCallName: toolName,
        parentMessageId: this.currentMessageId ?? undefined,
      },
      {
        type: AGUIEventType.TOOL_CALL_ARGS,
        timestamp: now,
        toolCallId,
        delta: argsString,
      },
    );

    return events;
  }

  private handleToolCallUpdate(
    update: Record<string, unknown>,
    now: number,
  ): AGUIBaseEvent[] {
    const events: AGUIBaseEvent[] = [];
    const toolCallId = (update.toolCallId as string) || "";
    const status = update.status as string | undefined;

    if (status === "completed" || status === "error") {
      // End the tool call
      if (this.openToolCalls.has(toolCallId)) {
        events.push({
          type: AGUIEventType.TOOL_CALL_END,
          timestamp: now,
          toolCallId,
        });
        this.openToolCalls.delete(toolCallId);
      }

      // Emit result
      const result = update.result ?? update.output;
      const resultStr = typeof result === "string" ? result : JSON.stringify(result ?? {});

      events.push({
        type: AGUIEventType.TOOL_CALL_RESULT,
        timestamp: now,
        messageId: uuidv4(),
        toolCallId,
        content: resultStr,
        role: "tool",
      });
    }

    return events;
  }

  private handleTurnComplete(
    update: Record<string, unknown>,
    now: number,
  ): AGUIBaseEvent[] {
    const events: AGUIBaseEvent[] = [];

    // Flush all open streams
    events.push(...this.flush());

    // Emit run finished
    events.push({
      type: AGUIEventType.RUN_FINISHED,
      timestamp: now,
      threadId: this.threadId,
      runId: this.runId,
      result: {
        stopReason: update.stopReason,
        usage: update.usage,
      },
    });

    return events;
  }

  private handleError(
    update: Record<string, unknown>,
    now: number,
  ): AGUIBaseEvent[] {
    const events: AGUIBaseEvent[] = [];

    // Flush open streams
    events.push(...this.flush());

    const message = (update.message as string) ||
      (update.content as { text?: string })?.text ||
      "Unknown error";

    events.push({
      type: AGUIEventType.RUN_ERROR,
      timestamp: now,
      message,
      code: (update.code as string) || "INTERNAL_ERROR",
    });

    return events;
  }

  private handlePlan(
    update: Record<string, unknown>,
    now: number,
  ): AGUIBaseEvent[] {
    // Map plan to a STEP_STARTED event
    return [{
      type: AGUIEventType.CUSTOM,
      timestamp: now,
      name: "plan",
      value: update.entries ?? update,
    }];
  }

  private handleTerminalOutput(
    update: Record<string, unknown>,
    now: number,
  ): AGUIBaseEvent[] {
    return [{
      type: AGUIEventType.CUSTOM,
      timestamp: now,
      name: "terminal_output",
      value: {
        content: update.content,
        exitCode: update.exitCode,
      },
    }];
  }

  private closeReasoning(now: number): AGUIBaseEvent[] {
    if (!this.isReasoningOpen || !this.currentReasoningId) return [];

    const events: AGUIBaseEvent[] = [
      {
        type: AGUIEventType.REASONING_MESSAGE_END,
        timestamp: now,
        messageId: this.currentReasoningId,
      },
      {
        type: AGUIEventType.REASONING_END,
        timestamp: now,
        messageId: this.currentReasoningId,
      },
    ];

    this.isReasoningOpen = false;
    this.currentReasoningId = null;
    return events;
  }
}
