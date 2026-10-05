"use client";

import { GitBranch, Zap } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { CodebaseData } from "@/client/hooks/use-workspaces";
import type { AcpProviderInfo } from "@/client/acp-client";
import type { KanbanBoardInfo } from "../types";
import type { RepoSyncState } from "./kanban-repo-sync-status";

interface KanbanStatusBarProps {
  /** 当前默认仓库 */
  defaultCodebase: CodebaseData | null;
  /** 所有仓库列表 */
  codebases: CodebaseData[];
  /** 当前看板 */
  board: KanbanBoardInfo | null;
  /** 看板队列状态 */
  boardQueue?: KanbanBoardInfo["queue"];
  /** 看板与 session/repo 绑定健康状态 */
  repoHealth?: { missingRepoTasks: number; cwdMismatchTasks: number };
  /** 当前选中的 Provider */
  selectedProvider?: AcpProviderInfo | null;
  /** 点击仓库时的回调 */
  onRepoClick?: () => void;
  /** 点击 Provider 时的回调 */
  onProviderClick?: () => void;
  /** 仓库同步状态 */
  repoSync?: RepoSyncState;
}

export function KanbanStatusBar({
  defaultCodebase,
  codebases,
  board,
  boardQueue,
  repoHealth,
  selectedProvider,
  onRepoClick,
  onProviderClick,
  repoSync,
}: KanbanStatusBarProps) {
  const { t } = useTranslation();
  const repoCount = codebases.length;
  const repoDisplayName = defaultCodebase
    ? defaultCodebase.label ?? defaultCodebase.repoPath.split("/").pop() ?? defaultCodebase.repoPath
    : null;

  return (
    <div
      className="h-6 shrink-0 flex items-center justify-between border-t border-desktop-border bg-desktop-bg-tertiary text-[11px] select-none"
      data-testid="kanban-status-bar"
    >
      {/* 左侧：仓库和状态信息 */}
      <div className="flex items-center divide-x divide-desktop-border/50">
        {/* 仓库信息 */}
        {onRepoClick ? (
          <button
            onClick={onRepoClick}
            className="flex items-center gap-1.5 px-2.5 h-6 text-desktop-text-primary hover:bg-desktop-bg-active transition-colors"
            title={defaultCodebase
              ? `${defaultCodebase.repoPath}${defaultCodebase.branch ? ` @ ${defaultCodebase.branch}` : ""}`
              : t.kanbanBoard.noReposLinked}
          >
            <GitBranch className="w-3 h-3" />
            <span className="font-medium">{t.kanbanBoard.repos}</span>
            <span className="rounded-full bg-desktop-bg-active px-1.5 py-0.5 text-[10px] text-desktop-text-secondary">
              {repoCount}
            </span>
            {repoDisplayName ? (
              <span className="max-w-[180px] truncate text-desktop-text-secondary">
                {repoDisplayName}
              </span>
            ) : (
              <span className="max-w-[180px] truncate text-desktop-text-secondary">
                {t.kanbanBoard.noReposLinked}
              </span>
            )}
            {defaultCodebase?.branch && (
              <span className="text-desktop-text-secondary">@ {defaultCodebase.branch}</span>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 h-6 text-desktop-text-secondary">
            <GitBranch className="w-3 h-3" />
            <span className="font-medium">{t.kanbanBoard.repos}</span>
            <span className="rounded-full bg-desktop-bg-active px-1.5 py-0.5 text-[10px]">
              {repoCount}
            </span>
            <span>{repoDisplayName ?? t.kanbanBoard.noReposLinked}</span>
          </div>
        )}
      </div>

      {/* 右侧：同步状态、运行状态和 Provider */}
      <div className="flex items-center divide-x divide-desktop-border/50">
        {/* 看板健康 */}
        {repoHealth && (repoHealth.missingRepoTasks > 0 || repoHealth.cwdMismatchTasks > 0) && (
          <div className="flex items-center gap-2 px-2.5 h-6 text-amber-600 dark:text-amber-300">
            <span className="font-medium">{t.kanban.kanbanHealth}</span>
            {repoHealth.missingRepoTasks > 0 && (
              <span>{repoHealth.missingRepoTasks} {t.kanban.missing}</span>
            )}
            {repoHealth.cwdMismatchTasks > 0 && (
              <span>{repoHealth.cwdMismatchTasks} {t.kanban.sessionMismatch}</span>
            )}
          </div>
        )}

        {/* 同步状态 */}
        {repoSync && repoSync.status !== "idle" && (
          <div
            className="flex items-center gap-1.5 px-2.5 h-6 text-desktop-text-secondary text-[11px]"
            data-testid="kanban-repo-sync-progress"
          >
            <span
              className={`w-1.5 h-1.5 shrink-0 rounded-full ${
                repoSync.status === "error"
                  ? "bg-rose-500"
                  : repoSync.status === "done"
                    ? "bg-emerald-500"
                    : "animate-pulse bg-sky-500"
              }`}
            />
            <span className="max-w-[150px] truncate">
              {repoSync.status === "syncing"
                ? repoSync.total > 0
                  ? `${t.kanban.syncingProgress} ${repoSync.completed}/${repoSync.total}`
                  : t.kanban.syncingRepos
                : repoSync.status === "done"
                  ? `${repoSync.total} ${repoSync.total === 1 ? t.kanban.repoUpdated : t.kanban.reposUpdated}`
                  : t.kanban.syncIssue}
            </span>
          </div>
        )}

        {/* 运行状态 */}
        {board && (
          <div className="flex items-center gap-2 px-2.5 h-6 text-desktop-text-secondary">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {t.kanban.runningLabel} {boardQueue?.runningCount ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {t.kanban.queuedLabel} {boardQueue?.queuedCount ?? 0}
            </span>
          </div>
        )}

        {/* Provider */}
        {selectedProvider && (
          <button
            onClick={onProviderClick}
            className="flex items-center gap-1.5 px-2.5 h-6 text-desktop-text-primary hover:bg-desktop-bg-active transition-colors"
            title={selectedProvider.description}
          >
            <Zap className="w-3 h-3" />
            <span className="max-w-[120px] truncate">{selectedProvider.name}</span>
          </button>
        )}
      </div>
    </div>
  );
}
