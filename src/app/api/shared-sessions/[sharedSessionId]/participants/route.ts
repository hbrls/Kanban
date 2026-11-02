import { NextRequest, NextResponse } from "next/server";
import {
  resolveSharedSessionContext,
  serializeParticipant,
  type SharedSessionRouteParams,
  toErrorResponse,
} from "../../_helpers";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: SharedSessionRouteParams) {
  try {
    const { sharedSessionId, service } = await resolveSharedSessionContext(params);
    const participants = service.listParticipants(sharedSessionId).map((participant) =>
      serializeParticipant(participant, false),
    );

    return NextResponse.json({ participants });
  } catch (error) {
    return toErrorResponse(error);
  }
}
