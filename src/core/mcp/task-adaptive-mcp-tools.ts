import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  FILE_SESSION_CONTEXT_TOOL_NAME,
  TASK_ADAPTIVE_HARNESS_TOOL_NAME,
  TASK_HISTORY_SUMMARY_TOOL_NAME,
  TRANSCRIPT_TURN_INSPECTION_TOOL_NAME,
  assembleTaskAdaptiveHarnessFromToolArgs,
  inspectTranscriptTurnsFromToolArgs,
  summarizeFileSessionContextFromToolArgs,
  summarizeTaskHistoryContextFromToolArgs,
} from "../harness/task-adaptive-tool";
import type { ToolResult } from "../tools/tool-result";

interface TextMcpToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
}

type ToolResultMapper = (result: ToolResult) => TextMcpToolResult;

export {
  FILE_SESSION_CONTEXT_TOOL_NAME,
  TASK_ADAPTIVE_HARNESS_TOOL_NAME,
  TASK_HISTORY_SUMMARY_TOOL_NAME,
  TRANSCRIPT_TURN_INSPECTION_TOOL_NAME,
} from "../harness/task-adaptive-tool";

export const TASK_ADAPTIVE_MCP_TOOL_NAMES = [
  TASK_ADAPTIVE_HARNESS_TOOL_NAME,
  TASK_HISTORY_SUMMARY_TOOL_NAME,
  FILE_SESSION_CONTEXT_TOOL_NAME,
  TRANSCRIPT_TURN_INSPECTION_TOOL_NAME,
] as const;

export type TaskAdaptiveMcpToolName = typeof TASK_ADAPTIVE_MCP_TOOL_NAMES[number];

const STRING_ARRAY_SCHEMA = {
  type: "array",
  items: { type: "string" },
} as const;

const TASK_ADAPTIVE_COMMON_PROPERTIES = {
  workspaceId: { type: "string", description: "Workspace ID. Uses the current MCP session workspace when omitted." },
  codebaseId: { type: "string", description: "Optional codebase ID override for repository resolution." },
  repoPath: { type: "string", description: "Optional repository path override for repository resolution." },
  taskLabel: { type: "string", description: "Short label for the current task or request." },
  locale: { type: "string", description: "Optional locale hint, e.g. en or zh-CN." },
  featureId: { type: "string", description: "Optional Feature Explorer feature ID to ground retrieval." },
  featureIds: { ...STRING_ARRAY_SCHEMA, description: "Optional ordered candidate Feature Tree IDs to ground retrieval." },
  filePaths: { ...STRING_ARRAY_SCHEMA, description: "Optional repository-relative file paths already known to be relevant." },
  routeCandidates: { ...STRING_ARRAY_SCHEMA, description: "Optional route hints for Feature Tree and file inference." },
  apiCandidates: { ...STRING_ARRAY_SCHEMA, description: "Optional API hints for Feature Tree and file inference." },
  historySessionIds: { ...STRING_ARRAY_SCHEMA, description: "Optional history session IDs to prioritize during retrieval." },
  moduleHints: { ...STRING_ARRAY_SCHEMA, description: "Optional module hints for retrieval fallback." },
  symptomHints: { ...STRING_ARRAY_SCHEMA, description: "Optional user-visible symptom hints for retrieval fallback." },
  taskType: {
    type: "string",
    enum: ["implementation", "planning", "analysis", "review"],
    description: "Task type hint used for retrieval heuristics.",
  },
  maxFiles: { type: "number", minimum: 1, description: "Maximum number of files to include in the selected context slice." },
  maxSessions: { type: "number", minimum: 1, description: "Maximum number of history sessions to include." },
  role: { type: "string", description: "Optional agent role hint, e.g. ROUTA or CRAFTER." },
} as const;

