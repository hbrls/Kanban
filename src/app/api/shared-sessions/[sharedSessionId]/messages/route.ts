import { NextRequest, NextResponse } from "next/server";
import {
  badRequest,
  requireParticipantAuth,
  resolveSharedSessionContext,
  serializeMessage,
  type SharedSessionRouteParams,
  toErrorResponse,
} from "../../_helpers";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: SharedSessionRouteParams) {
  try {
    const { sharedSessionId, service } = await resolveSharedSessionContext(params);
    const messages = service.listMessages(sharedSessionId).map(serializeMessage);
    return NextResponse.json({ messages });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: SharedSessionRouteParams) {
  try {
    const { sharedSessionId, service } = await resolveSharedSessionContext(params);
    const body = await request.json() as {
      participantId?: string;
      participantToken?: string;
      text?: string;
    };
    const auth = requireParticipantAuth(body);
    if (auth instanceof NextResponse) {
      return auth;
    }
    if (typeof body.text !== "string") {
      return badRequest("text is required");
    }
    const message = service.sendMessage({
      sharedSessionId,
      participantId: auth.participantId,
      participantToken: auth.participantToken,
      text: body.text,
    });

    return NextResponse.json({
      message: serializeMessage(message),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
