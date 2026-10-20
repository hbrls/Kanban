/**
 * @vitest-environment node
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildRelevantStrategyMemoryPromptSection,
  getReasoningMemoryStoragePath,
  loadReasoningMemories,
  saveReasoningMemory,
  searchReasoningMemories,
} from "../reasoning-memory";
import {
  saveReasoningMemoryFromToolArgs,
  searchReasoningMemoriesFromToolArgs,
} from "../task-adaptive-tool";

describe("reasoning-memory", () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "routa-reasoning-home-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it("stores project-local reasoning memories in one json document", async () => {
    const repoRoot = "/Users/phodal/ai/routa-js";
    const result = saveReasoningMemory(repoRoot, {
      title: "Keep JIT cache updates scoped",
      content: "When updating Feature Explorer JIT cache behavior, preserve existing route fallbacks and add focused characterization tests first.",
      outcome: "success",
      featureIds: ["feature-explorer"],
      filePaths: ["src/core/kanban/context-preload.ts"],
      lanes: ["dev"],
      providers: ["codex"],
      tags: ["jit-context"],
      confidence: 0.82,
      evidenceCount: 2,
      sourceTaskIds: ["task-1"],
      sourceSessionIds: ["session-1"],
    });

    expect(result.storagePath).toBe(
      path.join(
        tempHome,
        ".routa",
        "projects",
        "Users-phodal-ai-routa-js",
        "reasoning-memory",
        "memories.json",
      ),
    );
    expect(getReasoningMemoryStoragePath(repoRoot)).toBe(result.storagePath);

    const stored = JSON.parse(await fs.readFile(result.storagePath, "utf8")) as {
      schemaVersion: number;
      memories: Array<{ title: string; featureIds: string[] }>;
    };
    expect(stored.schemaVersion).toBe(1);
    expect(stored.memories).toEqual([
      expect.objectContaining({
        title: "Keep JIT cache updates scoped",
        featureIds: ["feature-explorer"],
      }),
    ]);

    expect(loadReasoningMemories(repoRoot)).toEqual([
      expect.objectContaining({
        outcome: "success",
        confidence: 0.82,
        evidenceCount: 2,
        sourceTaskIds: ["task-1"],
        sourceSessionIds: ["session-1"],
      }),
    ]);
  });

  it("ranks memories by concrete task hints before generic overlap", () => {
    const repoRoot = "/Users/phodal/ai/routa-js";
    saveReasoningMemory(repoRoot, {
      title: "Prefer feature explorer characterization",
      content: "Use Feature Explorer fixtures before changing JIT retrieval because the prompt depends on stable file ranking.",
      outcome: "mixed",
      featureIds: ["feature-explorer"],
      filePaths: ["src/core/kanban/context-preload.ts"],
      lanes: ["todo"],
      providers: ["codex"],
      tags: ["retrieval"],
      confidence: 0.7,
      evidenceCount: 1,
    });
    saveReasoningMemory(repoRoot, {
      title: "Generic prompt cleanup",
      content: "Keep prompt sections concise and avoid repeating task details.",
      outcome: "success",
      tags: ["prompt"],
      confidence: 0.95,
      evidenceCount: 3,
    });

    const results = searchReasoningMemories(repoRoot, {
      query: "Feature Explorer JIT retrieval prompt",
      featureIds: ["feature-explorer"],
      filePaths: ["src/core/kanban/context-preload.ts"],
      lane: "todo",
      provider: "codex",
      maxResults: 2,
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: "Prefer feature explorer characterization",
      outcome: "mixed",
    });
    expect(results[0].matchReasons.join(" ")).toContain("feature feature-explorer");
    expect(results[0].matchReasons.join(" ")).toContain("file src/core/kanban/context-preload.ts");
  });

  it("formats matched memories as a concise strategy prompt section", () => {
    const repoRoot = "/Users/phodal/ai/routa-js";
    saveReasoningMemory(repoRoot, {
      title: "Avoid broad route rewrites",
      content: "When API parity is the goal, preserve the existing route shape and add contract tests before extracting shared helpers.",
      outcome: "failure",
      featureIds: ["api-parity"],
      filePaths: ["src/app/api/feature-explorer/friction-profiles/route.ts"],
      confidence: 0.91,
      evidenceCount: 4,
    });

    const section = buildRelevantStrategyMemoryPromptSection(
      searchReasoningMemories(repoRoot, {
        query: "feature explorer API parity contract route",
        featureIds: ["api-parity"],
      }),
    );

    expect(section).toContain("## Relevant Strategy Memory");
    expect(section).toContain("Avoid broad route rewrites");
    expect(section).toContain("Outcome: failure; confidence: 0.91");
    expect(section).toContain("Lesson: When API parity is the goal");
    expect(section).toContain("feature:api-parity");
  });

  it("saves and searches reasoning memory from MCP tool args", async () => {
    const repoRoot = path.join(tempHome, "repo");
    await fs.mkdir(repoRoot, { recursive: true });

    await saveReasoningMemoryFromToolArgs({
      repoPath: repoRoot,
      title: "Use focused parity checks",
      content: "For Feature Explorer API parity work, confirm the existing route contract before extracting shared helpers.",
      outcome: "success",
      taskId: "task-535",
      sessionIds: ["session-535"],
      featureId: "feature-explorer",
      filePaths: ["src/app/api/feature-explorer/friction-profiles/route.ts"],
      tags: ["api-parity"],
      lane: "dev",
      provider: "codex",
      confidence: 0.84,
      evidenceCount: 2,
    }, "default");

    const result = await searchReasoningMemoriesFromToolArgs({
      repoPath: repoRoot,
      query: "Feature Explorer API parity route contract",
      featureIds: ["feature-explorer"],
      filePaths: ["src/app/api/feature-explorer/friction-profiles/route.ts"],
      lane: "dev",
      provider: "codex",
    }, "default");

    expect(result.storagePath).toBe(getReasoningMemoryStoragePath(repoRoot));
    expect(result.memories).toEqual([
      expect.objectContaining({
        title: "Use focused parity checks",
        outcome: "success",
      }),
    ]);
    expect(result.promptSection).toContain("## Relevant Strategy Memory");
    expect(result.promptSection).toContain("Use focused parity checks");
  });
});
