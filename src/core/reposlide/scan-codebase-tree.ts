/**
 * Scan a codebase directory and build a normalized tree structure.
 *
 * Primary input is `codebase.repoPath` — works for local repos and
 * GitHub-sourced codebases that have a local checkout.
 */

import * as fs from "fs";
import * as path from "path";

/** A node in the repository tree. */
export interface RepoTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: RepoTreeNode[];
  fileCount?: number;
}

/** Summary statistics for a scanned repository. */
export interface RepoSummary {
  totalFiles: number;
  totalDirectories: number;
  topLevelFolders: string[];
  sourceType: string;
  branch?: string;
}

/** Directories to always skip during scan. */
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "target",
  ".routa",
  ".worktrees",
  "__pycache__",
  ".tox",
  ".venv",
  "venv",
  ".cache",
]);

/** Maximum tree depth to scan. */
const MAX_DEPTH = 4;
/** Maximum number of children per directory. */
const MAX_CHILDREN = 50;

/**
 * Scan a repository directory and return a tree of files and directories.
 */
export function scanRepoTree(repoPath: string, maxDepth = MAX_DEPTH): RepoTreeNode {
  const rootName = path.basename(repoPath) || repoPath;
  return scanDir(repoPath, rootName, "", 0, maxDepth);
}

function scanDir(
  absolutePath: string,
  name: string,
  relativePath: string,
  depth: number,
  maxDepth: number,
): RepoTreeNode {
  const node: RepoTreeNode = {
    name,
    path: relativePath || ".",
    type: "directory",
    children: [],
    fileCount: 0,
  };

  if (depth >= maxDepth) return node;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absolutePath, { withFileTypes: true });
  } catch {
    return node;
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  let childCount = 0;
  for (const entry of entries) {
    if (entry.name.startsWith(".") && IGNORE_DIRS.has(entry.name)) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (childCount >= MAX_CHILDREN) break;

    const childRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    const childAbsolute = path.join(absolutePath, entry.name);

    if (entry.isDirectory()) {
      const child = scanDir(childAbsolute, entry.name, childRelative, depth + 1, maxDepth);
      node.children!.push(child);
      node.fileCount! += child.fileCount ?? 0;
    } else if (entry.isFile()) {
      node.children!.push({
        name: entry.name,
        path: childRelative,
        type: "file",
      });
      node.fileCount! += 1;
    }

    childCount++;
  }

  return node;
}

/**
 * Compute summary statistics from a scanned tree.
 */
export function computeSummary(
  tree: RepoTreeNode,
  sourceType: string,
  branch?: string,
): RepoSummary {
  let totalFiles = 0;
  let totalDirectories = 0;

  function walk(node: RepoTreeNode) {
    if (node.type === "directory") {
      totalDirectories++;
      for (const child of node.children ?? []) {
        walk(child);
      }
    } else {
      totalFiles++;
    }
  }

  walk(tree);

  const topLevelFolders = (tree.children ?? [])
    .filter((c) => c.type === "directory")
    .map((c) => c.name);

  return {
    totalFiles,
    totalDirectories,
    topLevelFolders,
    sourceType,
    branch,
  };
}
