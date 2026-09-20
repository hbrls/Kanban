import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { scanRepoTree, computeSummary } from "../scan-codebase-tree";
import { buildRepoSlideLaunch, resolveRepoSlideSkillRepoPath } from "../build-reposlide-launch";
import type { Codebase } from "@/core/models/codebase";

/** Create a small fixture directory tree for testing. */
function createFixtureDir(): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "reposlide-test-"));

  fs.mkdirSync(path.join(base, "src"));
  fs.mkdirSync(path.join(base, "src", "app"));
  fs.mkdirSync(path.join(base, "src", "core"));
  fs.mkdirSync(path.join(base, "docs"));
  fs.mkdirSync(path.join(base, "crates"));

  fs.writeFileSync(path.join(base, "README.md"), "# Test");
  fs.writeFileSync(path.join(base, "AGENTS.md"), "agents");
  fs.writeFileSync(path.join(base, "package.json"), "{}");
  fs.writeFileSync(path.join(base, "src", "index.ts"), "export {}");
  fs.writeFileSync(path.join(base, "src", "app", "page.tsx"), "<Page />");
  fs.writeFileSync(path.join(base, "src", "core", "utils.ts"), "export {}");
  fs.writeFileSync(path.join(base, "docs", "guide.md"), "# Guide");

  return base;
}

function removeFixtureDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe("scanRepoTree", () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    removeFixtureDir(fixtureDir);
  });

  it("scans directory and returns a tree with correct types", () => {
    const tree = scanRepoTree(fixtureDir);
    expect(tree.type).toBe("directory");
    expect(tree.children).toBeDefined();
    expect(tree.children!.length).toBeGreaterThan(0);
  });

  it("counts files correctly", () => {
    const tree = scanRepoTree(fixtureDir);
    expect(tree.fileCount).toBe(7);
  });

  it("sorts directories before files", () => {
    const tree = scanRepoTree(fixtureDir);
    const types = tree.children!.map((c) => c.type);
    const firstFileIndex = types.indexOf("file");
    const lastDirIndex = types.lastIndexOf("directory");
    if (firstFileIndex >= 0 && lastDirIndex >= 0) {
      expect(lastDirIndex).toBeLessThan(firstFileIndex);
    }
  });

  it("skips ignored directories", () => {
    const nodeModulesDir = path.join(fixtureDir, "node_modules");
    fs.mkdirSync(nodeModulesDir);
    fs.writeFileSync(path.join(nodeModulesDir, "pkg.js"), "");

    const tree = scanRepoTree(fixtureDir);
    const names = tree.children!.map((c) => c.name);
    expect(names).not.toContain("node_modules");

    fs.rmSync(nodeModulesDir, { recursive: true });
  });
});

describe("computeSummary", () => {
  it("returns correct file and directory counts", () => {
    const fixtureDir = createFixtureDir();
    const tree = scanRepoTree(fixtureDir);
    const summary = computeSummary(tree, "local", "main");

    expect(summary.totalFiles).toBe(7);
    expect(summary.totalDirectories).toBeGreaterThan(0);
    expect(summary.topLevelFolders).toContain("src");
    expect(summary.topLevelFolders).toContain("docs");
    expect(summary.sourceType).toBe("local");
    expect(summary.branch).toBe("main");

    removeFixtureDir(fixtureDir);
  });
});

describe("buildRepoSlideLaunch", () => {
  let fixtureDir: string;
  let projectRoot: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "reposlide-project-"));
    fs.mkdirSync(path.join(projectRoot, "tools", "ppt-template", ".agents", "skills", "slide-skill"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "tools", "ppt-template", ".agents", "skills", "slide-skill", "SKILL.md"),
      "---\nname: slide-skill\ndescription: slide skill\n---\nUse this skill."
    );
  });

  afterAll(() => {
    removeFixtureDir(fixtureDir);
    removeFixtureDir(projectRoot);
  });

  it("resolves the bundled slide-skill repo path", () => {
    expect(resolveRepoSlideSkillRepoPath(projectRoot)).toBe(
      path.join(projectRoot, "tools", "ppt-template"),
    );
  });

  it("builds launch payload with repo summary and skill context", () => {
    const codebase: Codebase = {
      id: "cb-1",
      workspaceId: "ws-1",
      repoPath: fixtureDir,
      branch: "main",
      label: "test-repo",
      isDefault: true,
      sourceType: "local",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const launch = buildRepoSlideLaunch(codebase, { projectRoot });

    expect(launch.codebase.id).toBe("cb-1");
    expect(launch.codebase.label).toBe("test-repo");
    expect(launch.summary.totalFiles).toBe(7);
    expect(launch.launch.skillName).toBe("slide-skill");
    expect(launch.launch.skillRepoPath).toBe(path.join(projectRoot, "tools", "ppt-template"));
    expect(launch.launch.skillAvailable).toBe(true);
    expect(launch.context.entryPoints.some((entry) => entry.path === "README.md")).toBe(true);
    expect(launch.launch.prompt).toContain('Create a presentation slide deck for the repository "test-repo".');
    expect(launch.launch.prompt).toContain(`- Repo path: ${fixtureDir}`);
  });

  it("includes the largest top-level directories in launch context", () => {
    const codebase: Codebase = {
      id: "cb-2",
      workspaceId: "ws-1",
      repoPath: fixtureDir,
      branch: "main",
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const launch = buildRepoSlideLaunch(codebase, { projectRoot });
    expect(launch.context.focusDirectories.length).toBeGreaterThan(0);
    expect(launch.context.focusDirectories.some((directory) => directory.path === "src")).toBe(true);
  });

  it("detects key files at root level", () => {
    const codebase: Codebase = {
      id: "cb-3",
      workspaceId: "ws-1",
      repoPath: fixtureDir,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const launch = buildRepoSlideLaunch(codebase, { projectRoot });
    expect(launch.context.keyFiles.some((file) => file.name === "README.md")).toBe(true);
    expect(launch.context.keyFiles.some((file) => file.name === "AGENTS.md")).toBe(true);
  });

  it("preserves source metadata in the launch payload", () => {
    const codebase: Codebase = {
      id: "cb-4",
      workspaceId: "ws-1",
      repoPath: fixtureDir,
      branch: "develop",
      label: "my-repo",
      isDefault: true,
      sourceType: "github",
      sourceUrl: "https://github.com/example/repo",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const launch = buildRepoSlideLaunch(codebase, { projectRoot });
    expect(launch.codebase.label).toBe("my-repo");
    expect(launch.codebase.branch).toBe("develop");
    expect(launch.codebase.sourceType).toBe("github");
    expect(launch.codebase.sourceUrl).toBe("https://github.com/example/repo");
    expect(launch.summary.totalFiles).toBe(7);
  });

  it("marks the launch as unavailable when slide-skill cannot be resolved", () => {
    const codebase: Codebase = {
      id: "cb-5",
      workspaceId: "ws-1",
      repoPath: fixtureDir,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const launch = buildRepoSlideLaunch(codebase, { projectRoot: fixtureDir });
    expect(launch.launch.skillAvailable).toBe(false);
    expect(launch.launch.skillRepoPath).toBeUndefined();
    expect(launch.launch.unavailableReason).toContain("slide-skill");
  });
});
