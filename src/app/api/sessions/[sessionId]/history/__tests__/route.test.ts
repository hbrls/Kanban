import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadSessionHistory } = vi.hoisted(() => ({
  loadSessionHistory: vi.fn(),
}));

vi.mock("@/core/session-history", () => ({
  loadSessionHistory,
}));

import { GET } from "../route";

describe("/api/sessions/[sessionId]/history GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSessionHistory.mockResolvedValue([{ sessionId: "session-123", update: { sessionUpdate: "agent_message" } }]);
  });

  it("falls back to local history loading for embedded sessions", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/sessions/session-123/history?consolidated=true"),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );
    const data = await response.json();

    expect(loadSessionHistory).toHaveBeenCalledWith("session-123", { consolidated: true });
    expect(data.history).toHaveLength(1);
  });
});
