import { NextRequest, NextResponse } from "next/server";

import { getHttpSessionStore } from "@/core/acp/http-session-store";

export interface A2ARequestAuthority {
  sessionId: string;
  workspaceId: string;
}

export class A2AAuthorityError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
    readonly rpcCode: -32002 | -32003,
  ) {
    super(message);
    this.name = "A2AAuthorityError";
  }
}

function normalize(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function requireA2ARequestAuthority(
  request: NextRequest,
  claimedWorkspaceId?: unknown,
): A2ARequestAuthority {
  const sessionId = normalize(request.headers.get("a2a-session-id"))
    ?? normalize(request.nextUrl.searchParams.get("sessionId"));
  if (!sessionId) {
    throw new A2AAuthorityError("A2A session authority is required", 401, -32002);
  }

  const session = getHttpSessionStore().getSession(sessionId);
  if (!session?.workspaceId) {
    throw new A2AAuthorityError("A2A session authority is invalid", 401, -32002);
  }

  const claimed = normalize(claimedWorkspaceId);
  if (claimed && claimed !== session.workspaceId) {
    throw new A2AAuthorityError(
      "The requested workspace is outside the A2A session authority",
      403,
      -32003,
    );
  }

  return { sessionId, workspaceId: session.workspaceId };
}

export function a2aAuthorityProblem(error: A2AAuthorityError): NextResponse {
  return NextResponse.json(
    {
      type: error.status === 401
        ? "https://a2a-protocol.org/errors/unauthenticated"
        : "https://a2a-protocol.org/errors/permission-denied",
      title: error.status === 401 ? "Authentication Required" : "Permission Denied",
      status: error.status,
      detail: error.message,
    },
    {
      status: error.status,
      headers: error.status === 401 ? { "WWW-Authenticate": "A2A-Session" } : undefined,
    },
  );
}
