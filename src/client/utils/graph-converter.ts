/**
 * Utility to convert DependencyGraph (from routa-cli) to ReactFlow format.
 * Includes automatic layout using Dagre algorithm.
 */

import type { Node, Edge } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import dagre from "dagre";
import type { DependencyGraph, GraphNode, GraphEdge, EdgeKind } from "@/types/graph";

export interface ModuleNodeData extends Record<string, unknown> {
  label: string;
  language: string;
  kind: string;
  fullPath: string;
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 60;

/**
 * Get color for node based on language
 */
function getNodeColor(language: string): string {
  const colors: Record<string, string> = {
    typescript: "#3178c6",
    rust: "#ce422b",
    java: "#f89820",
    javascript: "#f7df1e",
  };
  return colors[language.toLowerCase()] || "#6b7280";
}

/**
 * Get edge style based on edge kind
 */
function getEdgeStyle(kind: EdgeKind): { animated: boolean; style: React.CSSProperties } {
  const styles: Record<EdgeKind, { animated: boolean; style: React.CSSProperties }> = {
    imports: { animated: true, style: { stroke: "#3b82f6", strokeWidth: 2 } },
    uses: { animated: false, style: { stroke: "#8b5cf6", strokeWidth: 1.5 } },
    extends: { animated: false, style: { stroke: "#10b981", strokeWidth: 2, strokeDasharray: "5,5" } },
    implements: { animated: false, style: { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "3,3" } },
    depends_on: { animated: false, style: { stroke: "#6b7280", strokeWidth: 1 } },
    made_of: { animated: false, style: { stroke: "#ec4899", strokeWidth: 1 } },
  };
  return styles[kind] || { animated: false, style: { stroke: "#6b7280", strokeWidth: 1 } };
}

/**
 * Calculate layout using Dagre algorithm
 */
function calculateDagreLayout(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to dagre
  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Add edges to dagre
  edges.forEach((edge) => {
    g.setEdge(edge.from, edge.to);
  });

  // Calculate layout
  dagre.layout(g);

  // Extract positions
  const positions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    const nodeWithPosition = g.node(node.id);
    if (nodeWithPosition) {
      positions.set(node.id, {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      });
    }
  });

  return positions;
}

/**
 * Convert DependencyGraph to ReactFlow nodes and edges
 */
export function convertToReactFlow(graph: DependencyGraph): {
  nodes: Node<ModuleNodeData>[];
  edges: Edge[];
} {
  const positions = calculateDagreLayout(graph.nodes, graph.edges);

  const nodes: Node<ModuleNodeData>[] = graph.nodes.map((node) => {
    const position = positions.get(node.id) || { x: 0, y: 0 };
    const label = node.id.split("/").pop() || node.id;

    return {
      id: node.id,
      type: "moduleNode",
      position,
      data: {
        label,
        language: node.language,
        kind: node.kind,
        fullPath: node.path,
      },
      style: {
        background: getNodeColor(node.language),
        color: "white",
        border: "1px solid #1f2937",
        borderRadius: "4px",
        padding: "8px 12px",
        fontSize: "11px",
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      },
    };
  });

  const edges: Edge[] = graph.edges.map((edge) => {
    const edgeStyle = getEdgeStyle(edge.kind);
    return {
      id: `${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      type: "smoothstep",
      label: edge.kind,
      animated: edgeStyle.animated,
      style: edgeStyle.style,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeStyle.style.stroke as string,
      },
      labelStyle: {
        fontSize: "9px",
        fill: "#6b7280",
      },
    };
  });

  return { nodes, edges };
}

/**
 * Filter nodes by language
 */
export function filterNodesByLanguage(
  nodes: Node<ModuleNodeData>[],
  language: string
): Node<ModuleNodeData>[] {
  if (language === "all") return nodes;
  return nodes.filter((node) => node.data.language.toLowerCase() === language.toLowerCase());
}

/**
 * Filter edges by kind
 */
export function filterEdgesByKind(edges: Edge[], kind: string): Edge[] {
  if (kind === "all") return edges;
  return edges.filter((edge) => edge.label === kind);
}
