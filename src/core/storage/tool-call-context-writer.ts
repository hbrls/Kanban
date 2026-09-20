/**
 * ToolCallContextWriter — Fine-grained tool call context file storage.
 *
 * Stores tool call context under:
 * ~/.routa/projects/{folder-slug}/sessions/{sessionId}/tool-calls/{toolCallId}/call_{id}__routa-{timestamp}/
 *   ├── content.txt      # Tool call detailed context
 *   └── metadata.json    # Metadata
 *
 * Inspired by GitHub Copilot Chat's chat-session-resources mechanism.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getSessionsDir } from "./folder-slug";

/**
 * Tool call context metadata.
 */
export interface ToolCallContextMetadata {
  toolName: string;
  toolCallId: string;
  sessionId: string;
  timestamp: string;
  status: "running" | "completed" | "failed";
  provider: string;
  /** Duration in milliseconds (only for completed/failed) */
  durationMs?: number;
}

/**
 * Input for writing tool call context.
 */
export interface ToolCallContextInput {
  toolName: string;
  toolCallId: string;
  sessionId: string;
  provider: string;
  status: "running" | "completed" | "failed";
  input?: unknown;
  output?: unknown;
  /** Start timestamp for duration calculation */
  startTimestamp?: string;
}

export interface ToolCallContextPaths {
  resourceId: string;
  contextDir: string;
  contentPath: string;
  metadataPath: string;
}

/**
 * Generate a unique resource ID in the format: call_{uniqueId}__routa-{timestamp}
 */
function generateResourceId(toolCallId: string): string {
  const timestamp = Date.now();
  // Use first 8 chars of toolCallId for readability
  const shortId = toolCallId.slice(0, 8);
  return `call_${shortId}__routa-${timestamp}`;
}

/**
 * Format content.txt for a tool call.
 */
function formatContentTxt(ctx: ToolCallContextInput): string {
  const lines: string[] = [
    `Tool Call: ${ctx.toolName}`,
    `Session: ${ctx.sessionId}`,
    `ToolCallId: ${ctx.toolCallId}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Status: ${ctx.status}`,
    "",
  ];

  if (ctx.input !== undefined) {
    lines.push("Input:");
    lines.push(JSON.stringify(ctx.input, null, 2));
    lines.push("");
  }

  if (ctx.output !== undefined) {
    lines.push("Output:");
    const outputStr =
      typeof ctx.output === "string"
        ? ctx.output
        : JSON.stringify(ctx.output, null, 2);
    // Truncate very long outputs
    const maxLen = 50000;
    lines.push(outputStr.length > maxLen ? outputStr.slice(0, maxLen) + "\n... (truncated)" : outputStr);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * ToolCallContextWriter handles writing tool call context files.
 */
export class ToolCallContextWriter {
  /** Cache of toolCallId → resourceId for consistent naming */
  private resourceIdCache = new Map<string, string>();
  /** Cache of toolCallId → start timestamp for duration calculation */
  private startTimestamps = new Map<string, string>();

  constructor(private projectPath: string) {}

  /**
   * Get the tool calls directory for a session.
   */
  private getToolCallsDir(sessionId: string): string {
    return path.join(getSessionsDir(this.projectPath), sessionId, "tool-calls");
  }

  /**
   * Get or create a resource ID for a tool call.
   */
  private getResourceId(toolCallId: string): string {
    let resourceId = this.resourceIdCache.get(toolCallId);
    if (!resourceId) {
      resourceId = generateResourceId(toolCallId);
      this.resourceIdCache.set(toolCallId, resourceId);
    }
    return resourceId;
  }

  /**
   * Get the context directory for a specific tool call.
   */
  private getContextDir(sessionId: string, toolCallId: string): string {
    const resourceId = this.getResourceId(toolCallId);
    return path.join(
      this.getToolCallsDir(sessionId),
      toolCallId,
      resourceId
    );
  }

  /**
   * Return the stable paths that will be used for this tool call context.
   * Traces can reference these paths before the async write finishes.
   */
  getContextPaths(sessionId: string, toolCallId: string): ToolCallContextPaths {
    const resourceId = this.getResourceId(toolCallId);
    const contextDir = path.join(this.getToolCallsDir(sessionId), toolCallId, resourceId);
    return {
      resourceId,
      contextDir,
      contentPath: path.join(contextDir, "content.txt"),
      metadataPath: path.join(contextDir, "metadata.json"),
    };
  }

  /**
   * Write tool call context files (content.txt and metadata.json).
   */
  async writeContext(ctx: ToolCallContextInput): Promise<void> {
    const { contextDir, contentPath, metadataPath } = this.getContextPaths(
      ctx.sessionId,
      ctx.toolCallId
    );
    await fs.mkdir(contextDir, { recursive: true });

    // Track start timestamp for duration calculation
    if (ctx.status === "running") {
      this.startTimestamps.set(ctx.toolCallId, new Date().toISOString());
    }

    // Calculate duration if completing
    let durationMs: number | undefined;
    if (ctx.status === "completed" || ctx.status === "failed") {
      const startTs = ctx.startTimestamp || this.startTimestamps.get(ctx.toolCallId);
      if (startTs) {
        durationMs = Date.now() - new Date(startTs).getTime();
      }
      this.startTimestamps.delete(ctx.toolCallId);
    }

    // Write content.txt
    await fs.writeFile(contentPath, formatContentTxt(ctx), "utf-8");

    // Write metadata.json
    const metadata: ToolCallContextMetadata = {
      toolName: ctx.toolName,
      toolCallId: ctx.toolCallId,
      sessionId: ctx.sessionId,
      timestamp: new Date().toISOString(),
      status: ctx.status,
      provider: ctx.provider,
      ...(durationMs !== undefined && { durationMs }),
    };
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }
}
