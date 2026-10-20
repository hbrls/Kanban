/**
 * Codebase store interface and in-memory implementation.
 */

import type { Codebase } from "../models/codebase";

export interface CodebaseStore {
  add(codebase: Codebase): Promise<void>;
  get(codebaseId: string): Promise<Codebase | undefined>;
  listByWorkspace(workspaceId: string): Promise<Codebase[]>;
  update(codebaseId: string, fields: { branch?: string; label?: string; repoPath?: string }): Promise<void>;
  remove(codebaseId: string): Promise<void>;
  getDefault(workspaceId: string): Promise<Codebase | undefined>;
  setDefault(workspaceId: string, codebaseId: string): Promise<void>;
  countByWorkspace(workspaceId: string): Promise<number>;
  findByRepoPath(workspaceId: string, repoPath: string): Promise<Codebase | undefined>;
}

/**
 * InMemoryCodebaseStore — for use when no database is configured.
 */
export class InMemoryCodebaseStore implements CodebaseStore {
  private store = new Map<string, Codebase>();

  async add(codebase: Codebase): Promise<void> {
    this.store.set(codebase.id, { ...codebase });
  }

  async get(codebaseId: string): Promise<Codebase | undefined> {
    const cb = this.store.get(codebaseId);
    return cb ? { ...cb } : undefined;
  }

  async listByWorkspace(workspaceId: string): Promise<Codebase[]> {
    return Array.from(this.store.values()).filter((cb) => cb.workspaceId === workspaceId);
  }

  async update(codebaseId: string, fields: { branch?: string; label?: string; repoPath?: string }): Promise<void> {
    const cb = this.store.get(codebaseId);
    if (cb) {
      if (fields.branch !== undefined) cb.branch = fields.branch;
      if (fields.label !== undefined) cb.label = fields.label;
      if (fields.repoPath !== undefined) cb.repoPath = fields.repoPath;
      cb.updatedAt = new Date();
    }
  }

  async remove(codebaseId: string): Promise<void> {
    this.store.delete(codebaseId);
  }

  async getDefault(workspaceId: string): Promise<Codebase | undefined> {
    return Array.from(this.store.values()).find((cb) => cb.workspaceId === workspaceId && cb.isDefault);
  }

  async setDefault(workspaceId: string, codebaseId: string): Promise<void> {
    for (const cb of this.store.values()) {
      if (cb.workspaceId === workspaceId) {
        cb.isDefault = cb.id === codebaseId;
        cb.updatedAt = new Date();
      }
    }
  }

  async countByWorkspace(workspaceId: string): Promise<number> {
    return Array.from(this.store.values()).filter((cb) => cb.workspaceId === workspaceId).length;
  }

  async findByRepoPath(workspaceId: string, repoPath: string): Promise<Codebase | undefined> {
    return Array.from(this.store.values()).find((cb) => cb.workspaceId === workspaceId && cb.repoPath === repoPath);
  }
}
