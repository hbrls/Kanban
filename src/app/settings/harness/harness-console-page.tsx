"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@/i18n";
import { DesktopAppShell } from "@/client/components/desktop-app-shell";
import { RepoPicker, type RepoSelection } from "@/client/components/repo-picker";
import { WorkspaceSwitcher } from "@/client/components/workspace-switcher";
import {
  HarnessExecutionPlanFlow,
  type TierValue,
} from "@/client/components/harness-execution-plan-flow";
import { HarnessGovernanceLoopGraph } from "@/client/components/harness-governance-loop-graph";
import { HarnessLifecycleView } from "@/client/components/harness-lifecycle-view";
import { getHarnessUnsupportedRepoMessage } from "@/client/components/harness-support-state";
import { useHarnessSettingsData } from "@/client/hooks/use-harness-settings-data";
import { useCodebases, useWorkspaces } from "@/client/hooks/use-workspaces";
import { loadRepoSelection, saveRepoSelection } from "@/client/utils/repo-selection-storage";
import { normalizeWorkspaceQueryId, resolveWorkspaceSelection } from "@/client/utils/workspace-id";

type SectionId =
  | "overview";

interface SectionDef {
  id: SectionId;
  label: string;
  shortLabel: string;
  code: string;
}

const DEFAULT_EXPLORER_WIDTH = 240;
const MIN_EXPLORER_WIDTH = 220;
const MAX_EXPLORER_WIDTH = 460;
const HARNESS_SECTION_QUERY_KEY = "section";
const DEFAULT_SECTION: SectionId = "overview";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolveSectionId(value: string | null | undefined): SectionId {
  return value === "overview" ? "overview" : DEFAULT_SECTION;
}

