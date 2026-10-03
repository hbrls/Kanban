/**
 * A2A Sessions API - /api/a2a/sessions
 *
 * Discovery endpoint for A2A clients to list available backend sessions.
 * Returns session metadata including RPC endpoints and capabilities.
 */

import { NextRequest, NextResponse } from "next/server";
import { getA2aSessionRegistry } from "@/core/a2a";
import {
  A2AAuthorityError,
  a2aAuthorityProblem,
  requireA2ARequestAuthority,
} from "../request-authority";

export const dynamic = "force-dynamic";

/**
 * GET /api/a2a/sessions - List all active sessions
 */
export async function GET(request: NextRequest) {
  let session;
  try {
    const authority = requireA2ARequestAuthority(request);
    const registry = getA2aSessionRegistry();
    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    session = registry.getSession(authority.sessionId, baseUrl);
  } catch (error) {
    if (error instanceof A2AAuthorityError) {
      return a2aAuthorityProblem(error);
    }
    throw error;
  }

  const sessions = session ? [session] : [];

  return NextResponse.json(
    {
      sessions,
      count: sessions.length,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*", // Allow A2A clients from any origin
      },
    }
  );
}
