import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KanbanTab } from "../kanban-tab";
import type { KanbanBoardInfo, TaskInfo } from "../../types";
import { resetDesktopAwareFetchToGlobalFetch } from "./test-utils";

const { desktopAwareFetch } = vi.hoisted(() => ({
  desktopAwareFetch: vi.fn(),
}));

vi.mock("@/client/utils/diagnostics", async () => {
  const actual = await vi.importActual<typeof import("@/client/utils/diagnostics")>("@/client/utils/diagnostics");
  return {
    ...actual,
    desktopAwareFetch,
  };
});

vi.mock("@/client/components/repo-picker", () => ({
  RepoPicker: () => <div data-testid="repo-picker-mock" />,
}));

vi.mock("@/client/hooks/use-acp", () => ({
  useAcp: () => ({
    connected: false,
    sessionId: null,
    updates: [],
    providers: [],
    selectedProvider: "opencode",
    loading: false,
    error: null,
    authError: null,
    dockerConfigError: null,
    connect: vi.fn(async () => {}),
    createSession: vi.fn(async () => null),
    resumeSession: vi.fn(async () => null),
    forkSession: vi.fn(async () => null),
    selectSession: vi.fn(),
    setProvider: vi.fn(),
    setMode: vi.fn(async () => {}),
    prompt: vi.fn(async () => {}),
    promptSession: vi.fn(async () => {}),
    respondToUserInput: vi.fn(async () => {}),
    respondToUserInputForSession: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    disconnect: vi.fn(),
    clearAuthError: vi.fn(),
    clearDockerConfigError: vi.fn(),
    listProviderModels: vi.fn(async () => []),
    writeTerminal: vi.fn(async () => {}),
    resizeTerminal: vi.fn(async () => {}),
  }),
}));

vi.mock("../use-runtime-fitness-status", async () => {
  const { mockUseRuntimeFitnessStatus } = await import("./test-utils");
  return {
    useRuntimeFitnessStatus: mockUseRuntimeFitnessStatus,
  };
});

vi.mock("../kanban-fitness-workbench-modal", () => ({
  KanbanFitnessWorkbenchModal: ({ open }: { open: boolean }) => (
    open ? <div data-testid="kanban-fitness-workbench-modal" /> : null
  ),
}));

const board: KanbanBoardInfo = {
  id: "board-1",
  workspaceId: "workspace-1",
  name: "Default Board",
  isDefault: true,
  sessionConcurrencyLimit: 1,
  queue: {
    runningCount: 0,
    runningCards: [],
    queuedCount: 0,
    queuedCardIds: [],
    queuedCards: [],
    queuedPositions: {},
  },
  columns: [
    { id: "backlog", name: "Backlog", position: 0, stage: "backlog" },
  ],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

function createTask(id: string, title: string, overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    id,
    title,
    objective: `${title} objective`,
    status: "PENDING",
    boardId: board.id,
    columnId: "backlog",
    position: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  resetDesktopAwareFetchToGlobalFetch(desktopAwareFetch);
  desktopAwareFetch.mockImplementation(
    () => new Promise<Response>(() => {}),
  );
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  window.history.replaceState({}, "", "/workspace/workspace-1/kanban");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KanbanTab fitness navigation", () => {
  it("does not expose a fitness entry in the status bar and keeps the workbench modal closed", async () => {
    render(
      <KanbanTab
        workspaceId="workspace-1"
        boards={[board]}
        tasks={[createTask("task-1", "Story One")]}
        sessions={[]}
        providers={[]}
        specialists={[]}
        codebases={[{
          id: "codebase-1",
          workspaceId: "workspace-1",
          repoPath: "/tmp/repo",
          branch: "main",
          label: "routa-js",
          isDefault: true,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
        }]}
        onRefresh={vi.fn()}
      />,
    );

    await act(async () => {});

    expect(screen.queryByTestId("kanban-runtime-fitness-status")).toBeNull();
    expect(screen.queryByTestId("kanban-fitness-workbench-modal")).toBeNull();
  });
});
