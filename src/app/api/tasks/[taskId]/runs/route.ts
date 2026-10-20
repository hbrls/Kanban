import { NextResponse } from "next/server";
import { getHttpSessionStore } from "@/core/acp/http-session-store";
import { getRoutaSystem } from "@/core/routa-system";
import { buildTaskRunLedger } from "@/core/task-run-ledger";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;
  const system = getRoutaSystem();
  const task = await system.taskStore.get(taskId);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const sessionStore = getHttpSessionStore();
  await sessionStore.hydrateFromDb();

  const sessionsById = new Map(
    (task.laneSessions ?? [])
      .map((laneSession) => laneSession.sessionId)
      .map((sessionId) => [sessionId, sessionStore.getSession(sessionId)] as const)
      .filter((entry): entry is readonly [string, NonNullable<ReturnType<typeof sessionStore.getSession>>] => Boolean(entry[1])),
  );

  return NextResponse.json(
    { runs: buildTaskRunLedger(task, sessionsById) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
