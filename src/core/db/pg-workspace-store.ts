/**
 * Workspace store interface and in-memory implementation.
 */

import type { Workspace, WorkspaceStatus } from "../models/workspace";

export interface WorkspaceStore {
  save(workspace: Workspace): Promise<void>;
  get(workspaceId: string): Promise<Workspace | undefined>;
  list(): Promise<Workspace[]>;
  listByStatus(status: WorkspaceStatus): Promise<Workspace[]>;
  updateTitle(workspaceId: string, title: string): Promise<void>;
  updateStatus(workspaceId: string, status: WorkspaceStatus): Promise<void>;
  updateMetadata(workspaceId: string, metadata: Record<string, string>): Promise<void>;
  delete(workspaceId: string): Promise<void>;
}

/**
 * InMemoryWorkspaceStore — for use when no database is configured.
 */
export class InMemoryWorkspaceStore implements WorkspaceStore {
  private store = new Map<string, Workspace>();

  async save(workspace: Workspace): Promise<void> {
    this.store.set(workspace.id, { ...workspace });
  }

  async get(workspaceId: string): Promise<Workspace | undefined> {
    const ws = this.store.get(workspaceId);
    return ws ? { ...ws } : undefined;
  }

  async list(): Promise<Workspace[]> {
    return Array.from(this.store.values()).map((ws) => ({ ...ws }));
  }

  async listByStatus(status: WorkspaceStatus): Promise<Workspace[]> {
    return Array.from(this.store.values()).filter((ws) => ws.status === status);
  }

  async updateTitle(workspaceId: string, title: string): Promise<void> {
    const ws = this.store.get(workspaceId);
    if (ws) {
      ws.title = title;
      ws.updatedAt = new Date();
    }
  }

  async updateStatus(workspaceId: string, status: WorkspaceStatus): Promise<void> {
    const ws = this.store.get(workspaceId);
    if (ws) {
      ws.status = status;
      ws.updatedAt = new Date();
    }
  }

  async updateMetadata(workspaceId: string, metadata: Record<string, string>): Promise<void> {
    const ws = this.store.get(workspaceId);
    if (ws) {
      ws.metadata = { ...ws.metadata, ...metadata };
      ws.updatedAt = new Date();
    }
  }

  async delete(workspaceId: string): Promise<void> {
    this.store.delete(workspaceId);
  }
}
