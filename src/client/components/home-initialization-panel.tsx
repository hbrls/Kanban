"use client";

import { Check, Circle, CircleOff, LoaderCircle, TriangleAlert, XCircle } from "lucide-react";

import type {
  HomeInitializationStep,
  HomeInitializationStepId,
  HomeInitializationStepStatus,
} from "@/client/hooks/use-home-initialization";
import { useTranslation } from "@/i18n";

export interface HomeInitializationPanelProps {
  steps: HomeInitializationStep[];
  completedCount: number;
  totalCount: number;
  hasAttention: boolean;
  hasError: boolean;
  /** True once every step reached a terminal status. */
  settled: boolean;
  onConfigureProviders: () => void;
  onAddCodebase: () => void;
}

const CARD_CLS =
  "rounded-[20px] border border-black/6 bg-white/80 px-5 py-4 dark:border-white/8 dark:bg-white/5";
const HEAD_CLS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500";
const ACTION_CLS =
  "rounded-full border border-black/8 px-3 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-black/4 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10";

function StatusIcon({ status }: { status: HomeInitializationStepStatus }) {
  switch (status) {
    case "running":
      return <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-desktop-accent" />;
    case "success":
      return <Check className="h-4 w-4 shrink-0 text-emerald-500" />;
    case "attention":
      return <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />;
    case "error":
      return <XCircle className="h-4 w-4 shrink-0 text-rose-500" />;
    case "skipped":
      return <CircleOff className="h-4 w-4 shrink-0 text-slate-400" />;
    default:
      return <Circle className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />;
  }
}

export function HomeInitializationPanel({
  steps,
  completedCount,
  totalCount,
  hasAttention,
  hasError,
  settled,
  onConfigureProviders,
  onAddCodebase,
}: HomeInitializationPanelProps) {
  const { t } = useTranslation();
  const attentionCount = steps.filter((step) => step.status === "attention").length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const errorText = (error?: Error): string => error?.message || t.homeInitialization.statusError;

  const stepTitle = (id: HomeInitializationStepId): string => {
    switch (id) {
      case "workspaces":
        return t.homeInitialization.stepWorkspaces;
      case "active-workspace":
        return t.homeInitialization.stepActiveWorkspace;
      case "runtime":
        return t.homeInitialization.stepRuntime;
      case "codebases":
        return t.homeInitialization.stepCodebases;
      case "repo-access":
        return t.homeInitialization.stepRepoAccess;
      default:
        return t.homeInitialization.stepRecentSessions;
    }
  };

  const statusLabel = (status: HomeInitializationStepStatus): string => {
    switch (status) {
      case "running":
        return t.homeInitialization.statusRunning;
      case "success":
        return t.homeInitialization.statusSuccess;
      case "attention":
        return t.homeInitialization.statusAttention;
      case "error":
        return t.homeInitialization.statusError;
      case "skipped":
        return t.homeInitialization.statusSkipped;
      default:
        return t.homeInitialization.statusPending;
    }
  };

  const stepSummary = (step: HomeInitializationStep): string => {
    if (step.status === "pending") {
      return t.homeInitialization.waiting;
    }
    if (step.status === "skipped") {
      return step.skippedReason === "empty" && step.id === "codebases"
        ? t.homeInitialization.notConfigured
        : t.homeInitialization.statusSkipped;
    }
    if (step.status === "error") {
      return errorText(step.loadError);
    }

    switch (step.id) {
      case "workspaces":
        if (step.status === "running") return t.homeInitialization.running;
        return t.homeInitialization.workspacesCount.replace("{count}", String(step.count ?? 0));
      case "active-workspace":
        if (step.status === "running") return t.homeInitialization.running;
        return step.subject ?? t.homeInitialization.running;
      case "runtime":
        if (step.status === "running") return t.homeInitialization.running;
        return step.status === "attention"
          ? t.homeInitialization.runtimeNoProviders
          : t.homeInitialization.runtimeConnected.replace("{count}", String(step.availableProviders ?? 0));
      case "codebases":
        if (step.status === "running") return t.homeInitialization.running;
        return t.homeInitialization.codebasesCount.replace("{count}", String(step.count ?? 0));
      case "repo-access":
        if (step.status === "running") return t.homeInitialization.running;
        return step.status === "attention"
          ? t.homeInitialization.repoAccessProblems.replace("{count}", String(step.count ?? 0))
          : t.homeInitialization.repoAccessReachable;
      default:
        if (step.status === "running") return t.homeInitialization.running;
        return step.count
          ? t.homeInitialization.sessionsCount.replace("{count}", String(step.count))
          : t.homeInitialization.noRecentSessions;
    }
  };

  const renderActions = (step: HomeInitializationStep) => {
    const actions: React.ReactNode[] = [];

    if (step.id === "runtime" && (step.status === "attention" || step.status === "error")) {
      actions.push(
        <button key="configure" type="button" className={ACTION_CLS} onClick={onConfigureProviders}>
          {t.homeInitialization.actionConfigureProvider}
        </button>,
      );
    }

    if (step.id === "codebases" && step.status === "skipped" && step.skippedReason === "empty") {
      actions.push(
        <button key="add-codebase" type="button" className={ACTION_CLS} onClick={onAddCodebase}>
          {t.homeInitialization.actionAddCodebase}
        </button>,
      );
    }

    return actions;
  };

  const needsWorkspace = steps.some(
    (step) => step.id === "workspaces" && step.status === "success" && (step.count ?? 0) === 0,
  );

  const headline = hasError
    ? t.homeInitialization.summaryFailed
    : hasAttention
      ? t.homeInitialization.summaryAttention.replace("{count}", String(attentionCount))
      : needsWorkspace
        ? t.homeInitialization.noWorkspaces
        : settled
          ? t.homeInitialization.summaryReady
          : t.homeInitialization.progressLabel;

  return (
    <section className={CARD_CLS} data-testid="home-initialization-panel">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className={HEAD_CLS}>{t.homeInitialization.title}</span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {completedCount} / {totalCount}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{headline}</span>
        </div>
      </div>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-black/6 dark:bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            hasError ? "bg-rose-400" : hasAttention ? "bg-amber-400" : "bg-emerald-500"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="mt-4 space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2">
            <span className="mt-[3px]">
              <StatusIcon status={step.status} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm text-slate-700 dark:text-slate-200">{stepTitle(step.id)}</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">{statusLabel(step.status)}</span>
              </div>
              <div className="mt-0.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                {stepSummary(step)}
              </div>
              {renderActions(step).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2">{renderActions(step)}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
