import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KanbanStatusBar } from "../kanban-status-bar";
import type { KanbanBoardInfo } from "../../types";

const board: KanbanBoardInfo = {
  id: "board-1",
  workspaceId: "workspace-1",
  name: "Board",
  isDefault: true,
  sessionConcurrencyLimit: 1,
  queue: {
    runningCount: 1,
    runningCards: [],
    queuedCount: 2,
    queuedCardIds: [],
    queuedCards: [],
    queuedPositions: {},
  },
  columns: [{ id: "backlog", name: "Backlog", position: 0, stage: "backlog" }],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("KanbanStatusBar", () => {
  it("shows the workspace repository control entry and keeps it clickable without a default repo", () => {
    const onRepoClick = vi.fn();

    const { rerender } = render(
      <KanbanStatusBar
        defaultCodebase={{
          id: "codebase-1",
          workspaceId: "workspace-1",
          repoPath: "/tmp/repo",
          branch: "main",
          label: "routa-js",
          isDefault: true,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        }}
        codebases={[
          {
            id: "codebase-1",
            workspaceId: "workspace-1",
            repoPath: "/tmp/repo",
            branch: "main",
            label: "routa-js",
            isDefault: true,
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
          {
            id: "codebase-2",
            workspaceId: "workspace-1",
            repoPath: "/tmp/repo-two",
            branch: "develop",
            label: "docs-site",
            isDefault: false,
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
          },
        ]}
        board={board}
        boardQueue={board.queue}
        onRepoClick={onRepoClick}
      />,
    );

    const repoButton = screen.getByRole("button", { name: /Repos\s*2\s*routa-js\s*@\s*main|仓库\s*2\s*routa-js\s*@\s*main/ });
    fireEvent.click(repoButton);
    expect(onRepoClick).toHaveBeenCalledTimes(1);

    rerender(
      <KanbanStatusBar
        defaultCodebase={null}
        codebases={[]}
        board={board}
        boardQueue={board.queue}
        onRepoClick={onRepoClick}
      />,
    );

    const emptyRepoButton = screen.getByRole("button", { name: /Repos\s*0\s*No repositories linked|仓库\s*0\s*未关联仓库/ });
    fireEvent.click(emptyRepoButton);
    expect(onRepoClick).toHaveBeenCalledTimes(2);
  });

  it("does not render a runtime fitness entry in the status bar", () => {
    render(
      <KanbanStatusBar
        defaultCodebase={null}
        codebases={[]}
        board={board}
        boardQueue={board.queue}
      />,
    );

    expect(screen.queryByTestId("kanban-runtime-fitness-status")).toBeNull();
  });
});
