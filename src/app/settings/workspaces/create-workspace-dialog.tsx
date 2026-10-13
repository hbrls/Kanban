"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import type { WorkspaceData } from "@/client/hooks/use-workspaces";

type CreateWorkspaceDialogProps = {
  createWorkspace: (title: string) => Promise<WorkspaceData | null>;
  onClose: () => void;
};

export function CreateWorkspaceDialog({ createWorkspace, onClose }: CreateWorkspaceDialogProps) {
  const { t } = useTranslation();
  const copy = t.settingsExtended;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    }
  }, []);

  const requestClose = () => {
    if (pending) return;
    dialogRef.current?.close();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setMutationError(copy.workspacesNameRequired);
      return;
    }
    submittingRef.current = true;
    setPending(true);
    setMutationError(null);
    try {
      const created = await createWorkspace(trimmed);
      if (!created) {
        setMutationError(copy.workspacesCreateFailed);
        return;
      }
      dialogRef.current?.close();
    } catch {
      setMutationError(copy.workspacesCreateFailed);
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="create-workspace-dialog-title"
      className="w-full max-w-sm rounded-xl border border-desktop-border bg-desktop-bg-primary p-0 shadow-xl backdrop:bg-black/40"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="px-5 py-4">
        <h2
          id="create-workspace-dialog-title"
          className="text-sm font-semibold text-desktop-text-primary"
        >
          {copy.workspacesCreateTitle}
        </h2>
        <div className="mt-3">
          <label
            htmlFor="create-workspace-name"
            className="block text-[11px] font-medium text-desktop-text-secondary"
          >
            {copy.workspacesCreateNameLabel}
          </label>
          <input
            ref={inputRef}
            id="create-workspace-name"
            type="text"
            value={title}
            disabled={pending}
            placeholder={copy.workspacesCreateNamePlaceholder}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-lg border border-desktop-border bg-desktop-bg-secondary px-3 py-2 text-xs text-desktop-text-primary outline-none focus:border-desktop-accent disabled:opacity-50"
          />
        </div>
        {mutationError ? (
          <p role="alert" className="mt-2 text-[11px] text-desktop-danger-text">
            {mutationError}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={requestClose}
            disabled={pending}
            className="rounded-lg border border-desktop-border px-3 py-1.5 text-xs font-medium text-desktop-text-secondary transition-colors hover:bg-desktop-bg-secondary disabled:opacity-50"
          >
            {copy.workspacesCancel}
          </button>
          <button
            type="submit"
            disabled={pending || !title.trim()}
            className="rounded-lg bg-desktop-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? copy.workspacesCreateSubmitting : copy.workspacesCreateSubmit}
          </button>
        </div>
      </form>
    </dialog>
  );
}
