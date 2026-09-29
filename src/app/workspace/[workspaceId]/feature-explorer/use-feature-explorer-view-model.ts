"use client";

import { useMemo } from "react";

import type { TranslationDictionary } from "@/i18n";

import {
  type ExplorerSurfaceItem,
  type SurfaceNavigationView,
  type SurfaceTreeNode,
  buildApiLookupKey,
  buildGroupedApiItems,
  buildSurfaceTree,
  dedupeFeatureIds,
  matchesQuery,
  parseApiDeclaration,
  splitApiRouteSegments,
  splitBrowserRouteSegments,
  splitPathSegments,
} from "./surface-navigation";
import type {
  CapabilityGroup,
  FeatureSummary,
  FeatureSurfaceIndexResponse,
  FeatureSurfaceMetadataItem,
  FeatureSurfacePage,
} from "./types";

type FeatureExplorerMessages = TranslationDictionary["featureExplorer"];

type CapabilityTreeGroup = {
  id: string;
  title: string;
  description: string;
  items: ExplorerSurfaceItem[];
};

type SurfaceNavigationOption = {
  id: SurfaceNavigationView;
  label: string;
  tooltip?: string;
};

type SurfaceTreeSection = {
  id: string;
  title: string;
  nodes: SurfaceTreeNode[];
} | null;

type UseFeatureExplorerViewModelParams = {
  capabilityGroups: CapabilityGroup[];
  effectiveFeatureId: string;
  features: FeatureSummary[];
  inferredGroupId: string;
  messages: FeatureExplorerMessages;
  query: string;
  selectedSurfaceKey: string;
  surfaceIndex: FeatureSurfaceIndexResponse;
  surfaceNavigationView: SurfaceNavigationView;
};

function collectSurfaceItemsByFeature(items: ExplorerSurfaceItem[]): Map<string, ExplorerSurfaceItem[]> {
  const map = new Map<string, ExplorerSurfaceItem[]>();

  for (const item of items) {
    for (const featureId of item.featureIds) {
      const current = map.get(featureId) ?? [];
      current.push(item);
      map.set(featureId, current);
    }
  }

  return map;
}

function collectSurfaceTreeItems(nodes: SurfaceTreeNode[], acc: ExplorerSurfaceItem[] = []): ExplorerSurfaceItem[] {
  for (const node of nodes) {
    if (node.item) {
      acc.push(node.item);
    }
    if (node.children.length > 0) {
      collectSurfaceTreeItems(node.children, acc);
    }
  }

  return acc;
}

function buildPageFeatureMap(
  featureMetadata: FeatureSurfaceMetadataItem[],
  pages: FeatureSurfacePage[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const metadataItem of featureMetadata) {
    for (const route of metadataItem.pages ?? []) {
      const current = map.get(route) ?? [];
      current.push(metadataItem.id);
      map.set(route, current);
    }
  }

  for (const page of pages) {
    if (!page.sourceFile) {
      continue;
    }

    for (const metadataItem of featureMetadata) {
      if (!(metadataItem.sourceFiles ?? []).includes(page.sourceFile)) {
        continue;
      }

      const current = map.get(page.route) ?? [];
      current.push(metadataItem.id);
      map.set(page.route, current);
    }
  }

  return map;
}

function buildApiFeatureMap(
  featureMetadata: FeatureSurfaceMetadataItem[],
  surfaceIndex: FeatureSurfaceIndexResponse,
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const metadataItem of featureMetadata) {
    for (const declaration of metadataItem.apis ?? []) {
      const parsedDeclaration = parseApiDeclaration(declaration);
      const lookupKey = buildApiLookupKey(parsedDeclaration.method, parsedDeclaration.path);
      const current = map.get(lookupKey) ?? [];
      current.push(metadataItem.id);
      map.set(lookupKey, current);
    }
  }

  for (const implementationApi of [...surfaceIndex.nextjsApis, ...surfaceIndex.rustApis]) {
    const lookupKey = buildApiLookupKey(implementationApi.method, implementationApi.path);
    for (const metadataItem of featureMetadata) {
      if (!(metadataItem.sourceFiles ?? []).some((sourceFile) => implementationApi.sourceFiles.includes(sourceFile))) {
        continue;
      }

      const current = map.get(lookupKey) ?? [];
      current.push(metadataItem.id);
      map.set(lookupKey, current);
    }
  }

  return map;
}

