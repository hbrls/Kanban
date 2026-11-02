/**
 * Sandbox type definitions for code execution sandboxes.
 *
 * Mirrors the Rust types in crates/routa-core/src/sandbox/types.rs
 * Reference: https://amirmalik.net/2025/03/07/code-sandboxes-for-llm-ai-agents
 */

export const SANDBOX_LABEL = "routa.sandbox";
export const SANDBOX_IMAGE = "routa/sandbox:latest";
export const SANDBOX_CONTAINER_PORT = 8000;
export const SANDBOX_IDLE_TIMEOUT_MS = 60_000;
export const SANDBOX_CHECK_INTERVAL_MS = 60_000;

export type SandboxNetworkMode = "bridge" | "none";
export type SandboxEnvMode = "sanitized" | "inherit";
export type SandboxCapability =
  | "workspaceRead"
  | "workspaceWrite"
  | "networkAccess"
  | "linkedWorktreeRead";
export type SandboxLinkedWorktreeMode = "disabled" | "all" | "explicit";
export type SandboxMountAccess = "readOnly" | "readWrite";

export interface SandboxMount {
  hostPath: string;
  containerPath: string;
  access: SandboxMountAccess;
  reason?: string;
}

export type SandboxCapabilityTier = "observation" | "action";

export interface ResolvedSandboxCapability {
  capability: SandboxCapability;
  tier: SandboxCapabilityTier;
  enabled: boolean;
  reason: string;
}

export interface ResolvedSandboxLinkedWorktree {
  id: string;
  codebaseId: string;
  branch: string;
  hostPath: string;
  containerPath: string;
}

export type SandboxEnvFileSource = "workspaceConfig" | "request";

export interface ResolvedSandboxEnvFile {
  path: string;
  source: SandboxEnvFileSource;
  keys?: string[];
}

export interface ResolvedSandboxWorkspaceConfig {
  path: string;
  trusted: boolean;
  loaded: boolean;
  reason: string;
}

export interface ResolvedSandboxPolicy {
  workspaceId?: string;
  codebaseId?: string;
  scopeRoot: string;
  hostWorkdir: string;
  containerWorkdir: string;
  readOnlyPaths?: string[];
  readWritePaths?: string[];
  networkMode: SandboxNetworkMode;
  envMode: SandboxEnvMode;
  envFiles?: ResolvedSandboxEnvFile[];
  envAllowlist?: string[];
  mounts: SandboxMount[];
  capabilities?: ResolvedSandboxCapability[];
  linkedWorktrees?: ResolvedSandboxLinkedWorktree[];
  workspaceConfig?: ResolvedSandboxWorkspaceConfig;
  notes?: string[];
}

export interface SandboxPolicyInput {
  workspaceId?: string;
  codebaseId?: string;
  workdir?: string;
  readOnlyPaths?: string[];
  readWritePaths?: string[];
  networkMode?: SandboxNetworkMode;
  envMode?: SandboxEnvMode;
  envFile?: string;
  envAllowlist?: string[];
  capabilities?: SandboxCapability[];
  linkedWorktreeMode?: SandboxLinkedWorktreeMode;
  linkedWorktreeIds?: string[];
  trustWorkspaceConfig?: boolean;
}

/** Information about a running sandbox container. */
export interface SandboxInfo {
  /** Docker container ID. */
  id: string;
  /** Docker container name. */
  name: string;
  /** Container status (e.g. "running"). */
  status: string;
  /** Programming language for the sandbox kernel (e.g. "python"). */
  lang: string;
  /** Host port mapped to the in-sandbox server. */
  port?: number;
  /** Effective policy resolved by the Rust sandbox API for policy-aware sandboxes. */
  effectivePolicy?: ResolvedSandboxPolicy;
  /** ISO timestamp when the sandbox was created. */
  createdAt: string;
  /** ISO timestamp when the sandbox was last active. */
  lastActiveAt: string;
}

/** Request body for creating a new sandbox. */
export interface CreateSandboxRequest {
  /** Language for the sandbox kernel. Currently only "python" is supported. */
  lang: string;
  /** Optional workspace-aware Rust sandbox policy. */
  policy?: SandboxPolicyInput;
}

/** Permission-driven sandbox policy mutations that map to Rust SandboxPermissionConstraints. */
export interface SandboxPermissionConstraints {
  readOnlyPaths?: string[];
  readWritePaths?: string[];
  envFile?: string;
  envAllowlist?: string[];
  capabilities?: SandboxCapability[];
  networkMode?: SandboxNetworkMode;
  linkedWorktreeMode?: SandboxLinkedWorktreeMode;
  linkedWorktreeIds?: string[];
}

/** Request body for executing code in a sandbox. */
export interface ExecuteRequest {
  /** The source code to execute. */
  code: string;
}

/**
 * A single streaming output event from code execution (NDJSON).
 *
 * Exactly one of `text`, `image`, or `error` will be present.
 */
export type SandboxOutputEvent =
  | { text: string }
  | { image: string }
  | { error: string };
