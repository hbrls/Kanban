import { describe, expect, it } from "vitest";

import { createKanbanBoard } from "../../models/kanban";
import { createTask } from "../../models/task";
import { buildSessionKanbanContext, findTaskForSession } from "../session-kanban-context";

describe("session-kanban-context", () => {
  it("prefers exact lane-session ownership when resolving a task for a session", () => {
    const laneTask = createTask({
      id: "task-lane",
      title: "Review auth flow",
      objective: "Review the auth flow in review",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "review",
    });
    laneTask.laneSessions = [
      {
        sessionId: "session-dev-1",
        columnId: "dev",
        columnName: "Dev",
        stepIndex: 0,
        stepName: "Dev Step 1",
        provider: "claude",
        role: "DEVELOPER",
        status: "completed",
        startedAt: "2026-03-17T00:00:00.000Z",
      },
      {
        sessionId: "session-review-1",
        columnId: "review",
        columnName: "Review",
        stepIndex: 0,
        stepName: "Review Step 1",
        provider: "codex",
        role: "GATE",
        status: "running",
        startedAt: "2026-03-17T00:10:00.000Z",
      },
    ];

    const genericTask = createTask({
      id: "task-generic",
      title: "Older task",
      objective: "Legacy task linked only by session history",
      workspaceId: "default",
    });
    genericTask.sessionIds = ["session-review-1"];

    const resolved = findTaskForSession([genericTask, laneTask], "session-review-1");

    expect(resolved?.id).toBe("task-lane");
  });

  it("builds previous-lane and related handoff context for a review session", () => {
    const board = createKanbanBoard({
      id: "board-1",
      workspaceId: "default",
      name: "Main Board",
      columns: [
        { id: "backlog", name: "Backlog", position: 0, stage: "backlog" },
        { id: "dev", name: "Dev", position: 1, stage: "dev" },
        { id: "review", name: "Review", position: 2, stage: "review" },
      ],
    });

    const task = createTask({
      id: "task-1",
      title: "Desk check login flow",
      objective: "Verify login flow in review",
      workspaceId: "default",
      boardId: board.id,
      columnId: "review",
      position: 1,
    });
    task.laneSessions = [
      {
        sessionId: "session-dev-1",
        columnId: "dev",
        columnName: "Dev",
        stepIndex: 0,
        stepName: "Dev Step 1",
        provider: "claude",
        role: "DEVELOPER",
        status: "completed",
        startedAt: "2026-03-17T00:00:00.000Z",
      },
      {
        sessionId: "session-review-0",
        columnId: "review",
        columnName: "Review",
        stepIndex: 0,
        stepName: "Review Step 1",
        provider: "codex",
        role: "GATE",
        status: "completed",
        startedAt: "2026-03-17T00:05:00.000Z",
        completedAt: "2026-03-17T00:08:00.000Z",
      },
      {
        sessionId: "session-review-1",
        columnId: "review",
        columnName: "Review",
        stepIndex: 1,
        stepName: "Review Step 2",
        provider: "codex",
        role: "GATE",
        status: "running",
        startedAt: "2026-03-17T00:10:00.000Z",
      },
    ];
    task.laneHandoffs = [
      {
        id: "handoff-1",
        fromSessionId: "session-review-1",
        toSessionId: "session-dev-1",
        fromColumnId: "review",
        toColumnId: "dev",
        requestType: "environment_preparation",
        request: "Start the service and share the URL.",
        status: "completed",
        requestedAt: "2026-03-17T00:12:00.000Z",
        respondedAt: "2026-03-17T00:13:00.000Z",
        responseSummary: "Running at http://127.0.0.1:3000/login",
      },
    ];

    const context = buildSessionKanbanContext(task, "session-review-1", board);

    expect(context.currentLaneSession?.columnId).toBe("review");
    expect(context.previousLaneSession?.sessionId).toBe("session-dev-1");
    expect(context.previousLaneRun?.sessionId).toBe("session-review-0");
    expect(context.relatedHandoffs).toHaveLength(1);
    expect(context.relatedHandoffs[0]).toMatchObject({
      direction: "outgoing",
      fromColumnName: "Review",
      toColumnName: "Dev",
      responseSummary: "Running at http://127.0.0.1:3000/login",
    });
  });
});
