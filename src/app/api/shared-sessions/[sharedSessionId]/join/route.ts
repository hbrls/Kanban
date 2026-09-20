import { NextRequest, NextResponse } from "next/server";
import {
  requireInviteJoinInput,
  serializeParticipant,
  serializeSession,
  type SharedSessionRouteParams,
  withSharedSessionJson,
} from "../../_helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: SharedSessionRouteParams) {
  return withSharedSessionJson<{
    inviteToken?: string;
    userId?: string;
    displayName?: string;
    role?: "collaborator" | "viewer";
  }>(request, params, ({ sharedSessionId, service }, body) => {
    const joinInput = requireInviteJoinInput(body);
    if (joinInput instanceof NextResponse) {
      return joinInput;
    }
    const { session, participant } = service.joinSession({
      sharedSessionId,
      inviteToken: joinInput.inviteToken,
      userId: joinInput.userId,
      displayName: joinInput.displayName,
      role: joinInput.role,
    });

    return NextResponse.json({
      session: serializeSession(session),
      participant: serializeParticipant(participant, true),
    });
  });
}
