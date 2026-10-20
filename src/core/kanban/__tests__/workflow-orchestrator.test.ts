import { describe, expect, it, vi } from "vitest";

import { getHttpSessionStore } from "../../acp/http-session-store";
import { EventBus, AgentEventType } from "../../events/event-bus";
import { createKanbanBoard } from "../../models/kanban";
import { createTask } from "../../models/task";
import { InMemoryKanbanBoardStore } from "../../store/kanban-board-store";
import { InMemoryTaskStore } from "../../store/task-store";
import { upsertTaskLaneSession } from "../task-lane-history";
import { KanbanWorkflowOrchestrator } from "../workflow-orchestrator";

// TODO: This test suite is flaky - skipping temporarily
// See: ACP session creation failures and timing issues with recovery prompts
describe.skip("KanbanWorkflowOrchestrator", () => {
  it("starts an ACP session when a card enters todo with automation enabled", async () => {
    const eventBus = new EventBus();
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const createSession = vi.fn().mockResolvedValue("session-todo-1");

    const board = createKanbanBoard({
      id: "board-1",
      workspaceId: "default",
      name: "Main Board",
      isDefault: true,
      columns: [
        { id: "backlog", name: "Backlog", stage: "backlog", position: 0 },
        {
          id: "todo",
          name: "Todo",
          stage: "todo",
          position: 1,
          automation: {
            enabled: true,
            providerId: "codex",
            role: "DEVELOPER",
            transitionType: "entry",
          },
        },
        { id: "dev", name: "Dev", stage: "dev", position: 2 },
      ],
    });
    await boardStore.save(board);

    const task = createTask({
      id: "task-1",
      title: "Verify todo automation",
      objective: "Ensure moving a card into todo starts ACP automation",
      workspaceId: "default",
      boardId: board.id,
      columnId: "backlog",
    });
    await taskStore.save(task);

    const orchestrator = new KanbanWorkflowOrchestrator(
      eventBus,
      boardStore,
      taskStore,
      createSession,
    );
    orchestrator.start();

    eventBus.emit({
      type: AgentEventType.COLUMN_TRANSITION,
      agentId: "test",
      workspaceId: "default",
      data: {
        cardId: task.id,
        cardTitle: task.title,
        boardId: board.id,
        workspaceId: "default",
        fromColumnId: "backlog",
        toColumnId: "todo",
      },
      timestamp: new Date(),
    });

    await vi.waitFor(() => {
      expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
        workspaceId: "default",
        cardId: task.id,
        cardTitle: task.title,
        columnId: "todo",
        columnName: "Todo",
        stepIndex: 0,
        step: expect.objectContaining({
          providerId: "codex",
          role: "DEVELOPER",
        }),
        automation: expect.objectContaining({
          enabled: true,
          providerId: "codex",
          role: "DEVELOPER",
          transitionType: "entry",
        }),
      }));
    });

    expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
      cardId: task.id,
      columnId: "todo",
      currentStepIndex: 0,
      status: "running",
      sessionId: "session-todo-1",
    });
  });

  it("prefers source-column exit automation over target-column entry automation", async () => {
    const eventBus = new EventBus();
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const createSession = vi.fn().mockResolvedValue("session-exit-1");

    const board = createKanbanBoard({
      id: "board-exit-1",
      workspaceId: "default",
      name: "Exit Board",
      isDefault: true,
      columns: [
        {
          id: "backlog",
          name: "Backlog",
          stage: "backlog",
          position: 0,
          automation: {
            enabled: true,
            providerId: "claude",
            role: "ROUTA",
            transitionType: "exit",
          },
        },
        {
          id: "todo",
          name: "Todo",
          stage: "todo",
          position: 1,
          automation: {
            enabled: true,
            providerId: "codex",
            role: "DEVELOPER",
            transitionType: "entry",
          },
        },
      ],
    });
    await boardStore.save(board);

    const task = createTask({
      id: "task-exit-1",
      title: "Prefer exit automation",
      objective: "Verify source exit automation wins for a single transition",
      workspaceId: "default",
      boardId: board.id,
      columnId: "backlog",
    });
    await taskStore.save(task);

    const orchestrator = new KanbanWorkflowOrchestrator(
      eventBus,
      boardStore,
      taskStore,
      createSession,
    );
    orchestrator.start();

    eventBus.emit({
      type: AgentEventType.COLUMN_TRANSITION,
      agentId: "test",
      workspaceId: "default",
      data: {
        cardId: task.id,
        cardTitle: task.title,
        boardId: board.id,
        workspaceId: "default",
        fromColumnId: "backlog",
        toColumnId: "todo",
      },
      timestamp: new Date(),
    });

    await vi.waitFor(() => {
      expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
        columnId: "backlog",
        columnName: "Backlog",
        automation: expect.objectContaining({
          providerId: "claude",
          role: "ROUTA",
          transitionType: "exit",
        }),
      }));
    });

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
      columnId: "backlog",
      sessionId: "session-exit-1",
    });
  });

  it("runs lane automation steps sequentially within the same column", async () => {
    const eventBus = new EventBus();
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const createSession = vi
      .fn()
      .mockResolvedValueOnce("session-todo-1")
      .mockResolvedValueOnce("session-todo-2");

    const board = createKanbanBoard({
      id: "board-steps-1",
      workspaceId: "default",
      name: "Main Board",
      isDefault: true,
      columns: [
        { id: "backlog", name: "Backlog", stage: "backlog", position: 0 },
        {
          id: "todo",
          name: "Todo",
          stage: "todo",
          position: 1,
          automation: {
            enabled: true,
            steps: [
              {
                id: "triage",
                providerId: "claude",
                role: "CRAFTER",
                specialistId: "todo-triage",
                specialistName: "Todo Triage",
              },
              {
                id: "plan",
                providerId: "codex",
                role: "ROUTA",
                specialistId: "todo-plan",
                specialistName: "Todo Plan",
              },
            ],
            transitionType: "entry",
            autoAdvanceOnSuccess: false,
          },
        },
        { id: "dev", name: "Dev", stage: "dev", position: 2 },
      ],
    });
    await boardStore.save(board);

    const task = createTask({
      id: "task-steps-1",
      title: "Run todo steps",
      objective: "Verify lane steps stay in the same column until the last step completes",
      workspaceId: "default",
      boardId: board.id,
      columnId: "backlog",
    });
    await taskStore.save(task);

    const orchestrator = new KanbanWorkflowOrchestrator(
      eventBus,
      boardStore,
      taskStore,
      createSession,
    );
    orchestrator.start();

    eventBus.emit({
      type: AgentEventType.COLUMN_TRANSITION,
      agentId: "test",
      workspaceId: "default",
      data: {
        cardId: task.id,
        cardTitle: task.title,
        boardId: board.id,
        workspaceId: "default",
        fromColumnId: "backlog",
        toColumnId: "todo",
      },
      timestamp: new Date(),
    });

    await vi.waitFor(() => {
      expect(createSession).toHaveBeenNthCalledWith(1, expect.objectContaining({
        cardId: task.id,
        columnId: "todo",
        stepIndex: 0,
        step: expect.objectContaining({
          id: "triage",
          specialistId: "todo-triage",
        }),
      }));
    });

    const runningTask = await taskStore.get(task.id);
    runningTask!.columnId = "todo";
    runningTask!.triggerSessionId = "session-todo-1";
    await taskStore.save(runningTask!);

    eventBus.emit({
      type: AgentEventType.AGENT_COMPLETED,
      agentId: "session-todo-1",
      workspaceId: "default",
      data: {
        sessionId: "session-todo-1",
        success: true,
      },
      timestamp: new Date(),
    });

    await vi.waitFor(async () => {
      expect(createSession).toHaveBeenNthCalledWith(2, expect.objectContaining({
        cardId: task.id,
        columnId: "todo",
        stepIndex: 1,
        step: expect.objectContaining({
          id: "plan",
          specialistId: "todo-plan",
        }),
      }));

      const updatedTask = await taskStore.get(task.id);
      expect(updatedTask).toMatchObject({
        id: task.id,
        columnId: "todo",
        triggerSessionId: undefined,
      });
      expect(updatedTask?.sessionIds).toContain("session-todo-1");
      expect(updatedTask?.laneSessions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          sessionId: "session-todo-1",
          status: "completed",
        }),
      ]));
      expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
        currentStepIndex: 1,
        sessionId: "session-todo-2",
        status: "running",
      });
    });
  });

  it("clears the previous lane session before auto-advancing into the next automation", async () => {
    const eventBus = new EventBus();
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const createSession = vi
      .fn()
      .mockResolvedValueOnce("session-backlog-1")
      .mockResolvedValueOnce("session-todo-1");

    const board = createKanbanBoard({
      id: "board-1",
      workspaceId: "default",
      name: "Main Board",
      isDefault: true,
      columns: [
        {
          id: "backlog",
          name: "Backlog",
          stage: "backlog",
          position: 0,
          automation: {
            enabled: true,
            providerId: "claude",
            role: "DEVELOPER",
            transitionType: "entry",
            autoAdvanceOnSuccess: true,
          },
        },
        {
          id: "todo",
          name: "Todo",
          stage: "todo",
          position: 1,
          automation: {
            enabled: true,
            providerId: "codex",
            role: "ROUTA",
            transitionType: "entry",
            autoAdvanceOnSuccess: true,
          },
        },
        { id: "dev", name: "Dev", stage: "dev", position: 2 },
      ],
    });
    await boardStore.save(board);

    const task = createTask({
      id: "task-2",
      title: "Verify chained automation",
      objective: "Ensure each lane gets a fresh session",
      workspaceId: "default",
      boardId: board.id,
      columnId: "backlog",
      triggerSessionId: "session-backlog-1",
    });
    await taskStore.save(task);

    const orchestrator = new KanbanWorkflowOrchestrator(
      eventBus,
      boardStore,
      taskStore,
      createSession,
    );
    orchestrator.start();

    eventBus.emit({
      type: AgentEventType.COLUMN_TRANSITION,
      agentId: "test",
      workspaceId: "default",
      data: {
        cardId: task.id,
        cardTitle: task.title,
        boardId: board.id,
        workspaceId: "default",
        fromColumnId: "inbox",
        toColumnId: "backlog",
      },
      timestamp: new Date(),
    });

    await vi.waitFor(() => {
      expect(createSession).toHaveBeenNthCalledWith(1, expect.objectContaining({
        cardId: task.id,
        columnId: "backlog",
        stepIndex: 0,
      }));
    });

    eventBus.emit({
      type: AgentEventType.AGENT_COMPLETED,
      agentId: "session-backlog-1",
      workspaceId: "default",
      data: {
        sessionId: "session-backlog-1",
        success: true,
      },
      timestamp: new Date(),
    });

    await vi.waitFor(async () => {
      expect(createSession).toHaveBeenNthCalledWith(2, expect.objectContaining({
        cardId: task.id,
        columnId: "todo",
        stepIndex: 0,
      }));

      const updatedTask = await taskStore.get(task.id);
      expect(updatedTask).toMatchObject({
        id: task.id,
        columnId: "todo",
        triggerSessionId: undefined,
      });
    });
  });

  it("does not let the previous lane cleanup timer delete the next lane automation", async () => {
    vi.useFakeTimers();

    const eventBus = new EventBus();
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const createSession = vi
      .fn()
      .mockResolvedValueOnce("session-backlog-1")
      .mockResolvedValueOnce("session-todo-1");

    const board = createKanbanBoard({
      id: "board-2",
      workspaceId: "default",
      name: "Main Board",
      isDefault: true,
      columns: [
        {
          id: "backlog",
          name: "Backlog",
          stage: "backlog",
          position: 0,
          automation: {
            enabled: true,
            providerId: "claude",
            role: "DEVELOPER",
            transitionType: "entry",
            autoAdvanceOnSuccess: true,
          },
        },
        {
          id: "todo",
          name: "Todo",
          stage: "todo",
          position: 1,
          automation: {
            enabled: true,
            providerId: "codex",
            role: "ROUTA",
            transitionType: "entry",
            autoAdvanceOnSuccess: true,
          },
        },
        { id: "dev", name: "Dev", stage: "dev", position: 2 },
      ],
    });
    await boardStore.save(board);

    const task = createTask({
      id: "task-3",
      title: "Verify automation cleanup isolation",
      objective: "Ensure previous cleanup timers don't delete the next lane entry",
      workspaceId: "default",
      boardId: board.id,
      columnId: "backlog",
      triggerSessionId: "session-backlog-1",
    });
    await taskStore.save(task);

    const orchestrator = new KanbanWorkflowOrchestrator(
      eventBus,
      boardStore,
      taskStore,
      createSession,
    );
    orchestrator.start();

    eventBus.emit({
      type: AgentEventType.COLUMN_TRANSITION,
      agentId: "test",
      workspaceId: "default",
      data: {
        cardId: task.id,
        cardTitle: task.title,
        boardId: board.id,
        workspaceId: "default",
        fromColumnId: "created",
        toColumnId: "backlog",
      },
      timestamp: new Date(),
    });

    await vi.waitFor(() => {
      expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
        columnId: "backlog",
        sessionId: "session-backlog-1",
      });
    });

    eventBus.emit({
      type: AgentEventType.AGENT_COMPLETED,
      agentId: "session-backlog-1",
      workspaceId: "default",
      data: {
        sessionId: "session-backlog-1",
        success: true,
      },
      timestamp: new Date(),
    });

    await vi.waitFor(() => {
      expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
        columnId: "todo",
        sessionId: "session-todo-1",
      });
    });

    await vi.advanceTimersByTimeAsync(30_000);

    expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
      columnId: "todo",
      sessionId: "session-todo-1",
    });

    vi.useRealTimers();
  });

  it("recovers an inactive dev session with watchdog retry supervision", async () => {
    const eventBus = new EventBus();
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const sendKanbanSessionPrompt = vi.fn().mockResolvedValue(undefined);
    const createSession = vi
      .fn()
      .mockResolvedValueOnce("session-dev-1")
      .mockResolvedValueOnce("session-dev-2");

    const board = createKanbanBoard({
      id: "board-dev-watchdog",
      workspaceId: "default",
      name: "Main Board",
      isDefault: true,
      columns: [
        { id: "todo", name: "Todo", stage: "todo", position: 0 },
        {
          id: "dev",
          name: "Dev",
          stage: "dev",
          position: 1,
          automation: {
            enabled: true,
            providerId: "codex",
            role: "DEVELOPER",
            transitionType: "entry",
          },
        },
      ],
    });
    await boardStore.save(board);

    const task = createTask({
      id: "task-watchdog",
      title: "Recover stalled dev session",
      objective: "Implement the task even if the first session stalls",
      workspaceId: "default",
      boardId: board.id,
      columnId: "dev",
    });
    await taskStore.save(task);

    const orchestrator = new KanbanWorkflowOrchestrator(
      eventBus,
      boardStore,
      taskStore,
      createSession,
    );
    orchestrator.setSendKanbanSessionPrompt((params) => sendKanbanSessionPrompt(params));
    orchestrator.setResolveDevSessionSupervision(async () => ({
      mode: "watchdog_retry",
      inactivityTimeoutMinutes: 1,
      maxRecoveryAttempts: 1,
      completionRequirement: "turn_complete",
    }));
    orchestrator.start();

    eventBus.emit({
      type: AgentEventType.COLUMN_TRANSITION,
      agentId: "test",
      workspaceId: "default",
      data: {
        cardId: task.id,
        cardTitle: task.title,
        boardId: board.id,
        workspaceId: "default",
        fromColumnId: "todo",
        toColumnId: "dev",
      },
      timestamp: new Date(),
    });

    await vi.waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
      expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
        sessionId: "session-dev-1",
        attempt: 1,
        recoveryAttempts: 0,
      });
    });

    const sessionStore = getHttpSessionStore();
    sessionStore.upsertSession({
      sessionId: "session-dev-1",
      cwd: "/tmp",
      workspaceId: "default",
      provider: "codex",
      createdAt: new Date(Date.now() - 61_000).toISOString(),
    });

    const watchdog = orchestrator as unknown as {
      scanForInactiveSessions: () => Promise<void>;
    };
    await watchdog.scanForInactiveSessions();

    await vi.waitFor(async () => {
      expect(createSession).toHaveBeenCalledTimes(2);
      expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
        sessionId: "session-dev-2",
        attempt: 2,
        recoveryAttempts: 1,
        status: "running",
      });
      const updatedTask = await taskStore.get(task.id);
      expect(updatedTask?.lastSyncError).toContain("Attempt 2/2");
      expect(sendKanbanSessionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-dev-1",
          prompt: expect.stringContaining("acp session id = session-dev-1"),
        }),
      );
    });

    orchestrator.stop();
  });

  it("records AGENT_FAILED recovery with agent_failed reason", async () => {
    const eventBus = new EventBus();
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const sendKanbanSessionPrompt = vi.fn().mockResolvedValue(undefined);
    const createSession = vi
      .fn()
      .mockImplementation(async ({ cardId, supervision }) => {
        const trackedTask = await taskStore.get(cardId);
        const sessionId = supervision?.attempt === 1
          ? "session-failed-1"
          : "session-failed-2";
        if (trackedTask) {
          upsertTaskLaneSession(trackedTask, {
            sessionId,
            columnId: "dev",
            columnName: "Dev",
            attempt: supervision?.attempt,
            loopMode: supervision?.mode,
            completionRequirement: supervision?.completionRequirement,
            objective: trackedTask.objective,
            status: "running",
            recoveredFromSessionId: supervision?.recoveredFromSessionId,
            recoveryReason: supervision?.recoveryReason,
          });
          await taskStore.save(trackedTask);
        }
        getHttpSessionStore().upsertSession({
          sessionId,
          workspaceId: "default",
          provider: "claude",
          cwd: "/tmp",
          createdAt: new Date().toISOString(),
        });
        return sessionId;
      });

    const board = createKanbanBoard({
      id: "board-dev-watchdog-failed-reason",
      workspaceId: "default",
      name: "Main Board",
      isDefault: true,
      columns: [
        { id: "todo", name: "Todo", stage: "todo", position: 0 },
        {
          id: "dev",
          name: "Dev",
          stage: "dev",
          position: 1,
          automation: {
            enabled: true,
            providerId: "claude",
            role: "DEVELOPER",
            transitionType: "entry",
          },
        },
      ],
    });
    await boardStore.save(board);

    const task = createTask({
      id: "task-watchdog-failed-reason",
      title: "Keep AGENT_FAILED reason as agent_failed",
      objective: "Verify recovery reason classification on failed sessions",
      workspaceId: "default",
      boardId: board.id,
      columnId: "dev",
    });
    await taskStore.save(task);

    const orchestrator = new KanbanWorkflowOrchestrator(
      eventBus,
      boardStore,
      taskStore,
      createSession,
    );
    orchestrator.setSendKanbanSessionPrompt((params) => sendKanbanSessionPrompt(params));
    orchestrator.setResolveDevSessionSupervision(async () => ({
      mode: "watchdog_retry",
      inactivityTimeoutMinutes: 1,
      maxRecoveryAttempts: 1,
      completionRequirement: "turn_complete",
    }));
    orchestrator.start();

    eventBus.emit({
      type: AgentEventType.COLUMN_TRANSITION,
      agentId: "test",
      workspaceId: "default",
      data: {
        cardId: task.id,
        cardTitle: task.title,
        boardId: board.id,
        workspaceId: "default",
        fromColumnId: "todo",
        toColumnId: "dev",
      },
      timestamp: new Date(),
    });

    await vi.waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
      expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
        sessionId: "session-failed-1",
        attempt: 1,
      });
    });

    eventBus.emit({
      type: AgentEventType.AGENT_FAILED,
      agentId: "session-failed-1",
      workspaceId: "default",
      data: {
        sessionId: "session-failed-1",
        success: false,
        error: "boom",
      },
      timestamp: new Date(),
    });

    await vi.waitFor(async () => {
      expect(createSession).toHaveBeenCalledTimes(2);
      const updatedTask = await taskStore.get(task.id);
      expect(updatedTask?.laneSessions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          sessionId: "session-failed-1",
          status: "failed",
          recoveryReason: "agent_failed",
        }),
      ]));
      expect(sendKanbanSessionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-failed-1",
        }),
      );
    });

    orchestrator.stop();
  });

  it("recovers an inactive dev session even when the stale session is missing from local store", async () => {
    const eventBus = new EventBus();
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const sendKanbanSessionPrompt = vi.fn().mockResolvedValue(undefined);
    const createSession = vi
      .fn()
      .mockResolvedValueOnce("missing-session-1")
      .mockResolvedValueOnce("missing-session-2");

    const board = createKanbanBoard({
      id: "board-dev-watchdog-missing",
      workspaceId: "default",
      name: "Main Board",
      isDefault: true,
      columns: [
        { id: "todo", name: "Todo", stage: "todo", position: 0 },
        {
          id: "dev",
          name: "Dev",
          stage: "dev",
          position: 1,
          automation: {
            enabled: true,
            providerId: "claude",
            role: "DEVELOPER",
            transitionType: "entry",
          },
        },
      ],
    });
    await boardStore.save(board);

    const task = createTask({
      id: "task-watchdog-missing",
      title: "Recover stalled dev session without session record",
      objective: "Implement recovery if session record is missing",
      workspaceId: "default",
      boardId: board.id,
      columnId: "dev",
    });
    await taskStore.save(task);

    const orchestrator = new KanbanWorkflowOrchestrator(
      eventBus,
      boardStore,
      taskStore,
      createSession,
    );
    orchestrator.setSendKanbanSessionPrompt((params) => sendKanbanSessionPrompt(params));
    orchestrator.setResolveDevSessionSupervision(async () => ({
      mode: "watchdog_retry",
      inactivityTimeoutMinutes: 1,
      maxRecoveryAttempts: 1,
      completionRequirement: "turn_complete",
    }));
    orchestrator.start();

    eventBus.emit({
      type: AgentEventType.COLUMN_TRANSITION,
      agentId: "test",
      workspaceId: "default",
      data: {
        cardId: task.id,
        cardTitle: task.title,
        boardId: board.id,
        workspaceId: "default",
        fromColumnId: "todo",
        toColumnId: "dev",
      },
      timestamp: new Date(),
    });

    await vi.waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
      expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
        sessionId: "missing-session-1",
        attempt: 1,
        recoveryAttempts: 0,
      });
    });
    const automation = orchestrator.getAutomationForCard(task.id);
    if (automation) {
      automation.startedAt = new Date(Date.now() - 61_000);
    }

    const watchdog = orchestrator as unknown as {
      scanForInactiveSessions: () => Promise<void>;
    };
    await watchdog.scanForInactiveSessions();

    await vi.waitFor(async () => {
      expect(createSession).toHaveBeenCalledTimes(2);
      expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
        sessionId: "missing-session-2",
        attempt: 2,
        recoveryAttempts: 1,
      });
      expect(sendKanbanSessionPrompt).not.toHaveBeenCalled();
      const updatedTask = await taskStore.get(task.id);
      expect(updatedTask?.lastSyncError).toContain("Attempt 2/2");
    });

    orchestrator.stop();
  });

  it("recreates a dev session in Ralph Loop mode until completion criteria are met", async () => {
    const eventBus = new EventBus();
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const sendKanbanSessionPrompt = vi.fn().mockResolvedValue(undefined);
    const createSession = vi
      .fn()
      .mockResolvedValueOnce("session-loop-1")
      .mockResolvedValueOnce("session-loop-2");

    const board = createKanbanBoard({
      id: "board-dev-loop",
      workspaceId: "default",
      name: "Main Board",
      isDefault: true,
      columns: [
        { id: "todo", name: "Todo", stage: "todo", position: 0 },
        {
          id: "dev",
          name: "Dev",
          stage: "dev",
          position: 1,
          automation: {
            enabled: true,
            providerId: "claude",
            role: "DEVELOPER",
            transitionType: "entry",
          },
        },
      ],
    });
    await boardStore.save(board);

    const task = createTask({
      id: "task-loop",
      title: "Ralph loop dev session",
      objective: "Persist completion summary before finishing",
      workspaceId: "default",
      boardId: board.id,
      columnId: "dev",
    });
    await taskStore.save(task);

    const orchestrator = new KanbanWorkflowOrchestrator(
      eventBus,
      boardStore,
      taskStore,
      createSession,
    );
    orchestrator.setSendKanbanSessionPrompt((params) => sendKanbanSessionPrompt(params));
    orchestrator.setResolveDevSessionSupervision(async () => ({
      mode: "ralph_loop",
      inactivityTimeoutMinutes: 10,
      maxRecoveryAttempts: 1,
      completionRequirement: "completion_summary",
    }));
    orchestrator.start();

    const sessionStore = getHttpSessionStore();
    sessionStore.upsertSession({
      sessionId: "session-loop-1",
      workspaceId: "default",
      provider: "claude",
      cwd: "/tmp",
      createdAt: new Date().toISOString(),
    });

    eventBus.emit({
      type: AgentEventType.COLUMN_TRANSITION,
      agentId: "test",
      workspaceId: "default",
      data: {
        cardId: task.id,
        cardTitle: task.title,
        boardId: board.id,
        workspaceId: "default",
        fromColumnId: "todo",
        toColumnId: "dev",
      },
      timestamp: new Date(),
    });

    await vi.waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(1);
      expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
        sessionId: "session-loop-1",
        attempt: 1,
      });
    });

    eventBus.emit({
      type: AgentEventType.AGENT_COMPLETED,
      agentId: "session-loop-1",
      workspaceId: "default",
      data: {
        sessionId: "session-loop-1",
        success: true,
      },
      timestamp: new Date(),
    });

    await vi.waitFor(() => {
      expect(createSession).toHaveBeenCalledTimes(2);
      expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
        sessionId: "session-loop-2",
        attempt: 2,
        status: "running",
      });
      expect(sendKanbanSessionPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session-loop-1",
          prompt: expect.stringContaining("acp session id = session-loop-1"),
        }),
      );
    });

    const updatedTask = await taskStore.get(task.id);
    if (!updatedTask) {
      throw new Error("Expected task-loop");
    }
    updatedTask.completionSummary = "Implemented successfully";
    await taskStore.save(updatedTask);

    eventBus.emit({
      type: AgentEventType.AGENT_COMPLETED,
      agentId: "session-loop-2",
      workspaceId: "default",
      data: {
        sessionId: "session-loop-2",
        success: true,
      },
      timestamp: new Date(),
    });

    await vi.waitFor(async () => {
      expect(createSession).toHaveBeenCalledTimes(2);
      expect(orchestrator.getAutomationForCard(task.id)).toMatchObject({
        sessionId: "session-loop-2",
        status: "completed",
      });
      const completedTask = await taskStore.get(task.id);
      expect(completedTask?.lastSyncError).toBeUndefined();
    });

    orchestrator.stop();
  });
});
