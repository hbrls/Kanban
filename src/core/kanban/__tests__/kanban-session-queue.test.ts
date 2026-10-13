import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus, AgentEventType } from "../../events/event-bus";
import { createTask, TaskStatus } from "../../models/task";
import { InMemoryTaskStore } from "../../store/task-store";
import { KanbanSessionQueue } from "../kanban-session-queue";

describe("KanbanSessionQueue", () => {
  let eventBus: EventBus;
  let taskStore: InMemoryTaskStore;

  beforeEach(() => {
    eventBus = new EventBus();
    taskStore = new InMemoryTaskStore();
  });

  it("queues extra cards when the board concurrency limit is reached", async () => {
    await taskStore.save(createTask({
      id: "task-1",
      title: "First task",
      objective: "First task",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "backlog",
      status: TaskStatus.PENDING,
    }));
    await taskStore.save(createTask({
      id: "task-2",
      title: "Second task",
      objective: "Second task",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "backlog",
      status: TaskStatus.PENDING,
    }));

    const startFirst = vi.fn().mockResolvedValue({ sessionId: "session-1" });
    const startSecond = vi.fn().mockResolvedValue({ sessionId: "session-2" });
    const queue = new KanbanSessionQueue(eventBus, taskStore, async () => 1);
    queue.start();

    const first = await queue.enqueue({
      cardId: "task-1",
      cardTitle: "First task",
      boardId: "board-1",
      workspaceId: "default",
      columnId: "backlog",
      start: startFirst,
    });
    const second = await queue.enqueue({
      cardId: "task-2",
      cardTitle: "Second task",
      boardId: "board-1",
      workspaceId: "default",
      columnId: "backlog",
      start: startSecond,
    });

    expect(first).toEqual({ sessionId: "session-1", queued: false });
    expect(second).toEqual({ queued: true });
    expect(startFirst).toHaveBeenCalledTimes(1);
    expect(startSecond).not.toHaveBeenCalled();
    await expect(queue.getBoardSnapshot("board-1")).resolves.toEqual({
      boardId: "board-1",
      runningCount: 1,
      runningCards: [{ cardId: "task-1", cardTitle: "First task" }],
      queuedCount: 1,
      queuedCardIds: ["task-2"],
      queuedCards: [{ cardId: "task-2", cardTitle: "Second task" }],
      queuedPositions: { "task-2": 1 },
    });

    eventBus.emit({
      type: AgentEventType.AGENT_COMPLETED,
      agentId: "agent-1",
      workspaceId: "default",
      data: { sessionId: "session-1", success: true },
      timestamp: new Date(),
    });
    await vi.waitFor(() => {
      expect(startSecond).toHaveBeenCalledTimes(1);
    });

    await expect(queue.getBoardSnapshot("board-1")).resolves.toEqual({
      boardId: "board-1",
      runningCount: 1,
      runningCards: [{ cardId: "task-2", cardTitle: "Second task" }],
      queuedCount: 0,
      queuedCardIds: [],
      queuedCards: [],
      queuedPositions: {},
    });

    queue.stop();
  });

  it("drops stale queued cards that have moved away before a slot opens", async () => {
    await taskStore.save(createTask({
      id: "task-1",
      title: "First task",
      objective: "First task",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "backlog",
      status: TaskStatus.PENDING,
    }));
    await taskStore.save(createTask({
      id: "task-2",
      title: "Second task",
      objective: "Second task",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "backlog",
      status: TaskStatus.PENDING,
    }));

    const startFirst = vi.fn().mockResolvedValue({ sessionId: "session-1" });
    const startSecond = vi.fn().mockResolvedValue({ sessionId: "session-2" });
    const queue = new KanbanSessionQueue(eventBus, taskStore, async () => 1);
    queue.start();

    await queue.enqueue({
      cardId: "task-1",
      cardTitle: "First task",
      boardId: "board-1",
      workspaceId: "default",
      columnId: "backlog",
      start: startFirst,
    });
    await queue.enqueue({
      cardId: "task-2",
      cardTitle: "Second task",
      boardId: "board-1",
      workspaceId: "default",
      columnId: "backlog",
      start: startSecond,
    });

    const movedTask = await taskStore.get("task-2");
    if (!movedTask) {
      throw new Error("Expected task-2");
    }
    movedTask.columnId = "done";
    await taskStore.save(movedTask);

    eventBus.emit({
      type: AgentEventType.AGENT_COMPLETED,
      agentId: "agent-1",
      workspaceId: "default",
      data: { sessionId: "session-1", success: true },
      timestamp: new Date(),
    });
    await vi.waitFor(async () => {
      await expect(queue.getBoardSnapshot("board-1")).resolves.toMatchObject({ queuedCount: 0 });
    });

    expect(startSecond).not.toHaveBeenCalled();
    await expect(queue.getBoardSnapshot("board-1")).resolves.toEqual({
      boardId: "board-1",
      runningCount: 0,
      runningCards: [],
      queuedCount: 0,
      queuedCardIds: [],
      queuedCards: [],
      queuedPositions: {},
    });

    queue.stop();
  });

  it("drops queued cards that already gained a trigger session before snapshotting", async () => {
    await taskStore.save(createTask({
      id: "task-1",
      title: "First task",
      objective: "First task",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "backlog",
      status: TaskStatus.PENDING,
      triggerSessionId: "session-1",
    }));
    await taskStore.save(createTask({
      id: "task-2",
      title: "Second task",
      objective: "Second task",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "backlog",
      status: TaskStatus.PENDING,
    }));

    const startFirst = vi.fn().mockResolvedValue({ sessionId: "session-existing" });
    const startSecond = vi.fn().mockResolvedValue({ sessionId: "session-2" });
    const queue = new KanbanSessionQueue(eventBus, taskStore, async () => 1);
    queue.start();

    await queue.enqueue({
      cardId: "task-1",
      cardTitle: "First task",
      boardId: "board-1",
      workspaceId: "default",
      columnId: "backlog",
      start: startFirst,
    });
    await queue.enqueue({
      cardId: "task-2",
      cardTitle: "Second task",
      boardId: "board-1",
      workspaceId: "default",
      columnId: "backlog",
      start: startSecond,
    });

    const queuedTask = await taskStore.get("task-2");
    if (!queuedTask) {
      throw new Error("Expected task-2");
    }
    queuedTask.triggerSessionId = "session-2";
    await taskStore.save(queuedTask);

    await expect(queue.getBoardSnapshot("board-1")).resolves.toEqual({
      boardId: "board-1",
      runningCount: 1,
      runningCards: [{ cardId: "task-1", cardTitle: "First task" }],
      queuedCount: 0,
      queuedCardIds: [],
      queuedCards: [],
      queuedPositions: {},
    });

    queue.stop();
  });

  it("drops stale running cards that no longer exist before counting board capacity", async () => {
    await taskStore.save(createTask({
      id: "task-2",
      title: "Second task",
      objective: "Second task",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "backlog",
      status: TaskStatus.PENDING,
    }));

    const startGhost = vi.fn().mockResolvedValue({ sessionId: "session-ghost" });
    const startSecond = vi.fn().mockResolvedValue({ sessionId: "session-2" });
    const queue = new KanbanSessionQueue(eventBus, taskStore, async () => 1);
    queue.start();

    await queue.enqueue({
      cardId: "task-ghost",
      cardTitle: "Ghost task",
      boardId: "board-1",
      workspaceId: "default",
      columnId: "backlog",
      start: startGhost,
    });

    await expect(queue.getBoardSnapshot("board-1")).resolves.toEqual({
      boardId: "board-1",
      runningCount: 0,
      runningCards: [],
      queuedCount: 0,
      queuedCardIds: [],
      queuedCards: [],
      queuedPositions: {},
    });

    const second = await queue.enqueue({
      cardId: "task-2",
      cardTitle: "Second task",
      boardId: "board-1",
      workspaceId: "default",
      columnId: "backlog",
      start: startSecond,
    });

    expect(second).toEqual({ sessionId: "session-2", queued: false });
    expect(startSecond).toHaveBeenCalledTimes(1);
    await expect(queue.getBoardSnapshot("board-1")).resolves.toEqual({
      boardId: "board-1",
      runningCount: 1,
      runningCards: [{ cardId: "task-2", cardTitle: "Second task" }],
      queuedCount: 0,
      queuedCardIds: [],
      queuedCards: [],
      queuedPositions: {},
    });

    queue.stop();
  });
});
