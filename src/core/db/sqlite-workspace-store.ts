import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as sqliteSchema from "./sqlite-schema";
import type { Workspace, WorkspaceStatus } from "../models/workspace";
import type { WorkspaceStore } from "./pg-workspace-store";

type SqliteDb = BetterSQLite3Database<typeof sqliteSchema>;

export class SqliteWorkspaceStore implements WorkspaceStore {
  constructor(private db: SqliteDb) {}

  async save(workspace: Workspace): Promise<void> {
    await this.db
      .insert(sqliteSchema.workspaces)
      .values({
        id: workspace.id,
        title: workspace.title,
        status: workspace.status,
        metadata: workspace.metadata,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      })
      .onConflictDoUpdate({
        target: sqliteSchema.workspaces.id,
        set: {
          title: workspace.title,
          status: workspace.status,
          metadata: workspace.metadata,
          updatedAt: new Date(),
        },
      });
  }

  async get(workspaceId: string): Promise<Workspace | undefined> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.workspaces)
      .where(eq(sqliteSchema.workspaces.id, workspaceId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async list(): Promise<Workspace[]> {
    const rows = await this.db.select().from(sqliteSchema.workspaces);
    return rows.map(this.toModel);
  }

  async listByStatus(status: WorkspaceStatus): Promise<Workspace[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.workspaces)
      .where(eq(sqliteSchema.workspaces.status, status));
    return rows.map(this.toModel);
  }

  async updateTitle(workspaceId: string, title: string): Promise<void> {
    await this.db
      .update(sqliteSchema.workspaces)
      .set({ title, updatedAt: new Date() })
      .where(eq(sqliteSchema.workspaces.id, workspaceId));
  }

  async updateStatus(workspaceId: string, status: WorkspaceStatus): Promise<void> {
    await this.db
      .update(sqliteSchema.workspaces)
      .set({ status, updatedAt: new Date() })
      .where(eq(sqliteSchema.workspaces.id, workspaceId));
  }

  async updateMetadata(workspaceId: string, metadata: Record<string, string>): Promise<void> {
    const existing = await this.get(workspaceId);
    const merged = { ...(existing?.metadata ?? {}), ...metadata };
    await this.db
      .update(sqliteSchema.workspaces)
      .set({ metadata: merged, updatedAt: new Date() })
      .where(eq(sqliteSchema.workspaces.id, workspaceId));
  }

  async delete(workspaceId: string): Promise<void> {
    await this.db.delete(sqliteSchema.workspaces).where(eq(sqliteSchema.workspaces.id, workspaceId));
  }

  private toModel(row: typeof sqliteSchema.workspaces.$inferSelect): Workspace {
    return {
      id: row.id,
      title: row.title,
      status: row.status as WorkspaceStatus,
      metadata: (row.metadata as Record<string, string>) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
