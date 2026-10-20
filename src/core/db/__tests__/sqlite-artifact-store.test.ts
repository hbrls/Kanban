import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createArtifact, createArtifactRequest } from "@/core/models/artifact";
import * as sqliteSchema from "../sqlite-schema";
import { SqliteArtifactStore } from "../sqlite-stores";

describe("SqliteArtifactStore", () => {
  let sqlite: BetterSqlite3.Database;
  let store: SqliteArtifactStore;

  beforeEach(() => {
    sqlite = new BetterSqlite3(":memory:");
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        task_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        provided_by_agent_id TEXT,
        requested_by_agent_id TEXT,
        request_id TEXT,
        content TEXT,
        context TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at INTEGER,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE artifact_requests (
        id TEXT PRIMARY KEY,
        from_agent_id TEXT NOT NULL,
        to_agent_id TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        task_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        context TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        artifact_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    sqlite.prepare(`
      INSERT INTO workspaces (id, title, status, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run("workspace-1", "Workspace", "active", "{}", Date.now(), Date.now());

    const db = drizzle(sqlite, { schema: sqliteSchema });
    store = new SqliteArtifactStore(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("persists artifacts by task and provider", async () => {
    const artifact = createArtifact({
      id: "artifact-1",
      type: "screenshot",
      taskId: "task-1",
      workspaceId: "workspace-1",
      providedByAgentId: "agent-1",
      content: "base64",
      context: "Review proof",
      status: "provided",
      metadata: {
        mediaType: "image/png",
      },
    });

    await store.saveArtifact(artifact);

    expect(await store.getArtifact("artifact-1")).toMatchObject({
      id: "artifact-1",
      type: "screenshot",
      providedByAgentId: "agent-1",
      metadata: {
        mediaType: "image/png",
      },
    });
    expect(await store.listByTask("task-1")).toHaveLength(1);
    expect(await store.listByTaskAndType("task-1", "screenshot")).toHaveLength(1);
    expect(await store.listByProvider("agent-1")).toHaveLength(1);
  });

  it("persists artifact requests and fulfillment status", async () => {
    const request = createArtifactRequest({
      id: "request-1",
      fromAgentId: "agent-a",
      toAgentId: "agent-b",
      artifactType: "test_results",
      taskId: "task-2",
      workspaceId: "workspace-1",
      context: "Need verification output",
    });

    await store.saveRequest(request);
    await store.updateRequestStatus("request-1", "fulfilled", "artifact-9");

    expect(await store.getRequest("request-1")).toMatchObject({
      id: "request-1",
      status: "fulfilled",
      artifactId: "artifact-9",
    });
    expect(await store.listPendingRequests("agent-b")).toHaveLength(0);
    expect(await store.listRequestsByTask("task-2")).toHaveLength(1);
  });
});
