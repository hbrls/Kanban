import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as sqliteSchema from "@/core/db/sqlite-schema";
import { SqliteCustomMcpServerStore } from "@/core/store/custom-mcp-server-store";

describe("SqliteCustomMcpServerStore", () => {
  let sqlite: BetterSqlite3.Database;
  let store: SqliteCustomMcpServerStore;

  beforeEach(() => {
    sqlite = new BetterSqlite3(":memory:");
    sqlite.exec(`
      CREATE TABLE custom_mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        command TEXT,
        args TEXT,
        url TEXT,
        headers TEXT,
        env TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        workspace_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    const db = drizzle(sqlite, { schema: sqliteSchema });
    store = new SqliteCustomMcpServerStore(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("persists and updates stdio MCP servers", async () => {
    await store.create({
      id: "filesystem",
      name: "Filesystem",
      description: "Local files",
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      env: { LOG_LEVEL: "debug" },
      enabled: true,
      workspaceId: "workspace-1",
    });

    expect(await store.get("filesystem")).toMatchObject({
      id: "filesystem",
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      env: { LOG_LEVEL: "debug" },
      enabled: true,
      workspaceId: "workspace-1",
    });

    await store.update("filesystem", {
      enabled: false,
      command: "node",
      args: ["server.js"],
    });

    expect(await store.get("filesystem")).toMatchObject({
      command: "node",
      args: ["server.js"],
      enabled: false,
    });
  });

  it("lists enabled HTTP/SSE servers and deletes records", async () => {
    await store.create({
      id: "http-api",
      name: "HTTP API",
      type: "http",
      url: "http://localhost:4000/mcp",
      headers: { Authorization: "Bearer test" },
      enabled: true,
    });
    await store.create({
      id: "events",
      name: "Events",
      type: "sse",
      url: "http://localhost:5000/sse",
      enabled: false,
      workspaceId: "workspace-2",
    });

    expect(await store.list()).toHaveLength(2);
    expect(await store.listEnabled()).toMatchObject([
      {
        id: "http-api",
        type: "http",
        headers: { Authorization: "Bearer test" },
      },
    ]);

    await store.delete("events");
    expect(await store.get("events")).toBeNull();
  });
});
