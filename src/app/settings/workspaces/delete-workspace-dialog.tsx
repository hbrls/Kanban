"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import {
  DEFAULT_WORKSPACE_ID,
  WorkspaceMutationError,
  type WorkspaceData,
} from "@/client/hooks/use-workspaces";

type DeleteWorkspaceDialogProps = {
  workspace: WorkspaceData;
  deleteWorkspace: (id: string) => Promise<void>;
  onClose: () => void;
  onDeleted: () => void;
};

export function DeleteWorkspaceDialog({
  workspace,
  deleteWorkspace,
  onClose,
  onDeleted,
}: DeleteWorkspaceDialogProps) {
  const { t } = useTranslation();
  const copy = t.settingsExtended;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  const requestClose = () => {
    if (pending) return;
    dialogRef.current?.close();
  };

  const handleConfirm = async () => {
    if (submittingRef.current) return;
    if (workspace.id === DEFAULT_WORKSPACE_ID) {
      setMutationError(copy.workspacesDefaultProtected);
      return;
    }
    submittingRef.current = true;
    setPending(true);
    setMutationError(null);
    try {
      await deleteWorkspace(workspace.id);
      dialogRef.current?.close();
      onDeleted();
    } catch (err) {
      if (err instanceof WorkspaceMutationError && err.status === 409) {
        setMutationError(copy.workspacesDefaultProtected);
      } else {
        setMutationError(copy.workspacesDeleteFailed);
      }
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="delete-workspace-dialog-title"
      aria-describedby="delete-workspace-dialog-body"
      className="w-full max-w-md rounded-xl border border-desktop-border bg-desktop-bg-primary p-0 shadow-xl backdrop:bg-black/40"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={onClose}
    >
      <div className="px-5 py-4">
        <h2
          id="delete-workspace-dialog-title"
          className="text-sm font-semibold text-desktop-text-primary"
        >
          {copy.workspacesDeleteTitle.replace("{title}", workspace.title)}
        </h2>
        <p className="mt-1 font-mono text-[10px] text-desktop-text-tertiary">{workspace.id}</p>
        <div id="delete-workspace-dialog-body" className="mt-3 space-y-2">
          <p className="text-xs leading-5 text-desktop-text-secondary">{copy.workspacesDeleteBody}</p>
          <p className="text-[11px] leading-5 text-desktop-text-tertiary">{copy.workspacesDeleteNote}</p>
        </div>
        {mutationError ? (
          <p role="alert" className="mt-3 text-[11px] text-desktop-danger-text">
            {mutationError}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={requestClose}
            disabled={pending}
            className="rounded-lg border border-desktop-border px-3 py-1.5 text-xs font-medium text-desktop-text-secondary transition-colors hover:bg-desktop-bg-secondary disabled:opacity-50"
          >
            {copy.workspacesCancel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="rounded-lg bg-desktop-danger-solid px-3 py-1.5 text-xs font-medium text-desktop-danger-on-solid transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? copy.workspacesDeleteSubmitting : copy.workspacesDeleteConfirm}
          </button>
        </div>
      </div>
    </dialog>
  );
}
