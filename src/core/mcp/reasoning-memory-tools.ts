import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  LOAD_RETROSPECTIVE_MEMORY_TOOL_NAME,
  SAVE_REASONING_MEMORY_TOOL_NAME,
  SAVE_RETROSPECTIVE_MEMORY_TOOL_NAME,
  SEARCH_REASONING_MEMORY_TOOL_NAME,
  loadFeatureRetrospectiveMemoryFromToolArgs,
  saveFeatureRetrospectiveMemoryFromToolArgs,
  saveReasoningMemoryFromToolArgs,
  searchReasoningMemoriesFromToolArgs,
} from "../harness/task-adaptive-tool";
import type { ToolResult } from "../tools/tool-result";

export {
  LOAD_RETROSPECTIVE_MEMORY_TOOL_NAME,
  SAVE_REASONING_MEMORY_TOOL_NAME,
  SAVE_RETROSPECTIVE_MEMORY_TOOL_NAME,
  SEARCH_REASONING_MEMORY_TOOL_NAME,
} from "../harness/task-adaptive-tool";

interface TextMcpToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
}

type ToolResultMapper = (result: ToolResult) => TextMcpToolResult;

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const REASONING_MEMORY_TOOL_NAMES = [
  SEARCH_REASONING_MEMORY_TOOL_NAME,
  SAVE_REASONING_MEMORY_TOOL_NAME,
] as const;

export type ReasoningMemoryToolName = typeof REASONING_MEMORY_TOOL_NAMES[number];

export const MEMORY_MCP_TOOL_NAMES = [
  LOAD_RETROSPECTIVE_MEMORY_TOOL_NAME,
  SAVE_RETROSPECTIVE_MEMORY_TOOL_NAME,
  ...REASONING_MEMORY_TOOL_NAMES,
] as const;

export type MemoryMcpToolName = typeof MEMORY_MCP_TOOL_NAMES[number];

const LOAD_RETROSPECTIVE_MEMORY_DESCRIPTION =
  "Load previously saved prompt-ready retrospective memory for selected files or a feature before transcript rereads.";

const SAVE_RETROSPECTIVE_MEMORY_DESCRIPTION =
  "Persist a short prompt-ready retrospective summary for a file or feature so future specialist runs can reuse it as durable memory.";

const SEARCH_REASONING_MEMORY_DESCRIPTION =
  "Search prompt-ready strategy memories learned from prior successful or failed agent runs before starting similar Kanban work.";

const SAVE_REASONING_MEMORY_DESCRIPTION =
  "Persist a concise operational lesson from a successful, failed, or mixed agent trajectory for future strategy retrieval.";

const STRING_ARRAY_SCHEMA = {
  type: "array",
  items: { type: "string" },
} as const;

const LOAD_RETROSPECTIVE_MEMORY_INPUT_SCHEMA = {
  type: "object",
  properties: {
    workspaceId: { type: "string", description: "Workspace ID. Uses the current MCP session workspace when omitted." },
    codebaseId: { type: "string", description: "Optional codebase ID override for repository resolution." },
    repoPath: { type: "string", description: "Optional repository path override for repository resolution." },
    featureId: { type: "string", description: "Optional Feature Explorer feature ID to load feature-level memory." },
    filePaths: { ...STRING_ARRAY_SCHEMA, description: "Optional repository-relative files to load file-level memory for." },
  },
} as const;

const SAVE_RETROSPECTIVE_MEMORY_INPUT_SCHEMA = {
  type: "object",
  properties: {
    workspaceId: { type: "string", description: "Workspace ID. Uses the current MCP session workspace when omitted." },
    codebaseId: { type: "string", description: "Optional codebase ID override for repository resolution." },
    repoPath: { type: "string", description: "Optional repository path override for repository resolution." },
    scope: {
      type: "string",
      enum: ["file", "feature"],
      description: "Whether to save file-level or feature-level retrospective memory.",
    },
    targetId: { type: "string", description: "Optional explicit target key. Use filePath or featureId when possible." },
    filePath: { type: "string", description: "Repository-relative target file when scope=file." },
    featureId: { type: "string", description: "Feature Tree ID when scope=feature or when file memory should keep feature context." },
    featureName: { type: "string", description: "Optional human-readable feature name for the saved memory." },
    summary: { type: "string", description: "Short prompt-ready summary to reuse next time." },
  },
  required: ["scope", "summary"],
} as const;

