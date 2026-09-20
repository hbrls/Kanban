/**
 * Workspace model
 *
 * Top-level organizational unit in Routa. Every agent, task, note,
 * session, and codebase belongs to exactly one workspace.
 */

import os from "os";
import path from "path";

export type WorkspaceStatus = "active" | "archived";

export interface Workspace {
  id: string;
  title: string;
  status: WorkspaceStatus;
  metadata: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export function getDefaultWorkspaceWorktreeRoot(workspaceId: string): string {
  return path.join(os.homedir(), ".routa", "workspace", workspaceId);
}

export function getEffectiveWorkspaceMetadata(workspace: Pick<Workspace, "id" | "metadata">): Record<string, string> {
  const metadata = { ...(workspace.metadata ?? {}) };
  const explicitRoot = metadata.worktreeRoot?.trim();
  metadata.worktreeRoot = explicitRoot || getDefaultWorkspaceWorktreeRoot(workspace.id);
  return metadata;
}

export function createWorkspace(params: {
  id: string;
  title: string;
  metadata?: Record<string, string>;
}): Workspace {
  const now = new Date();
  return {
    id: params.id,
    title: params.title,
    status: "active",
    metadata: getEffectiveWorkspaceMetadata({
      id: params.id,
      metadata: params.metadata ?? {},
    }),
    createdAt: now,
    updatedAt: now,
  };
}
