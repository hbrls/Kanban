import { NextRequest, NextResponse } from "next/server";

import {
  getSessionRoutingRecord,
  proxyRunnerOwnedSessionRequest,
} from "@/core/acp/runner-routing";
import {
  buildRepoSlideDownloadPath,
  resolveRepoSlideDeckArtifact,
} from "@/core/reposlide/deck-artifact";
import { loadRepoSlideSessionResult } from "@/core/reposlide/session-result";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const proxied = await proxyRunnerOwnedSessionRequest(request, {
    sessionId,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/reposlide-result`,
  });
  if (proxied) {
    return proxied;
  }

  const session = await getSessionRoutingRecord(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { transcript, result: baseResult } = await loadRepoSlideSessionResult(sessionId);
  const artifact = await resolveRepoSlideDeckArtifact(session.cwd, baseResult.deckPath);
  const result = artifact
    ? {
        ...baseResult,
        downloadUrl: buildRepoSlideDownloadPath(sessionId),
      }
    : baseResult;

  return NextResponse.json(
    {
      sessionId,
      result,
      latestEventKind: transcript.latestEventKind,
      source: transcript.source,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
