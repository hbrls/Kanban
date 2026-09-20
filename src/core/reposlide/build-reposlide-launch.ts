import * as fs from "fs";
import * as path from "path";

import type { Codebase } from "@/core/models/codebase";

import {
  computeSummary,
  scanRepoTree,
  type RepoSummary,
  type RepoTreeNode,
} from "./scan-codebase-tree";

const ENTRY_POINT_PATTERNS = [
  "README.md",
  "README",
  "AGENTS.md",
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "setup.py",
  "pom.xml",
  "build.gradle",
  "Makefile",
  "Dockerfile",
  "docker-compose.yml",
  "tsconfig.json",
];

const ANCHOR_DIRS = [
  "src/app",
  "src/core",
  "src/client",
  "crates",
  "apps",
  "lib",
  "pkg",
  "cmd",
  "internal",
  "api",
];

const KEY_FILE_NAMES = [
  "README.md",
  "AGENTS.md",
  "ARCHITECTURE.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "CHANGELOG.md",
];

const MAX_DIR_FOCUS_AREAS = 6;
const SLIDE_SKILL_NAME = "slide-skill";

export interface RepoSlideLaunchPoint {
  name: string;
  path: string;
  reason?: string;
}

export interface RepoSlideFocusDirectory {
  name: string;
  path: string;
  fileCount: number;
  children: Array<{
    name: string;
    type: "file" | "directory";
    fileCount?: number;
  }>;
}

export interface RepoSlideLaunchContext {
  rootFiles: string[];
  entryPoints: RepoSlideLaunchPoint[];
  keyFiles: RepoSlideLaunchPoint[];
  focusDirectories: RepoSlideFocusDirectory[];
}

export interface RepoSlideLaunchResponse {
  codebase: {
    id: string;
    label?: string;
    repoPath: string;
    sourceType: string;
    sourceUrl?: string;
    branch?: string;
  };
  summary: RepoSummary;
  context: RepoSlideLaunchContext;
  launch: {
    skillName: string;
    skillRepoPath?: string;
    skillAvailable: boolean;
    unavailableReason?: string;
    prompt: string;
  };
}

export function resolveRepoSlideSkillRepoPath(projectRoot = process.cwd()): string | undefined {
  const candidate = path.join(projectRoot, "tools/ppt-template");
  const skillFile = path.join(candidate, ".agents/skills", SLIDE_SKILL_NAME, "SKILL.md");
  return fs.existsSync(skillFile) ? candidate : undefined;
}

export function buildRepoSlideLaunch(
  codebase: Codebase,
  options?: { projectRoot?: string },
): RepoSlideLaunchResponse {
  const sourceType = codebase.sourceType ?? "local";
  const tree = scanRepoTree(codebase.repoPath);
  const summary = computeSummary(tree, sourceType, codebase.branch);
  const context = buildLaunchContext(tree);
  const skillRepoPath = resolveRepoSlideSkillRepoPath(options?.projectRoot);
  const skillAvailable = Boolean(skillRepoPath);

  return {
    codebase: {
      id: codebase.id,
      label: codebase.label,
      repoPath: codebase.repoPath,
      sourceType,
      sourceUrl: codebase.sourceUrl,
      branch: codebase.branch,
    },
    summary,
    context,
    launch: {
      skillName: SLIDE_SKILL_NAME,
      skillRepoPath,
      skillAvailable,
      unavailableReason: skillAvailable
        ? undefined
        : "slide-skill could not be found relative to the current Routa installation.",
      prompt: buildRepoSlidePrompt(codebase, summary, context),
    },
  };
}

function buildLaunchContext(tree: RepoTreeNode): RepoSlideLaunchContext {
  return {
    rootFiles: (tree.children ?? [])
      .filter((child) => child.type === "file")
      .map((child) => child.name),
    entryPoints: detectEntryPoints(tree),
    keyFiles: detectKeyFiles(tree),
    focusDirectories: pickFocusDirectories(tree).map((directory) => ({
      name: directory.name,
      path: directory.path,
      fileCount: directory.fileCount ?? 0,
      children: (directory.children ?? []).map((child) => ({
        name: child.name,
        type: child.type,
        fileCount: child.type === "directory" ? child.fileCount ?? 0 : undefined,
      })),
    })),
  };
}

