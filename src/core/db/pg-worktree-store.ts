/**
 * Worktree store interface and in-memory implementation.
 */

import type { Worktree, WorktreeStatus } from "../models/worktree";

export interface WorktreeStore {
  add(worktree: Worktree): Promise<void>;
  get(worktreeId: string): Promise<Worktree | undefined>;
  listByCodebase(codebaseId: string): Promise<Worktree[]>;
  listByWorkspace(workspaceId: string): Promise<Worktree[]>;
  updateStatus(worktreeId: string, status: WorktreeStatus, errorMessage?: string): Promise<void>;
  assignSession(worktreeId: string, sessionId: string | null): Promise<void>;
  remove(worktreeId: string): Promise<void>;
  findByBranch(codebaseId: string, branch: string): Promise<Worktree | undefined>;
}

/**
 * InMemoryWorktreeStore — for use when no database is configured.
 */
export class InMemoryWorktreeStore implements WorktreeStore {
  private store = new Map<string, Worktree>();

  async add(worktree: Worktree): Promise<void> {
    this.store.set(worktree.id, { ...worktree });
  }

  async get(worktreeId: string): Promise<Worktree | undefined> {
    const wt = this.store.get(worktreeId);
    return wt ? { ...wt } : undefined;
  }

  async listByCodebase(codebaseId: string): Promise<Worktree[]> {
    return Array.from(this.store.values()).filter((wt) => wt.codebaseId === codebaseId);
  }

  async listByWorkspace(workspaceId: string): Promise<Worktree[]> {
    return Array.from(this.store.values()).filter((wt) => wt.workspaceId === workspaceId);
  }

  async updateStatus(worktreeId: string, status: WorktreeStatus, errorMessage?: string): Promise<void> {
    const wt = this.store.get(worktreeId);
    if (wt) {
      this.store.set(worktreeId, {
        ...wt,
        status,
        errorMessage,
        updatedAt: new Date(),
      });
    }
  }

  async assignSession(worktreeId: string, sessionId: string | null): Promise<void> {
    const wt = this.store.get(worktreeId);
    if (wt) {
      this.store.set(worktreeId, {
        ...wt,
        sessionId: sessionId ?? undefined,
        updatedAt: new Date(),
      });
    }
  }

  async remove(worktreeId: string): Promise<void> {
    this.store.delete(worktreeId);
  }

  async findByBranch(codebaseId: string, branch: string): Promise<Worktree | undefined> {
    return Array.from(this.store.values()).find(
      (wt) => wt.codebaseId === codebaseId && wt.branch === branch
    );
  }
}
