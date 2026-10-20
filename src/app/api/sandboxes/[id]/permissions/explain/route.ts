import { NextRequest, NextResponse } from "next/server";
import type { SandboxPermissionConstraints } from "@/core/sandbox";
import { proxyRustSandboxPermissionMutation } from "@/core/sandbox";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: { constraints?: SandboxPermissionConstraints };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.constraints) {
    return NextResponse.json({ error: "Missing required field: constraints" }, { status: 400 });
  }

  const response = await proxyRustSandboxPermissionMutation(id, "explain", body.constraints);
  const payload = await response.json().catch(() => ({ error: "Invalid sandbox response" }));
  return NextResponse.json(payload, { status: response.status });
}
