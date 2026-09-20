/**
 * A2A Core Module - Exports for A2A integration
 */

// A2A Session Registry
export { A2aSessionRegistry, getA2aSessionRegistry } from "./a2a-session-registry";
export type { A2aSessionInfo } from "./a2a-session-registry";

// A2A Executor
export { createA2aExecutor } from "./a2a-executor";

// A2A Task Bridge
export { A2ATaskBridge, getA2ATaskBridge, mapAgentStatusToA2AState, mapAgentRoleToSkillId } from "./a2a-task-bridge";
export type { A2ATask, A2ATaskState, A2AMessage, A2APart, A2AArtifact, A2ATaskStatus } from "./a2a-task-bridge";

// A2A Outbound Client
export { A2AOutboundClient, getA2AOutboundClient } from "./a2a-outbound-client";
export type { A2AOutboundClientOptions } from "./types";

// A2A Agent Card utilities
export { fetchAgentCard, validateAgentCard, getRpcEndpoint, hasSkill, getSkillIds } from "./a2a-agent-card";

// A2A Types
export type {
  AgentCard,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,
  SendMessageParams,
  SendMessageResult,
  GetTaskParams,
  GetTaskResult,
} from "./types";

// A2A Errors
export {
  A2AOutboundError,
  A2ATimeoutError,
  A2ANetworkError,
  A2AInvalidCardError,
} from "./types";
