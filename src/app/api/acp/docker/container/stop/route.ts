import { NextRequest, NextResponse } from "next/server";
import { getDockerProcessManager } from "@/core/acp/docker";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, containerId } = body;

    // Accept either sessionId or containerId for flexibility
    const id = sessionId || containerId;
    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid 'sessionId' or 'containerId' parameter" },
        { status: 400 }
      );
    }

    const manager = getDockerProcessManager();
    await manager.stopContainer(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

