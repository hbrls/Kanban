/**
 * /api/workspaces/[workspaceId] - Single workspace CRUD.
 *
 * GET    /api/workspaces/:id  → Get workspace with its codebases
 * PATCH  /api/workspaces/:id  → Update workspace title
 * DELETE /api/workspaces/:id  → Delete workspace
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { getRoutaSystem } from "@/core/routa-system";
import { getEffectiveWorkspaceMetadata } from "@/core/models/workspace";

export const dynamic = "force-dynamic";

async function normalizeWorkspaceMetadata(metadata: unknown) {
  if (metadata === undefined) return undefined;
  if (metadata === null || Array.isArray(metadata) || typeof metadata !== "object") {
    throw new Error("metadata must be an object");
  }

  const nextMetadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") {
      throw new Error(`metadata.${key} must be a string`);
    }
    nextMetadata[key] = value;
  }

  if ("worktreeRoot" in nextMetadata) {
    const rawRoot = nextMetadata.worktreeRoot.trim();
    if (!rawRoot) {
      nextMetadata.worktreeRoot = "";
    } else {
      const expandedRoot = rawRoot.startsWith("~/")
        ? path.join(os.homedir(), rawRoot.slice(2))
        : rawRoot;
      const resolvedRoot = path.resolve(expandedRoot);
      await fs.mkdir(resolvedRoot, { recursive: true });
      await fs.access(resolvedRoot, fs.constants.W_OK);
      nextMetadata.worktreeRoot = resolvedRoot;
    }
  }

  return nextMetadata;
}

function serializeWorkspace(workspace: { id: string; title: string; status: string; metadata: Record<string, string>; createdAt: Date; updatedAt: Date; }) {
  return {
    ...workspace,
    metadata: getEffectiveWorkspaceMetadata(workspace),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const system = getRoutaSystem();

  const workspace = await system.workspaceStore.get(workspaceId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const codebases = await system.codebaseStore.listByWorkspace(workspaceId);

  return NextResponse.json({ workspace: serializeWorkspace(workspace), codebases });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const body = await request.json();
  const { title, metadata } = body;

  const system = getRoutaSystem();

  const existing = await system.workspaceStore.get(workspaceId);
  if (!existing) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (title !== undefined) {
    await system.workspaceStore.updateTitle(workspaceId, title);
  }
  if (metadata !== undefined) {
    try {
      const normalizedMetadata = await normalizeWorkspaceMetadata(metadata);
      if (normalizedMetadata) {
        await system.workspaceStore.updateMetadata(workspaceId, normalizedMetadata);
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid metadata" },
        { status: 400 },
      );
    }
  }
  const workspace = await system.workspaceStore.get(workspaceId);

  return NextResponse.json({ workspace: workspace ? serializeWorkspace(workspace) : workspace });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const system = getRoutaSystem();

  await system.workspaceStore.delete(workspaceId);

  return NextResponse.json({ deleted: true });
}
