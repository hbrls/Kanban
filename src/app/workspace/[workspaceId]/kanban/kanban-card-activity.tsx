"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { AcpProviderInfo } from "@/client/acp-client";
import { resolveEffectiveTaskAutomation } from "@/core/kanban/effective-task-automation";
import type { KanbanColumnInfo } from "../types";
import type { SessionInfo, TaskInfo, TaskRunInfo } from "../types";
import {
  createKanbanSpecialistResolver,
  formatSessionTimestamp,
  getLaneSessionStepLabel,
  getSpecialistName,
  type KanbanSpecialistOption,
} from "./kanban-card-session-utils";
import type { KanbanSpecialistLanguage } from "./kanban-specialist-language";
import { getKanbanSessionCopy } from "./i18n/kanban-session-copy";
import { useTaskRuns } from "./use-task-runs";

type ActivityTabId = "handoffs" | "github";

function formatTaskRunKind(kind: TaskRunInfo["kind"] | undefined): string {
  return kind ?? "unknown";
}

function formatTaskRunStatus(status: TaskRunInfo["status"] | undefined): string {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "timed_out":
      return "Timed out";
    case "transitioned":
      return "Transitioned";
    default:
      return "Unknown";
  }
}

function getTaskRunStatusClasses(status: TaskRunInfo["status"] | undefined): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200";
    case "failed":
    case "timed_out":
      return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200";
    case "running":
      return "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200";
    case "transitioned":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

function formatAgentCardTarget(agentCardUrl?: string): string | undefined {
  const trimmed = agentCardUrl?.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    return `${parsed.hostname}${parsed.pathname !== "/" ? parsed.pathname : ""}`;
  } catch {
    return trimmed.replace(/^https?:\/\//, "");
  }
}

function formatExpectedRunTarget(
  task: TaskInfo,
  boardColumns: KanbanColumnInfo[],
  availableProviders: AcpProviderInfo[],
  specialists: KanbanSpecialistOption[],
  workspaceDefaultLabel: string,
  autoProviderId?: string,
): string {
  const resolveSpecialist = createKanbanSpecialistResolver(specialists);
  const effectiveAutomation = resolveEffectiveTaskAutomation(task, boardColumns, resolveSpecialist, {
    autoProviderId,
  });
  const specialistName = getSpecialistName(
    effectiveAutomation.specialistId,
    effectiveAutomation.specialistName,
    specialists,
  );

  if (effectiveAutomation.transport === "a2a") {
    return [
      "A2A",
      effectiveAutomation.role ?? "DEVELOPER",
      specialistName,
      formatAgentCardTarget(effectiveAutomation.agentCardUrl),
      effectiveAutomation.skillId ? `skill:${effectiveAutomation.skillId}` : undefined,
    ].filter(Boolean).join(" · ");
  }

  const providerName = effectiveAutomation.providerId
    ? availableProviders.find((provider) => provider.id === effectiveAutomation.providerId)?.name ?? effectiveAutomation.providerId
    : workspaceDefaultLabel;
  return [providerName, effectiveAutomation.role ?? "DEVELOPER", specialistName].join(" · ");
}

function formatLaneSessionHeading(
  laneSession: NonNullable<TaskInfo["laneSessions"]>[number] | undefined,
  session: SessionInfo | undefined,
): string {
  if (laneSession?.transport === "a2a") {
    return laneSession.externalTaskId
      ? `A2A Task · ${laneSession.externalTaskId}`
      : laneSession.contextId
        ? `A2A Context · ${laneSession.contextId}`
        : "A2A Task";
  }

  return session?.name ?? session?.provider ?? "Automation Run";
}

function ActivitySection({
  title,
  description,
  children,
  compact = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="space-y-2 border-b border-slate-200/80 py-2 dark:border-[#232736]">
      <div className={compact ? "mb-2" : "mb-3"}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{title}</div>
        {description && (
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</div>
        )}
      </div>
      {children}
    </section>
  );
}

