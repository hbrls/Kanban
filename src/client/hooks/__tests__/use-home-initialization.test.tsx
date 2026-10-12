import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const acp = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    connected: false,
    sessionId: null,
    updates: [],
    providers: [] as Array<{ id: string; status: string }>,
    selectedProvider: "claude",
    loading: false,
    error: null as string | null,
    authError: null,
    dockerConfigError: null,
  };

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    state,
    listeners,
    notify,
    reset: () => {
      state.connected = false;
      state.loading = false;
      state.error = null;
      state.providers = [];
    },
    connect: vi.fn(async () => {
      state.loading = true;
      notify();
      state.loading = false;
      state.connected = true;
      state.error = null;
      state.providers = [{ id: "claude", status: "available" }];
      notify();
    }),
    disconnect: vi.fn(() => {
      state.connected = false;
      state.loading = false;
      state.error = null;
      state.providers = [];
      notify();
    }),
  };
});

const { desktopAwareFetchMock, collectRepoAccessResultsMock } = vi.hoisted(() => ({
  desktopAwareFetchMock: vi.fn(),
  collectRepoAccessResultsMock: vi.fn(),
}));

vi.mock("../../utils/diagnostics", () => ({
  desktopAwareFetch: desktopAwareFetchMock,
}));

vi.mock("../../utils/repo-validation", () => ({
  collectRepoAccessResults: collectRepoAccessResultsMock,
}));

vi.mock("../use-acp", async () => {
  const React = await import("react");

  return {
    useAcp: () => {
      const [, force] = React.useState(0);

      React.useEffect(() => {
        const listener = () => force((value) => value + 1);
        acp.listeners.add(listener);
        return () => {
          acp.listeners.delete(listener);
        };
      }, []);

      return { ...acp.state, connect: acp.connect, disconnect: acp.disconnect };
    },
  };
});

import { useHomeInitialization } from "../use-home-initialization";
import type { HomeInitializationStepId, UseHomeInitializationReturn } from "../use-home-initialization";

const WORKSPACE = {
  id: "ws-1",
  title: "Workspace One",
  status: "active" as const,
  metadata: {},
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
};

const CODEBASE = {
  id: "cb-1",
  workspaceId: "ws-1",
  repoPath: "/repo/main",
  isDefault: true,
  createdAt: "",
  updatedAt: "",
};

