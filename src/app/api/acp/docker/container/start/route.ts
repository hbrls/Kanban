import { NextRequest, NextResponse } from "next/server";
import { getDockerProcessManager } from "@/core/acp/docker";
import type { DockerContainerConfig } from "@/core/acp/docker";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, image, workdir, authJson } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid 'sessionId' parameter" },
        { status: 400 }
      );
    }

    if (!workdir || typeof workdir !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid 'workdir' parameter" },
        { status: 400 }
      );
    }

    const config: DockerContainerConfig = {
      sessionId,
      image: image || undefined,
      workspacePath: workdir,
      authJson: authJson || undefined,
    };

    const manager = getDockerProcessManager();
    const info = await manager.startContainer(config);

    return NextResponse.json({
      ok: true,
      container: {
        containerId: info.containerId,
        containerName: info.containerName,
        sessionId: info.sessionId,
        hostPort: info.hostPort,
        containerPort: info.containerPort,
        image: info.image,
        workspacePath: info.workspacePath,
        createdAt: info.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

