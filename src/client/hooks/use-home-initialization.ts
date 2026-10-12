"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SessionInfo } from "@/app/workspace/[workspaceId]/types";
import { useAcp, type UseAcpActions, type UseAcpState } from "@/client/hooks/use-acp";
import {
  useCodebases,
  useWorkspaces,
  type CodebaseData,
  type WorkspaceData,
} from "@/client/hooks/use-workspaces";
import { desktopAwareFetch } from "@/client/utils/diagnostics";
import { collectRepoAccessResults, type RepoAccessResult } from "@/client/utils/repo-validation";

/** Fail a still-running step after this long so the surface can never lock up. */
const STEP_TIMEOUT_MS = 15_000;
const RECENT_SESSION_LIMIT = 6;

export type HomeInitializationStepId =
  | "workspaces"
  | "active-workspace"
  | "runtime"
  | "codebases"
  | "repo-access"
  | "recent-sessions";

export type HomeInitializationStepStatus =
  | "pending"
  | "running"
  | "success"
  | "attention"
  | "error"
  | "skipped";

export interface HomeInitializationStep {
  id: HomeInitializationStepId;
  status: HomeInitializationStepStatus;
  /** Number of loaded items when the step has a countable subject. */
  count?: number;
  /** Single subject of the step, such as the active workspace title. */
  subject?: string;
  loadError?: Error;
  inaccessibleRepos?: RepoAccessResult[];
  availableProviders?: number;
  /** Why a skipped step was skipped: nothing to do, or an upstream step failed. */
  skippedReason?: "empty" | "upstream";
}

export interface UseHomeInitializationOptions {
  /** Workspace requested through the `?workspace=` query parameter. */
  requestedWorkspaceId?: string | null;
}

export interface UseHomeInitializationReturn {
  steps: HomeInitializationStep[];
  activeStepId: HomeInitializationStepId | null;
  completedCount: number;
  totalCount: number;
  ready: boolean;
  hasAttention: boolean;
  /** True once every step reached a terminal status. */
  settled: boolean;

  workspaces: WorkspaceData[];
  workspacesLoading: boolean;
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceData | null;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
  createWorkspace: (title: string) => Promise<boolean>;
  codebases: CodebaseData[];
  refreshCodebases: () => Promise<void>;
  accessibleRepoPaths: Set<string>;
  recentSessions: SessionInfo[];
  sessionsLoading: boolean;
  sessionsError: Error | null;
  acp: UseAcpState & UseAcpActions;
}

interface SessionsEntry {
  running: boolean;
  sessions: SessionInfo[];
  error: Error | null;
}

const TERMINAL_STATUSES: HomeInitializationStepStatus[] = ["success", "attention", "error", "skipped"];

function isTerminal(status: HomeInitializationStepStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** A step whose upstream settled without succeeding can never run. */
function upstreamBlocked(upstream: HomeInitializationStepStatus): boolean {
  return upstream === "error" || upstream === "skipped";
}

function useStepTimeout(active: boolean): boolean {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = setTimeout(() => setStalled(true), STEP_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      setStalled(false);
    };
  }, [active]);

  return active && stalled;
}

function selectWorkspaceId(
  workspaces: WorkspaceData[],
  requestedWorkspaceId: string | null | undefined,
  current: string | null,
): string | null {
  if (!workspaces.length) {
    return null;
  }

  if (requestedWorkspaceId && workspaces.some((workspace) => workspace.id === requestedWorkspaceId)) {
    return requestedWorkspaceId;
  }

  if (current && workspaces.some((workspace) => workspace.id === current)) {
    return current;
  }

  return workspaces[0].id;
}

