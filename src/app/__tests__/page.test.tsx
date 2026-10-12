import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

const WORKSPACE = {
  id: "default",
  title: "Default Workspace",
  status: "active" as const,
  metadata: {},
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
};

const CODEBASE = {
  id: "cb-1",
  workspaceId: "default",
  repoPath: "/repo/main",
  isDefault: true,
  createdAt: "",
  updatedAt: "",
};

type HookState = Record<string, unknown>;

const hook = vi.hoisted(() => ({
  state: {} as HookState,
}));

const desktopAwareFetchMock = vi.hoisted(() => vi.fn(async () => ({ ok: true, json: async () => ({}) } as Response)));

function settledSteps() {
  return [
    { id: "workspaces", status: "success", count: 1 },
    { id: "active-workspace", status: "success", subject: "Default Workspace" },
    { id: "runtime", status: "success", availableProviders: 2 },
    { id: "codebases", status: "success", count: 1 },
    { id: "repo-access", status: "success", count: 0 },
    { id: "recent-sessions", status: "success", count: 0 },
  ];
}

function baseState(overrides: HookState = {}): HookState {
  return {
    steps: settledSteps(),
    activeStepId: null,
    completedCount: 6,
    totalCount: 6,
    ready: true,
    hasAttention: false,
    settled: true,
    refresh: vi.fn(async () => {}),
    workspaces: [WORKSPACE],
    workspacesLoading: false,
    activeWorkspaceId: "default",
    activeWorkspace: WORKSPACE,
    setActiveWorkspaceId: vi.fn(),
    createWorkspace: vi.fn(async () => true),
    codebases: [CODEBASE],
    refreshCodebases: vi.fn(async () => {}),
    accessibleRepoPaths: new Set<string>(["/repo/main"]),
    recentSessions: [],
    sessionsLoading: false,
    sessionsError: null,
    acp: { providers: [] },
    ...overrides,
  };
}

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => navigation.searchParams.get(key),
  }),
}));

vi.mock("@/client/hooks/use-home-initialization", () => ({
  useHomeInitialization: () => hook.state,
}));

vi.mock("@/client/utils/diagnostics", () => ({
  desktopAwareFetch: desktopAwareFetchMock,
}));

vi.mock("@/client/components/settings-panel", () => ({
  SettingsPanel: ({ open }: { open: boolean }) => (open ? <div data-testid="settings-panel" /> : null),
}));

vi.mock("@/client/components/repo-picker", () => ({
  RepoPicker: () => <div data-testid="repo-picker" />,
}));

vi.mock("@/client/components/workspace-switcher", () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));

vi.mock("@/client/components/desktop-app-shell", () => ({
  DesktopAppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="desktop-shell">{children}</div>
  ),
}));

import HomePage from "../page";

