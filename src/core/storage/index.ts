/**
 * Storage Module — Unified storage layer for sessions and traces.
 *
 * Provides factory functions that return the local storage providers
 * (JSONL files under ~/.routa/).
 */

export * from "./types";
export * from "./folder-slug";
export * from "./jsonl-writer";
export * from "./local-session-provider";
export * from "./local-trace-provider";
export * from "./migration-tool";
export * from "./history-compactor";
export * from "./tool-call-context-writer";

import { LocalSessionProvider } from "./local-session-provider";
import { LocalTraceProvider } from "./local-trace-provider";
import { MigrationTool } from "./migration-tool";
import type { SessionStorageProvider, TraceStorageProvider } from "./types";

function isServerless(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Get the session storage provider.
 *
 * Desktop/Local: LocalSessionProvider (JSONL files in ~/.routa/)
 */
export function getSessionStorageProvider(
  projectPath: string
): SessionStorageProvider {
  return new LocalSessionProvider(projectPath);
}

/**
 * Get the trace storage provider.
 *
 * Desktop/Local: LocalTraceProvider (JSONL files in ~/.routa/)
 */
export function getTraceStorageProvider(
  projectPath: string
): TraceStorageProvider {
  return new LocalTraceProvider(projectPath);
}

/**
 * Run trace migration on startup (safe to call multiple times).
 */
export async function runMigrationIfNeeded(
  projectPath: string
): Promise<void> {
  if (isServerless()) return; // No local migration needed in serverless
  const tool = new MigrationTool(projectPath);
  await tool.migrateTraces();
}