export function useFeatureExplorerViewModel({
  capabilityGroups,
  effectiveFeatureId,
  features,
  inferredGroupId,
  messages,
  query,
  selectedSurfaceKey,
  surfaceIndex,
  surfaceNavigationView,
}: UseFeatureExplorerViewModelParams) {
  const featureMetadata = useMemo(
    () => surfaceIndex.metadata?.features ?? [],
    [surfaceIndex.metadata],
  );
  const featureSummaryById = useMemo(
    () => new Map(features.map((feature) => [feature.id, feature])),
    [features],
  );
  const featureMetadataById = useMemo(
    () => new Map(featureMetadata.map((feature) => [feature.id, feature])),
    [featureMetadata],
  );
  const pageFeatureMap = useMemo(
    () => buildPageFeatureMap(featureMetadata, surfaceIndex.pages),
    [featureMetadata, surfaceIndex.pages],
  );
  const apiFeatureMap = useMemo(
    () => buildApiFeatureMap(featureMetadata, surfaceIndex),
    [featureMetadata, surfaceIndex],
  );
  const browserViewFeatureIds = useMemo(() => {
    const ids = new Set<string>();

    for (const feature of features) {
      if (feature.pageCount > 0) {
        ids.add(feature.id);
      }
    }
    for (const metadataItem of featureMetadata) {
      if ((metadataItem.pages?.length ?? 0) > 0) {
        ids.add(metadataItem.id);
      }
    }
    for (const page of surfaceIndex.pages) {
      for (const featureId of dedupeFeatureIds(pageFeatureMap.get(page.route) ?? [])) {
        ids.add(featureId);
      }
    }

    return ids;
  }, [featureMetadata, features, pageFeatureMap, surfaceIndex.pages]);
  const nextjsApiFeatureIds = useMemo(() => {
    const ids = new Set<string>();
    for (const api of surfaceIndex.nextjsApis) {
      const lookupKey = buildApiLookupKey(api.method, api.path);
      for (const featureId of dedupeFeatureIds(apiFeatureMap.get(lookupKey) ?? [])) {
        ids.add(featureId);
      }
    }
    return ids;
  }, [apiFeatureMap, surfaceIndex.nextjsApis]);
  const rustApiFeatureIds = useMemo(() => {
    const ids = new Set<string>();
    for (const api of surfaceIndex.rustApis) {
      const lookupKey = buildApiLookupKey(api.method, api.path);
      for (const featureId of dedupeFeatureIds(apiFeatureMap.get(lookupKey) ?? [])) {
        ids.add(featureId);
      }
    }
    return ids;
  }, [apiFeatureMap, surfaceIndex.rustApis]);

  const featureItems = useMemo<ExplorerSurfaceItem[]>(
    () =>
      features
        .filter((feature) => {
          if (!matchesQuery(query, [feature.name, feature.summary, feature.id])) {
            return false;
          }

          if (feature.id === effectiveFeatureId) {
            return true;
          }

          switch (surfaceNavigationView) {
            case "capabilities":
              return true;
            case "surfaces":
              return browserViewFeatureIds.has(feature.id);
            case "apis":
              return nextjsApiFeatureIds.has(feature.id) || rustApiFeatureIds.has(feature.id) || feature.apiCount > 0;
            case "paths":
              return true;
          }
        })
        .map((feature): ExplorerSurfaceItem => {
          const metadataItem = featureMetadataById.get(feature.id);
          const sourceFiles = metadataItem?.sourceFiles ?? [];
          return {
            key: `feature:${feature.id}`,
            kind: "feature",
            label: feature.name,
            secondary: capabilityGroups.find((group) => group.id === feature.group)?.name ?? feature.group,
            featureIds: [feature.id],
            sourceFiles,
            metrics: [
              {
                id: "pages",
                label: messages.pageSection,
                value: String(feature.pageCount),
                testId: `feature-metric-pages-${feature.id}`,
              },
              {
                id: "apis",
                label: "API",
                value: String(feature.apiCount),
                testId: `feature-metric-apis-${feature.id}`,
              },
              {
                id: "files",
                label: messages.filesLabel,
                value: String(feature.sourceFileCount),
                testId: `feature-metric-files-${feature.id}`,
              },
            ],
            selectable: true,
          };
        }),
    [
      browserViewFeatureIds,
      capabilityGroups,
      effectiveFeatureId,
      featureMetadataById,
      features,
      messages.filesLabel,
      messages.pageSection,
      nextjsApiFeatureIds,
      query,
      rustApiFeatureIds,
      surfaceNavigationView,
    ],
  );
  const curatedFeatureItems = useMemo(
    () =>
      featureItems.filter((item) => {
        const feature = featureSummaryById.get(item.featureIds[0] ?? "");
        if (!feature) {
          return true;
        }
        return feature.group !== inferredGroupId && feature.status !== "inferred";
      }),
    [featureItems, featureSummaryById, inferredGroupId],
  );
  const inferredFeatureItems = useMemo(
    () =>
      featureItems.filter((item) => {
        const feature = featureSummaryById.get(item.featureIds[0] ?? "");
        if (!feature) {
          return false;
        }
        return feature.group === inferredGroupId || feature.status === "inferred";
      }),
    [featureItems, featureSummaryById, inferredGroupId],
  );
  const pageItems = useMemo<ExplorerSurfaceItem[]>(
    () =>
      surfaceIndex.pages
        .filter((page) => matchesQuery(query, [page.route, page.title, page.description, page.sourceFile]))
        .map((page): ExplorerSurfaceItem => ({
          key: `page:${page.route}`,
          kind: "page",
          label: page.route,
          secondary: page.title || page.sourceFile,
          featureIds: dedupeFeatureIds(pageFeatureMap.get(page.route) ?? []),
          sourceFiles: page.sourceFile ? [page.sourceFile] : [],
          selectable: true,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [pageFeatureMap, query, surfaceIndex.pages],
  );
  const apiBrowseItems = useMemo<ExplorerSurfaceItem[]>(
    () =>
      buildGroupedApiItems({
        kind: "contract-api",
        apis: [
          ...surfaceIndex.contractApis,
          ...surfaceIndex.nextjsApis,
          ...surfaceIndex.rustApis,
        ],
        query,
        resolveFeatureIds: (method, path) => dedupeFeatureIds(apiFeatureMap.get(buildApiLookupKey(method, path)) ?? []),
      }),
    [apiFeatureMap, query, surfaceIndex.contractApis, surfaceIndex.nextjsApis, surfaceIndex.rustApis],
  );
  const featureSidebarGroups = useMemo<CapabilityTreeGroup[]>(() => {
    const itemsByGroup = new Map<string, ExplorerSurfaceItem[]>();

    for (const item of curatedFeatureItems) {
      const feature = featureSummaryById.get(item.featureIds[0] ?? "");
      const groupId = feature?.group || "__ungrouped__";
      const current = itemsByGroup.get(groupId) ?? [];
      current.push(item);
      itemsByGroup.set(groupId, current);
    }

    const groups = capabilityGroups
      .filter((group) => group.id !== inferredGroupId)
      .map((group) => ({
        id: group.id,
        title: group.name,
        description: group.description,
        items: itemsByGroup.get(group.id) ?? [],
      }))
      .filter((group) => group.items.length > 0);

    const groupedIds = new Set(groups.map((group) => group.id));
    for (const [groupId, items] of itemsByGroup.entries()) {
      if (groupedIds.has(groupId)) {
        continue;
      }
      groups.push({
        id: groupId,
        title: groupId === "__ungrouped__" ? messages.featureSection : groupId,
        description: "",
        items,
      });
    }

    if (inferredFeatureItems.length > 0) {
      const inferredGroup = capabilityGroups.find((group) => group.id === inferredGroupId);
      groups.push({
        id: inferredGroupId,
        title: inferredGroup?.name ?? messages.inferredFeaturesLabel,
        description: inferredGroup?.description ?? "",
        items: inferredFeatureItems,
      });
    }

    return groups;
  }, [
    capabilityGroups,
    curatedFeatureItems,
    featureSummaryById,
    inferredFeatureItems,
    inferredGroupId,
    messages.featureSection,
    messages.inferredFeaturesLabel,
  ]);
  const surfaceNavigationOptions = useMemo<SurfaceNavigationOption[]>(
    () => [
      { id: "capabilities", label: messages.sectionView, tooltip: messages.capabilitiesTooltip },
      { id: "surfaces", label: messages.browserUrlView, tooltip: messages.surfacesTooltip },
      { id: "apis", label: messages.apiView, tooltip: messages.apisTooltip },
      { id: "paths", label: messages.pathView, tooltip: messages.pathsTooltip },
    ],
    [messages.apiView, messages.browserUrlView, messages.capabilitiesTooltip, messages.apisTooltip, messages.pathView, messages.pathsTooltip, messages.sectionView, messages.surfacesTooltip],
  );
  const surfaceTreeSection = useMemo<SurfaceTreeSection>(() => {
    if (surfaceNavigationView === "capabilities") {
      return null;
    }

    if (surfaceNavigationView === "surfaces") {
      return {
        id: "surfaces",
        title: messages.browserUrlView,
        nodes: buildSurfaceTree(
          pageItems.map((item) => ({
            nodeId: item.key,
            segments: splitBrowserRouteSegments(item.label),
            item,
          })),
        ),
      };
    }

    if (surfaceNavigationView === "apis") {
      return {
        id: "apis-tree",
        title: messages.apiView,
        nodes: buildSurfaceTree(
          apiBrowseItems.map((item) => ({
            nodeId: item.key,
            segments: splitApiRouteSegments(item.label),
            item,
          })),
        ),
      };
    }

    return {
      id: "path-tree",
      title: messages.pathView,
      nodes: buildSurfaceTree(
        [...pageItems, ...apiBrowseItems].flatMap((item) => {
          const sourcePaths = item.sourceFiles.length > 0 ? item.sourceFiles : [item.label];
          return sourcePaths.map((sourcePath) => ({
            nodeId: `${item.key}:${sourcePath}`,
            segments: [...splitPathSegments(sourcePath), item.label],
            item,
          }));
        }),
      ),
    };
  }, [
    apiBrowseItems,
    messages.apiView,
    messages.browserUrlView,
    messages.pathView,
    pageItems,
    surfaceNavigationView,
  ]);
  const capabilityTreeNodes = useMemo<SurfaceTreeNode[]>(() => {
    const pageItemsByFeature = collectSurfaceItemsByFeature(pageItems);
    const apiItemsByFeature = collectSurfaceItemsByFeature(apiBrowseItems);

    return featureSidebarGroups.map((group) => ({
      id: `capability:${group.id}`,
      label: group.title,
      children: group.items.map((featureItem) => {
        const featureId = featureItem.featureIds[0] ?? "";
        const metadataItem = featureMetadataById.get(featureId);
        const pageChildren = (pageItemsByFeature.get(featureId) ?? []).map((item) => ({
          id: `capability:${group.id}:${item.key}`,
          label: item.label,
          item,
          children: [],
          itemCount: 1,
        }));
        const mappedApiChildren = (apiItemsByFeature.get(featureId) ?? []).map((item) => ({
          id: `capability:${group.id}:${item.key}`,
          label: item.label,
          item,
          children: [],
          itemCount: 1,
        }));
        const fallbackApiChildren = mappedApiChildren.length === 0
          ? (metadataItem?.apis ?? []).map((declaration) => {
              const parsedDeclaration = parseApiDeclaration(declaration);
              const lookupKey = buildApiLookupKey(parsedDeclaration.method, parsedDeclaration.path);
              const sourceFiles = [
                ...surfaceIndex.nextjsApis
                  .filter((api) => buildApiLookupKey(api.method, api.path) === lookupKey)
                  .flatMap((api) => api.sourceFiles),
                ...surfaceIndex.rustApis
                  .filter((api) => buildApiLookupKey(api.method, api.path) === lookupKey)
                  .flatMap((api) => api.sourceFiles),
              ];
              const item: ExplorerSurfaceItem = {
                key: `feature-api:${featureId}:${lookupKey}`,
                kind: "contract-api",
                label: parsedDeclaration.path,
                secondary: parsedDeclaration.method,
                badges: [parsedDeclaration.method],
                featureIds: [featureId],
                sourceFiles: [...new Set(sourceFiles)],
                selectable: true,
              };

              return {
                id: `capability:${group.id}:${item.key}`,
                label: item.label,
                item,
                children: [],
                itemCount: 1,
              };
            })
          : [];
        const children = [...pageChildren, ...mappedApiChildren, ...fallbackApiChildren];

        return {
          id: `capability:${group.id}:${featureItem.key}`,
          label: featureItem.label,
          item: featureItem,
          children,
          itemCount: 1 + children.length,
        };
      }),
      itemCount: group.items.length,
    }));
  }, [apiBrowseItems, featureMetadataById, featureSidebarGroups, pageItems, surfaceIndex.nextjsApis, surfaceIndex.rustApis]);

  const selectedSurface = useMemo(() => {
    const treeItems = surfaceTreeSection ? collectSurfaceTreeItems(surfaceTreeSection.nodes) : [];
    const capabilityItems = collectSurfaceTreeItems(capabilityTreeNodes);
    const explorerItemsByKey = new Map(
      [...treeItems, ...capabilityItems].map((item) => [item.key, item] as const),
    );
    const resolvedSurfaceKey = selectedSurfaceKey && explorerItemsByKey.has(selectedSurfaceKey)
      ? selectedSurfaceKey
      : (effectiveFeatureId ? `feature:${effectiveFeatureId}` : "");

    if (resolvedSurfaceKey) {
      return explorerItemsByKey.get(resolvedSurfaceKey) ?? null;
    }

    return null;
  }, [capabilityTreeNodes, effectiveFeatureId, selectedSurfaceKey, surfaceTreeSection]);
  const curatedFeatureCount = useMemo(
    () => features.filter((feature) => feature.group !== inferredGroupId && feature.status !== "inferred").length,
    [features, inferredGroupId],
  );
  const inferredFeatureCount = useMemo(
    () => features.filter((feature) => feature.group === inferredGroupId || feature.status === "inferred").length,
    [features, inferredGroupId],
  );
  const hasCuratedFeatureTaxonomy = curatedFeatureCount > 0;
  const hasInferredFeatureTaxonomy = inferredFeatureCount > 0;
  const repositoryStatusTone = hasCuratedFeatureTaxonomy
    ? "ready"
    : hasInferredFeatureTaxonomy
      ? "inferred"
      : "missing";

  const activeSurfaceKey = selectedSurface?.key ?? (effectiveFeatureId ? `feature:${effectiveFeatureId}` : "");

  return {
    activeSurfaceKey,
    capabilityTreeNodes,
    curatedFeatureCount,
    featureSidebarGroups,
    inferredFeatureCount,
    repositoryStatusTone,
    surfaceNavigationOptions,
    surfaceTreeSection,
  };
}
