"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";

import { DesktopAppShell } from "@/client/components/desktop-app-shell";
import { RepoPicker, type RepoSelection } from "@/client/components/repo-picker";
import { WorkspaceSwitcher } from "@/client/components/workspace-switcher";
import { useCodebases, useWorkspaces } from "@/client/hooks/use-workspaces";
import { saveRepoSelection } from "@/client/utils/repo-selection-storage";
import { useTranslation } from "@/i18n";

import {
  formatShortDate,
  loadInitialRepoSelection,
  readFeatureExplorerUrlState,
  replaceFeatureExplorerUrlState,
} from "./feature-explorer-client-helpers";
import {
  type ExplorerSurfaceItem,
  type SurfaceNavigationView,
  SurfaceTreeRow,
} from "./surface-navigation";
import { useFeatureExplorerData } from "./use-feature-explorer-data";
import { useFeatureExplorerViewModel } from "./use-feature-explorer-view-model";

export function FeatureExplorerPageClient({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const inferredGroupId = "inferred-surfaces";
  const router = useRouter();
  const { t } = useTranslation();
  const workspacesHook = useWorkspaces();
  const { codebases } = useCodebases(workspaceId);

  const workspace = workspacesHook.workspaces.find((item) => item.id === workspaceId) ?? null;
  const workspaceRepos = useMemo(
    () =>
      codebases.map((codebase) => ({
        name: codebase.label ?? codebase.repoPath.split("/").pop() ?? codebase.repoPath,
        path: codebase.repoPath,
        branch: codebase.branch ?? "",
      })),
    [codebases],
  );
  const [repoSelectionOverrides, setRepoSelectionOverrides] = useState<Record<string, RepoSelection | null>>({});
  const hasRepoSelectionOverride = Object.prototype.hasOwnProperty.call(repoSelectionOverrides, workspaceId);
  const manualRepoSelection = hasRepoSelectionOverride
    ? (repoSelectionOverrides[workspaceId] ?? null)
    : null;
  const fallbackRepoSelection = workspaceRepos[0] ?? null;
  const effectiveRepoSelection = manualRepoSelection ?? fallbackRepoSelection;
  const repoRefreshKey = `${effectiveRepoSelection?.path ?? ""}:${effectiveRepoSelection?.branch ?? ""}`;

  useEffect(() => {
    if (hasRepoSelectionOverride) {
      return;
    }

    setRepoSelectionOverrides((prev) => ({
      ...prev,
      [workspaceId]: loadInitialRepoSelection(workspaceId),
    }));
  }, [hasRepoSelectionOverride, workspaceId]);

  useEffect(() => {
    if (!hasRepoSelectionOverride) {
      return;
    }

    saveRepoSelection("featureExplorer", workspaceId, manualRepoSelection);
  }, [hasRepoSelectionOverride, manualRepoSelection, workspaceId]);

  const {
    loading,
    error,
    capabilityGroups,
    features,
    surfaceIndex,
  } = useFeatureExplorerData({
    workspaceId,
    repoPath: effectiveRepoSelection?.path,
    refreshKey: repoRefreshKey,
  });

  const [surfaceNavigationView, setSurfaceNavigationView] = useState<SurfaceNavigationView>("capabilities");
  const [featureId, setFeatureId] = useState<string>("");
  const [selectedSurfaceKey, setSelectedSurfaceKey] = useState<string>("");
  const [query, setQuery] = useState("");
  const [surfaceSectionCollapsed, setSurfaceSectionCollapsed] = useState<Record<string, boolean>>({});
  const [surfaceTreeExpandedIds, setSurfaceTreeExpandedIds] = useState<Record<string, boolean>>({});
  const [hasHydratedClientState, setHasHydratedClientState] = useState(false);

  const effectiveFeatureId = featureId;
  const {
    activeSurfaceKey,
    capabilityTreeNodes,
    curatedFeatureCount,
    featureSidebarGroups,
    inferredFeatureCount,
    repositoryStatusTone,
    surfaceNavigationOptions,
    surfaceTreeSection,
  } = useFeatureExplorerViewModel({
    capabilityGroups,
    effectiveFeatureId,
    features,
    inferredGroupId,
    messages: t.featureExplorer,
    query,
    selectedSurfaceKey,
    surfaceIndex,
    surfaceNavigationView,
  });
  const capabilityGroupMetrics = useMemo(
    () => capabilityTreeNodes.reduce<Record<string, { pages: number; apis: number; files: number }>>((acc, node) => {
      acc[node.id.replace("capability:", "")] = node.children.reduce(
        (groupTotals, child) => ({
          pages: groupTotals.pages + Number(child.item?.metrics?.find((metric) => metric.id === "pages")?.value ?? 0),
          apis: groupTotals.apis + Number(child.item?.metrics?.find((metric) => metric.id === "apis")?.value ?? 0),
          files: groupTotals.files + Number(child.item?.metrics?.find((metric) => metric.id === "files")?.value ?? 0),
        }),
        { pages: 0, apis: 0, files: 0 },
      );
      return acc;
    }, {}),
    [capabilityTreeNodes],
  );

  useEffect(() => {
    const urlState = readFeatureExplorerUrlState();
    setFeatureId(urlState.featureId);
    setHasHydratedClientState(true);
  }, [workspaceId]);

  useEffect(() => {
    if (!hasHydratedClientState) {
      return;
    }

    replaceFeatureExplorerUrlState({
      featureId: effectiveFeatureId,
    });
  }, [effectiveFeatureId, hasHydratedClientState]);

  const handleWorkspaceSelect = (nextWorkspaceId: string) => {
    router.push(`/workspace/${encodeURIComponent(nextWorkspaceId)}/feature-explorer`);
  };

  const handleWorkspaceCreate = async (title: string) => {
    const created = await workspacesHook.createWorkspace(title);
    if (created?.id) {
      router.push(`/workspace/${encodeURIComponent(created.id)}/feature-explorer`);
    }
  };

  const handleRepoSelectionChange = (selection: RepoSelection | null) => {
    setRepoSelectionOverrides((prev) => ({ ...prev, [workspaceId]: selection }));
  };

  const handleSelectFeature = (nextFeatureId: string) => {
    setFeatureId(nextFeatureId);
  };
  const handleSelectSurface = (item: ExplorerSurfaceItem) => {
    setSelectedSurfaceKey(item.key);

    if (item.kind === "feature") {
      handleSelectFeature(item.featureIds[0] ?? "");
      return;
    }

    if (item.featureIds[0]) {
      handleSelectFeature(item.featureIds[0]);
    }
  };

  const handleToggleSurfaceSection = (sectionId: string) => {
    setSurfaceSectionCollapsed((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const handleToggleSurfaceTreeNode = (nodeId: string) => {
    setSurfaceTreeExpandedIds((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const repositoryStatusLabel = repositoryStatusTone === "ready"
    ? t.featureExplorer.repositoryReady
    : repositoryStatusTone === "inferred"
      ? t.featureExplorer.repositoryInferred
      : t.featureExplorer.repositoryMissingTaxonomy;
  const repositoryStatusChipClassName = repositoryStatusTone === "ready"
    ? "border-emerald-300/60 bg-emerald-50/70 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
    : repositoryStatusTone === "inferred"
      ? "border-sky-300/60 bg-sky-50/70 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
      : "border-amber-300/60 bg-amber-50/70 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200";

  return (
    <DesktopAppShell
      workspaceId={workspaceId}
      workspaceTitle={workspace?.title ?? workspaceId}
      workspaceSwitcher={(
        <WorkspaceSwitcher
          workspaces={workspacesHook.workspaces}
          activeWorkspaceId={workspaceId}
          activeWorkspaceTitle={workspace?.title ?? workspaceId}
          onSelect={handleWorkspaceSelect}
          onCreate={handleWorkspaceCreate}
          loading={workspacesHook.loading}
          compact
          desktop
        />
      )}
    >
      <div className="flex h-full min-h-0 bg-desktop-bg-primary">
        <main className="flex min-w-0 flex-1">
          <aside className="flex min-h-0 flex-1 flex-col border-r border-desktop-border bg-desktop-bg-secondary/20">
            <div className="border-b border-desktop-border px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 rounded-sm border border-desktop-border bg-desktop-bg-primary px-2.5 py-1.5">
                  <RepoPicker
                    value={effectiveRepoSelection}
                    onChange={handleRepoSelectionChange}
                    additionalRepos={workspaceRepos}
                    pathDisplay="hidden"
                  />
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-desktop-border bg-desktop-bg-primary px-2.5 py-1.5 text-xs text-desktop-text-secondary">
                  <Search className="h-3.5 w-3.5" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t.featureExplorer.searchPlaceholder}
                    className="w-full bg-transparent text-xs text-desktop-text-primary outline-none placeholder:text-desktop-text-secondary"
                  />
                </label>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <span className={`rounded-sm border px-1.5 py-1 text-[9px] font-semibold normal-case tracking-normal ${repositoryStatusChipClassName}`}>
                  {repositoryStatusLabel}
                </span>
                {surfaceNavigationOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSurfaceNavigationView(option.id)}
                    title={option.tooltip}
                    className={`rounded-sm border px-2 py-1 text-[10px] font-medium ${
                      surfaceNavigationView === option.id
                        ? "border-desktop-accent bg-desktop-bg-active text-desktop-text-primary"
                        : "border-desktop-border bg-desktop-bg-primary text-desktop-text-secondary hover:text-desktop-text-primary"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-desktop-text-secondary">
                <span className="rounded-sm border border-desktop-border bg-desktop-bg-primary px-1.5 py-0.5">
                  {curatedFeatureCount} {t.featureExplorer.curatedFeaturesLabel}
                </span>
                <span className="rounded-sm border border-desktop-border bg-desktop-bg-primary px-1.5 py-0.5">
                  {inferredFeatureCount} {t.featureExplorer.inferredFeaturesLabel}
                </span>
                <span className="rounded-sm border border-desktop-border bg-desktop-bg-primary px-1.5 py-0.5">
                  {surfaceIndex.pages.length} {t.featureExplorer.pageSection}
                </span>
                <span className="rounded-sm border border-desktop-border bg-desktop-bg-primary px-1.5 py-0.5">
                  {surfaceIndex.contractApis.length} {t.featureExplorer.contractApiSection}
                </span>
                {surfaceIndex.generatedAt ? (
                  <span className="rounded-sm border border-desktop-border bg-desktop-bg-primary px-1.5 py-0.5">
                    {formatShortDate(surfaceIndex.generatedAt)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="px-3 py-4 text-xs text-desktop-text-secondary">Loading…</div>
              ) : error ? (
                <div className="px-3 py-4 text-xs text-red-400">{error}</div>
              ) : surfaceNavigationView === "capabilities" ? (
                featureSidebarGroups.length > 0 ? (
                  <div className="space-y-3 px-2 pb-3 pt-2">
                    {featureSidebarGroups.map((group) => {
                      const collapsed = surfaceSectionCollapsed[group.id] ?? (group.id === inferredGroupId && curatedFeatureCount > 0);
                      const groupNode = capabilityTreeNodes.find((node) => node.id === `capability:${group.id}`);
                      const groupMetrics = capabilityGroupMetrics[group.id] ?? { pages: 0, apis: 0, files: 0 };
                      return (
                        <div key={group.id}>
                          <button
                            type="button"
                            onClick={() => handleToggleSurfaceSection(group.id)}
                            className="mb-1 flex w-full items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-desktop-text-secondary hover:text-desktop-text-primary"
                          >
                            <span className="flex items-center gap-1.5">
                              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              <span>{group.title}</span>
                            </span>
                            <span className="flex items-center gap-1 text-[9px] font-medium normal-case tracking-normal text-current/80">
                              <span className="rounded-sm border border-desktop-border bg-desktop-bg-primary px-1.5 py-0.5">
                                {groupMetrics.pages} {t.featureExplorer.pageSection}
                              </span>
                              <span className="rounded-sm border border-desktop-border bg-desktop-bg-primary px-1.5 py-0.5">
                                {groupMetrics.apis} API
                              </span>
                              <span className="rounded-sm border border-desktop-border bg-desktop-bg-primary px-1.5 py-0.5">
                                {groupMetrics.files} {t.featureExplorer.filesLabel}
                              </span>
                            </span>
                          </button>
                          {group.description ? (
                            <div className="mb-1 px-1 text-[11px] leading-5 text-desktop-text-secondary">
                              {group.description}
                            </div>
                          ) : null}
                          {!collapsed ? (
                            <div className="space-y-0.5">
                              {(groupNode?.children ?? []).map((node) => (
                                <SurfaceTreeRow
                                  key={node.id}
                                  node={node}
                                  depth={0}
                                  activeSurfaceKey={activeSurfaceKey}
                                  expandedIds={surfaceTreeExpandedIds}
                                  onSelectSurface={handleSelectSurface}
                                  onToggleNode={handleToggleSurfaceTreeNode}
                                  unmappedLabel={t.featureExplorer.unmappedLabel}
                                  defaultExpandedDepth={0}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-3 py-4">
                    <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary p-3">
                      <div className="text-[12px] font-semibold text-desktop-text-primary">
                        {t.featureExplorer.featureTaxonomyEmptyTitle}
                      </div>
                      <div className="mt-1 text-[11px] leading-5 text-desktop-text-secondary">
                        {t.featureExplorer.featureTaxonomyEmptyDescription}
                      </div>
                    </div>
                  </div>
                )
              ) : !surfaceTreeSection ? (
                <div className="px-3 py-4 text-xs text-desktop-text-secondary">
                  {t.featureExplorer.noFeatureMatches}
                </div>
              ) : (
                <div className="space-y-3 px-2 pb-3 pt-2">
                  <div>
                    <button
                      type="button"
                      onClick={() => handleToggleSurfaceSection(surfaceTreeSection.id)}
                      className="mb-1 flex w-full items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-desktop-text-secondary hover:text-desktop-text-primary"
                    >
                      <span className="flex items-center gap-1.5">
                        {(surfaceSectionCollapsed[surfaceTreeSection.id] ?? false)
                          ? <ChevronRight className="h-3.5 w-3.5" />
                          : <ChevronDown className="h-3.5 w-3.5" />}
                        <span>{surfaceTreeSection.title}</span>
                      </span>
                      <span>{surfaceTreeSection.nodes.reduce((sum, node) => sum + node.itemCount, 0)}</span>
                    </button>
                    {!(surfaceSectionCollapsed[surfaceTreeSection.id] ?? false) ? (
                      <div className="space-y-1">
                        {surfaceTreeSection.nodes.map((node) => (
                          <SurfaceTreeRow
                            key={node.id}
                            node={node}
                            depth={0}
                            activeSurfaceKey={activeSurfaceKey}
                            expandedIds={surfaceTreeExpandedIds}
                            onSelectSurface={handleSelectSurface}
                            onToggleNode={handleToggleSurfaceTreeNode}
                            unmappedLabel={t.featureExplorer.unmappedLabel}
                            defaultExpandedDepth={0}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </main>
      </div>
    </DesktopAppShell>
  );
}
