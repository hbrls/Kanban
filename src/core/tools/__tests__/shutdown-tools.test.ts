/**
 * Tests for Phase 3: Graceful Shutdown Protocol (issue #137)
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AgentTools } from "../agent-tools";
import { EventBus, AgentEventType } from "../../events/event-bus";
import { InMemoryAgentStore } from "../../store/agent-store";
import { InMemoryConversationStore } from "../../store/conversation-store";
import { InMemoryTaskStore } from "../../store/task-store";
import { AgentRole, AgentStatus, ModelTier, createAgent } from "../../models/agent";

function makeAgent(id: string, opts: { parentId?: string; status?: AgentStatus } = {}) {
  const agent = createAgent({
    id,
    name: `agent-${id}`,
    role: AgentRole.CRAFTER,
    workspaceId: "ws-1",
    parentId: opts.parentId,
    modelTier: ModelTier.SMART,
    metadata: {},
  });
  if (opts.status) agent.status = opts.status;
  return agent;
}

describe("Graceful Shutdown Protocol", () => {
  let tools: AgentTools;
  let agentStore: InMemoryAgentStore;
  let conversationStore: InMemoryConversationStore;
  let taskStore: InMemoryTaskStore;
  let eventBus: EventBus;

  beforeEach(() => {
    agentStore = new InMemoryAgentStore();
    conversationStore = new InMemoryConversationStore();
    taskStore = new InMemoryTaskStore();
    eventBus = new EventBus();
    tools = new AgentTools(agentStore, conversationStore, taskStore, eventBus);
  });

  // ─── requestShutdown ───────────────────────────────────────────────────────

  describe("requestShutdown", () => {
    it("returns early when no active child agents", async () => {
      const coordinator = makeAgent("coord-1");
      await agentStore.save(coordinator);

      const result = await tools.requestShutdown({
        coordinatorAgentId: "coord-1",
        workspaceId: "ws-1",
      });

      expect(result.success).toBe(true);
      expect((result.data as any).agentIds).toHaveLength(0);
    });

    it("sends shutdown message to each active child agent", async () => {
      const coordinator = makeAgent("coord-2");
      const child1 = makeAgent("child-1", { parentId: "coord-2", status: AgentStatus.ACTIVE });
      const child2 = makeAgent("child-2", { parentId: "coord-2", status: AgentStatus.ACTIVE });
      await agentStore.save(coordinator);
      await agentStore.save(child1);
      await agentStore.save(child2);

      const result = await tools.requestShutdown({
        coordinatorAgentId: "coord-2",
        workspaceId: "ws-1",
        reason: "work complete",
      });

      expect(result.success).toBe(true);
      expect((result.data as any).agentIds).toHaveLength(2);

      const msgs1 = await conversationStore.getConversation("child-1");
      expect(msgs1[0].content).toContain("Shutdown Request");
      expect(msgs1[0].content).toContain("work complete");

      const msgs2 = await conversationStore.getConversation("child-2");
      expect(msgs2[0].content).toContain("acknowledgeShutdown");
    });

    it("emits SHUTDOWN_REQUESTED event per child agent", async () => {
      const coordinator = makeAgent("coord-3");
      const child = makeAgent("child-3", { parentId: "coord-3", status: AgentStatus.ACTIVE });
      await agentStore.save(coordinator);
      await agentStore.save(child);

      const emitted: AgentEventType[] = [];
      eventBus.on("test", (e) => emitted.push(e.type));

      await tools.requestShutdown({
        coordinatorAgentId: "coord-3",
        workspaceId: "ws-1",
      });

      expect(emitted).toContain(AgentEventType.SHUTDOWN_REQUESTED);
    });

    it("only targets direct children, not unrelated active agents", async () => {
      const coordinator = makeAgent("coord-4");
      const child = makeAgent("child-4", { parentId: "coord-4", status: AgentStatus.ACTIVE });
      const unrelated = makeAgent("unrelated-4", { status: AgentStatus.ACTIVE });
      await agentStore.save(coordinator);
      await agentStore.save(child);
      await agentStore.save(unrelated);

      const result = await tools.requestShutdown({
        coordinatorAgentId: "coord-4",
        workspaceId: "ws-1",
      });

      expect((result.data as any).agentIds).toEqual(["child-4"]);

      const unrelatedMsgs = await conversationStore.getConversation("unrelated-4");
      expect(unrelatedMsgs).toHaveLength(0);
    });
  });

  // ─── acknowledgeShutdown ───────────────────────────────────────────────────

  describe("acknowledgeShutdown", () => {
    it("returns error when agent not found", async () => {
      const result = await tools.acknowledgeShutdown({
        agentId: "missing",
        workspaceId: "ws-1",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Agent not found");
    });

    it("marks agent as COMPLETED", async () => {
      const agent = makeAgent("worker-ack", { status: AgentStatus.ACTIVE });
      await agentStore.save(agent);

      const result = await tools.acknowledgeShutdown({
        agentId: "worker-ack",
        workspaceId: "ws-1",
        summary: "saved all state",
      });

      expect(result.success).toBe(true);
      expect((result.data as any).status).toBe(AgentStatus.COMPLETED);

      const updated = await agentStore.get("worker-ack");
      expect(updated?.status).toBe(AgentStatus.COMPLETED);
    });

    it("emits SHUTDOWN_ACKNOWLEDGED event", async () => {
      const agent = makeAgent("worker-ack2", { status: AgentStatus.ACTIVE });
      await agentStore.save(agent);

      const emitted: AgentEventType[] = [];
      eventBus.on("test", (e) => emitted.push(e.type));

      await tools.acknowledgeShutdown({ agentId: "worker-ack2", workspaceId: "ws-1" });

      expect(emitted).toContain(AgentEventType.SHUTDOWN_ACKNOWLEDGED);
    });

    it("notifies parent agent when parentId is set", async () => {
      const parent = makeAgent("parent-ack");
      const child = makeAgent("child-ack", { parentId: "parent-ack", status: AgentStatus.ACTIVE });
      await agentStore.save(parent);
      await agentStore.save(child);

      await tools.acknowledgeShutdown({
        agentId: "child-ack",
        workspaceId: "ws-1",
        summary: "gracefully stopped",
      });

      const msgs = await conversationStore.getConversation("parent-ack");
      expect(msgs.length).toBe(1);
      expect(msgs[0].content).toContain("Shutdown Acknowledged");
      expect(msgs[0].content).toContain("gracefully stopped");
    });

    it("does not notify parent when no parentId", async () => {
      const agent = makeAgent("solo-ack", { status: AgentStatus.ACTIVE });
      await agentStore.save(agent);

      await tools.acknowledgeShutdown({ agentId: "solo-ack", workspaceId: "ws-1" });

      const msgs = await conversationStore.getConversation("solo-ack");
      expect(msgs).toHaveLength(0);
    });
  });

  // ─── Full shutdown round-trip ──────────────────────────────────────────────

  describe("full shutdown round-trip", () => {
    it("coordinator requests shutdown, children acknowledge, all marked COMPLETED", async () => {
      const coordinator = makeAgent("coord-rt");
      const child1 = makeAgent("child-rt-1", { parentId: "coord-rt", status: AgentStatus.ACTIVE });
      const child2 = makeAgent("child-rt-2", { parentId: "coord-rt", status: AgentStatus.ACTIVE });
      await agentStore.save(coordinator);
      await agentStore.save(child1);
      await agentStore.save(child2);

      // Step 1: coordinator requests shutdown
      const shutdownResult = await tools.requestShutdown({
        coordinatorAgentId: "coord-rt",
        workspaceId: "ws-1",
        reason: "all tasks done",
      });
      expect((shutdownResult.data as any).agentIds).toHaveLength(2);

      // Step 2: each child acknowledges
      await tools.acknowledgeShutdown({ agentId: "child-rt-1", workspaceId: "ws-1", summary: "done" });
      await tools.acknowledgeShutdown({ agentId: "child-rt-2", workspaceId: "ws-1", summary: "done" });

      // Both children should be COMPLETED
      expect((await agentStore.get("child-rt-1"))?.status).toBe(AgentStatus.COMPLETED);
      expect((await agentStore.get("child-rt-2"))?.status).toBe(AgentStatus.COMPLETED);

      // Coordinator should have received acknowledgment messages
      const coordMsgs = await conversationStore.getConversation("coord-rt");
      expect(coordMsgs.length).toBe(2);
      expect(coordMsgs.every((m) => m.content.includes("Shutdown Acknowledged"))).toBe(true);
    });
  });
});
