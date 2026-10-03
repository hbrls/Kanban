/**
 * GET /api/workspaces/[workspaceId]/codebases/[codebaseId]/reposlide
 *
 * Returns the launch context for an agent-driven RepoSlide session.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { buildRepoSlideLaunch } from "@/core/reposlide/build-reposlide-launch";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; codebaseId: string }> },
) {
  const { workspaceId, codebaseId } = await params;
  const system = getRoutaSystem();

  const codebase = await system.codebaseStore.get(codebaseId);
  if (!codebase || codebase.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Codebase not found" }, { status: 404 });
  }

  if (!codebase.repoPath) {
    return NextResponse.json(
      { error: "Codebase has no repository path" },
      { status: 400 },
    );
  }

  try {
    const launch = buildRepoSlideLaunch(codebase);
    return NextResponse.json(launch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
