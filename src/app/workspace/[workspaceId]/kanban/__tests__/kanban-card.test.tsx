import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TaskInfo } from "../../types";
import { KanbanCard } from "../kanban-card";

vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    isDragging: false,
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
  }),
}));

function buildTask(overrides?: Partial<TaskInfo>): TaskInfo {
  return {
    id: "task-1",
    title: "Artifact status",
    objective: "Show artifact gate state on the card.",
    status: "IN_PROGRESS",
    boardId: "board-1",
    columnId: "dev",
    position: 0,
    priority: "medium",
    labels: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    artifactSummary: {
      total: 0,
      byType: {},
    },
    ...overrides,
  };
}

describe("KanbanCard cover", () => {
  it("does not render artifact gate or count badges on the card cover", () => {
    render(
      <KanbanCard
        task={buildTask()}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onOpenDetail={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("kanban-card-artifact-gate")).toBeNull();
    expect(screen.queryByTestId("kanban-card-artifact-count")).toBeNull();
  });

  it("keeps artifact badges off the cover even when the gate is satisfied and artifacts exist", () => {
    render(
      <KanbanCard
        task={buildTask({
          artifactSummary: {
            total: 2,
            byType: {
              screenshot: 1,
              logs: 1,
            },
          },
        })}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onOpenDetail={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("kanban-card-artifact-gate")).toBeNull();
    expect(screen.queryByTestId("kanban-card-artifact-count")).toBeNull();
  });

  it("surfaces review feedback on cards returned to dev", () => {
    render(
      <KanbanCard
        task={buildTask({
          columnId: "dev",
          verificationVerdict: "NOT_APPROVED",
          verificationReport: "AC3 failed: editor still strips nested marks when pasting rich text.",
        })}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onOpenDetail={vi.fn()}
      />,
    );

    expect(screen.getByTestId("kanban-card-review-feedback").textContent).toContain("Returned to Dev");
    expect(screen.getByTestId("kanban-card-review-feedback").textContent).toContain("AC3 failed");
  });

  it("does not render GitHub badges on the card cover and keeps the main status badge", () => {
    render(
      <KanbanCard
        task={buildTask({
          githubNumber: 289,
          githubUrl: "https://github.com/acme/platform/pull/289",
          isPullRequest: true,
          githubSyncedAt: "2025-01-02T00:00:00.000Z",
        })}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onOpenDetail={vi.fn()}
      />,
    );

    expect(screen.queryByRole("link", { name: "PR #289" })).toBeNull();
    expect(screen.queryByText(/Synced|Not synced|Sync issue/)).toBeNull();
    expect(screen.getByText("Idle")).toBeTruthy();
  });

  it("does not render a Run or Rerun action on an automated lane card", () => {
    render(
      <KanbanCard
        task={buildTask({ columnId: "backlog" })}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onOpenDetail={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rerun" })).toBeNull();
    expect(screen.getByText("Idle")).toBeTruthy();
  });

  it("does not render a Run or Rerun action when the linked session has failed", () => {
    render(
      <KanbanCard
        task={buildTask({ columnId: "dev", triggerSessionId: "session-1" })}
        linkedSession={{
          sessionId: "session-1",
          cwd: "/tmp/workspace-1",
          workspaceId: "workspace-1",
          provider: "codex",
          acpStatus: "error",
          createdAt: "2025-01-01T00:00:00.000Z",
        }}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onOpenDetail={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rerun" })).toBeNull();
    expect(screen.getByText("Failed")).toBeTruthy();
  });

  it("does not render a Run or Rerun action while the card is queued", () => {
    render(
      <KanbanCard
        task={buildTask({ columnId: "dev" })}
        queuePosition={2}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onOpenDetail={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rerun" })).toBeNull();
    expect(screen.getByText("Queued #2")).toBeTruthy();
  });

  it("does not render a Run or Rerun action on a terminal card", () => {
    render(
      <KanbanCard
        task={buildTask({ columnId: "done" })}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onOpenDetail={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rerun" })).toBeNull();
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("renders canonical story body instead of raw yaml on the card", () => {
    render(
      <KanbanCard
        task={buildTask({
          title: "Canonical story preview",
          objective: `\`\`\`yaml
story:
  version: 1
  language: en
  title: Canonical story preview
  problem_statement: |
    Dependency upgrades can regress editor behavior without explicit validation.
  user_value: |
    Maintainers can review the change as a structured story instead of raw YAML only.
  acceptance_criteria:
    - id: AC1
      text: Card preview shows story content.
      testable: true
    - id: AC2
      text: Raw fenced YAML is hidden in the list.
      testable: true
  constraints_and_affected_areas:
    - src/app/workspace/[workspaceId]/kanban/kanban-card.tsx
  dependencies_and_sequencing:
    independent_story_check: pass
    depends_on: []
    unblock_condition: none
  out_of_scope:
    - unrelated cleanup
  invest:
    independent:
      status: pass
      reason: no prerequisite
    negotiable:
      status: pass
      reason: presentation only
    valuable:
      status: pass
      reason: faster scanning
    estimable:
      status: pass
      reason: card-only change
    small:
      status: pass
      reason: one component
    testable:
      status: pass
      reason: preview is visible
\`\`\``,
        })}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onOpenDetail={vi.fn()}
      />,
    );

    expect(screen.getByText(/Dependency upgrades can regress editor behavior/i)).toBeTruthy();
    expect(screen.queryByText(/```yaml/i)).toBeNull();
  });
});
