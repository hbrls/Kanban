import { NextRequest, NextResponse } from "next/server";
import type {
  SharedPromptApproval,
  SharedSessionService,
  SharedSession,
  SharedSessionMessage,
  SharedSessionParticipant,
} from "@/core/shared-session";
import { SharedSessionError, getSharedSessionService } from "@/core/shared-session";

export type SharedSessionRouteParams = {
  params: Promise<{ sharedSessionId: string }>;
};

export interface SharedSessionContext {
  sharedSessionId: string;
  service: SharedSessionService;
}

export interface ParticipantAuthInput {
  participantId?: string;
  participantToken?: string;
}

export interface ParticipantAuth {
  participantId: string;
  participantToken: string;
}

export function serializeSession(session: SharedSession) {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt?.toISOString(),
  };
}

export function serializeParticipant(participant: SharedSessionParticipant, includeToken = false) {
  return {
    id: participant.id,
    sharedSessionId: participant.sharedSessionId,
    userId: participant.userId,
    displayName: participant.displayName,
    role: participant.role,
    joinedAt: participant.joinedAt.toISOString(),
    leftAt: participant.leftAt?.toISOString(),
    ...(includeToken ? { accessToken: participant.accessToken } : {}),
  };
}

export function serializeApproval(approval: SharedPromptApproval) {
  return {
    ...approval,
    createdAt: approval.createdAt.toISOString(),
    resolvedAt: approval.resolvedAt?.toISOString(),
  };
}

export function serializeMessage(message: SharedSessionMessage) {
  return {
    ...message,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function resolveSharedSessionContext(
  params: SharedSessionRouteParams["params"],
): Promise<SharedSessionContext> {
  const { sharedSessionId } = await params;
  return {
    sharedSessionId,
    service: getSharedSessionService(),
  };
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function requireParticipantAuth(input: ParticipantAuthInput): NextResponse | {
  participantId: string;
  participantToken: string;
} {
  if (!input.participantId || !input.participantToken) {
    return badRequest("participantId and participantToken are required");
  }

  return {
    participantId: input.participantId,
    participantToken: input.participantToken,
  };
}

export async function withSharedSessionJson<TBody>(
  request: NextRequest,
  params: SharedSessionRouteParams["params"],
  handler: (context: SharedSessionContext, body: TBody) => Promise<NextResponse> | NextResponse,
): Promise<NextResponse> {
  try {
    const context = await resolveSharedSessionContext(params);
    const body = (await request.json()) as TBody;
    return await handler(context, body);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function withParticipantAuthJson<TBody extends ParticipantAuthInput>(
  request: NextRequest,
  params: SharedSessionRouteParams["params"],
  handler: (
    context: SharedSessionContext,
    auth: ParticipantAuth,
    body: TBody,
  ) => Promise<NextResponse> | NextResponse,
): Promise<NextResponse> {
  return withSharedSessionJson<TBody>(request, params, (context, body) => {
    const auth = requireParticipantAuth(body);
    if (auth instanceof NextResponse) {
      return auth;
    }

    return handler(context, auth, body);
  });
}

export function requireInviteJoinInput(input: {
  inviteToken?: string;
  userId?: string;
  displayName?: string;
  role?: "collaborator" | "viewer";
}): NextResponse | {
  inviteToken: string;
  userId: string;
  displayName?: string;
  role?: "collaborator" | "viewer";
} {
  if (!input.inviteToken) {
    return badRequest("inviteToken is required");
  }
  if (!input.userId?.trim()) {
    return badRequest("userId is required");
  }

  return {
    inviteToken: input.inviteToken,
    userId: input.userId,
    displayName: input.displayName,
    role: input.role,
  };
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof SharedSessionError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
