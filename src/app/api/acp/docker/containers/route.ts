import { NextResponse } from "next/server";
import { getDockerProcessManager } from "@/core/acp/docker";

export const dynamic = "force-dynamic";

export async function GET() {
  const manager = getDockerProcessManager();
  const containers = manager.listContainers();

  return NextResponse.json({
    containers: containers.map((c) => ({
      containerId: c.containerId,
      containerName: c.containerName,
      sessionId: c.sessionId,
      hostPort: c.hostPort,
      containerPort: c.containerPort,
      image: c.image,
      workspacePath: c.workspacePath,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

