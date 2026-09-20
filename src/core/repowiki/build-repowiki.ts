import type { Codebase } from "@/core/models/codebase";

import { computeSummary, scanRepoTree } from "./scan-codebase-tree";
import { extractArchitectureAnchors } from "./extract-architecture-anchors";
import { buildStorylineContext, type RepoWikiStorylineContext } from "./build-storyline-context";

export interface RepoWikiPayload {
  codebase: {
    id: string;
    workspaceId: string;
    label?: string;
    repoPath: string;
    sourceType: string;
    sourceUrl?: string;
    branch?: string;
  };
  summary: {
    totalFiles: number;
    totalDirectories: number;
    topLevelFolders: string[];
    sourceType: string;
    branch?: string;
    repositoryRoleSummary: string;
  };
  anchors: Array<{ kind: "file" | "directory"; path: string; reason: string }>;
  modules: Array<{ name: string; path: string; fileCount: number; role: string }>;
  architecture: {
    runtimeBoundaries: string[];
    crossLayerRelationships: string[];
  };
  workflows: Array<{ name: string; description: string; relatedPaths: string[] }>;
  glossary: Array<{ term: string; meaning: string; sourcePath?: string }>;
  sourceLinks: Array<{ label: string; path: string }>;
  storylineContext: RepoWikiStorylineContext;
}

export function buildRepoWiki(codebase: Codebase): RepoWikiPayload {
  const sourceType = codebase.sourceType ?? "local";
  const tree = scanRepoTree(codebase.repoPath);
  const summary = computeSummary(tree, sourceType, codebase.branch);
  const anchors = extractArchitectureAnchors(tree);
  const storylineContext = buildStorylineContext(tree, anchors);

  const modules = (tree.children ?? [])
    .filter((child) => child.type === "directory")
    .sort((left, right) => (right.fileCount ?? 0) - (left.fileCount ?? 0))
    .slice(0, 8)
    .map((child) => ({
      name: child.name,
      path: child.path,
      fileCount: child.fileCount ?? 0,
      role: inferModuleRole(child.name),
    }));

  const sourceLinks = [
    ...anchors.map((anchor) => ({ label: anchor.path, path: anchor.path })),
    ...modules.map((module) => ({ label: module.name, path: module.path })),
  ];

  return {
    codebase: {
      id: codebase.id,
      workspaceId: codebase.workspaceId,
      label: codebase.label,
      repoPath: codebase.repoPath,
      sourceType,
      sourceUrl: codebase.sourceUrl,
      branch: codebase.branch,
    },
    summary: {
      ...summary,
      repositoryRoleSummary: buildRepositoryRoleSummary(summary.topLevelFolders),
    },
    anchors,
    modules,
    architecture: {
      runtimeBoundaries: buildRuntimeBoundaries(summary.topLevelFolders),
      crossLayerRelationships: buildCrossLayerRelationships(summary.topLevelFolders),
    },
    workflows: buildWorkflows(summary.topLevelFolders),
    glossary: buildGlossary(summary.topLevelFolders),
    sourceLinks,
    storylineContext,
  };
}

function inferModuleRole(name: string): string {
  if (name === "src") return "Primary application source code.";
  if (name === "docs") return "Documentation, architecture notes, and operational guides.";
  if (name === "crates") return "Rust service/runtime modules.";
  if (name === "apps") return "Application entrypoints and package surfaces.";
  if (name === "app") return "User-facing application layer.";
  return "Core repository module area.";
}

function buildRepositoryRoleSummary(topLevelFolders: string[]): string {
  if (topLevelFolders.length === 0) {
    return "Repository is compact and mostly root-file driven.";
  }
  return `Repository is organized around ${topLevelFolders.slice(0, 4).join(", ")}.`;
}

function buildRuntimeBoundaries(topLevelFolders: string[]): string[] {
  const boundaries: string[] = [];
  if (topLevelFolders.includes("src")) boundaries.push("Source runtime boundary under src/");
  if (topLevelFolders.includes("crates")) boundaries.push("Rust/Axum backend boundary under crates/");
  if (topLevelFolders.includes("apps")) boundaries.push("Multi-app boundary under apps/");
  if (topLevelFolders.includes("docs")) boundaries.push("Documentation and architecture boundary under docs/");
  return boundaries;
}

function buildCrossLayerRelationships(topLevelFolders: string[]): string[] {
  if (topLevelFolders.includes("src") && topLevelFolders.includes("crates")) {
    return ["Next.js app layer in src/ coordinates with Rust services in crates/."];
  }
  if (topLevelFolders.includes("src") && topLevelFolders.includes("docs")) {
    return ["Implementation in src/ is guided by architecture and ADR documents in docs/."];
  }
  return ["Cross-layer relationships require deeper file-level inspection."];
}

function buildWorkflows(topLevelFolders: string[]): Array<{ name: string; description: string; relatedPaths: string[] }> {
  return [
    {
      name: "Repo orientation",
      description: "Start from README/AGENTS and map top-level modules before detailed tracing.",
      relatedPaths: ["README.md", "AGENTS.md", ...topLevelFolders.map((folder) => `${folder}/`)],
    },
    {
      name: "Architecture walkthrough",
      description: "Trace runtime boundaries and handoffs between major layers.",
      relatedPaths: topLevelFolders.map((folder) => `${folder}/`),
    },
  ];
}

function buildGlossary(topLevelFolders: string[]): Array<{ term: string; meaning: string; sourcePath?: string }> {
  const glossary: Array<{ term: string; meaning: string; sourcePath?: string }> = [
    { term: "RepoWiki", meaning: "Intermediate architecture-aware repository knowledge artifact." },
    { term: "Storyline context", meaning: "Slide-ready narrative hints generated from repository evidence." },
  ];

  if (topLevelFolders.includes("crates")) {
    glossary.push({ term: "crates", meaning: "Rust package/workspace area.", sourcePath: "crates/" });
  }

  if (topLevelFolders.includes("src")) {
    glossary.push({ term: "src", meaning: "Application source root.", sourcePath: "src/" });
  }

  return glossary;
}
