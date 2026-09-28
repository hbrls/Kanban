"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAcp } from "@/client/hooks/use-acp";
import { useKanbanEvents } from "@/client/hooks/use-kanban-events";
import { useWorkspaces, useCodebases } from "@/client/hooks/use-workspaces";
import { desktopAwareFetch } from "@/client/utils/diagnostics";
import { DesktopAppShell } from "@/client/components/desktop-app-shell";
import { WorkspaceSwitcher } from "@/client/components/workspace-switcher";
import { useTranslation } from "@/i18n";
import { KanbanTab } from "./kanban-tab";
import {
  localizeSpecialists,
  mapLocaleToKanbanSpecialistLanguage,
  type KanbanSpecialistLanguage,
} from "./kanban-specialist-language";
import type { RepoSyncState } from "./kanban-repo-sync-status";
import type {
  KanbanAgentPromptHandler,
  KanbanAgentPromptOptions,
  KanbanBoardInfo,
  TaskInfo,
  SessionInfo,
} from "../types";
import { resolveKanbanAutomationStep } from "@/core/kanban/effective-task-automation";
import { createKanbanSpecialistResolver } from "./kanban-card-session-utils";
import type { KanbanRepoChanges } from "./kanban-file-changes-types";

interface SpecialistOption {
  id: string;
  name: string;
  role: string;
  displayName?: string;
  defaultProvider?: string;
}

