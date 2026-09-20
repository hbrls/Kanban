/**
 * /api/workflows/[id]/trigger — start a workflow run inside a workspace.
 *
 * POST /api/workflows/[id]/trigger
 *   → create a workflow run and enqueue background tasks for each step
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { getWorkflowLoader, WorkflowExecutor } from "@/core/workflows";
import { getBackgroundWorker, startBackgroundWorker } from "@/core/background-worker";

export const dynamic = "force-dynamic";

function requireWorkspaceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const workspaceId = requireWorkspaceId(body.workspaceId);
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const definition = await getWorkflowLoader().load(id);
    const system = getRoutaSystem();
    const executor = new WorkflowExecutor({
      workflowRunStore: system.workflowRunStore,
      backgroundTaskStore: system.backgroundTaskStore,
    });

    const result = await executor.trigger({
      workflowId: id,
      definition,
      workspaceId,
      triggerPayload: typeof body.triggerPayload === "string" ? body.triggerPayload : undefined,
      triggerSource: "manual",
    });

    startBackgroundWorker();
    void getBackgroundWorker().dispatchPending();

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to trigger workflow" },
      { status: 500 },
    );
  }
}