function buildRepoSlidePrompt(
  codebase: Codebase,
  summary: RepoSummary,
  context: RepoSlideLaunchContext,
): string {
  const repoLabel = codebase.label ?? (path.basename(codebase.repoPath) || codebase.repoPath);
  const lines = [
    `Create a presentation slide deck for the repository "${repoLabel}".`,
    "",
    "Goal:",
    "- Explain what this repository is, how it is structured, and how an engineer should orient themselves quickly.",
    "- Keep the deck concise: target 6-8 slides.",
    "- Use evidence from the local repository only. If a conclusion is inferred, label it as an inference.",
    "",
    "Required coverage:",
    "- Repository purpose and audience.",
    "- Runtime or architecture overview.",
    "- Top-level structure and major subsystems.",
    "- Important entry points, docs, and operational files.",
    "- Notable risks, TODOs, or ambiguities if they materially affect understanding.",
    "",
    "Before drafting slides, inspect these first if they exist:",
    "- AGENTS.md",
    "- README.md",
    "- docs/ARCHITECTURE.md",
    "- docs/adr/README.md",
    "- package.json / Cargo.toml / pyproject.toml / go.mod",
    "",
    "Output:",
    "- Build the deck with slide-skill and save the final artifact as a PPTX.",
    "- In the final response, report the PPTX path and summarize the slide outline.",
    "",
    "Repository context:",
    `- Repo path: ${codebase.repoPath}`,
    `- Branch: ${codebase.branch ?? "unknown"}`,
    `- Source type: ${summary.sourceType}`,
    `- Total files scanned: ${summary.totalFiles}`,
    `- Total directories scanned: ${summary.totalDirectories}`,
    `- Top-level folders: ${summary.topLevelFolders.join(", ") || "(none detected)"}`,
    `- Root files: ${context.rootFiles.join(", ") || "(none detected)"}`,
  ];

  if (context.entryPoints.length > 0) {
    lines.push("", "Entry points and architecture anchors:");
    for (const item of context.entryPoints) {
      lines.push(`- ${item.path}: ${item.reason ?? item.name}`);
    }
  }

  if (context.keyFiles.length > 0) {
    lines.push("", "Key files worth reading:");
    for (const file of context.keyFiles) {
      lines.push(`- ${file.path}`);
    }
  }

  if (context.focusDirectories.length > 0) {
    lines.push("", "Largest top-level areas:");
    for (const directory of context.focusDirectories) {
      const preview = directory.children
        .slice(0, 8)
        .map((child) =>
          child.type === "directory"
            ? `${child.name}/ (${child.fileCount ?? 0} files)`
            : child.name,
        )
        .join(", ");
      lines.push(
        `- ${directory.path} (${directory.fileCount} files): ${preview || "no immediate children scanned"}`,
      );
    }
  }

  lines.push(
    "",
    "Work in the repository itself as the primary context. Do not generate application code for Routa; generate the slide deck artifact about this repo.",
  );

  return lines.join("\n");
}

function detectEntryPoints(tree: RepoTreeNode): RepoSlideLaunchPoint[] {
  const found: RepoSlideLaunchPoint[] = [];

  for (const child of tree.children ?? []) {
    if (child.type !== "file") continue;
    for (const pattern of ENTRY_POINT_PATTERNS) {
      if (child.name === pattern || child.name.startsWith(pattern.split(".")[0])) {
        found.push({
          name: child.name,
          path: child.path,
          reason: `Project entry point (${pattern})`,
        });
        break;
      }
    }
  }

  for (const anchor of ANCHOR_DIRS) {
    const node = findNodeByPath(tree, anchor);
    if (node) {
      found.push({
        name: anchor,
        path: node.path,
        reason: "Architecture anchor directory",
      });
    }
  }

  return found;
}

function detectKeyFiles(tree: RepoTreeNode): RepoSlideLaunchPoint[] {
  return (tree.children ?? [])
    .filter((child) => child.type === "file" && KEY_FILE_NAMES.includes(child.name))
    .map((child) => ({
      name: child.name,
      path: child.path,
    }));
}

function pickFocusDirectories(tree: RepoTreeNode): RepoTreeNode[] {
  return (tree.children ?? [])
    .filter((child) => child.type === "directory")
    .sort((left, right) => (right.fileCount ?? 0) - (left.fileCount ?? 0))
    .slice(0, MAX_DIR_FOCUS_AREAS);
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
