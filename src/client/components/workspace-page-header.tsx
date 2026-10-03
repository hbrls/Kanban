import { useTranslation } from "@/i18n";
import { PanelTop } from "lucide-react";


interface WorkspacePageHeaderProps {
  title: string;
  workspaceId: string;
  boardName: string;
  latestSessionName: string;
  activeAgentsCount: number;
  pendingTasksCount: number;
  onRefresh: () => void;
  onKanban?: () => void;
  onTeam?: () => void;
  onTraces?: () => void;
}

export function WorkspacePageHeader({
  title,
  workspaceId,
  boardName,
  latestSessionName,
  activeAgentsCount,
  pendingTasksCount,
  onRefresh,
  onKanban,
  onTeam,
  onTraces,
}: WorkspacePageHeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-desktop-border pb-3" data-testid="workspace-page-header">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <PanelTop className="h-4 w-4 shrink-0 text-desktop-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
          <h1 className="truncate text-[14px] font-semibold text-desktop-text-primary">{title}</h1>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-desktop-border bg-desktop-bg-secondary px-2.5 py-1 text-[10px] text-desktop-text-secondary">
            <span>{t.workspace.workspaceLabel}</span>
            <code className="font-mono text-desktop-text-primary">{workspaceId}</code>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-desktop-border bg-desktop-bg-secondary px-2.5 py-1 text-[10px] text-desktop-text-secondary">
            <span>{boardName}</span>
            <span className="opacity-40">/</span>
            <span>{latestSessionName}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-desktop-border bg-desktop-bg-secondary px-2.5 py-1 text-[10px] text-desktop-text-secondary">
            <span>{activeAgentsCount > 0 ? `${activeAgentsCount} ${t.workspace.activeAgents}` : t.workspace.standby}</span>
            <span className="opacity-40">/</span>
            <span>{pendingTasksCount > 0 ? `${pendingTasksCount} ${t.workspace.inFlight}` : t.workspace.noPendingTasks}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md bg-desktop-bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-desktop-text-secondary transition-colors hover:bg-desktop-bg-active/70 hover:text-desktop-text-primary"
        >
          {t.common.refresh}
        </button>
        {onTeam ? (
          <button
            type="button"
            onClick={onTeam}
            className="rounded-md bg-desktop-bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-desktop-text-secondary transition-colors hover:bg-desktop-bg-active/70 hover:text-desktop-text-primary"
          >
            {t.nav.team}
          </button>
        ) : null}
        {onKanban ? (
          <button
            type="button"
            onClick={onKanban}
            className="rounded-md bg-desktop-accent px-2.5 py-1.5 text-[11px] font-medium text-desktop-accent-text transition-colors hover:opacity-90"
          >
            {t.nav.kanban}
          </button>
        ) : null}
        {onTraces ? (
          <button
            type="button"
            onClick={onTraces}
            className="rounded-md bg-desktop-bg-secondary px-2.5 py-1.5 text-[11px] font-medium text-desktop-text-secondary transition-colors hover:bg-desktop-bg-active/70 hover:text-desktop-text-primary"
          >
            {t.nav.traces}
          </button>
        ) : null}
      </div>
    </header>
  );
}