export default function HarnessConsolePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspacesHook = useWorkspaces();
  const sectionFromUrl = resolveSectionId(searchParams.get(HARNESS_SECTION_QUERY_KEY));
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const urlWorkspaceId = normalizeWorkspaceQueryId(searchParams.get("workspaceId"));
  const workspaceId = resolveWorkspaceSelection(
    selectedWorkspaceId,
    urlWorkspaceId,
    workspacesHook.workspaces,
  );
  const { codebases } = useCodebases(workspaceId);
  const [selectedCodebaseId, setSelectedCodebaseId] = useState("");
  const [selectedRepoOverrideState, setSelectedRepoOverrideState] = useState<{
    workspaceId: string;
    selection: RepoSelection | null;
  }>({ workspaceId: "", selection: null });
  const [selectedTier, setSelectedTier] = useState<TierValue>("normal");

  const rawPersistedRepoSelection = useMemo(
    () => loadRepoSelection("harness", workspaceId),
    [workspaceId],
  );

  const activeWorkspaceTitle = useMemo(() => {
    return workspacesHook.workspaces.find((workspace) => workspace.id === workspaceId)?.title
      ?? workspacesHook.workspaces[0]?.title
      ?? undefined;
  }, [workspaceId, workspacesHook.workspaces]);

  const activeCodebase = useMemo(() => {
    const effectiveCodebaseId = codebases.some((codebase) => codebase.id === selectedCodebaseId)
      ? selectedCodebaseId
      : (codebases.find((codebase) => codebase.isDefault)?.id ?? codebases[0]?.id ?? "");
    return codebases.find((codebase) => codebase.id === effectiveCodebaseId) ?? null;
  }, [codebases, selectedCodebaseId]);

  const persistedRepoSelection = useMemo(() => {
    if (!rawPersistedRepoSelection) {
      return null;
    }
    if (
      activeCodebase
      && rawPersistedRepoSelection.path === activeCodebase.repoPath
      && rawPersistedRepoSelection.branch === (activeCodebase.branch ?? "")
    ) {
      return null;
    }
    return rawPersistedRepoSelection;
  }, [activeCodebase, rawPersistedRepoSelection]);

  const selectedRepoOverride = selectedRepoOverrideState.workspaceId === workspaceId
    ? selectedRepoOverrideState.selection
    : null;
  const effectiveRepoOverride = selectedRepoOverride ?? persistedRepoSelection;

  const matchedSelectedCodebase = useMemo(() => {
    if (!effectiveRepoOverride) {
      return activeCodebase;
    }
    return codebases.find((codebase) => (
      codebase.repoPath === effectiveRepoOverride.path
      && (effectiveRepoOverride.branch ? (codebase.branch ?? "") === effectiveRepoOverride.branch : true)
    )) ?? codebases.find((codebase) => codebase.repoPath === effectiveRepoOverride.path) ?? null;
  }, [activeCodebase, codebases, effectiveRepoOverride]);

  const activeRepoSelection = useMemo(() => {
    if (effectiveRepoOverride) {
      return effectiveRepoOverride;
    }
    if (!activeCodebase) {
      return null;
    }
    return {
      name: activeCodebase.label ?? activeCodebase.repoPath.split("/").pop() ?? activeCodebase.repoPath,
      path: activeCodebase.repoPath,
      branch: activeCodebase.branch ?? "",
    } satisfies RepoSelection;
  }, [activeCodebase, effectiveRepoOverride]);

  const activeRepoPath = activeRepoSelection?.path;
  const activeRepoCodebaseId = effectiveRepoOverride ? matchedSelectedCodebase?.id : activeCodebase?.id;
  const {
    planState,
  } = useHarnessSettingsData({
    workspaceId,
    codebaseId: activeRepoCodebaseId,
    repoPath: activeRepoPath,
    selectedTier,
  });

  const selectedRepoLabel = activeRepoSelection?.name ?? "None";
  const unsupportedRepoMessage = getHarnessUnsupportedRepoMessage(
    planState.error,
  );

  useEffect(() => {
    if (selectedRepoOverrideState.workspaceId !== workspaceId) {
      return;
    }
    saveRepoSelection("harness", workspaceId, selectedRepoOverrideState.selection);
  }, [selectedRepoOverrideState, workspaceId]);

  const [openTabs, setOpenTabs] = useState<SectionId[]>([DEFAULT_SECTION]);
  const [governanceView, setGovernanceView] = useState<"lifecycle" | "loop">("lifecycle");
  const [selectedGovernanceNodeId, setSelectedGovernanceNodeId] = useState<string | null>(null);
  const [bottomPanelTab, setBottomPanelTab] = useState<"context" | "plan">("context");
  const [showBottomPanel, setShowBottomPanel] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(DEFAULT_EXPLORER_WIDTH);

  const activeSection = sectionFromUrl;
  const visibleTabs = useMemo(() => (
    openTabs.includes(activeSection) ? openTabs : [...openTabs, activeSection]
  ), [activeSection, openTabs]);

  const replaceSectionInUrl = useCallback((id: SectionId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(HARNESS_SECTION_QUERY_KEY, id);
    const next = params.toString();
    router.replace(next ? `/settings/harness?${next}` : "/settings/harness");
  }, [router, searchParams]);

  function openSection(id: SectionId) {
    setOpenTabs((current) => (current.includes(id) ? current : [...current, id]));
    replaceSectionInUrl(id);
  }

  function openBottomPanel(tab: "context" | "plan") {
    setBottomPanelTab(tab);
    setShowBottomPanel(true);
  }

  function handleGovernanceNodeClick(nodeId: string) {
    setSelectedGovernanceNodeId(nodeId);
    openBottomPanel("context");
  }

  function handleExplorerResizeStart(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = explorerWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setExplorerWidth(clamp(startWidth + deltaX, MIN_EXPLORER_WIDTH, MAX_EXPLORER_WIDTH));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  const sections = useMemo((): SectionDef[] => [
    { id: "overview", label: t.settings.harness.overview, shortLabel: "Overview", code: "OV" },
  ], [t]);

  const governanceContextPanel = useMemo(() => {
    if (selectedGovernanceNodeId === null) {
      return null;
    }
    switch (selectedGovernanceNodeId) {
      case "lint":
      case "precommit":
        return <HarnessExecutionPlanFlow loading={planState.loading} error={planState.error} plan={planState.data} repoLabel={selectedRepoLabel} selectedTier={selectedTier} onTierChange={setSelectedTier} unsupportedMessage={unsupportedRepoMessage} variant="compact" />;
      case "release":
      case "commit":
      case "post-commit":
        return <div className="p-3 text-[11px] text-desktop-text-secondary">选择 Lifecycle 节点查看对应组件的上下文视图。</div>;
      default:
        return <div className="p-3 text-[11px] text-desktop-text-secondary">选择 Lifecycle 节点查看对应组件的上下文视图。</div>;
    }
  }, [
    planState.data,
    planState.error,
    planState.loading,
    selectedGovernanceNodeId,
    selectedRepoLabel,
    selectedTier,
    unsupportedRepoMessage,
  ]);

  function renderOverview() {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-end border-b border-desktop-border pb-2">
          <div className="inline-flex items-center gap-0.5 rounded border border-desktop-border bg-desktop-bg-primary p-0.5 normal-case tracking-normal">
            {(["lifecycle", "loop"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setGovernanceView(view)}
                className={`rounded px-2.5 py-1 text-[10px] font-medium ${
                  governanceView === view
                    ? "bg-desktop-accent text-desktop-accent-text"
                    : "text-desktop-text-secondary hover:bg-desktop-bg-active hover:text-desktop-text-primary"
                }`}
              >
                {view === "lifecycle" ? "Lifecycle" : "Loop"}
              </button>
            ))}
          </div>
        </div>
        {governanceView === "lifecycle" ? (
          <HarnessLifecycleView
            selectedNodeId={selectedGovernanceNodeId}
            onSelectedNodeChange={handleGovernanceNodeClick}
            contextPanel={null}
          />
        ) : (
          <HarnessGovernanceLoopGraph
            repoPath={activeRepoPath}
            planError={planState.error}
            unsupportedMessage={unsupportedRepoMessage}
            selectedNodeId={selectedGovernanceNodeId}
            onSelectedNodeChange={handleGovernanceNodeClick}
            contextPanel={null}
          />
        )}
        {renderGovernanceBottomPanel()}
      </div>
    );
  }

  function renderGovernanceBottomPanel() {
    if (!showBottomPanel) {
      return null;
    }

    return (
      <div className="flex flex-col">
        <div
          className="flex shrink-0 flex-col border border-desktop-border bg-desktop-bg-secondary"
          data-testid="harness-console-bottom-panel"
        >
          <div className="flex h-9 items-center justify-between border-b border-desktop-border px-3">
            <div className="flex items-center gap-1">
              {(["context", "plan"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setBottomPanelTab(tab)}
                  className={`rounded px-2.5 py-1 text-[10px] font-medium ${
                    bottomPanelTab === tab
                      ? "bg-desktop-accent text-desktop-accent-text"
                      : "text-desktop-text-secondary hover:bg-desktop-bg-active hover:text-desktop-text-primary"
                  }`}
                >
                  {tab === "context" ? "Context" : "Execution Plan"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-[10px] text-desktop-text-secondary">
              {selectedGovernanceNodeId ? <span>node: {selectedGovernanceNodeId}</span> : null}
              <button
                type="button"
                className="desktop-btn desktop-btn-secondary"
                onClick={() => setShowBottomPanel(false)}
              >
                Close
              </button>
            </div>
          </div>

          <div className="p-3">
            {bottomPanelTab === "context" ? governanceContextPanel : null}
            {bottomPanelTab === "plan" ? (
              <HarnessExecutionPlanFlow
                loading={planState.loading}
                error={planState.error}
                plan={planState.data}
                repoLabel={selectedRepoLabel}
                selectedTier={selectedTier}
                onTierChange={setSelectedTier}
                unsupportedMessage={unsupportedRepoMessage}
                variant="compact"
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  function renderSectionContent(sectionId: SectionId) {
    switch (sectionId) {
      case "overview":
        return renderOverview();
      default:
        return null;
    }
  }

  function renderExplorerSectionButton(section: SectionDef) {
    const isActive = activeSection === section.id;
    return (
      <button
        key={section.id}
        type="button"
        onClick={() => openSection(section.id)}
        className={`desktop-list-item w-full rounded-md border text-left ${
          isActive
            ? "active border-desktop-border"
            : "border-transparent"
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-desktop-text-primary">{section.label}</span>
      </button>
    );
  }

  const titleBarRight = (
    <div className="flex items-center gap-2">
      <RepoPicker
        value={activeRepoSelection}
        onChange={(selection) => {
          setSelectedRepoOverrideState({ workspaceId, selection });
          if (!selection) {
            setSelectedCodebaseId("");
            return;
          }
          const matchedCodebase = codebases.find((codebase) => (
            codebase.repoPath === selection.path
            && (selection.branch ? (codebase.branch ?? "") === selection.branch : true)
          )) ?? codebases.find((codebase) => codebase.repoPath === selection.path)
            ?? codebases.find((codebase) => (
              (codebase.label ?? codebase.repoPath.split("/").pop() ?? codebase.repoPath) === selection.name
            ));
          setSelectedCodebaseId(matchedCodebase?.id ?? "");
        }}
        pathDisplay="hidden"
        additionalRepos={codebases.map((codebase) => ({
          name: codebase.label ?? codebase.repoPath.split("/").pop() ?? codebase.repoPath,
          path: codebase.repoPath,
          branch: codebase.branch ?? "",
        }))}
      />
      <button type="button" className="desktop-btn desktop-btn-secondary" onClick={() => openBottomPanel("plan")}>Plan</button>
    </div>
  );

  return (
    <DesktopAppShell
      workspaceId={workspaceId}
      workspaceTitle={activeWorkspaceTitle}
      workspaceSwitcher={(
        <WorkspaceSwitcher
          workspaces={workspacesHook.workspaces}
          activeWorkspaceId={workspaceId || null}
          activeWorkspaceTitle={activeWorkspaceTitle}
          onSelect={(nextWorkspaceId) => {
            setSelectedWorkspaceId(nextWorkspaceId);
            setSelectedRepoOverrideState({ workspaceId: nextWorkspaceId, selection: null });
            setSelectedCodebaseId("");
          }}
          onCreate={async (title) => {
            const workspace = await workspacesHook.createWorkspace(title);
            if (workspace) {
              setSelectedWorkspaceId(workspace.id);
              setSelectedRepoOverrideState({ workspaceId: workspace.id, selection: null });
              setSelectedCodebaseId("");
            }
          }}
          loading={workspacesHook.loading}
          compact
          desktop
        />
      )}
      titleBarRight={titleBarRight}
    >
      <div className="flex h-full min-h-0 overflow-hidden bg-desktop-bg-primary text-desktop-text-primary" data-testid="harness-console-root">
        <aside
          className="flex shrink-0 flex-col border-r border-desktop-border bg-desktop-bg-secondary"
          data-testid="harness-console-explorer"
          style={{ width: `${explorerWidth}px` }}
        >
          <div className="flex-1 overflow-y-auto px-2 py-3 desktop-scrollbar-thin">
            <div className="space-y-3">
              <div className="space-y-1">
                {sections.map((section) => renderExplorerSectionButton(section))}
              </div>
            </div>
          </div>
        </aside>

        <div
          role="separator"
          aria-label="Resize explorer"
          data-testid="harness-console-explorer-resizer"
          className="w-1 shrink-0 cursor-col-resize bg-desktop-border/60 transition-colors hover:bg-desktop-accent"
          onMouseDown={handleExplorerResizeStart}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-desktop-border bg-desktop-bg-secondary px-2">
            <div className="flex h-full items-center overflow-x-auto desktop-scrollbar-thin" data-testid="harness-console-tabs">
              {visibleTabs.map((tabId) => {
                const section = sections.find((item) => item.id === tabId);
                if (!section) {
                  return null;
                }
                const isActive = activeSection === tabId;
                return (
                  <div key={tabId} className={`group flex h-full shrink-0 items-center border-r border-desktop-border ${isActive ? "bg-desktop-bg-primary" : "bg-desktop-bg-secondary"}`}>
                    <button
                      type="button"
                      onClick={() => openSection(tabId)}
                      className={`h-full border-b-2 px-3 text-[11px] font-medium ${isActive ? "border-desktop-accent text-desktop-text-primary" : "border-transparent text-desktop-text-secondary hover:bg-desktop-bg-active/70 hover:text-desktop-text-primary"}`}
                    >
                      {section.shortLabel}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-desktop-bg-primary p-4 desktop-scrollbar">
            {renderSectionContent(activeSection)}
          </div>

          <div className="flex h-6 shrink-0 items-center bg-desktop-accent px-3 text-[10px] text-desktop-accent-text">
            <span>{activeWorkspaceTitle ?? "-"}</span>
          </div>
        </div>
      </div>
    </DesktopAppShell>
  );
}
