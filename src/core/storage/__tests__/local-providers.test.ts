/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalSessionProvider } from "../local-session-provider";
import { LocalTraceProvider } from "../local-trace-provider";
import { MigrationTool } from "../migration-tool";
import type { SessionRecord } from "../types";

let tmpDir: string;
let originalHome: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storage-test-"));
  // Override HOME so getSessionsDir/getTracesDir use our temp dir
  originalHome = process.env.HOME;
  process.env.HOME = tmpDir;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

describe("LocalSessionProvider", () => {
  it("saves and retrieves a session", async () => {
    const provider = new LocalSessionProvider("/test/project");
    const session: SessionRecord = {
      id: "sess-1",
      name: "Test Session",
      cwd: "/test/project",
      workspaceId: "ws-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await provider.save(session);
    const retrieved = await provider.get("sess-1");

    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe("sess-1");
    expect(retrieved!.name).toBe("Test Session");
  });

  it("lists sessions sorted by updatedAt", async () => {
    const provider = new LocalSessionProvider("/test/project");
    const now = Date.now();

    await provider.save({
      id: "old", cwd: "/test", workspaceId: "ws-1",
      createdAt: new Date(now - 1000).toISOString(),
      updatedAt: new Date(now - 1000).toISOString(),
    });
    await provider.save({
      id: "new", cwd: "/test", workspaceId: "ws-1",
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });

    const sessions = await provider.list();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("new");
  });

  it("appends and retrieves message history", async () => {
    const provider = new LocalSessionProvider("/test/project");
    await provider.save({
      id: "sess-2", cwd: "/test", workspaceId: "ws-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await provider.appendMessage("sess-2", {
      uuid: "msg-1",
      type: "user_message",
      message: "hello",
      sessionId: "sess-2",
      timestamp: new Date().toISOString(),
    });

    const history = await provider.getHistory("sess-2");
    expect(history).toHaveLength(1);
  });

  it("deletes a session", async () => {
    const provider = new LocalSessionProvider("/test/project");
    await provider.save({
      id: "to-delete", cwd: "/test", workspaceId: "ws-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await provider.delete("to-delete");
    const result = await provider.get("to-delete");
    expect(result).toBeUndefined();
  });

  it("derives label from first user message when no name set", async () => {
    const provider = new LocalSessionProvider("/test/project");
    await provider.save({
      id: "no-name", cwd: "/test", workspaceId: "ws-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await provider.appendMessage("no-name", {
      uuid: "msg-1",
      type: "user_message",
      message: "Help me fix the login bug",
      sessionId: "no-name",
      timestamp: new Date().toISOString(),
    });

    const session = await provider.get("no-name");
    expect(session!.name).toBe("Help me fix the login bug");
  });
});

describe("LocalTraceProvider", () => {
  it("appends and queries traces", async () => {
    const provider = new LocalTraceProvider("/test/project");

    const record = {
      version: "0.1.0",
      id: "trace-1",
      timestamp: new Date().toISOString(),
      sessionId: "sess-1",
      contributor: { provider: "claude" },
      eventType: "user_message" as const,
    };

    await provider.append(record);
    const results = await provider.query({ sessionId: "sess-1" });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("trace-1");
  });

  it("getById finds a specific trace", async () => {
    const provider = new LocalTraceProvider("/test/project");

    await provider.append({
      version: "0.1.0",
      id: "find-me",
      timestamp: new Date().toISOString(),
      sessionId: "sess-1",
      contributor: { provider: "claude" },
      eventType: "tool_call" as const,
    });

    const found = await provider.getById("find-me");
    expect(found).not.toBeNull();
    expect(found!.eventType).toBe("tool_call");
  });

  it("returns stats", async () => {
    const provider = new LocalTraceProvider("/test/project");

    await provider.append({
      version: "0.1.0",
      id: "s1",
      timestamp: new Date().toISOString(),
      sessionId: "sess-1",
      contributor: { provider: "claude" },
      eventType: "user_message" as const,
    });
    await provider.append({
      version: "0.1.0",
      id: "s2",
      timestamp: new Date().toISOString(),
      sessionId: "sess-2",
      contributor: { provider: "claude" },
      eventType: "tool_call" as const,
    });

    const stats = await provider.stats();
    expect(stats.totalRecords).toBe(2);
    expect(stats.uniqueSessions).toBe(2);
  });
});

describe("MigrationTool", () => {
  it("migrates legacy traces to new location", async () => {
    const projectPath = path.join(tmpDir, "my-project");
    // Create legacy trace structure
    const legacyDir = path.join(projectPath, ".routa", "traces", "2025-01-15");
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, "traces-20250115-120000.jsonl"),
      '{"id":"legacy-1","sessionId":"s1"}\n',
      "utf-8"
    );

    const tool = new MigrationTool(projectPath);
    const migrated = await tool.migrateTraces();

    expect(migrated).toBe(true);

    // Check marker file was created
    const marker = path.join(projectPath, ".routa", "traces", ".migrated");
    const markerExists = await fs.access(marker).then(() => true).catch(() => false);
    expect(markerExists).toBe(true);
  });

  it("skips migration if already migrated", async () => {
    const projectPath = path.join(tmpDir, "migrated-project");
    const legacyDir = path.join(projectPath, ".routa", "traces");
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, ".migrated"),
      "{}",
      "utf-8"
    );

    const tool = new MigrationTool(projectPath);
    const migrated = await tool.migrateTraces();

    expect(migrated).toBe(false);
  });

  it("returns false when no legacy directory exists", async () => {
    const tool = new MigrationTool(path.join(tmpDir, "no-legacy"));
    const migrated = await tool.migrateTraces();
    expect(migrated).toBe(false);
  });
});
