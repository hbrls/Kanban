import { describe, expect, it } from "vitest";

import { A2ATaskBridge } from "../a2a-task-bridge";

describe("A2ATaskBridge workspace authority", () => {
  it("requires a workspace scope when listing tasks", () => {
    const bridge = new A2ATaskBridge();
    bridge.createTask({ userPrompt: "Alice task", workspaceId: "ws-alice" });
    bridge.createTask({ userPrompt: "Bob task", workspaceId: "ws-bob" });

    expect(() => bridge.listTasks(undefined as never)).toThrow("workspaceId is required");
    expect(bridge.listTasks({ workspaceId: "ws-bob" })).toHaveLength(1);
  });

  it("does not read or cancel Alice's task through Bob's workspace scope", () => {
    const bridge = new A2ATaskBridge();
    const aliceTask = bridge.createTask({
      userPrompt: "Alice task",
      workspaceId: "ws-alice",
    });

    expect(bridge.getTask(aliceTask.id, "ws-bob")).toBeUndefined();
    expect(bridge.cancelTask(aliceTask.id, "ws-bob")).toBeUndefined();
    expect(bridge.getTask(aliceTask.id, "ws-alice")?.status.state).toBe("submitted");
  });
});
