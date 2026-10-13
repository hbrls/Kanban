/**
 * Settings / Workspaces - /settings/workspaces
 * Table of every workspace record (active + archived) with linked repositories,
 * plus create and guarded delete flows.
 */
"use client";

import { useMemo, useRef, useState } from "react";
import { Layers, Plus } from "lucide-react";
import { useTranslation } from "@/i18n";
import { SettingsRouteShell } from "@/client/components/settings-route-shell";
import { SettingsPageHeader } from "@/client/components/settings-page-header";
import {
  DEFAULT_WORKSPACE_ID,
  useWorkspaces,
  type WorkspaceData,
} from "@/client/hooks/use-workspaces";
import { WorkspacesTable } from "./workspaces-table";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { DeleteWorkspaceDialog } from "./delete-workspace-dialog";

type WorkspaceDialogState =
  | { kind: "create" }
  | { kind: "delete"; workspace: WorkspaceData }
  | null;

function toTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function WorkspacesSettingsPage() {
  const { t } = useTranslation();
  const copy = t.settingsExtended;
  const { workspaces, loading, error, fetchWorkspaces, createWorkspace, deleteWorkspace } =
    useWorkspaces({ status: "all" });
  const [dialog, setDialog] = useState<WorkspaceDialogState>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  const sortedWorkspaces = useMemo(
    () => [...workspaces].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt)),
    [workspaces],
  );

  const openDeleteDialog = (workspace: WorkspaceData) => {
    if (workspace.id === DEFAULT_WORKSPACE_ID) return;
    setDialog({ kind: "delete", workspace });
  };

  return (
    <SettingsRouteShell
      activeSettingsItem="workspaces"
      title={copy.workspacesTitle}
      description={copy.workspacesDesc}
      badgeLabel={copy.workspacesBadge}
      contentClassName="flex h-full min-h-0 w-full flex-col"
      icon={(
        <Layers className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}/>
      )}
      summary={[
        { label: copy.workspacesScopeLabel, value: copy.workspacesScopeValue },
      ]}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <SettingsPageHeader
          title={copy.workspacesTitle}
          description={copy.workspacesDesc}
          extra={(
            <button
              ref={addButtonRef}
              type="button"
              onClick={() => setDialog({ kind: "create" })}
              className="inline-flex items-center gap-1 rounded-lg bg-desktop-accent px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              {copy.workspacesAdd}
            </button>
          )}
          metadata={[
            {
              label: copy.workspacesCountLabel,
              value: loading || error ? "—" : String(sortedWorkspaces.length),
            },
            { label: copy.workspacesScopeLabel, value: copy.workspacesScopeValue },
          ]}
        />
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {loading ? (
            <p className="text-xs text-desktop-text-secondary">{copy.workspacesLoading}</p>
          ) : error ? (
            <div className="rounded-xl border border-desktop-border bg-desktop-bg-secondary px-4 py-3">
              <p className="text-xs font-semibold text-desktop-text-primary">{copy.workspacesLoadFailed}</p>
              <p className="mt-1 font-mono text-[11px] text-desktop-text-secondary">{error.message}</p>
              <button
                type="button"
                onClick={() => void fetchWorkspaces()}
                className="mt-2 rounded-lg border border-desktop-border px-2.5 py-1 text-[11px] font-medium text-desktop-text-secondary transition-colors hover:bg-desktop-bg-primary"
              >
                {copy.workspacesRetryLoad}
              </button>
            </div>
          ) : sortedWorkspaces.length === 0 ? (
            <p className="text-xs text-desktop-text-secondary">{copy.workspacesEmpty}</p>
          ) : (
            <WorkspacesTable workspaces={sortedWorkspaces} onDelete={openDeleteDialog} />
          )}
        </div>
      </div>
      {dialog?.kind === "create" ? (
        <CreateWorkspaceDialog
          createWorkspace={createWorkspace}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteWorkspaceDialog
          workspace={dialog.workspace}
          deleteWorkspace={deleteWorkspace}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            addButtonRef.current?.focus();
          }}
        />
      ) : null}
    </SettingsRouteShell>
  );
}
