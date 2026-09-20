import type { RepoTreeNode } from "./scan-codebase-tree";
import type { RepoWikiAnchor } from "./extract-architecture-anchors";

export interface RepoWikiStorylineContext {
  suggestedSections: string[];
  entryPoints: string[];
  keyFiles: string[];
  focusAreas: Array<{ path: string; fileCount: number }>;
  narrativeHints: string[];
}

const KEY_FILES = ["README.md", "AGENTS.md", "ARCHITECTURE.md", "CONTRIBUTING.md", "Cargo.toml", "package.json"];

export function buildStorylineContext(tree: RepoTreeNode, anchors: RepoWikiAnchor[]): RepoWikiStorylineContext {
  const rootChildren = tree.children ?? [];
  const entryPoints = anchors.filter((anchor) => anchor.kind === "file").map((anchor) => anchor.path);

  const keyFiles = rootChildren
    .filter((child) => child.type === "file" && KEY_FILES.includes(child.name))
    .map((child) => child.path);

  const focusAreas = rootChildren
    .filter((child) => child.type === "directory")
    .sort((left, right) => (right.fileCount ?? 0) - (left.fileCount ?? 0))
    .slice(0, 6)
    .map((child) => ({ path: child.path, fileCount: child.fileCount ?? 0 }));

  const suggestedSections = [
    "Repository overview",
    "Top-level architecture",
    "Runtime boundaries",
    "Important modules and responsibilities",
    "Key files and why they matter",
    "Main workflows / narratives",
    "Slide-ready storyline hints",
  ];

  const narrativeHints = [
    `Start from docs/README and then explain ${focusAreas[0]?.path ?? "the primary module"}.`,
    "Call out cross-layer boundaries between app/core/client or equivalent runtime layers.",
    "Label inferred conclusions explicitly when source files do not state intent directly.",
  ];

  return {
    suggestedSections,
    entryPoints,
    keyFiles,
    focusAreas,
    narrativeHints,
  };
}
