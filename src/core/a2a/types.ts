/**
 * A2A Types - Shared types for A2A protocol communication
 */

export interface AgentCardSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface AgentCard {
  name: string;
  description: string;
  protocolVersion: string;
  version: string;
  url: string;
  documentationUrl?: string;
  preferredTransport?: string;
  additionalInterfaces?: Array<{ url: string; transport: string }>;
  capabilities: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentCardSkill[];
}

// ─── JSON-RPC 2.0 Types ────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JsonRpcSuccessResponse<T = unknown> extends JsonRpcResponse {
  result: T;
  error?: never;
}

export interface JsonRpcErrorResponse extends JsonRpcResponse {
  result?: never;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ─── A2A Outbound Client Types ─────────────────────────────────────────────────

export interface SendMessageParams {
  message: {
    messageId?: string;
    role: "user" | "agent";
    parts: Array<{ text?: string; data?: unknown; mediaType?: string }>;
    contextId?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface SendMessageResult {
  task: {
    id: string;
    contextId: string;
    status: {
      state: string;
      timestamp: string;
    };
    metadata?: Record<string, unknown>;
  };
}

export interface GetTaskParams {
  id: string;
}

export interface GetTaskResult {
  task: {
    id: string;
    contextId: string;
    status: {
      state: string;
      timestamp: string;
      message?: {
        messageId: string;
        role: string;
        parts: Array<{ text?: string; data?: unknown; mediaType?: string }>;
      };
    };
    history: Array<{
      messageId: string;
      role: string;
      parts: Array<{ text?: string; data?: unknown; mediaType?: string }>;
      contextId?: string;
      taskId?: string;
    }>;
    artifacts?: Array<{
      artifactId: string;
      name: string;
      description?: string;
      parts: Array<{ text?: string; data?: unknown; mediaType?: string }>;
    }>;
    metadata?: Record<string, unknown>;
  };
}

// ─── A2A Outbound Client Options ───────────────────────────────────────────────

export interface A2AOutboundClientOptions {
  /**
   * Timeout for network requests in milliseconds
   * @default 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Polling interval for waitForCompletion in milliseconds
   * @default 1000 (1 second)
   */
  pollInterval?: number;

  /**
   * Maximum time to wait for task completion in milliseconds
   * @default 300000 (5 minutes)
   */
  maxWaitTime?: number;

  /**
   * Maximum number of retry attempts for network requests
   * @default 3
   */
  maxRetries?: number;

  /**
   * Delay between retry attempts in milliseconds
   * @default 1000 (1 second)
   */
  retryDelay?: number;

  /**
   * Static HTTP headers to attach to Agent Card fetches and JSON-RPC requests.
   */
  requestHeaders?: Record<string, string>;
}

// ─── A2A Outbound Client Errors ─────────────────────────────────────────────────

export class A2AOutboundError extends Error {
  constructor(
    message: string,
    public code?: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "A2AOutboundError";
  }
}

export class A2ATimeoutError extends A2AOutboundError {
  constructor(message: string, public elapsed: number) {
    super(message, -32002);
    this.name = "A2ATimeoutError";
  }
}

export class A2ANetworkError extends A2AOutboundError {
  constructor(message: string, public cause?: Error) {
    super(message, -32003);
    this.name = "A2ANetworkError";
  }
}

export class A2AInvalidCardError extends A2AOutboundError {
  constructor(message: string, public cardUrl: string) {
    super(message, -32004);
    this.name = "A2AInvalidCardError";
  }
}