const SEARCH_REASONING_MEMORY_INPUT_SCHEMA = {
  type: "object",
  properties: {
    workspaceId: { type: "string", description: "Workspace ID. Uses the current MCP session workspace when omitted." },
    codebaseId: { type: "string", description: "Optional codebase ID override for repository resolution." },
    repoPath: { type: "string", description: "Optional repository path override for repository resolution." },
    query: { type: "string", description: "Free-text task or failure description to match against stored strategy memories." },
    taskId: { type: "string", description: "Optional current task/card ID used as a retrieval hint." },
    sourceTaskIds: { ...STRING_ARRAY_SCHEMA, description: "Optional source task IDs to match directly." },
    sessionIds: { ...STRING_ARRAY_SCHEMA, description: "Optional session IDs to match directly." },
    sourceSessionIds: { ...STRING_ARRAY_SCHEMA, description: "Optional source session IDs to match directly." },
    featureId: { type: "string", description: "Optional Feature Tree ID to match." },
    featureIds: { ...STRING_ARRAY_SCHEMA, description: "Optional Feature Tree IDs to match." },
    filePaths: { ...STRING_ARRAY_SCHEMA, description: "Optional repository-relative files to match." },
    tags: { ...STRING_ARRAY_SCHEMA, description: "Optional tags, symptoms, lanes, or domains to match." },
    lane: { type: "string", description: "Optional Kanban lane such as backlog, todo, dev, review, or done." },
    columnId: { type: "string", description: "Alias for lane." },
    provider: { type: "string", description: "Optional agent provider such as codex, claude, or auggie." },
    maxResults: { type: "integer", description: "Maximum memories to return. Defaults to 3 and is capped by the server." },
  },
} as const;

const SAVE_REASONING_MEMORY_INPUT_SCHEMA = {
  type: "object",
  properties: {
    workspaceId: { type: "string", description: "Workspace ID. Uses the current MCP session workspace when omitted." },
    codebaseId: { type: "string", description: "Optional codebase ID override for repository resolution." },
    repoPath: { type: "string", description: "Optional repository path override for repository resolution." },
    id: { type: "string", description: "Optional memory ID to update an existing strategy memory." },
    title: { type: "string", description: "Short human-readable title for the strategy memory." },
    description: { type: "string", description: "Optional additional context for the memory." },
    content: { type: "string", description: "Concise operational lesson. Do not include private chain-of-thought." },
    outcome: {
      type: "string",
      enum: ["success", "failure", "mixed"],
      description: "Whether the source trajectory succeeded, failed, or was mixed.",
    },
    taskId: { type: "string", description: "Optional current task/card ID to record as evidence." },
    sourceTaskIds: { ...STRING_ARRAY_SCHEMA, description: "Task/card IDs that produced this lesson." },
    sessionIds: { ...STRING_ARRAY_SCHEMA, description: "Session IDs that produced this lesson." },
    sourceSessionIds: { ...STRING_ARRAY_SCHEMA, description: "Session IDs that produced this lesson." },
    featureId: { type: "string", description: "Optional Feature Tree ID associated with this lesson." },
    featureIds: { ...STRING_ARRAY_SCHEMA, description: "Feature Tree IDs associated with this lesson." },
    filePaths: { ...STRING_ARRAY_SCHEMA, description: "Repository-relative files associated with this lesson." },
    tags: { ...STRING_ARRAY_SCHEMA, description: "Tags, symptoms, or domains associated with this lesson." },
    lane: { type: "string", description: "Optional Kanban lane associated with this lesson." },
    columnId: { type: "string", description: "Alias for lane." },
    lanes: { ...STRING_ARRAY_SCHEMA, description: "Kanban lanes associated with this lesson." },
    provider: { type: "string", description: "Optional provider associated with this lesson." },
    providers: { ...STRING_ARRAY_SCHEMA, description: "Providers associated with this lesson." },
    confidence: { type: "number", description: "Confidence score from 0 to 1." },
    evidenceCount: { type: "integer", description: "Number of concrete evidence items behind this lesson." },
  },
  required: ["title", "content"],
} as const;

const searchReasoningMemoryZodSchema = {
  workspaceId: z.string().optional().describe("Workspace ID override. Uses the current MCP session workspace when omitted."),
  codebaseId: z.string().optional().describe("Optional codebase ID override."),
  repoPath: z.string().optional().describe("Optional repository path override."),
  query: z.string().optional().describe("Free-text task or failure description to match against stored strategy memories."),
  taskId: z.string().optional().describe("Optional current task/card ID used as a retrieval hint."),
  sourceTaskIds: z.array(z.string()).optional().describe("Optional source task IDs to match directly."),
  sessionIds: z.array(z.string()).optional().describe("Optional session IDs to match directly."),
  sourceSessionIds: z.array(z.string()).optional().describe("Optional source session IDs to match directly."),
  featureId: z.string().optional().describe("Optional Feature Tree ID to match."),
  featureIds: z.array(z.string()).optional().describe("Optional Feature Tree IDs to match."),
  filePaths: z.array(z.string()).optional().describe("Optional repository-relative files to match."),
  tags: z.array(z.string()).optional().describe("Optional tags, symptoms, lanes, or domains to match."),
  lane: z.string().optional().describe("Optional Kanban lane such as backlog, todo, dev, review, or done."),
  columnId: z.string().optional().describe("Alias for lane."),
  provider: z.string().optional().describe("Optional agent provider such as codex, claude, or auggie."),
  maxResults: z.number().int().positive().optional().describe("Maximum memories to return. Defaults to 3 and is capped by the server."),
};

