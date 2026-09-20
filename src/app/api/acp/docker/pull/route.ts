import { NextRequest, NextResponse } from "next/server";
import { getDockerDetector } from "@/core/acp/docker";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid 'image' parameter" },
        { status: 400 }
      );
    }

    const detector = getDockerDetector();
    const result = await detector.pullImage(image);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