describe("HomePage", () => {
  beforeEach(() => {
    navigation.searchParams = new URLSearchParams();
    desktopAwareFetchMock.mockClear();
    hook.state = baseState();
  });

  it("renders the initialization panel in place of the old onboarding hub", () => {
    render(<HomePage />);

    expect(screen.getByTestId("home-initialization-panel")).toBeTruthy();
    expect(screen.getByText("Home initialization")).toBeTruthy();
    expect(screen.getByText("Initialization complete")).toBeTruthy();

    // The removed large surfaces must not come back.
    expect(screen.queryByText("Which execution mode do you want to enter?")).toBeNull();
    expect(screen.queryByText("Readiness")).toBeNull();
    expect(screen.queryByRole("link", { name: /Kanban Mode/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Sessions Mode/i })).toBeNull();
  });

  it("always shows the step list — progress is the point of the surface", () => {
    render(<HomePage />);

    expect(screen.getByText("Home initialization")).toBeTruthy();
    expect(screen.getByText("Workspaces")).toBeTruthy();
    expect(screen.getByText("Agent Runtime")).toBeTruthy();
    expect(screen.getByText("Recent sessions")).toBeTruthy();

    // No collapse affordance exists: the progress is never hidden.
    expect(screen.queryByText("Show details")).toBeNull();
    expect(screen.queryByText("Hide details")).toBeNull();
  });

  it("shows the running step while initialization is in flight and keeps navigation locked", () => {
    hook.state = baseState({
      steps: [
        { id: "workspaces", status: "success", count: 1 },
        { id: "active-workspace", status: "success", subject: "Default Workspace" },
        { id: "runtime", status: "running" },
        { id: "codebases", status: "pending" },
        { id: "repo-access", status: "pending" },
        { id: "recent-sessions", status: "pending" },
      ],
      activeStepId: "runtime",
      completedCount: 2,
      totalCount: 6,
      ready: false,
      settled: false,
    });

    render(<HomePage />);

    expect(screen.getByText("2 / 6")).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
  });

  it("explains a malformed response instead of pretending it is empty", () => {
    hook.state = baseState({
      steps: [
        {
          id: "workspaces",
          status: "error",
          loadError: new Error('/api/workspaces?status=active returned an unexpected payload: no "workspaces" array'),
        },
        { id: "active-workspace", status: "skipped" },
        { id: "runtime", status: "skipped" },
        { id: "codebases", status: "skipped" },
        { id: "repo-access", status: "skipped" },
        { id: "recent-sessions", status: "skipped" },
      ],
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      completedCount: 6,
      totalCount: 6,
      ready: false,
      settled: true,
    });

    render(<HomePage />);

    expect(screen.getByText(/returned an unexpected payload/)).toBeTruthy();
    expect(screen.getByText("Initialization failed")).toBeTruthy();
  });

  it("offers a workspace creation form when no workspace exists", async () => {
    hook.state = baseState({
      steps: [
        { id: "workspaces", status: "success", count: 0 },
        { id: "active-workspace", status: "skipped" },
        { id: "runtime", status: "skipped" },
        { id: "codebases", status: "skipped" },
        { id: "repo-access", status: "skipped" },
        { id: "recent-sessions", status: "skipped" },
      ],
      workspaces: [],
      activeWorkspaceId: null,
      activeWorkspace: null,
      ready: false,
    });

    render(<HomePage />);

    expect(screen.getByText("Create your first workspace")).toBeTruthy();
    expect(screen.getByPlaceholderText("Workspace name")).toBeTruthy();
    expect(screen.getByTestId("home-initialization-panel")).toBeTruthy();
    expect(screen.getByText("No workspace yet")).toBeTruthy();
  });

  it("surfaces provider and codebase access attention with their actions", () => {
    hook.state = baseState({
      steps: [
        { id: "workspaces", status: "success", count: 1 },
        { id: "active-workspace", status: "success", subject: "Default Workspace" },
        { id: "runtime", status: "attention", availableProviders: 0 },
        { id: "codebases", status: "success", count: 1 },
        {
          id: "repo-access",
          status: "attention",
          count: 1,
          inaccessibleRepos: [{ repoPath: "/repo/main", accessible: false, reason: "http", status: 404 }],
        },
        { id: "recent-sessions", status: "success", count: 0 },
      ],
      accessibleRepoPaths: new Set<string>(),
      hasAttention: true,
      ready: false,
    });

    render(<HomePage />);

    expect(screen.getByText("Connected, but no provider is available")).toBeTruthy();
    expect(screen.getByText("Configure provider")).toBeTruthy();
    expect(screen.getByText("1 codebase(s) unreachable")).toBeTruthy();
    expect(screen.getByText("2 item(s) need attention")).toBeTruthy();
  });

  it("renders no links to other surfaces — Home only starts", () => {
    render(<HomePage />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("does not present a failed sessions request as an empty list", () => {
    hook.state = baseState({
      steps: [
        { id: "workspaces", status: "success", count: 1 },
        { id: "active-workspace", status: "success", subject: "Default Workspace" },
        { id: "runtime", status: "success", availableProviders: 2 },
        { id: "codebases", status: "success", count: 1 },
        { id: "repo-access", status: "success", count: 0 },
        {
          id: "recent-sessions",
          status: "error",
          loadError: new Error("/api/sessions?workspaceId=ws-1&limit=6 failed: HTTP 503"),
        },
      ],
      sessionsError: new Error("/api/sessions?workspaceId=ws-1&limit=6 failed: HTTP 503"),
      recentSessions: [],
    });

    render(<HomePage />);

    // The failure is reported both on the step and in the sessions section —
    // what matters is that it never reads as "no sessions".
    expect(screen.getAllByText(/failed: HTTP 503/).length).toBeGreaterThan(0);
    expect(screen.queryByText("No recent sessions")).toBeNull();
  });
});
