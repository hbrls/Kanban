"use client";

import { Trash2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import {
  DEFAULT_WORKSPACE_ID,
  useCodebases,
  type CodebaseData,
  type WorkspaceData,
} from "@/client/hooks/use-workspaces";

const cellClass = "align-top px-3 py-2 text-xs text-desktop-text-secondary";

function repoDisplayName(codebase: CodebaseData): string {
  const label = codebase.label?.trim();
  if (label) return label;
  const segments = codebase.repoPath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? codebase.repoPath;
}

function MetadataCell({ metadata }: { metadata: Record<string, string> }) {
  return (
    <pre className="font-mono text-[11px] whitespace-pre-wrap break-all">
      {JSON.stringify(metadata ?? {}, null, 2)}
    </pre>
  );
}

function RepositoriesCell({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const copy = t.settingsExtended;
  const { codebases, loading, error } = useCodebases(workspaceId);

  if (loading) {
    return <span className="text-desktop-text-tertiary">{copy.workspacesReposLoading}</span>;
  }
  if (error) {
    return (
      <span className="text-desktop-text-tertiary" title={error.message}>
        {copy.workspacesReposFailed}
      </span>
    );
  }
  if (codebases.length === 0) {
    return <span className="text-desktop-text-tertiary">{copy.workspacesReposEmpty}</span>;
  }

  const ordered = [...codebases].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  return (
    <ul className="space-y-2">
      {ordered.map((codebase) => (
        <li key={codebase.id}>
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-desktop-text-primary">{repoDisplayName(codebase)}</span>
            {codebase.isDefault ? (
              <span className="rounded-full bg-desktop-bg-active px-1.5 py-0.5 text-[10px] font-semibold text-desktop-accent">
                {copy.workspacesRepoDefault}
              </span>
            ) : null}
          </div>
          <div className="font-mono text-[11px] text-desktop-text-secondary break-all">
            {codebase.repoPath}
            {codebase.branch ? ` · ${codebase.branch}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}

function WorkspaceRow({
  workspace,
  onDelete,
}: {
  workspace: WorkspaceData;
  onDelete: (workspace: WorkspaceData) => void;
}) {
  const { t } = useTranslation();
  const copy = t.settingsExtended;
  const isActive = workspace.status === "active";
  const isDefault = workspace.id === DEFAULT_WORKSPACE_ID;

  return (
    <tr className="border-t border-desktop-border">
      <td className={`${cellClass} text-desktop-text-primary`}>{workspace.title}</td>
      <td className={cellClass}>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            isActive
              ? "bg-desktop-bg-active text-desktop-accent"
              : "bg-desktop-bg-active/60 text-desktop-text-secondary"
          }`}
        >
          {isActive ? copy.workspacesStatusActive : copy.workspacesStatusArchived}
        </span>
      </td>
      <td className={cellClass}>
        <RepositoriesCell workspaceId={workspace.id} />
      </td>
      <td className={cellClass}>
        <MetadataCell metadata={workspace.metadata} />
      </td>
      <td className={cellClass}>
        {isDefault ? (
          <div>
            <button
              type="button"
              disabled
              aria-label={copy.workspacesDeleteAria.replace("{title}", workspace.title)}
              className="inline-flex items-center gap-1 rounded-md border border-desktop-border px-2 py-1 text-[11px] font-medium text-desktop-text-tertiary opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              {copy.workspacesDelete}
            </button>
            <p className="mt-1 text-[10px] text-desktop-text-tertiary">
              {copy.workspacesDefaultProtected}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onDelete(workspace)}
            aria-label={copy.workspacesDeleteAria.replace("{title}", workspace.title)}
            className="inline-flex items-center gap-1 rounded-md border border-desktop-danger-border px-2 py-1 text-[11px] font-medium text-desktop-danger-text transition-colors hover:bg-desktop-danger-subtle"
          >
            <Trash2 className="h-3 w-3" />
            {copy.workspacesDelete}
          </button>
        )}
      </td>
    </tr>
  );
}

export function WorkspacesTable({
  workspaces,
  onDelete,
}: {
  workspaces: WorkspaceData[];
  onDelete: (workspace: WorkspaceData) => void;
}) {
  const { t } = useTranslation();
  const copy = t.settingsExtended;
  const headerClass =
    "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-desktop-text-tertiary";

  return (
    <div className="overflow-auto rounded-xl border border-desktop-border">
      <table className="w-full min-w-max border-collapse">
        <thead className="bg-desktop-bg-secondary">
          <tr>
            <th className={headerClass}>{copy.workspacesColTitle}</th>
            <th className={headerClass}>{copy.workspacesColStatus}</th>
            <th className={headerClass}>{copy.workspacesColRepos}</th>
            <th className={headerClass}>{copy.workspacesColMetadata}</th>
            <th className={headerClass}>{copy.workspacesColActions}</th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((workspace) => (
            <WorkspaceRow key={workspace.id} workspace={workspace} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
