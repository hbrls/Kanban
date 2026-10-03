import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskStatus, createTask } from "@/core/models/task";
import { ensureTaskBoardContext } from "../task-board-context";
import { ensureDefaultBoard } from "../boards";

vi.mock("../boards", () => ({
  ensureDefaultBoard: vi.fn(),
}));

describe("ensureTaskBoardContext", () => {
  beforeEach(() => {
    vi.mocked(ensureDefaultBoard).mockReset();
  });

  it("backfills missing board and column using the workspace default board", async () => {
    vi.mocked(ensureDefaultBoard).mockResolvedValue({
      id: "board-default",
      workspaceId: "workspace-1",
    } as Awaited<ReturnType<typeof ensureDefaultBoard>>);

    const task = createTask({
      id: "task-1",
      title: "Legacy card",
      objective: "Repair missing board context",
      workspaceId: "workspace-1",
      status: TaskStatus.PENDING,
    });

    const nextTask = await ensureTaskBoardContext({} as never, task);

    expect(nextTask.boardId).toBe("board-default");
    expect(nextTask.columnId).toBe("backlog");
  });

  it("preserves an existing board and column", async () => {
    const task = createTask({
      id: "task-2",
      title: "Assigned card",
      objective: "Keep existing context",
      workspaceId: "workspace-1",
      status: TaskStatus.IN_PROGRESS,
      boardId: "board-1",
      columnId: "dev",
    });

    const nextTask = await ensureTaskBoardContext({} as never, task);

    expect(nextTask.boardId).toBe("board-1");
    expect(nextTask.columnId).toBe("dev");
    expect(ensureDefaultBoard).not.toHaveBeenCalled();
  });
});