const taskAdaptiveCommonZodSchema = {
  workspaceId: z.string().optional().describe("Workspace ID override. Uses the current MCP session workspace when omitted."),
  codebaseId: z.string().optional().describe("Optional codebase ID override."),
  repoPath: z.string().optional().describe("Optional repository path override."),
  taskLabel: z.string().optional().describe("Short label for the current task or request."),
  locale: z.string().optional().describe("Optional locale hint, e.g. en or zh-CN."),
  featureId: z.string().optional().describe("Optional Feature Explorer feature ID to ground retrieval."),
  featureIds: z.array(z.string()).optional().describe("Optional ordered candidate Feature Tree IDs to ground retrieval."),
  filePaths: z.array(z.string()).optional().describe("Optional repository-relative file paths already known to be relevant."),
  routeCandidates: z.array(z.string()).optional().describe("Optional route hints for Feature Tree and file inference."),
  apiCandidates: z.array(z.string()).optional().describe("Optional API hints for Feature Tree and file inference."),
  historySessionIds: z.array(z.string()).optional().describe("Optional history session IDs to prioritize during retrieval."),
  moduleHints: z.array(z.string()).optional().describe("Optional module hints for retrieval fallback."),
  symptomHints: z.array(z.string()).optional().describe("Optional user-visible symptom hints for retrieval fallback."),
  taskType: z.enum(["implementation", "planning", "analysis", "review"]).optional().describe("Task type hint used for retrieval heuristics."),
  maxFiles: z.number().int().positive().optional().describe("Maximum number of files to include in the selected context slice."),
  maxSessions: z.number().int().positive().optional().describe("Maximum number of history sessions to include."),
  role: z.string().optional().describe("Optional agent role hint, e.g. ROUTA or CRAFTER."),
};

const transcriptTurnInspectionProperties = {
  workspaceId: TASK_ADAPTIVE_COMMON_PROPERTIES.workspaceId,
  codebaseId: TASK_ADAPTIVE_COMMON_PROPERTIES.codebaseId,
  repoPath: TASK_ADAPTIVE_COMMON_PROPERTIES.repoPath,
  sessionIds: { ...STRING_ARRAY_SCHEMA, description: "Explicit session IDs to inspect. Prefer the highest-relevance sessions first." },
  historySessionIds: {
    ...STRING_ARRAY_SCHEMA,
    description: "Alias for sessionIds for compatibility with existing task-adaptive flows.",
  },
  featureId: { type: "string", description: "Optional Feature Explorer feature ID used to preserve feature-level evidence." },
  filePaths: {
    ...STRING_ARRAY_SCHEMA,
    description: "Optional repository-relative focus files. Signals are filtered to these files when provided.",
  },
  maxUserPrompts: { type: "number", minimum: 1, description: "Maximum number of user prompts to keep per inspected session." },
  maxSignals: { type: "number", minimum: 1, description: "Maximum number of relevant signals and failed signals to keep per session." },
} as const;

const transcriptTurnInspectionZodSchema = {
  workspaceId: taskAdaptiveCommonZodSchema.workspaceId,
  codebaseId: taskAdaptiveCommonZodSchema.codebaseId,
  repoPath: taskAdaptiveCommonZodSchema.repoPath,
  sessionIds: z.array(z.string()).optional().describe("Explicit session IDs to inspect. Prefer the highest-relevance sessions first."),
  historySessionIds: z.array(z.string()).optional().describe("Alias for sessionIds for compatibility with existing task-adaptive flows."),
  featureId: z.string().optional().describe("Optional Feature Explorer feature ID used to preserve feature-level evidence."),
  filePaths: z.array(z.string()).optional().describe("Optional repository-relative focus files. Signals are filtered to these files when provided."),
  maxUserPrompts: z.number().int().positive().optional().describe("Maximum number of user prompts to keep per inspected session."),
  maxSignals: z.number().int().positive().optional().describe("Maximum number of relevant signals and failed signals to keep per session."),
};

export const TASK_ADAPTIVE_MCP_TOOL_DEFINITIONS = [
  {
    name: TASK_ADAPTIVE_HARNESS_TOOL_NAME,
    description: "Compile a Task-Adaptive Harness pack for the current task by retrieving relevant history sessions, file signals, and high-friction failures just in time.",
    inputSchema: { type: "object", properties: TASK_ADAPTIVE_COMMON_PROPERTIES },
  },
  {
    name: TASK_HISTORY_SUMMARY_TOOL_NAME,
    description: "Compress linked history sessions into a History Summary so analysts can reason from seeds, friction signals, and matched files without rereading every transcript.",
    inputSchema: { type: "object", properties: TASK_ADAPTIVE_COMMON_PROPERTIES },
  },
  {
    name: FILE_SESSION_CONTEXT_TOOL_NAME,
    description: "Structure file-linked session evidence into direct vs adjacent buckets, scope drift, input friction, environment friction, and repeated hotspots for specialist analysis.",
    inputSchema: { type: "object", properties: TASK_ADAPTIVE_COMMON_PROPERTIES },
  },
  {
    name: TRANSCRIPT_TURN_INSPECTION_TOOL_NAME,
    description: "Inspect specific transcript sessions and extract real user turns, file-targeted commands, failed commands, and scope-drift prompts for read-only specialist analysis.",
    inputSchema: { type: "object", properties: transcriptTurnInspectionProperties },
  },
];

