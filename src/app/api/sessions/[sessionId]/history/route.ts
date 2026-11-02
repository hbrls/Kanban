/**
 * Session History API Route - /api/sessions/[sessionId]/history
 *
 * Returns the message history for a session, used when switching sessions
 * in the UI to restore the chat transcript.
 *
 * Query params:
 * - consolidated=true: Returns consolidated history (agent_message_chunk merged into agent_message)
 *
 * Falls back to DB when in-memory history is empty (serverless cold start).
 */

import { NextRequest, NextResponse } from "next/server";
import { loadSessionHistory } from "@/core/session-history";
import { proxyRunnerOwnedSessionRequest } from "@/core/acp/runner-routing";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const proxied = await proxyRunnerOwnedSessionRequest(request, {
    sessionId,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/history`,
    method: "GET",
  });
  if (proxied) return proxied;

  const consolidated = request.nextUrl.searchParams.get("consolidated") === "true";
  const result = await loadSessionHistory(sessionId, { consolidated });

  return NextResponse.json(
    { history: result },
    { headers: { "Cache-Control": "no-store" } }
  );
}
