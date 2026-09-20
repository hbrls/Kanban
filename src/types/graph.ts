/**
 * Type definitions for module dependency graph analysis.
 * Matches the output from routa-cli graph analyze command.
 */

export type NodeKind = "file" | "package" | "class" | "function" | "method" | "module";

export type EdgeKind = 
  | "uses"
  | "imports"
  | "made_of"
  | "depends_on"
  | "extends"
  | "implements";

export type GraphLanguage = "rust" | "typescript" | "java" | "auto";

export interface GraphNode {
  id: string;
  path: string;
  language: string;
  kind: NodeKind;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  specifier: string;
  resolved: boolean;
}

export interface DependencyGraph {
  generated_at: string;
  root_dir: string;
  language: string;
  node_count: number;
  edge_count: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphAnalyzeParams {
  repoRoot: string;
  language?: GraphLanguage;
  depth?: "fast" | "normal";
}
