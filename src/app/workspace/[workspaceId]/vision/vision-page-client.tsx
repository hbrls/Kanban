"use client";

/**
 * Vision page client entry: resolves the workspace id from the route (or the
 * real URL in static placeholder mode), wraps the canvas in the desktop
 * shell, and provides the local reset-layout action.
 */
import React, { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { DesktopAppShell } from "@/client/components/desktop-app-shell";
import { WorkspaceSwitcher } from "@/client/components/workspace-switcher";
import { useWorkspaces } from "@/client/hooks/use-workspaces";
import { useTranslation } from "@/i18n";

const VisionCanvas = dynamic(
  () => import("./vision-canvas").then((mod) => mod.VisionCanvas),
  { ssr: false },
);

export function VisionPageClient() {
  const params = useParams();
  const router = useRouter();
  const rawWorkspaceId = (params.workspaceId as string) ?? "";
  const workspaceId =
    rawWorkspaceId === "__placeholder__" && typeof window !== "undefined"
      ? (window.location.pathname.match(/^\/workspace\/([^/]+)/)?.[1] ?? rawWorkspaceId)
      : rawWorkspaceId;
  const { t } = useTranslation();
  const workspacesHook = useWorkspaces();
  const [resetToken, setResetToken] = useState(0);

  const workspace = workspacesHook.workspaces.find((w) => w.id === workspaceId);
  const activeWorkspaceTitle =
    workspace?.title ?? (workspaceId === "default" ? t.workspace.defaultWorkspace : workspaceId);

  const handleWorkspaceSelect = useCallback((nextWorkspaceId: string) => {
    router.push(`/workspace/${nextWorkspaceId}/vision`);
  }, [router]);

  const handleWorkspaceCreate = useCallback(async (title: string) => {
    const workspaceResult = await workspacesHook.createWorkspace(title);
    if (workspaceResult) {
      router.push(`/workspace/${workspaceResult.id}/vision`);
    }
  }, [router, workspacesHook]);

  const handleResetLayout = useCallback(() => {
    setResetToken((token) => token + 1);
  }, []);

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
      <div
        className="flex h-full flex-col overflow-hidden bg-desktop-bg-primary"
        data-testid="vision-page-shell"
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-desktop-border bg-desktop-bg-secondary px-4">
          <h1 className="text-sm font-semibold text-desktop-text-primary">
            {t.vision.pageTitle}
          </h1>
          <button
            type="button"
            onClick={handleResetLayout}
            className="flex items-center gap-1.5 rounded-lg border border-desktop-border px-2.5 py-1 text-xs text-desktop-text-secondary transition-colors hover:bg-desktop-bg-active hover:text-desktop-text-primary"
            title={t.vision.resetLayout}
            aria-label={t.vision.resetLayout}
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
            <span>{t.vision.resetLayout}</span>
          </button>
        </div>
        <VisionCanvas resetToken={resetToken} />
      </div>
    </DesktopAppShell>
  );
}