function okJson(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function stepStatus(
  result: { current: UseHomeInitializationReturn },
  id: HomeInitializationStepId,
) {
  return result.current.steps.find((step) => step.id === id)?.status;
}

/** Default happy-path backend. */
function mockBackend(overrides: {
  workspaces?: unknown;
  codebases?: unknown;
  sessions?: unknown;
} = {}) {
  desktopAwareFetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.startsWith("/api/workspaces?")) {
      return okJson({ workspaces: overrides.workspaces ?? [WORKSPACE] });
    }
    if (url.includes("/codebases")) {
      return okJson({ codebases: overrides.codebases ?? [CODEBASE] });
    }
    if (url.startsWith("/api/sessions?")) {
      return okJson({ sessions: overrides.sessions ?? [] });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("useHomeInitialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acp.reset();
    acp.connect.mockImplementation(async () => {
      acp.state.loading = true;
      acp.notify();
      acp.state.loading = false;
      acp.state.connected = true;
      acp.state.error = null;
      acp.state.providers = [{ id: "claude", status: "available" }];
      acp.notify();
    });
    collectRepoAccessResultsMock.mockResolvedValue([{ repoPath: "/repo/main", accessible: true }]);
    mockBackend();
  });

  it("runs the serial steps to a ready state", async () => {
    const { result } = renderHook(() => useHomeInitialization());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    expect(stepStatus(result, "workspaces")).toBe("success");
    expect(stepStatus(result, "active-workspace")).toBe("success");
    expect(stepStatus(result, "runtime")).toBe("success");
    expect(stepStatus(result, "codebases")).toBe("success");
    expect(stepStatus(result, "repo-access")).toBe("success");
    expect(stepStatus(result, "recent-sessions")).toBe("success");
    expect(result.current.completedCount).toBe(result.current.totalCount);
    expect(result.current.settled).toBe(true);
    expect(result.current.activeWorkspaceId).toBe("ws-1");
  });

  it("surfaces a workspaces request failure and releases the navigation lock", async () => {
    desktopAwareFetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);

    const { result } = renderHook(() => useHomeInitialization());

    await waitFor(() => {
      expect(stepStatus(result, "workspaces")).toBe("error");
    });

    const workspacesStep = result.current.steps.find((step) => step.id === "workspaces");
    expect(workspacesStep?.loadError?.message).toContain("HTTP 500");
    expect(stepStatus(result, "active-workspace")).toBe("skipped");
    expect(stepStatus(result, "recent-sessions")).toBe("skipped");
    expect(result.current.settled).toBe(true);
    expect(result.current.ready).toBe(false);
  });

  it("skips the workspace-scoped steps when no workspace exists, then resumes after creation", async () => {
    let created = false;
    desktopAwareFetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/workspaces?status=active")) {
        return okJson({ workspaces: created ? [WORKSPACE] : [] });
      }
      if (url === "/api/workspaces" && init?.method === "POST") {
        created = true;
        return okJson({ workspace: WORKSPACE });
      }
      if (url.includes("/codebases")) {
        return okJson({ codebases: [CODEBASE] });
      }
      if (url.startsWith("/api/sessions?")) {
        return okJson({ sessions: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useHomeInitialization());

    await waitFor(() => {
      expect(result.current.settled).toBe(true);
    });

    expect(stepStatus(result, "workspaces")).toBe("success");
    expect(stepStatus(result, "active-workspace")).toBe("skipped");
    expect(stepStatus(result, "runtime")).toBe("skipped");
    expect(result.current.activeWorkspaceId).toBeNull();
    expect(result.current.ready).toBe(false);

    await act(async () => {
      await result.current.createWorkspace("Workspace One");
    });

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    expect(result.current.activeWorkspaceId).toBe("ws-1");
    expect(stepStatus(result, "runtime")).toBe("success");
  });

  it("reports an ACP connection failure", async () => {
    acp.connect.mockImplementationOnce(async () => {
      acp.state.loading = false;
      acp.state.connected = false;
      acp.state.error = "Session stream disconnected";
      acp.notify();
    });

    const { result } = renderHook(() => useHomeInitialization());

    await waitFor(() => {
      expect(stepStatus(result, "runtime")).toBe("error");
    });

    expect(result.current.settled).toBe(true);
    expect(result.current.ready).toBe(false);
  });

  it("marks the codebase step skipped when none is configured", async () => {
    mockBackend({ codebases: [] });

    const { result } = renderHook(() => useHomeInitialization());

    await waitFor(() => {
      expect(stepStatus(result, "codebases")).toBe("skipped");
    });

    expect(stepStatus(result, "repo-access")).toBe("skipped");
    expect(collectRepoAccessResultsMock).not.toHaveBeenCalled();
    // An unconfigured codebase is a "not configured" state, not a blocker.
    expect(result.current.hasAttention).toBe(false);
    expect(result.current.ready).toBe(true);
  });

  it("raises attention when a codebase path is unreachable", async () => {
    collectRepoAccessResultsMock.mockResolvedValue([
      { repoPath: "/repo/main", accessible: false, reason: "http", status: 404 },
    ]);

    const { result } = renderHook(() => useHomeInitialization());

    await waitFor(() => {
      expect(stepStatus(result, "repo-access")).toBe("attention");
    });

    const repoStep = result.current.steps.find((step) => step.id === "repo-access");
    expect(repoStep?.count).toBe(1);
    expect(repoStep?.inaccessibleRepos?.[0].repoPath).toBe("/repo/main");
    expect(result.current.hasAttention).toBe(true);
    expect(result.current.activeStepId).toBeNull();
  });

  it("keeps a sessions failure visible instead of masking it as an empty list", async () => {
    desktopAwareFetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/workspaces?")) return okJson({ workspaces: [WORKSPACE] });
      if (url.includes("/codebases")) return okJson({ codebases: [CODEBASE] });
      if (url.startsWith("/api/sessions?")) return { ok: false, status: 503, json: async () => ({}) } as Response;
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useHomeInitialization());

    await waitFor(() => {
      expect(stepStatus(result, "recent-sessions")).toBe("error");
    });

    expect(result.current.sessionsError?.message).toContain("HTTP 503");
    expect(result.current.recentSessions).toEqual([]);
  });

  it("keeps workspace-independent steps when switching workspace", async () => {
    const secondWorkspace = { ...WORKSPACE, id: "ws-2", title: "Workspace Two" };
    mockBackend({ workspaces: [WORKSPACE, secondWorkspace] });

    const { result } = renderHook(() => useHomeInitialization());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });

    await act(async () => {
      result.current.setActiveWorkspaceId("ws-2");
    });

    await waitFor(() => {
      expect(result.current.activeWorkspaceId).toBe("ws-2");
      expect(stepStatus(result, "codebases")).toBe("success");
    });

    expect(stepStatus(result, "workspaces")).toBe("success");
    expect(stepStatus(result, "runtime")).toBe("success");
    expect(acp.connect).toHaveBeenCalledTimes(1);
  });
});
