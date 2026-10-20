import { NextRequest, NextResponse } from "next/server";
import {
  serializeParticipant,
  type SharedSessionRouteParams,
  withParticipantAuthJson,
} from "../../_helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: SharedSessionRouteParams) {
  return withParticipantAuthJson(request, params, ({ sharedSessionId, service }, auth) => {
    const participant = service.leaveSession({
      sharedSessionId,
      participantId: auth.participantId,
      participantToken: auth.participantToken,
    });

    return NextResponse.json({
      participant: serializeParticipant(participant, false),
    });
  });
}
