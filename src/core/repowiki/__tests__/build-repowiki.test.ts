import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Codebase } from "@/core/models/codebase";
import { buildRepoWiki } from "../build-repowiki";

function createFixtureDir(): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "repowiki-test-"));
  fs.mkdirSync(path.join(base, "app"), { recursive: true });
  fs.mkdirSync(path.join(base, "src", "app"), { recursive: true });
  fs.mkdirSync(path.join(base, "src", "core"), { recursive: true });
  fs.mkdirSync(path.join(base, "docs", "adr"), { recursive: true });
  fs.mkdirSync(path.join(base, "crates"), { recursive: true });

  fs.writeFileSync(path.join(base, "README.md"), "# RepoWiki Fixture");
  fs.writeFileSync(path.join(base, "AGENTS.md"), "agent contract");
  fs.writeFileSync(path.join(base, "package.json"), "{}");
  fs.writeFileSync(path.join(base, "packagefoo.js"), "export const nope = true;\n");
  fs.writeFileSync(path.join(base, "app", "page.tsx"), "export default function AppPage() { return null; }");
  fs.writeFileSync(path.join(base, "src", "app", "page.tsx"), "export default function Page() { return null; }");
  fs.writeFileSync(path.join(base, "src", "core", "model.ts"), "export const model = {};\n");
  fs.writeFileSync(path.join(base, "docs", "ARCHITECTURE.md"), "# Architecture");
  fs.writeFileSync(path.join(base, "docs", "adr", "README.md"), "# ADR Index");

  return base;
}

describe("buildRepoWiki", () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("builds a normalized RepoWiki payload with storyline context", () => {
    const codebase: Codebase = {
      id: "cb-repowiki",
      workspaceId: "ws-1",
      repoPath: fixtureDir,
      branch: "main",
      label: "fixture",
      sourceType: "local",
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const wiki = buildRepoWiki(codebase);

    expect(wiki.codebase.id).toBe("cb-repowiki");
    expect(wiki.summary.totalFiles).toBeGreaterThan(0);
    expect(wiki.anchors.some((anchor) => anchor.path === "README.md")).toBe(true);
    expect(wiki.modules.some((module) => module.path === "src")).toBe(true);
    expect(wiki.modules.some((module) => module.path === "app" && module.role === "User-facing application layer.")).toBe(true);
    expect(wiki.architecture.runtimeBoundaries.length).toBeGreaterThan(0);
    expect(wiki.workflows.length).toBeGreaterThan(0);
    expect(wiki.glossary.length).toBeGreaterThan(0);
    expect(wiki.sourceLinks.length).toBeGreaterThan(0);
    expect(wiki.storylineContext.suggestedSections).toContain("Top-level architecture");
  });

  it("includes nested architecture docs and avoids loose root-file matches", () => {
    const codebase: Codebase = {
      id: "cb-repowiki-anchors",
      workspaceId: "ws-1",
      repoPath: fixtureDir,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const wiki = buildRepoWiki(codebase);

    expect(wiki.anchors.some((anchor) => anchor.path === "docs/ARCHITECTURE.md" && anchor.kind === "file")).toBe(true);
    expect(wiki.anchors.some((anchor) => anchor.path === "docs/adr/README.md" && anchor.kind === "file")).toBe(true);
    expect(wiki.anchors.some((anchor) => anchor.path === "packagefoo.js")).toBe(false);
    expect(wiki.storylineContext.entryPoints).toContain("docs/ARCHITECTURE.md");
  });
});
