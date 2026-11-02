import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/core/acp/http-session-store", () => ({
  getHttpSessionStore: () => ({ getSession }),
}));

import {
  A2AAuthorityError,
  requireA2ARequestAuthority,
} from "../request-authority";

describe("A2A request authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockImplementation((sessionId: string) => {
      if (sessionId === "alice-session") {
        return { sessionId, workspaceId: "ws-alice" };
      }
      if (sessionId === "bob-session") {
        return { sessionId, workspaceId: "ws-bob" };
      }
      return undefined;
    });
  });

  it("rejects requests without a server-side session binding", () => {
    expect(() => requireA2ARequestAuthority(
      new NextRequest("http://localhost/api/a2a/tasks"),
    )).toThrow(A2AAuthorityError);
  });

  it("derives workspace authority from the session instead of caller metadata", () => {
    const request = new NextRequest(
      "http://localhost/api/a2a/tasks?sessionId=bob-session",
    );

    expect(requireA2ARequestAuthority(request)).toEqual({
      sessionId: "bob-session",
      workspaceId: "ws-bob",
    });
    expect(() => requireA2ARequestAuthority(request, "ws-alice")).toThrow(
      "outside the A2A session authority",
    );
  });

  it("accepts the A2A-Session-Id header without putting authority in the URL", () => {
    const request = new NextRequest("http://localhost/api/a2a/tasks", {
      headers: { "A2A-Session-Id": "alice-session" },
    });

    expect(requireA2ARequestAuthority(request, "ws-alice").workspaceId).toBe("ws-alice");
  });
});
