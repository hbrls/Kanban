import type { RepoTreeNode } from "./scan-codebase-tree";

const ROOT_FILE_ANCHORS = [
  "README.md",
  "README",
  "AGENTS.md",
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "go.mod",
];

const NESTED_FILE_ANCHORS = ["docs/ARCHITECTURE.md", "docs/adr/README.md"];
const DIRECTORY_ANCHORS = ["src/app", "src/core", "src/client", "crates", "docs", "apps", "api"];

export interface RepoWikiAnchor {
  kind: "file" | "directory";
  path: string;
  reason: string;
}

export function extractArchitectureAnchors(tree: RepoTreeNode): RepoWikiAnchor[] {
  const anchors: RepoWikiAnchor[] = [];
  const rootChildren = tree.children ?? [];

  for (const child of rootChildren) {
    if (child.type !== "file") continue;
    if (ROOT_FILE_ANCHORS.some((anchor) => matchesRootFileAnchor(child.name, anchor))) {
      anchors.push({
        kind: "file",
        path: child.path,
        reason: `Architecture/documentation anchor (${child.name})`,
      });
    }
  }

  for (const dirPath of DIRECTORY_ANCHORS) {
    const node = findNodeByPath(tree, dirPath);
    if (!node) continue;
    anchors.push({
      kind: "directory",
      path: node.path,
      reason: "Architecture anchor directory",
    });
  }

  for (const filePath of NESTED_FILE_ANCHORS) {
    const node = findNodeByPath(tree, filePath);
    if (!node || node.type !== "file") continue;
    anchors.push({
      kind: "file",
      path: node.path,
      reason: `Architecture/documentation anchor (${node.name})`,
    });
  }

  return anchors;
}

function matchesRootFileAnchor(fileName: string, anchor: string): boolean {
  const baseName = anchor.split(".")[0];
  return fileName === anchor || fileName === baseName || fileName.startsWith(`${baseName}.`);
}

function findNodeByPath(tree: RepoTreeNode, targetPath: string): RepoTreeNode | null {
  const segments = targetPath.split("/");
  let current: RepoTreeNode | undefined = tree;

  for (const segment of segments) {
    if (!current?.children) return null;
    current = current.children.find((child) => child.name === segment);
    if (!current) return null;
  }

  return current;
}