const saveReasoningMemoryZodSchema = {
  workspaceId: z.string().optional().describe("Workspace ID override. Uses the current MCP session workspace when omitted."),
  codebaseId: z.string().optional().describe("Optional codebase ID override."),
  repoPath: z.string().optional().describe("Optional repository path override."),
  id: z.string().optional().describe("Optional memory ID to update an existing strategy memory."),
  title: z.string().describe("Short human-readable title for the strategy memory."),
  description: z.string().optional().describe("Optional additional context for the memory."),
  content: z.string().describe("Concise operational lesson. Do not include private chain-of-thought."),
  outcome: z.enum(["success", "failure", "mixed"]).optional().describe("Whether the source trajectory succeeded, failed, or was mixed."),
  taskId: z.string().optional().describe("Optional current task/card ID to record as evidence."),
  sourceTaskIds: z.array(z.string()).optional().describe("Task/card IDs that produced this lesson."),
  sessionIds: z.array(z.string()).optional().describe("Session IDs that produced this lesson."),
  sourceSessionIds: z.array(z.string()).optional().describe("Session IDs that produced this lesson."),
  featureId: z.string().optional().describe("Optional Feature Tree ID associated with this lesson."),
  featureIds: z.array(z.string()).optional().describe("Feature Tree IDs associated with this lesson."),
  filePaths: z.array(z.string()).optional().describe("Repository-relative files associated with this lesson."),
  tags: z.array(z.string()).optional().describe("Tags, symptoms, or domains associated with this lesson."),
  lane: z.string().optional().describe("Optional Kanban lane associated with this lesson."),
  columnId: z.string().optional().describe("Alias for lane."),
  lanes: z.array(z.string()).optional().describe("Kanban lanes associated with this lesson."),
  provider: z.string().optional().describe("Optional provider associated with this lesson."),
  providers: z.array(z.string()).optional().describe("Providers associated with this lesson."),
  confidence: z.number().optional().describe("Confidence score from 0 to 1."),
  evidenceCount: z.number().int().positive().optional().describe("Number of concrete evidence items behind this lesson."),
};

const loadRetrospectiveMemoryZodSchema = {
  workspaceId: z.string().optional().describe("Workspace ID override. Uses the current MCP session workspace when omitted."),
  codebaseId: z.string().optional().describe("Optional codebase ID override."),
  repoPath: z.string().optional().describe("Optional repository path override."),
  featureId: z.string().optional().describe("Optional Feature Explorer feature ID."),
  filePaths: z.array(z.string()).optional().describe("Optional repository-relative files to load file-level memory for."),
};

const saveRetrospectiveMemoryZodSchema = {
  workspaceId: z.string().optional().describe("Workspace ID override. Uses the current MCP session workspace when omitted."),
  codebaseId: z.string().optional().describe("Optional codebase ID override."),
  repoPath: z.string().optional().describe("Optional repository path override."),
  scope: z.enum(["file", "feature"]).describe("Whether to save file-level or feature-level retrospective memory."),
  targetId: z.string().optional().describe("Optional explicit target key. Prefer filePath or featureId when available."),
  filePath: z.string().optional().describe("Repository-relative file path when scope=file."),
  featureId: z.string().optional().describe("Feature Tree ID when scope=feature or to keep file memory attached to a feature."),
  featureName: z.string().optional().describe("Optional human-readable feature name."),
  summary: z.string().describe("Short prompt-ready summary to reuse in the next analysis session."),
};

export const REASONING_MEMORY_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: SEARCH_REASONING_MEMORY_TOOL_NAME,
    description: SEARCH_REASONING_MEMORY_DESCRIPTION,
    inputSchema: SEARCH_REASONING_MEMORY_INPUT_SCHEMA,
  },
  {
    name: SAVE_REASONING_MEMORY_TOOL_NAME,
    description: SAVE_REASONING_MEMORY_DESCRIPTION,
    inputSchema: SAVE_REASONING_MEMORY_INPUT_SCHEMA,
  },
];

