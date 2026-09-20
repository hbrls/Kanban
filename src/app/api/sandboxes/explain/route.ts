import { NextRequest, NextResponse } from "next/server";
import type { CreateSandboxRequest } from "@/core/sandbox";
import { explainRustSandboxPolicy } from "@/core/sandbox";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: CreateSandboxRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await explainRustSandboxPolicy(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("not configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