function SessionIdChip({
  sessionId,
  compact = false,
}: {
  sessionId: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    navigator.clipboard.writeText(sessionId).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
      setCopied(false);
    });
  };

  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${compact ? "max-w-[13rem]" : "max-w-[18rem]"}`}>
      <span
        className={`min-w-0 break-all rounded-lg bg-slate-100 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300 ${compact ? "px-1.5 py-0.5" : "px-2 py-1"}`}
        title={sessionId}
      >
        {sessionId}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        title={t.common.copyToClipboard}
        aria-label={t.common.copyToClipboard}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

export function KanbanSessionRunMetadata({
  laneSession,
  run,
  session,
  specialists,
  compact = false,
}: {
  laneSession?: NonNullable<TaskInfo["laneSessions"]>[number];
  run?: TaskRunInfo;
  session?: SessionInfo;
  specialists: KanbanSpecialistOption[];
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const sessionId = laneSession?.sessionId ?? run?.sessionId ?? session?.sessionId ?? "";
  const laneSpecialist = getSpecialistName(
    laneSession?.specialistId,
    run?.specialistName ?? laneSession?.specialistName,
    specialists,
  );
  const isA2ARun = laneSession?.transport === "a2a";

  return (
    <div
      className={`w-full border-b border-slate-200/70 text-left last:border-b-0 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"} text-slate-700 dark:border-slate-700 dark:text-slate-300`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {run && (
          <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:text-slate-200">
            {formatTaskRunKind(run.kind)}
          </span>
        )}
        {laneSession?.transport && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
            {laneSession.transport}
          </span>
        )}
        {(run?.status ?? laneSession?.status) && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getTaskRunStatusClasses(run?.status ?? laneSession?.status)}`}>
            {formatTaskRunStatus(run?.status ?? laneSession?.status)}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`truncate font-medium text-slate-900 dark:text-slate-100 ${compact ? "text-[13px]" : "text-sm"}`}>
            {laneSession ? formatLaneSessionHeading(laneSession, session) : (session?.name ?? session?.provider ?? t.kanban.acpSession)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isA2ARun
              ? [
                "Remote task",
                laneSession?.role ?? t.kanban.unknownRole,
                laneSpecialist,
              ].filter(Boolean).join(" · ")
              : [
                laneSession?.provider ?? session?.provider ?? t.kanban.unknownProvider,
                laneSession?.role ?? session?.role ?? t.kanban.unknownRole,
                laneSpecialist,
              ].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            {formatSessionTimestamp(run?.startedAt ?? session?.createdAt ?? laneSession?.startedAt)}
          </div>
        </div>
        <SessionIdChip
          sessionId={run?.externalTaskId ?? laneSession?.externalTaskId ?? sessionId}
          compact={compact}
        />
      </div>
      <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="truncate">
          {isA2ARun
            ? (run?.contextId ?? laneSession?.contextId) ? `Context ${run?.contextId ?? laneSession?.contextId}` : "Remote task metadata available"
            : session?.cwd ?? t.kanban.workingDirUnavailable}
        </span>
      </div>
    </div>
  );
}

export function KanbanCardActivityPanel({
  task,
  specialistLanguage = "en",
  compact = false,
}: {
  task: TaskInfo;
  specialistLanguage?: KanbanSpecialistLanguage;
  compact?: boolean;
}) {
  const copy = getKanbanSessionCopy(specialistLanguage);
  const tabs: Array<{ id: ActivityTabId; label: string; count?: number }> = [
    ...((task.laneHandoffs?.length ?? 0) > 0 ? [{ id: "handoffs" as const, label: copy.handoffs, count: task.laneHandoffs?.length }] : []),
    ...(task.githubNumber ? [{ id: "github" as const, label: "GitHub" }] : []),
  ];
  const [activeTab, setActiveTab] = useState<ActivityTabId | null>(null);
  const visibleTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id;

  return (
    <ActivitySection
      title={copy.activityTitle}
      description={compact ? undefined : copy.activityDescription}
      compact={compact}
    >
      <div>
        {tabs.length > 0 && (
          <div className="flex flex-wrap border-b border-slate-200/70 dark:border-[#232736]">
            {tabs.map((tab) => {
              const active = tab.id === visibleTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center justify-between gap-1 border-b-2 border-transparent px-3 py-2 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-b-[#b45309] text-amber-800 dark:border-b-[#f59e0b] dark:text-amber-200"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" && (
                    <span className={`rounded-none border px-1 py-0.5 text-[10px] ${active ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/10 dark:text-amber-100" : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {visibleTab && (
          <div className={compact ? "mt-3" : "mt-4"}>
            {visibleTab === "handoffs" && (
              <HandoffPanel
                task={task}
                compact={compact}
              />
            )}
            {visibleTab === "github" && (
              <GitHubPanel task={task} compact={compact} />
            )}
          </div>
        )}
      </div>
    </ActivitySection>
  );
}

