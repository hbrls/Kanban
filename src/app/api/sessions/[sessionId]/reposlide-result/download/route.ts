import fs from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import {
  getSessionRoutingRecord,
  proxyRunnerOwnedSessionRequest,
} from "@/core/acp/runner-routing";
import {
  REPOSLIDE_PPTX_CONTENT_TYPE,
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
    path: `/api/sessions/${encodeURIComponent(sessionId)}/reposlide-result/download`,
  });
  if (proxied) {
    return proxied;
  }

  const session = await getSessionRoutingRecord(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { result } = await loadRepoSlideSessionResult(sessionId);
  const artifact = await resolveRepoSlideDeckArtifact(session.cwd, result.deckPath);
  if (!artifact) {
    return NextResponse.json(
      { error: "RepoSlide deck is not available for download" },
      { status: 404 },
    );
  }

  const fileBuffer = await fs.readFile(artifact.absolutePath);
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
      "Content-Type": REPOSLIDE_PPTX_CONTENT_TYPE,
    },
  });
}
