/**
 * Tests for LifecycleNotifier (issue #137, Phase 1)
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { LifecycleNotifier } from "../lifecycle-notifier";
import { EventBus, AgentEventType } from "../../events/event-bus";
import { InMemoryAgentStore } from "../../store/agent-store";
import { InMemoryConversationStore } from "../../store/conversation-store";
import { AgentRole, AgentStatus, ModelTier, createAgent } from "../../models/agent";
import { MessageRole } from "../../models/message";

function makeAgent(id: string, parentId?: string) {
  return createAgent({ id, name: `agent-${id}`, role: AgentRole.CRAFTER, workspaceId: "ws-1", parentId, modelTier: ModelTier.SMART, metadata: {} });
}

describe("LifecycleNotifier", () => {
  let eventBus: EventBus;
  let agentStore: InMemoryAgentStore;
  let conversationStore: InMemoryConversationStore;

  beforeEach(() => {
    eventBus = new EventBus();
    agentStore = new InMemoryAgentStore();
    conversationStore = new InMemoryConversationStore();
  });

  function makeNotifier(agentId: string, parentId?: string) {
    return new LifecycleNotifier(eventBus, agentStore, conversationStore, {
      agentId,
      workspaceId: "ws-1",
      parentId,
      agentName: `agent-${agentId}`,
    });
  }

  // ─── notifyIdle ────────────────────────────────────────────────────────────

  describe("notifyIdle", () => {
    it("emits AGENT_IDLE event", async () => {
      const agent = makeAgent("a1");
      await agentStore.save(agent);
      const notifier = makeNotifier("a1");

      const emitted: AgentEventType[] = [];
      eventBus.on("test", (e) => emitted.push(e.type));

      await notifier.notifyIdle("done for now");

      expect(emitted).toContain(AgentEventType.AGENT_IDLE);
    });

    it("keeps agent status ACTIVE after idle", async () => {
      const agent = makeAgent("a1");
      await agentStore.save(agent);
      const notifier = makeNotifier("a1");

      await notifier.notifyIdle();

      const updated = await agentStore.get("a1");
      expect(updated?.status).toBe(AgentStatus.ACTIVE);
    });

    it("delivers message to parent when parentId is set", async () => {
      const parent = makeAgent("parent-1");
      const child = makeAgent("child-1", "parent-1");
      await agentStore.save(parent);
      await agentStore.save(child);

      const notifier = makeNotifier("child-1", "parent-1");
      await notifier.notifyIdle("finished turn");

      const msgs = await conversationStore.getConversation("parent-1");
      expect(msgs.length).toBe(1);
      expect(msgs[0].content).toContain("IDLE");
      expect(msgs[0].content).toContain("finished turn");
    });

    it("does not deliver message when no parentId", async () => {
      const agent = makeAgent("a1");
      await agentStore.save(agent);
      const notifier = makeNotifier("a1");

      await notifier.notifyIdle();

      const msgs = await conversationStore.getConversation("a1");
      expect(msgs.length).toBe(0);
    });
  });

  // ─── notifyCompleted ───────────────────────────────────────────────────────

  describe("notifyCompleted", () => {
    it("emits AGENT_COMPLETED and sets status to COMPLETED", async () => {
      const agent = makeAgent("a2");
      await agentStore.save(agent);
      const notifier = makeNotifier("a2");

      const emitted: AgentEventType[] = [];
      eventBus.on("test", (e) => emitted.push(e.type));

      await notifier.notifyCompleted("all done", ["src/foo.ts"]);

      expect(emitted).toContain(AgentEventType.AGENT_COMPLETED);
      const updated = await agentStore.get("a2");
      expect(updated?.status).toBe(AgentStatus.COMPLETED);
    });

    it("includes filesModified in parent message", async () => {
      const parent = makeAgent("p2");
      const child = makeAgent("c2", "p2");
      await agentStore.save(parent);
      await agentStore.save(child);

      const notifier = makeNotifier("c2", "p2");
      await notifier.notifyCompleted("done", ["src/a.ts", "src/b.ts"]);

      const msgs = await conversationStore.getConversation("p2");
      expect(msgs[0].content).toContain("src/a.ts");
      expect(msgs[0].content).toContain("src/b.ts");
    });
  });

  // ─── notifyFailed ──────────────────────────────────────────────────────────

  describe("notifyFailed", () => {
    it("emits AGENT_FAILED and sets status to ERROR", async () => {
      const agent = makeAgent("a3");
      await agentStore.save(agent);
      const notifier = makeNotifier("a3");

      const emitted: AgentEventType[] = [];
      eventBus.on("test", (e) => emitted.push(e.type));

      await notifier.notifyFailed("out of memory", "task-xyz pending");

      expect(emitted).toContain(AgentEventType.AGENT_FAILED);
      const updated = await agentStore.get("a3");
      expect(updated?.status).toBe(AgentStatus.ERROR);
    });

    it("includes error and pendingWork in parent message", async () => {
      const parent = makeAgent("p3");
      const child = makeAgent("c3", "p3");
      await agentStore.save(parent);
      await agentStore.save(child);

      const notifier = makeNotifier("c3", "p3");
      await notifier.notifyFailed("crash", "still needs refactor");

      const msgs = await conversationStore.getConversation("p3");
      expect(msgs[0].content).toContain("crash");
      expect(msgs[0].content).toContain("still needs refactor");
    });
  });

  // ─── notifyTimeout ─────────────────────────────────────────────────────────

  describe("notifyTimeout", () => {
    it("emits AGENT_TIMEOUT and sets status to ERROR", async () => {
      const agent = makeAgent("a4");
      await agentStore.save(agent);
      const notifier = makeNotifier("a4");

      const emitted: AgentEventType[] = [];
      eventBus.on("test", (e) => emitted.push(e.type));

      await notifier.notifyTimeout("exceeded 5 min budget");

      expect(emitted).toContain(AgentEventType.AGENT_TIMEOUT);
      const updated = await agentStore.get("a4");
      expect(updated?.status).toBe(AgentStatus.ERROR);
    });
  });
});
