import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { proxyRunnerOwnedSessionRequest, loadSessionHistory } = vi.hoisted(() => ({
  proxyRunnerOwnedSessionRequest: vi.fn(),
  loadSessionHistory: vi.fn(),
}));

vi.mock("@/core/acp/runner-routing", () => ({
  proxyRunnerOwnedSessionRequest,
}));

vi.mock("@/core/session-history", () => ({
  loadSessionHistory,
}));

import { GET } from "../route";

describe("/api/sessions/[sessionId]/history GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    proxyRunnerOwnedSessionRequest.mockResolvedValue(null);
    loadSessionHistory.mockResolvedValue([{ sessionId: "session-123", update: { sessionUpdate: "agent_message" } }]);
  });

  it("proxies runner-owned sessions before falling back to local history", async () => {
    proxyRunnerOwnedSessionRequest.mockResolvedValue(
      new Response(JSON.stringify({ history: [{ sessionId: "session-123", proxied: true }] }), { status: 200 }),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/sessions/session-123/history"),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );
    const data = await response.json();

    expect(data.history[0]).toMatchObject({ sessionId: "session-123", proxied: true });
    expect(loadSessionHistory).not.toHaveBeenCalled();
  });

  it("falls back to local history loading for embedded sessions", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/sessions/session-123/history?consolidated=true"),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );
    const data = await response.json();

    expect(proxyRunnerOwnedSessionRequest).toHaveBeenCalledTimes(1);
    expect(loadSessionHistory).toHaveBeenCalledWith("session-123", { consolidated: true });
    expect(data.history).toHaveLength(1);
  });
});