export function useHomeInitialization(
  options: UseHomeInitializationOptions = {},
): UseHomeInitializationReturn {
  const requestedWorkspaceId = options.requestedWorkspaceId ?? null;

  const workspacesHook = useWorkspaces();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const {
    codebases,
    loading: codebasesLoading,
    error: codebasesError,
    fetchCodebases,
  } = useCodebases(activeWorkspaceId ?? "");
  const acp = useAcp();
  const {
    connect: connectAcp,
    connected: acpConnected,
    loading: acpLoading,
    error: acpError,
    providers: acpProviders,
  } = acp;

  const [runtimeStarted, setRuntimeStarted] = useState(false);
  const [repoAccess, setRepoAccess] = useState<{ key: string; running: boolean; results: RepoAccessResult[] }>({
    key: "",
    running: false,
    results: [],
  });
  const [sessionsByWorkspace, setSessionsByWorkspace] = useState<Record<string, SessionsEntry>>({});
  const requestedSessionsRef = useRef<Set<string>>(new Set());

  const workspacesStalled = useStepTimeout(workspacesHook.loading);
  const codebasesStalled = useStepTimeout(codebasesLoading);
  const runtimeStalled = useStepTimeout(acpLoading && !acpConnected);

  const workspaces = workspacesHook.workspaces;
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const activeWorkspaceTitle = activeWorkspace?.title;
  const availableProviders = useMemo(
    () => (acpConnected ? acpProviders.filter((provider) => provider.status === "available").length : 0),
    [acpConnected, acpProviders],
  );

  // Keep the active workspace valid: honour `?workspace=`, otherwise fall back to
  // the first active workspace, and re-point when the current one disappears.
  useEffect(() => {
    const next = selectWorkspaceId(workspaces, requestedWorkspaceId, activeWorkspaceId);
    if (next !== activeWorkspaceId) {
      setActiveWorkspaceId(next);
    }
  }, [workspaces, requestedWorkspaceId, activeWorkspaceId]);

  // Serial step 3: connect the agent runtime once a workspace is known.
  useEffect(() => {
    if (!activeWorkspaceId || runtimeStarted) {
      return;
    }
    if (acpConnected || acpLoading) {
      return;
    }

    setRuntimeStarted(true);
    void connectAcp();
  }, [activeWorkspaceId, runtimeStarted, acpConnected, acpLoading, connectAcp]);

  const workspacesStatus: HomeInitializationStepStatus = workspacesHook.loading
    ? workspacesStalled ? "error" : "running"
    : workspacesHook.error || workspacesStalled ? "error" : "success";

  let activeWorkspaceStatus: HomeInitializationStepStatus;  if (!isTerminal(workspacesStatus)) {
    activeWorkspaceStatus = "pending";
  } else if (upstreamBlocked(workspacesStatus)) {
    activeWorkspaceStatus = "skipped";
  } else if (!workspaces.length) {
    activeWorkspaceStatus = "skipped";
  } else if (activeWorkspace) {
    activeWorkspaceStatus = "success";
  } else {
    activeWorkspaceStatus = "running";
  }

  let runtimeStatus: HomeInitializationStepStatus;
  if (activeWorkspaceStatus === "success") {
    if (runtimeStalled || acpError) {
      runtimeStatus = "error";
    } else if (acpConnected) {
      runtimeStatus = availableProviders > 0 ? "success" : "attention";
    } else if (acpLoading) {
      runtimeStatus = "running";
    } else if (runtimeStarted) {
      // `connect()` returned without connecting and without an error.
      runtimeStatus = "error";
    } else {
      runtimeStatus = "pending";
    }
  } else if (upstreamBlocked(activeWorkspaceStatus)) {
    runtimeStatus = "skipped";
  } else {
    runtimeStatus = "pending";
  }

  let codebasesStatus: HomeInitializationStepStatus;
  if (runtimeStatus === "success" || runtimeStatus === "attention") {
    if (codebasesStalled || codebasesError) {
      codebasesStatus = "error";
    } else if (codebasesLoading) {
      codebasesStatus = "running";
    } else if (!codebases.length) {
      codebasesStatus = "skipped";
    } else {
      codebasesStatus = "success";
    }
  } else if (upstreamBlocked(runtimeStatus)) {
    codebasesStatus = "skipped";
  } else {
    codebasesStatus = "pending";
  }

  const codebasesKey = codebases.map((codebase) => codebase.repoPath).join("\n");
  const repoAccessKey = `${activeWorkspaceId ?? ""}\n${codebasesKey}`;
  const repoAccessStale = repoAccess.key !== repoAccessKey;

  // Serial step 5: probe whether every configured codebase is still reachable.
  useEffect(() => {
    if (codebasesStatus !== "success") {
      return;
    }

    let cancelled = false;
    setRepoAccess({ key: repoAccessKey, running: true, results: [] });

    void (async () => {
      const results = await collectRepoAccessResults(codebases.map((codebase) => codebase.repoPath));
      if (!cancelled) {
        setRepoAccess({ key: repoAccessKey, running: false, results });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [repoAccessKey, codebasesStatus, codebases]);

  let repoAccessStatus: HomeInitializationStepStatus;
  if (codebasesStatus === "success") {
    if (repoAccessStale || repoAccess.running) {
      repoAccessStatus = "running";
    } else if (repoAccess.results.some((result) => !result.accessible)) {
      repoAccessStatus = "attention";
    } else {
      repoAccessStatus = "success";
    }
  } else if (upstreamBlocked(codebasesStatus)) {
    repoAccessStatus = "skipped";
  } else {
    repoAccessStatus = "pending";
  }

  const accessibleRepoPaths = useMemo(
    () => new Set(repoAccess.results.filter((result) => result.accessible).map((result) => result.repoPath)),
    [repoAccess.results],
  );

  const sessionsEntry = activeWorkspaceId ? sessionsByWorkspace[activeWorkspaceId] : undefined;

  // Serial step 6: load recent sessions once the runtime step settled. Each
  // workspace is fetched once; the request is tracked in a ref so writing the
  // in-flight marker cannot cancel the request that produced it.
  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    if (runtimeStatus !== "success" && runtimeStatus !== "attention") {
      return;
    }
    if (requestedSessionsRef.current.has(activeWorkspaceId)) {
      return;
    }
    requestedSessionsRef.current.add(activeWorkspaceId);

    setSessionsByWorkspace((current) => ({
      ...current,
      [activeWorkspaceId]: { running: true, sessions: [], error: null },
    }));

    void (async () => {
      const url = `/api/sessions?workspaceId=${encodeURIComponent(activeWorkspaceId)}&limit=${RECENT_SESSION_LIMIT}`;
      try {
        const response = await desktopAwareFetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
        });

        if (!response.ok) {
          setSessionsByWorkspace((current) => ({
            ...current,
            [activeWorkspaceId]: {
              running: false,
              sessions: [],
              error: new Error(`${url} failed: HTTP ${response.status}`),
            },
          }));
          return;
        }

        const data = await response.json().catch(() => ({}));

        if (!Array.isArray(data?.sessions)) {
          setSessionsByWorkspace((current) => ({
            ...current,
            [activeWorkspaceId]: {
              running: false,
              sessions: [],
              error: new Error(`${url} returned an unexpected payload: no "sessions" array`),
            },
          }));
          return;
        }

        setSessionsByWorkspace((current) => ({
          ...current,
          [activeWorkspaceId]: { running: false, sessions: data.sessions, error: null },
        }));
      } catch (error) {
        setSessionsByWorkspace((current) => ({
          ...current,
          [activeWorkspaceId]: {
            running: false,
            sessions: [],
            error: error instanceof Error ? error : new Error(String(error)),
          },
        }));
      }
    })();
  }, [activeWorkspaceId, runtimeStatus]);

  let sessionsStatus: HomeInitializationStepStatus;
  if (runtimeStatus === "success" || runtimeStatus === "attention") {
    if (!sessionsEntry || sessionsEntry.running) {
      sessionsStatus = "running";
    } else if (sessionsEntry.error) {
      sessionsStatus = "error";
    } else {
      sessionsStatus = "success";
    }
  } else if (upstreamBlocked(runtimeStatus)) {
    sessionsStatus = "skipped";
  } else {
    sessionsStatus = "pending";
  }

  const steps = useMemo<HomeInitializationStep[]>(() => {
    const inaccessible = repoAccess.results.filter((result) => !result.accessible);
    const workspacesError: Error | undefined = workspacesHook.loading
      ? workspacesStalled ? new Error(`no response within ${STEP_TIMEOUT_MS}ms`) : undefined
      : workspacesHook.error ?? undefined;
    const runtimeError: Error | undefined = acpError
      ? new Error(acpError)
      : runtimeStalled
        ? new Error(`no response within ${STEP_TIMEOUT_MS}ms`)
        : undefined;
    const sessionsError: Error | undefined = sessionsEntry?.error ?? undefined;

    return [
      {
        id: "workspaces",
        status: workspacesStatus,
        count: workspaces.length,
        loadError: workspacesError,
      },
      {
        id: "active-workspace",
        status: activeWorkspaceStatus,
        subject: activeWorkspaceTitle,
        skippedReason: upstreamBlocked(workspacesStatus) ? "upstream" : "empty",
      },
      {
        id: "runtime",
        status: runtimeStatus,
        availableProviders,
        loadError: runtimeError,
      },
      {
        id: "codebases",
        status: codebasesStatus,
        count: codebases.length,
        loadError: codebasesError ?? undefined,
        skippedReason: upstreamBlocked(runtimeStatus) ? "upstream" : "empty",
      },
      {
        id: "repo-access",
        status: repoAccessStatus,
        count: inaccessible.length,
        inaccessibleRepos: inaccessible,
        skippedReason: upstreamBlocked(codebasesStatus) ? "upstream" : "empty",
      },
      {
        id: "recent-sessions",
        status: sessionsStatus,
        count: sessionsEntry?.sessions.length ?? 0,
        loadError: sessionsError,
        skippedReason: upstreamBlocked(runtimeStatus) ? "upstream" : "empty",
      },
    ];
  }, [
    workspacesStatus,
    workspaces.length,
    workspacesStalled,
    workspacesHook.loading,
    workspacesHook.error,
    activeWorkspaceStatus,
    activeWorkspaceTitle,
    runtimeStatus,
    availableProviders,
    runtimeStalled,
    acpError,
    codebasesStatus,
    codebases.length,
    codebasesError,
    repoAccessStatus,
    repoAccess.results,
    sessionsStatus,
    sessionsEntry,
  ]);

  const activeStep = steps.find((step) => step.status === "running") ?? null;
  const completedCount = steps.filter((step) => isTerminal(step.status)).length;
  const hasError = steps.some((step) => step.status === "error");
  const hasAttention = steps.some((step) => step.status === "attention");
  const settled = steps.every((step) => isTerminal(step.status));
  const ready = settled && !hasError && activeWorkspaceId !== null;

  const createWorkspace = useCallback(async (title: string): Promise<boolean> => {
    const workspace = await workspacesHook.createWorkspace(title);
    if (!workspace) {
      return false;
    }
    setActiveWorkspaceId(workspace.id);
    return true;
  }, [workspacesHook]);

  return {
    steps,
    activeStepId: activeStep?.id ?? null,
    completedCount,
    totalCount: steps.length,
    ready,
    hasAttention,
    settled,
    workspaces,
    workspacesLoading: workspacesHook.loading,
    activeWorkspaceId,
    activeWorkspace,
    setActiveWorkspaceId,
    createWorkspace,
    codebases,
    refreshCodebases: fetchCodebases,
    accessibleRepoPaths,
    recentSessions: sessionsEntry?.sessions ?? [],
    sessionsLoading: sessionsEntry?.running ?? false,
    sessionsError: sessionsEntry?.error ?? null,
    acp,
  };
}