export function KanbanPageClient() {
  const params = useParams();
  const router = useRouter();
  const rawWorkspaceId = params.workspaceId as string;
  const workspaceId =
    rawWorkspaceId === "__placeholder__" && typeof window !== "undefined"
      ? (window.location.pathname.match(/^\/workspace\/([^/]+)/)?.[1] ?? rawWorkspaceId)
      : rawWorkspaceId;
  const acp = useAcp();
  const { locale, t } = useTranslation();
  const workspacesHook = useWorkspaces();
  const { codebases, fetchCodebases } = useCodebases(workspaceId);

  const [boards, setBoards] = useState<KanbanBoardInfo[]>([]);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [specialists, setSpecialists] = useState<SpecialistOption[]>([]);
  const [repoChanges, setRepoChanges] = useState<KanbanRepoChanges[]>([]);
  const [repoChangesLoading, setRepoChangesLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [repoSync, setRepoSync] = useState<RepoSyncState>({
    status: "idle",
    total: 0,
    completed: 0,
    currentRepoLabel: null,
    message: null,
    error: null,
  });
  const refreshBurstCleanupRef = useRef<(() => void) | null>(null);
  const warmedupProvidersRef = useRef<Set<string>>(new Set());

  // Auto-connect ACP
  useEffect(() => {
    if (!acp.connected && !acp.loading) {
      acp.connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acp.connected, acp.loading]);

  // Fetch boards
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await desktopAwareFetch(`/api/kanban/boards?workspaceId=${encodeURIComponent(workspaceId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (controller.signal.aborted) return;
        setBoards(Array.isArray(data?.boards) ? data.boards : []);
      } catch { /* ignore */ }
    })();
    return () => controller.abort();
  }, [workspaceId, refreshKey]);

  // Warm up registry providers configured in column automations when the board is opened.
  useEffect(() => {
    const resolveSpecialist = createKanbanSpecialistResolver(specialists);
    const enabledAutomationProviderIds = new Set<string>();
    for (const board of boards) {
      for (const column of board.columns ?? []) {
        if (!column.automation?.enabled) {
          continue;
        }
        for (const step of column.automation.steps ?? []) {
          const resolvedStep = resolveKanbanAutomationStep(step, resolveSpecialist, {
            autoProviderId: board.autoProviderId,
          });
          if (resolvedStep?.providerId) {
            enabledAutomationProviderIds.add(resolvedStep.providerId);
          }
        }
        const fallbackStep = resolveKanbanAutomationStep({
          id: "primary",
          providerId: column.automation.providerId,
          role: column.automation.role,
          specialistId: column.automation.specialistId,
          specialistName: column.automation.specialistName,
          specialistLocale: column.automation.specialistLocale,
        }, resolveSpecialist, {
          autoProviderId: board.autoProviderId,
        });
        if (fallbackStep?.providerId) {
          enabledAutomationProviderIds.add(fallbackStep.providerId);
        }
      }
    }

    if (enabledAutomationProviderIds.size === 0 || acp.providers.length === 0) return;

    const registryProviderIds = new Set(
      acp.providers
        .filter((provider) => provider.source === "registry")
        .map((provider) => provider.id),
    );

    for (const providerId of enabledAutomationProviderIds) {
      if (!registryProviderIds.has(providerId) || warmedupProvidersRef.current.has(providerId)) {
        continue;
      }

      warmedupProvidersRef.current.add(providerId);
      void desktopAwareFetch("/api/acp/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: providerId }),
      }).catch(() => {
        warmedupProvidersRef.current.delete(providerId);
      });
    }
  }, [boards, specialists, acp.providers]);

  const specialistLanguage: KanbanSpecialistLanguage = useMemo(
    () => mapLocaleToKanbanSpecialistLanguage(locale),
    [locale],
  );

  // Fetch tasks
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await desktopAwareFetch(`/api/tasks?workspaceId=${encodeURIComponent(workspaceId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (controller.signal.aborted) return;
        setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      } catch { /* ignore */ }
    })();
    return () => controller.abort();
  }, [workspaceId, refreshKey]);

  // Fetch sessions
  useEffect(() => {
    (async () => {
      try {
        const res = await desktopAwareFetch(`/api/sessions?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`, { cache: "no-store" });
        const data = await res.json();
        setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
      } catch { /* ignore */ }
    })();
  }, [workspaceId, refreshKey]);

  // Fetch specialists
  useEffect(() => {
    (async () => {
      try {
        const res = await desktopAwareFetch(
          `/api/specialists?workspaceId=${encodeURIComponent(workspaceId)}&locale=${encodeURIComponent(specialistLanguage)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        setSpecialists(Array.isArray(data?.specialists) ? data.specialists : []);
      } catch { /* ignore */ }
    })();
  }, [workspaceId, specialistLanguage]);

  useEffect(() => {
    const controller = new AbortController();

    if (!workspaceId || workspaceId === "__placeholder__") return () => controller.abort();
    if (codebases.length === 0) {
      setRepoChanges([]);
      setRepoChangesLoading(false);
      return () => controller.abort();
    }

    setRepoChangesLoading(true);
    void (async () => {
      try {
        const res = await desktopAwareFetch(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/codebases/changes`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        setRepoChanges(Array.isArray(data?.repos) ? data.repos : []);
      } catch {
        if (controller.signal.aborted) return;
        setRepoChanges([]);
      } finally {
        if (!controller.signal.aborted) {
          setRepoChangesLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [workspaceId, codebases, refreshKey]);

  const localizedSpecialists = useMemo(
    () => localizeSpecialists(specialists),
    [specialists],
  );

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    void fetchCodebases();
  }, [fetchCodebases]);

  const handleKanbanInvalidate = useCallback(() => {
    handleRefresh();
  }, [handleRefresh]);

  useKanbanEvents({
    workspaceId,
    onInvalidate: handleKanbanInvalidate,
  });

  useEffect(() => {
    if (repoSync.status !== "done") return;

    const timeoutId = window.setTimeout(() => {
      setRepoSync((current) => current.status === "done"
        ? { ...current, status: "idle", message: null }
        : current);
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [repoSync.status]);

  useEffect(() => {
    return () => {
      refreshBurstCleanupRef.current?.();
      refreshBurstCleanupRef.current = null;
    };
  }, []);

  // Handler for agent input - creates session and sends prompt
  const handleAgentPrompt: KanbanAgentPromptHandler = useCallback(async (
    promptText: string,
    options?: KanbanAgentPromptOptions,
  ): Promise<string | null> => {
    if (!acp.connected) {
      await acp.connect();
    }

    const defaultCodebase = codebases.find((c) => c.isDefault) ?? codebases[0];
    const cwd = defaultCodebase?.repoPath;
    const preferredProvider = options?.provider ?? acp.selectedProvider ?? undefined;
    const provider = acp.providers.find(
      (candidate) => candidate.id === preferredProvider && candidate.status !== "unavailable",
    )?.id
      ?? acp.providers.find((candidate) => candidate.status !== "unavailable")?.id
      ?? preferredProvider;

    if (provider && provider !== acp.selectedProvider) {
      acp.setProvider(provider);
    }

    const result = await acp.createSession(
      cwd,
      provider,
      undefined,
      options?.role ?? "DEVELOPER",
      workspaceId,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      options?.toolMode,
      options?.allowedNativeTools,
      options?.mcpProfile,
      options?.systemPrompt,
      true,
      options?.taskAdaptiveHarness,
      options?.boardId,
    );

    if (!result?.sessionId) {
      return null;
    }

    void acp.promptSession(result.sessionId, promptText).catch((error) => {
      console.error("[kanban] Failed to send Kanban agent prompt:", error);
    });

    return result.sessionId;
  }, [acp, codebases, workspaceId]);

  const workspace = workspacesHook.workspaces.find((w) => w.id === workspaceId);
  const activeWorkspaceTitle = workspace?.title ?? (workspaceId === "default" ? t.workspace.defaultWorkspace : workspaceId);

  const handleWorkspaceSelect = useCallback((nextWorkspaceId: string) => {
    router.push(`/workspace/${nextWorkspaceId}/kanban`);
  }, [router]);

  const handleWorkspaceCreate = useCallback(async (title: string) => {
    const workspaceResult = await workspacesHook.createWorkspace(title);
    if (workspaceResult) {
      router.push(`/workspace/${workspaceResult.id}/kanban`);
    }
  }, [router, workspacesHook]);

  return (
    <DesktopAppShell
      workspaceId={workspaceId}
      workspaceTitle={activeWorkspaceTitle}
      workspaceSwitcher={(
        <WorkspaceSwitcher
          workspaces={workspacesHook.workspaces}
          activeWorkspaceId={workspaceId}
          activeWorkspaceTitle={activeWorkspaceTitle}
          onSelect={handleWorkspaceSelect}
          onCreate={handleWorkspaceCreate}
          loading={workspacesHook.loading}
          compact
          desktop
        />
      )}
    >
      <div className="flex h-full flex-col overflow-hidden bg-desktop-bg-primary" data-testid="kanban-page-shell">
        <div className="flex-1 min-h-0 overflow-hidden">
          <KanbanTab
            workspaceId={workspaceId}
            refreshSignal={refreshKey}
            boards={boards}
            tasks={tasks}
            sessions={sessions}
            providers={acp.providers}
            specialists={localizedSpecialists}
            specialistLanguage={specialistLanguage}
            codebases={codebases}
            onRefresh={handleRefresh}
            acp={acp}
            onAgentPrompt={handleAgentPrompt}
            repoSync={repoSync}
            repoChanges={repoChanges}
            repoChangesLoading={repoChangesLoading}
          />
        </div>
      </div>
    </DesktopAppShell>
  );
}
