import { NextRequest, NextResponse } from "next/server";

import { buildRepoWiki } from "@/core/repowiki/build-repowiki";
import { getRoutaSystem } from "@/core/routa-system";

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
    return NextResponse.json({ error: "Codebase has no repository path" }, { status: 400 });
  }

  try {
    return NextResponse.json(buildRepoWiki(codebase));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
