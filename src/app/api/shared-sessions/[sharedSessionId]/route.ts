import { NextRequest, NextResponse } from "next/server";
import {
  resolveSharedSessionContext,
  serializeApproval,
  serializeParticipant,
  serializeSession,
  type SharedSessionRouteParams,
  toErrorResponse,
  withParticipantAuthJson,
} from "../_helpers";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: SharedSessionRouteParams) {
  try {
    const { sharedSessionId, service } = await resolveSharedSessionContext(params);
    const session = service.getSession(sharedSessionId);
    if (!session) {
      return NextResponse.json({ error: "Shared session not found" }, { status: 404 });
    }

    const participants = service.listParticipants(sharedSessionId).map((participant) =>
      serializeParticipant(participant, false),
    );
    const approvals = service.listApprovals(sharedSessionId).map(serializeApproval);

    return NextResponse.json({
      session: serializeSession(session),
      participants,
      approvals,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: SharedSessionRouteParams) {
  return withParticipantAuthJson(request, params, ({ sharedSessionId, service }, auth) => {
    const session = service.closeSession({
      sharedSessionId,
      participantId: auth.participantId,
      participantToken: auth.participantToken,
    });

    return NextResponse.json({
      closed: true,
      session: serializeSession(session),
    });
  });
}
