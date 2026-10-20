/**
 * /api/background-tasks/[id] — Single task operations.
 *
 * GET    /api/background-tasks/[id]  → Get task status
 * PATCH  /api/background-tasks/[id]  → Edit task (PENDING only)
 * DELETE /api/background-tasks/[id]  → Cancel / delete task
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const system = getRoutaSystem();
  const task = await system.backgroundTaskStore.get(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ task });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const system = getRoutaSystem();
  const task = await system.backgroundTaskStore.get(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (task.status !== "PENDING") {
    return NextResponse.json(
      { error: "Only PENDING tasks can be edited" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, prompt, agentId, priority } = body;
  const updated = {
    ...task,
    ...(title !== undefined && { title }),
    ...(prompt !== undefined && { prompt }),
    ...(agentId !== undefined && { agentId }),
    ...(priority !== undefined && { priority }),
    updatedAt: new Date(),
  };
  await system.backgroundTaskStore.save(updated);
  return NextResponse.json({ task: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = request.nextUrl;
  const force = searchParams.get("force") === "true";

  const system = getRoutaSystem();
  const task = await system.backgroundTaskStore.get(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // PENDING tasks have not started — hard delete immediately
  if (task.status === "PENDING") {
    await system.backgroundTaskStore.delete(id);
    return NextResponse.json({ success: true });
  }

  // RUNNING tasks: soft-cancel unless force=true (for stale/orphaned tasks)
  if (task.status === "RUNNING") {
    if (force) {
      await system.backgroundTaskStore.updateStatus(id, "FAILED", {
        completedAt: new Date(),
        errorMessage: "Force-deleted by user",
      });
      await system.backgroundTaskStore.delete(id);
      return NextResponse.json({ success: true });
    }
    await system.backgroundTaskStore.updateStatus(id, "CANCELLED", {
      completedAt: new Date(),
    });
    const updated = await system.backgroundTaskStore.get(id);
    return NextResponse.json({ task: updated });
  }

  // Terminal state tasks (COMPLETED, CANCELLED, FAILED) — hard delete
  await system.backgroundTaskStore.delete(id);
  return NextResponse.json({ success: true });
}