export const MEMORY_MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: LOAD_RETROSPECTIVE_MEMORY_TOOL_NAME,
    description: LOAD_RETROSPECTIVE_MEMORY_DESCRIPTION,
    inputSchema: LOAD_RETROSPECTIVE_MEMORY_INPUT_SCHEMA,
  },
  {
    name: SAVE_RETROSPECTIVE_MEMORY_TOOL_NAME,
    description: SAVE_RETROSPECTIVE_MEMORY_DESCRIPTION,
    inputSchema: SAVE_RETROSPECTIVE_MEMORY_INPUT_SCHEMA,
  },
  ...REASONING_MEMORY_TOOL_DEFINITIONS,
];

export function isReasoningMemoryToolName(name: string): name is ReasoningMemoryToolName {
  return REASONING_MEMORY_TOOL_NAMES.includes(name as ReasoningMemoryToolName);
}

export function isMemoryMcpToolName(name: string): name is MemoryMcpToolName {
  return MEMORY_MCP_TOOL_NAMES.includes(name as MemoryMcpToolName);
}

export async function executeMemoryMcpTool(
  name: MemoryMcpToolName,
  args: Record<string, unknown>,
  fallbackWorkspaceId?: string,
): Promise<ToolResult> {
  if (name === LOAD_RETROSPECTIVE_MEMORY_TOOL_NAME) {
    return {
      success: true,
      data: await loadFeatureRetrospectiveMemoryFromToolArgs(args, fallbackWorkspaceId),
    };
  }

  if (name === SAVE_RETROSPECTIVE_MEMORY_TOOL_NAME) {
    return {
      success: true,
      data: await saveFeatureRetrospectiveMemoryFromToolArgs(args, fallbackWorkspaceId),
    };
  }

  return executeReasoningMemoryMcpTool(name, args, fallbackWorkspaceId);
}

export async function executeReasoningMemoryMcpTool(
  name: ReasoningMemoryToolName,
  args: Record<string, unknown>,
  fallbackWorkspaceId?: string,
): Promise<ToolResult> {
  if (name === SEARCH_REASONING_MEMORY_TOOL_NAME) {
    return {
      success: true,
      data: await searchReasoningMemoriesFromToolArgs(args, fallbackWorkspaceId),
    };
  }

  return {
    success: true,
    data: await saveReasoningMemoryFromToolArgs(args, fallbackWorkspaceId),
  };
}

export function registerLoadRetrospectiveMemoryTool(
  server: McpServer,
  workspaceId: string,
  toMcpResult: ToolResultMapper,
) {
  server.tool(
    LOAD_RETROSPECTIVE_MEMORY_TOOL_NAME,
    LOAD_RETROSPECTIVE_MEMORY_DESCRIPTION,
    loadRetrospectiveMemoryZodSchema,
    async (params) => {
      try {
        return toMcpResult(await executeMemoryMcpTool(
          LOAD_RETROSPECTIVE_MEMORY_TOOL_NAME,
          params,
          workspaceId,
        ));
      } catch (error) {
        return toMcpResult({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}

export function registerSaveRetrospectiveMemoryTool(
  server: McpServer,
  workspaceId: string,
  toMcpResult: ToolResultMapper,
) {
  server.tool(
    SAVE_RETROSPECTIVE_MEMORY_TOOL_NAME,
    SAVE_RETROSPECTIVE_MEMORY_DESCRIPTION,
    saveRetrospectiveMemoryZodSchema,
    async (params) => {
      try {
        return toMcpResult(await executeMemoryMcpTool(
          SAVE_RETROSPECTIVE_MEMORY_TOOL_NAME,
          params,
          workspaceId,
        ));
      } catch (error) {
        return toMcpResult({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}

export function registerSearchReasoningMemoryTool(
  server: McpServer,
  workspaceId: string,
  toMcpResult: ToolResultMapper,
) {
  server.tool(
    SEARCH_REASONING_MEMORY_TOOL_NAME,
    SEARCH_REASONING_MEMORY_DESCRIPTION,
    searchReasoningMemoryZodSchema,
    async (params) => {
      try {
        return toMcpResult(await executeReasoningMemoryMcpTool(
          SEARCH_REASONING_MEMORY_TOOL_NAME,
          params,
          workspaceId,
        ));
      } catch (error) {
        return toMcpResult({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}

export function registerSaveReasoningMemoryTool(
  server: McpServer,
  workspaceId: string,
  toMcpResult: ToolResultMapper,
) {
  server.tool(
    SAVE_REASONING_MEMORY_TOOL_NAME,
    SAVE_REASONING_MEMORY_DESCRIPTION,
    saveReasoningMemoryZodSchema,
    async (params) => {
      try {
        return toMcpResult(await executeReasoningMemoryMcpTool(
          SAVE_REASONING_MEMORY_TOOL_NAME,
          params,
          workspaceId,
        ));
      } catch (error) {
        return toMcpResult({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}