export function KanbanCardActivityBar({
  task,
  sessions = [],
  specialists = [],
  specialistLanguage = "en",
  currentSessionId,
  onSelectSession,
  refreshSignal,
}: {
  task: TaskInfo;
  sessions?: SessionInfo[];
  specialists?: KanbanSpecialistOption[];
  specialistLanguage?: KanbanSpecialistLanguage;
  currentSessionId?: string;
  onSelectSession?: (sessionId: string) => void;
  refreshSignal?: number;
}) {
  const { t } = useTranslation();
  const copy = getKanbanSessionCopy(specialistLanguage);
  const sessionTabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const { runs, error } = useTaskRuns(
    task.id,
    `${refreshSignal ?? ""}:${task.updatedAt ?? ""}:${task.triggerSessionId ?? ""}:${task.laneSessions?.length ?? 0}`,
  );
  const laneSessions = task.laneSessions ?? [];
  const sessionMap = new Map(sessions.map((session) => [session.sessionId, session]));
  const laneSessionMap = new Map(laneSessions.map((entry) => [entry.sessionId, entry]));
  const runMap = new Map((runs ?? []).map((run) => [run.sessionId ?? run.id, run]));
  const selectedSessionId = currentSessionId && laneSessionMap.has(currentSessionId)
    ? currentSessionId
    : laneSessions[laneSessions.length - 1]?.sessionId;
  const selectedLaneSession = selectedSessionId ? laneSessionMap.get(selectedSessionId) : undefined;
  const selectedRun = selectedSessionId ? runMap.get(selectedSessionId) : undefined;
  const selectedSession = selectedSessionId ? sessionMap.get(selectedSessionId) : undefined;
  const tabPanelId = `kanban-session-tabpanel-${task.id}`;

  useEffect(() => {
    if (!selectedSessionId) return;
    sessionTabRefs.current[selectedSessionId]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [selectedSessionId]);

  if (laneSessions.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 border-b border-dashed border-slate-300 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <span>{copy.noRunsInline}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-1 py-1">
      {error && (
        <div className="border-l-2 border-amber-300 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-700/80 dark:text-amber-200">
          Run ledger unavailable, using cached task history.
        </div>
      )}
      <div
        role="tablist"
        aria-label={copy.runs}
        className="flex min-w-0 flex-wrap items-end gap-1 border-b border-desktop-border"
      >
        {laneSessions.map((laneSession, index) => {
          const sessionId = laneSession.sessionId;
          const active = sessionId === selectedSessionId;
          const laneLabel = laneSession.columnName?.trim() || laneSession.columnId?.trim() || t.kanban.runLabel;
          const stepLabel = laneSession.stepName?.trim() || t.kanban.acpSession;
          const tabLabel = `# ${index + 1} ${laneLabel} - ${stepLabel}`;
          const fullTabLabel = `${tabLabel} · ${sessionId}`;

          return (
            <button
              key={sessionId}
              type="button"
              id={`kanban-session-tab-${task.id}-${index}`}
              role="tab"
              ref={(node) => {
                sessionTabRefs.current[sessionId] = node;
              }}
              onClick={() => onSelectSession?.(sessionId)}
              aria-selected={active}
              aria-controls={tabPanelId}
              tabIndex={active ? 0 : -1}
              title={fullTabLabel}
              aria-label={fullTabLabel}
              className={`shrink-0 border-b-2 px-3 py-1.5 text-[11px] font-medium transition-colors ${
                active
                  ? "border-b-desktop-accent bg-desktop-bg-active text-desktop-accent"
                  : "border-b-transparent text-desktop-text-secondary hover:bg-desktop-bg-active/70 hover:text-desktop-text-primary"
              }`}
            >
              {tabLabel}
            </button>
          );
        })}
      </div>
      {selectedLaneSession && (
        <div id={tabPanelId} className="border-b border-slate-200/80 dark:border-[#232736]">
          <KanbanSessionRunMetadata
            laneSession={selectedLaneSession}
            run={selectedRun}
            session={selectedSession}
            specialists={specialists}
            compact
          />
        </div>
      )}
    </div>
  );
}

export function KanbanEmptySessionPane({
  task,
  boardColumns,
  availableProviders,
  specialists,
  specialistLanguage = "en",
  autoProviderId,
}: {
  task: TaskInfo;
  boardColumns: KanbanColumnInfo[];
  availableProviders: AcpProviderInfo[];
  specialists: KanbanSpecialistOption[];
  specialistLanguage?: KanbanSpecialistLanguage;
  autoProviderId?: string;
}) {
  const { t } = useTranslation();
  const copy = getKanbanSessionCopy(specialistLanguage);
  const target = formatExpectedRunTarget(
    task,
    boardColumns,
    availableProviders,
    specialists,
    t.kanban.workspaceDefault,
    autoProviderId,
  );

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-slate-200/80 p-2 dark:border-[#202433]">
        <KanbanCardActivityBar
          task={task}
          specialistLanguage={specialistLanguage}
        />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <div className="w-full max-w-lg border border-slate-200/80 p-4 dark:border-[#232736]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-300">{copy.emptyPaneEyebrow}</div>
          <div className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">{copy.emptyPaneTitle}</div>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.emptyPaneDescription}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.emptyPaneHint}</p>
          <div className="mt-3 border-l-2 border-sky-300 bg-sky-50/50 px-3 py-2.5 text-sm font-medium text-sky-900 dark:border-sky-800/60 dark:bg-sky-900/20 dark:text-sky-100">
            {copy.expectedTarget(target)}
          </div>
        </div>
      </div>
    </div>
  );
}

function HandoffPanel({ task, compact = false }: { task: TaskInfo; compact?: boolean }) {
  const { t } = useTranslation();
  const handoffs = task.laneHandoffs ?? [];
  if (handoffs.length === 0) {
    return (
      <div className={`border-b border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400 ${compact ? "px-3 py-3" : "px-4 py-4"}`}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{t.kanban.laneHandoffs}</div>
        <div className="mt-2">{t.kanban.noLaneHandoffsYet}</div>
      </div>
    );
  }

  const orderedHandoffs = handoffs.slice().sort((left, right) => (
    new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime()
  ));

  return (
    <>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{t.kanban.laneHandoffs}</div>
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t.kanban.laneHandoffsDescription}
        </div>
      </div>
      <div className={`space-y-2 ${compact ? "mt-3" : "mt-4"}`}>
        {orderedHandoffs.map((handoff) => (
          <div
            key={handoff.id}
            className="border-b border-slate-200/70 px-3 py-2 dark:border-slate-700/70"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                {handoff.requestType.replace(/_/g, " ")}
              </span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                {handoff.status}
              </span>
            </div>
            <div className="mt-2 text-sm text-slate-800 dark:text-slate-200">{handoff.request}</div>
            {handoff.responseSummary && (
              <div className="mt-2 border-l-2 border-emerald-200 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/30 dark:text-emerald-200">
                {handoff.responseSummary}
              </div>
            )}
            <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              {t.kanban.requested} {formatSessionTimestamp(handoff.requestedAt)}{handoff.respondedAt ? ` · ${t.kanban.responded} ${formatSessionTimestamp(handoff.respondedAt)}` : ""}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function GitHubPanel({ task, compact = false }: { task: TaskInfo; compact?: boolean }) {
  const { t } = useTranslation();
  if (!task.githubNumber) {
    return null;
  }

  return (
    <div className={`border-b border-slate-200/70 dark:border-slate-700/70 ${compact ? "px-3 py-3" : "px-4 py-4"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">GitHub</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          {task.githubState ?? t.kanban.linkedLabel}
        </span>
        {task.githubRepo && (
          <span className="text-xs text-slate-500 dark:text-slate-400">{task.githubRepo}</span>
        )}
      </div>
      <a
        href={task.githubUrl}
        target="_blank"
        rel="noreferrer"
        className={`mt-3 inline-flex text-amber-600 hover:underline dark:text-amber-400 ${compact ? "text-[13px]" : "text-sm"}`}
      >
        #{task.githubNumber}
      </a>
      {task.githubSyncedAt && (
        <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          {t.kanban.syncedAt} {formatSessionTimestamp(task.githubSyncedAt)}
        </div>
      )}
    </div>
  );
}