export function isTaskAdaptiveMcpToolName(name: string): name is TaskAdaptiveMcpToolName {
  return TASK_ADAPTIVE_MCP_TOOL_NAMES.includes(name as TaskAdaptiveMcpToolName);
}

export async function executeTaskAdaptiveMcpTool(
  name: TaskAdaptiveMcpToolName,
  args: Record<string, unknown>,
  fallbackWorkspaceId?: string,
): Promise<ToolResult> {
  if (name === TASK_ADAPTIVE_HARNESS_TOOL_NAME) {
    return { success: true, data: await assembleTaskAdaptiveHarnessFromToolArgs(args, fallbackWorkspaceId) };
  }
  if (name === TASK_HISTORY_SUMMARY_TOOL_NAME) {
    return { success: true, data: await summarizeTaskHistoryContextFromToolArgs(args, fallbackWorkspaceId) };
  }
  if (name === FILE_SESSION_CONTEXT_TOOL_NAME) {
    return { success: true, data: await summarizeFileSessionContextFromToolArgs(args, fallbackWorkspaceId) };
  }
  return { success: true, data: await inspectTranscriptTurnsFromToolArgs(args, fallbackWorkspaceId) };
}

function registerTaskAdaptiveTool(
  server: McpServer,
  name: TaskAdaptiveMcpToolName,
  description: string,
  schema: Record<string, z.ZodTypeAny>,
  workspaceId: string,
  toMcpResult: ToolResultMapper,
) {
  server.tool(name, description, schema, async (params) => {
    try {
      return toMcpResult(await executeTaskAdaptiveMcpTool(name, params, workspaceId));
    } catch (error) {
      return toMcpResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export function registerAssembleTaskAdaptiveHarnessTool(
  server: McpServer,
  workspaceId: string,
  toMcpResult: ToolResultMapper,
) {
  registerTaskAdaptiveTool(
    server,
    TASK_ADAPTIVE_HARNESS_TOOL_NAME,
    TASK_ADAPTIVE_MCP_TOOL_DEFINITIONS[0].description,
    taskAdaptiveCommonZodSchema,
    workspaceId,
    toMcpResult,
  );
}

export function registerSummarizeTaskHistoryContextTool(
  server: McpServer,
  workspaceId: string,
  toMcpResult: ToolResultMapper,
) {
  registerTaskAdaptiveTool(
    server,
    TASK_HISTORY_SUMMARY_TOOL_NAME,
    TASK_ADAPTIVE_MCP_TOOL_DEFINITIONS[1].description,
    taskAdaptiveCommonZodSchema,
    workspaceId,
    toMcpResult,
  );
}

export function registerSummarizeFileSessionContextTool(
  server: McpServer,
  workspaceId: string,
  toMcpResult: ToolResultMapper,
) {
  registerTaskAdaptiveTool(
    server,
    FILE_SESSION_CONTEXT_TOOL_NAME,
    TASK_ADAPTIVE_MCP_TOOL_DEFINITIONS[2].description,
    taskAdaptiveCommonZodSchema,
    workspaceId,
    toMcpResult,
  );
}

export function registerInspectTranscriptTurnsTool(
  server: McpServer,
  workspaceId: string,
  toMcpResult: ToolResultMapper,
) {
  registerTaskAdaptiveTool(
    server,
    TRANSCRIPT_TURN_INSPECTION_TOOL_NAME,
    TASK_ADAPTIVE_MCP_TOOL_DEFINITIONS[3].description,
    transcriptTurnInspectionZodSchema,
    workspaceId,
    toMcpResult,
  );
}
