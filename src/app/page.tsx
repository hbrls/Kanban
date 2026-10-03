"use client";

/**
 * Home - /
 * The startup surface: it runs the initialization chain for the current
 * workspace and reports how far that chain got.
 */

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { RepoSelection } from "@/client/components/repo-picker";
import { RepoPicker } from "@/client/components/repo-picker";
import { SettingsPanel } from "@/client/components/settings-panel";
import type { SettingsTab } from "@/client/components/settings-panel-shared";
import { DesktopAppShell } from "@/client/components/desktop-app-shell";
import { HomeInitializationPanel } from "@/client/components/home-initialization-panel";
import { WorkspaceSwitcher } from "@/client/components/workspace-switcher";
import { useHomeInitialization } from "@/client/hooks/use-home-initialization";
import { desktopAwareFetch } from "@/client/utils/diagnostics";
import { useTranslation } from "@/i18n";

const CARD_CLS =
  "rounded-[20px] border border-black/6 bg-white/80 px-5 py-4 dark:border-white/8 dark:bg-white/5";
const HEAD_CLS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500";

function HomePageContent() {
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  const initialization = useHomeInitialization({
    requestedWorkspaceId: searchParams.get("workspace"),
  });
  const { acp, activeWorkspace, activeWorkspaceId, workspaces } = initialization;

  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [workspaceTitleDraft, setWorkspaceTitleDraft] = useState("");
  const [workspaceCreateFailed, setWorkspaceCreateFailed] = useState(false);

  const handleOpenProviders = useCallback(() => {
    setSettingsInitialTab("providers");
    setShowSettingsPanel(true);
  }, []);

  const handleCreateWorkspace = useCallback(async (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    setWorkspaceCreateFailed(false);
    const created = await initialization.createWorkspace(trimmed);
    if (created) {
      setWorkspaceTitleDraft("");
      return;
    }
    setWorkspaceCreateFailed(true);
  }, [initialization]);

  const handleAddCodebase = useCallback(async (selection: RepoSelection) => {
    const targetWorkspaceId = activeWorkspaceId ?? workspaces[0]?.id;
    if (!targetWorkspaceId) {
      return false;
    }

    const response = await desktopAwareFetch(`/api/workspaces/${encodeURIComponent(targetWorkspaceId)}/codebases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoPath: selection.path,
        branch: selection.branch || undefined,
        label: selection.name || undefined,
      }),
    });

    if (!response.ok) {
      return false;
    }

    await initialization.refreshCodebases();
    return true;
  }, [activeWorkspaceId, workspaces, initialization]);

  const hasWorkspace = workspaces.length > 0;

  return (
    <DesktopAppShell
      workspaceId={activeWorkspaceId}
      workspaceTitle={activeWorkspace?.title ?? undefined}
      workspaceSwitcher={(
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          activeWorkspaceTitle={activeWorkspace?.title ?? undefined}
          onSelect={initialization.setActiveWorkspaceId}
          onCreate={async (title) => {
            await initialization.createWorkspace(title);
          }}
          loading={initialization.workspacesLoading}
          compact
          desktop
        />
      )}
    >
      <div className="flex h-full min-h-0 bg-[#f6f4ef] dark:bg-[#0c1118]">
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-8 lg:px-10 lg:py-10">
            <HomeInitializationPanel
              steps={initialization.steps}
              completedCount={initialization.completedCount}
              totalCount={initialization.totalCount}
              hasAttention={initialization.hasAttention}
              hasError={initialization.steps.some((step) => step.status === "error")}
              settled={initialization.settled}
              onConfigureProviders={handleOpenProviders}
              onAddCodebase={() => setShowRepoPicker(true)}
            />

            {!hasWorkspace && (
              <section className={CARD_CLS}>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t.homeInitialization.createWorkspaceTitle}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {t.homeInitialization.createWorkspaceHint}
                </p>
                <form
                  className="mt-4 flex flex-wrap items-center gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await handleCreateWorkspace(workspaceTitleDraft);
                  }}
                >
                  <input
                    value={workspaceTitleDraft}
                    onChange={(event) => setWorkspaceTitleDraft(event.target.value)}
                    placeholder={t.homeInitialization.createWorkspacePlaceholder}
                    className="min-w-0 flex-1 rounded-xl border border-black/8 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-desktop-accent dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-desktop-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    {t.common.create}
                  </button>
                </form>
                {workspaceCreateFailed && (
                  <p className="mt-2 text-[11px] text-rose-500">{t.homeInitialization.createWorkspaceFailed}</p>
                )}
              </section>
            )}

            {showRepoPicker && (
              <section className={CARD_CLS}>
                <div className="mb-3 flex items-center justify-between">
                  <span className={HEAD_CLS}>{t.homeInitialization.actionAddCodebase}</span>
                  <button
                    type="button"
                    onClick={() => setShowRepoPicker(false)}
                    className="text-[11px] text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  >
                    {t.common.close}
                  </button>
                </div>
                <RepoPicker
                  value={null}
                  onChange={async (selection) => {
                    if (!selection) return;
                    await handleAddCodebase(selection);
                    setShowRepoPicker(false);
                  }}
                />
              </section>
            )}
          </div>
        </main>
      </div>

      <SettingsPanel
        open={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        providers={acp.providers}
        initialTab={settingsInitialTab}
      />
    </DesktopAppShell>
  );
}

function HomePageFallback() {
  const { t } = useTranslation();

  return (
    <div className="desktop-theme flex h-screen items-center justify-center bg-desktop-bg-primary">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-desktop-accent border-t-transparent" />
        <p className="text-sm text-desktop-text-secondary">{t.common.loading}</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomePageFallback />}>
      <HomePageContent />
    </Suspense>
  );
}
