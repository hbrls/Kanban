import { NextRequest, NextResponse } from "next/server";
import {
  badRequest,
  serializeApproval,
  type SharedSessionRouteParams,
  withParticipantAuthJson,
} from "../../_helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: SharedSessionRouteParams) {
  return withParticipantAuthJson<{
    participantId?: string;
    participantToken?: string;
    prompt?: string;
  }>(request, params, ({ sharedSessionId, service }, auth, body) => {
    if (typeof body.prompt !== "string") {
      return badRequest("prompt is required");
    }
    const result = service.sendPrompt({
      sharedSessionId,
      participantId: auth.participantId,
      participantToken: auth.participantToken,
      prompt: body.prompt,
    });

    return NextResponse.json({
      status: result.status,
      approval: result.approval ? serializeApproval(result.approval) : null,
    });
  });
}
