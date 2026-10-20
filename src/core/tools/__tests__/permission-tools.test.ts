/**
 * Tests for Phase 2: Permission Delegation Protocol (issue #137)
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AgentTools } from "../agent-tools";
import { PermissionStore } from "../permission-store";
import { EventBus, AgentEventType } from "../../events/event-bus";
import { InMemoryAgentStore } from "../../store/agent-store";
import { InMemoryConversationStore } from "../../store/conversation-store";
import { InMemoryTaskStore } from "../../store/task-store";
import { AgentRole, ModelTier, createAgent } from "../../models/agent";

function makeAgent(id: string, parentId?: string) {
  return createAgent({
    id,
    name: `agent-${id}`,
    role: AgentRole.CRAFTER,
    workspaceId: "ws-1",
    parentId,
    modelTier: ModelTier.SMART,
    metadata: {},
  });
}

describe("Permission Delegation Protocol", () => {
  let tools: AgentTools;
  let agentStore: InMemoryAgentStore;
  let conversationStore: InMemoryConversationStore;
  let taskStore: InMemoryTaskStore;
  let eventBus: EventBus;
  let permissionStore: PermissionStore;

  beforeEach(() => {
    agentStore = new InMemoryAgentStore();
    conversationStore = new InMemoryConversationStore();
    taskStore = new InMemoryTaskStore();
    eventBus = new EventBus();
    permissionStore = new PermissionStore();
    tools = new AgentTools(agentStore, conversationStore, taskStore, eventBus);
    tools.setPermissionStore(permissionStore);
  });

  // ─── requestPermission ─────────────────────────────────────────────────────

  describe("requestPermission", () => {
    it("returns error when coordinator agent not found", async () => {
      const result = await tools.requestPermission({
        requestingAgentId: "worker-1",
        coordinatorAgentId: "missing",
        workspaceId: "ws-1",
        type: "file_edit",
        description: "edit outside scope",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Coordinator agent not found");
    });

    it("saves request as pending and returns requestId", async () => {
      const coordinator = makeAgent("coord-1");
      await agentStore.save(coordinator);

      const result = await tools.requestPermission({
        requestingAgentId: "worker-1",
        coordinatorAgentId: "coord-1",
        workspaceId: "ws-1",
        type: "destructive_op",
        tool: "bash",
        description: "run db migration",
        urgency: "high",
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ decision: "pending" });
      const requestId = (result.data as any).requestId;
      const stored = permissionStore.get(requestId);
      expect(stored?.decision).toBe("pending");
      expect(stored?.urgency).toBe("high");
    });

    it("delivers notification message to coordinator conversation", async () => {
      const coordinator = makeAgent("coord-2");
      await agentStore.save(coordinator);

      await tools.requestPermission({
        requestingAgentId: "worker-2",
        coordinatorAgentId: "coord-2",
        workspaceId: "ws-1",
        type: "dependency_install",
        description: "install lodash",
      });

      const msgs = await conversationStore.getConversation("coord-2");
      expect(msgs.length).toBe(1);
      expect(msgs[0].content).toContain("Permission Request");
      expect(msgs[0].content).toContain("respondToPermission");
    });

    it("emits PERMISSION_REQUESTED event", async () => {
      const coordinator = makeAgent("coord-3");
      await agentStore.save(coordinator);

      const emitted: AgentEventType[] = [];
      eventBus.on("test", (e) => emitted.push(e.type));

      await tools.requestPermission({
        requestingAgentId: "worker-3",
        coordinatorAgentId: "coord-3",
        workspaceId: "ws-1",
        type: "clarification",
        description: "ambiguous requirement",
      });

      expect(emitted).toContain(AgentEventType.PERMISSION_REQUESTED);
    });

    it("returns error when permission store not configured", async () => {
      const bare = new AgentTools(agentStore, conversationStore, taskStore, eventBus);
      const result = await bare.requestPermission({
        requestingAgentId: "w",
        coordinatorAgentId: "c",
        workspaceId: "ws-1",
        type: "file_edit",
        description: "test",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Permission store not configured");
    });
  });

  // ─── respondToPermission ───────────────────────────────────────────────────

  describe("respondToPermission", () => {
    async function createPendingRequest() {
      const coordinator = makeAgent("coord-r");
      await agentStore.save(coordinator);
      const req = await tools.requestPermission({
        requestingAgentId: "worker-r",
        coordinatorAgentId: "coord-r",
        workspaceId: "ws-1",
        type: "file_edit",
        description: "edit config",
      });
      return (req.data as any).requestId as string;
    }

    it("allows a pending request and notifies worker", async () => {
      const requestId = await createPendingRequest();

      const result = await tools.respondToPermission({
        requestId,
        coordinatorAgentId: "coord-r",
        decision: "allow",
        feedback: "go ahead",
      });

      expect(result.success).toBe(true);
      expect((result.data as any).decision).toBe("allow");

      const stored = permissionStore.get(requestId);
      expect(stored?.decision).toBe("allow");
      expect(stored?.feedback).toBe("go ahead");

      const msgs = await conversationStore.getConversation("worker-r");
      expect(msgs.some((m) => m.content.includes("allow"))).toBe(true);
    });

    it("denies a pending request", async () => {
      const requestId = await createPendingRequest();

      const result = await tools.respondToPermission({
        requestId,
        coordinatorAgentId: "coord-r",
        decision: "deny",
        feedback: "too risky",
      });

      expect(result.success).toBe(true);
      const stored = permissionStore.get(requestId);
      expect(stored?.decision).toBe("deny");
    });

    it("returns error when wrong coordinator tries to respond", async () => {
      const requestId = await createPendingRequest();

      const result = await tools.respondToPermission({
        requestId,
        coordinatorAgentId: "wrong-coord",
        decision: "allow",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Only the designated coordinator");
    });

    it("returns error when request not found", async () => {
      const result = await tools.respondToPermission({
        requestId: "nonexistent",
        coordinatorAgentId: "coord-r",
        decision: "allow",
      });
      expect(result.success).toBe(false);
    });

    it("emits PERMISSION_RESPONDED event", async () => {
      const requestId = await createPendingRequest();

      const emitted: AgentEventType[] = [];
      eventBus.on("test", (e) => emitted.push(e.type));

      await tools.respondToPermission({
        requestId,
        coordinatorAgentId: "coord-r",
        decision: "allow",
      });

      expect(emitted).toContain(AgentEventType.PERMISSION_RESPONDED);
    });


  });

  // ─── listPendingPermissions ────────────────────────────────────────────────

  describe("listPendingPermissions", () => {
    it("returns all pending requests for coordinator", async () => {
      const coordinator = makeAgent("coord-list");
      await agentStore.save(coordinator);

      await tools.requestPermission({
        requestingAgentId: "w1",
        coordinatorAgentId: "coord-list",
        workspaceId: "ws-1",
        type: "file_edit",
        description: "req 1",
      });
      await tools.requestPermission({
        requestingAgentId: "w2",
        coordinatorAgentId: "coord-list",
        workspaceId: "ws-1",
        type: "clarification",
        description: "req 2",
      });

      const result = await tools.listPendingPermissions("coord-list");
      expect(result.success).toBe(true);
      expect((result.data as any).count).toBe(2);
    });

    it("excludes resolved requests", async () => {
      const coordinator = makeAgent("coord-list2");
      await agentStore.save(coordinator);

      const req = await tools.requestPermission({
        requestingAgentId: "w1",
        coordinatorAgentId: "coord-list2",
        workspaceId: "ws-1",
        type: "file_edit",
        description: "req",
      });
      const requestId = (req.data as any).requestId;

      await tools.respondToPermission({ requestId, coordinatorAgentId: "coord-list2", decision: "allow" });

      const result = await tools.listPendingPermissions("coord-list2");
      expect((result.data as any).count).toBe(0);
    });
  });
});
