"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslation } from "@/i18n";
import { desktopAwareFetch } from "@/client/utils/diagnostics";
import { convertToReactFlow, filterNodesByLanguage, filterEdgesByKind } from "@/client/utils/graph-converter";
import type { DependencyGraph } from "@/types/graph";
import type { ModuleNodeData } from "@/client/utils/graph-converter";

type HarnessModuleGraphViewProps = {
  repoRoot: string;
  language?: string;
};

const ModuleNode = ({ data }: NodeProps<Node<ModuleNodeData>>) => {
  return (
    <div className="px-3 py-2 rounded border border-gray-700 bg-opacity-90 text-white text-xs">
      <Handle type="target" position={Position.Top} className="w-2 h-2" />
      <div className="font-semibold truncate" title={data.fullPath}>
        {data.label}
      </div>
      <div className="text-[10px] opacity-75 mt-0.5">
        {data.kind} · {data.language}
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
    </div>
  );
};

const nodeTypes = {
  moduleNode: ModuleNode,
};

export function HarnessModuleGraphView({
  repoRoot,
  language: initialLanguage = "auto",
}: HarnessModuleGraphViewProps) {
  const { t } = useTranslation();
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [languageFilter, setLanguageFilter] = useState("all");
  const [edgeFilter, setEdgeFilter] = useState("all");

  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        repoRoot,
        lang: initialLanguage,
        depth: "fast",
      });

      const response = await desktopAwareFetch(`/api/graph/analyze?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load graph");
      }

      setGraph(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }, [repoRoot, initialLanguage]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    return convertToReactFlow(graph);
  }, [graph]);

  const filteredNodes = useMemo(
    () => filterNodesByLanguage(nodes, languageFilter),
    [nodes, languageFilter]
  );

  const filteredEdges = useMemo(
    () => filterEdgesByKind(edges, edgeFilter),
    [edges, edgeFilter]
  );

  const availableLanguages = useMemo(() => {
    if (!graph) return [];
    const languages = new Set(graph.nodes.map((n) => n.language.toLowerCase()));
    return Array.from(languages).sort();
  }, [graph]);

  const availableEdgeKinds = useMemo(() => {
    if (!graph) return [];
    const kinds = new Set(graph.edges.map((e) => e.kind));
    return Array.from(kinds).sort();
  }, [graph]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] border border-desktop-border rounded-sm bg-desktop-bg-primary">
        <div className="text-desktop-text-secondary text-sm">
          {t.settings.harness.moduleGraph.loading || "Loading dependency graph..."}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] border border-desktop-border rounded-sm bg-desktop-bg-primary">
        <div className="text-red-500 text-sm mb-2">
          {t.settings.harness.moduleGraph.error || "Failed to load graph"}
        </div>
        <div className="text-desktop-text-secondary text-xs">{error}</div>
        <button
          type="button"
          className="mt-4 desktop-btn desktop-btn-secondary text-xs"
          onClick={loadGraph}
        >
          {t.common.retry || "Retry"}
        </button>
      </div>
    );
  }

  if (!graph || graph.node_count === 0) {
    return (
      <div className="flex items-center justify-center h-[600px] border border-desktop-border rounded-sm bg-desktop-bg-primary">
        <div className="text-desktop-text-secondary text-sm">
          {t.settings.harness.moduleGraph.noData || "No modules found in this repository"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-3 items-center text-sm">
        <label className="flex items-center gap-2">
          <span className="text-desktop-text-secondary text-xs">
            {t.settings.harness.moduleGraph.filterLanguage || "Language:"}
          </span>
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="desktop-input text-xs py-1 px-2"
          >
            <option value="all">{t.common.all || "All"}</option>
            {availableLanguages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-desktop-text-secondary text-xs">
            {t.settings.harness.moduleGraph.filterEdgeKind || "Dependency:"}
          </span>
          <select
            value={edgeFilter}
            onChange={(e) => setEdgeFilter(e.target.value)}
            className="desktop-input text-xs py-1 px-2"
          >
            <option value="all">{t.common.all || "All"}</option>
            {availableEdgeKinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto text-xs text-desktop-text-secondary">
          {filteredNodes.length} {t.settings.harness.moduleGraph.nodes || "nodes"} ·{" "}
          {filteredEdges.length} {t.settings.harness.moduleGraph.edges || "edges"}
        </div>
      </div>

      {/* Graph */}
      <div className="h-[600px] border border-desktop-border rounded-sm bg-desktop-bg-primary overflow-hidden">
        <ReactFlow
          nodes={filteredNodes}
          edges={filteredEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.1, minZoom: 0.2, maxZoom: 1.5 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          panOnDrag
          zoomOnScroll
        >
          <Background color="#d7dee7" gap={20} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              const color = node.style?.background as string;
              return color || "#6b7280";
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
          />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <div className="font-semibold text-desktop-text-secondary">
          {t.settings.harness.moduleGraph.legend || "Legend:"}
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ background: "#3178c6" }} />
          <span>TypeScript</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ background: "#ce422b" }} />
          <span>Rust</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ background: "#f89820" }} />
          <span>Java</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-blue-500" />
          <span>Imports</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 border-t-2 border-green-500 border-dashed" />
          <span>Extends</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 border-t-2 border-orange-500 border-dashed" />
          <span>Implements</span>
        </div>
      </div>
    </div>
  );
}
