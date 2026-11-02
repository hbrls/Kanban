import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, listAgents } = vi.hoisted(() => ({
  getSession: vi.fn(),
  listAgents: vi.fn(),
}));

vi.mock("@/core/acp/http-session-store", () => ({
  getHttpSessionStore: () => ({ getSession }),
}));

vi.mock("@/core/routa-system", () => ({
  getRoutaSystem: () => ({
    tools: { listAgents },
  }),
}));

import { POST as rpcPost } from "../rpc/route";
import { GET as getTaskList } from "../tasks/route";
import { GET as getTask, POST as cancelTask } from "../tasks/[id]/route";
import { getA2ATaskBridge } from "@/core/a2a";

describe("A2A task routes workspace authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAgents.mockResolvedValue({ success: true, data: [] });
    getSession.mockImplementation((sessionId: string) => ({
      sessionId,
      workspaceId: sessionId === "alice-session" ? "ws-alice" : "ws-bob",
    }));
  });

  it("prevents Bob from listing, reading, or canceling Alice's REST task", async () => {
    const bridge = getA2ATaskBridge();
    const aliceTask = bridge.createTask({
      userPrompt: "Alice REST authority task",
      workspaceId: "ws-alice",
    });
    const headers = { "A2A-Session-Id": "bob-session" };

    const listResponse = await getTaskList(new NextRequest(
      "http://localhost/api/a2a/tasks",
      { headers },
    ));
    const listBody = await listResponse.json();
    expect(listBody.tasks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: aliceTask.id }),
    ]));

    const routeContext = { params: Promise.resolve({ id: aliceTask.id }) };
    const getResponse = await getTask(new NextRequest(
      `http://localhost/api/a2a/tasks/${aliceTask.id}`,
      { headers },
    ), routeContext);
    expect(getResponse.status).toBe(404);

    const cancelResponse = await cancelTask(new NextRequest(
      `http://localhost/api/a2a/tasks/${aliceTask.id}?action=cancel`,
      { method: "POST", headers },
    ), routeContext);
    expect(cancelResponse.status).toBe(404);
    expect(bridge.getTask(aliceTask.id, "ws-alice")?.status.state).toBe("submitted");
  });

  it.each(["GetTask", "CancelTask"])(
    "prevents Bob from using JSON-RPC %s on Alice's task",
    async (method) => {
      const bridge = getA2ATaskBridge();
      const aliceTask = bridge.createTask({
        userPrompt: `Alice RPC ${method} authority task`,
        workspaceId: "ws-alice",
      });

      const response = await rpcPost(new NextRequest(
        "http://localhost/api/a2a/rpc",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "A2A-Session-Id": "bob-session",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: method,
            method,
            params: { id: aliceTask.id },
          }),
        },
      ));
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error.code).toBe(-32001);
      expect(bridge.getTask(aliceTask.id, "ws-alice")?.status.state).toBe("submitted");
    },
  );
});
