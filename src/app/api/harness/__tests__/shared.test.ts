import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const system = {
  codebaseStore: {
    get: vi.fn(),
    listByWorkspace: vi.fn(),
  },
};

const getCurrentRoutaRepoRootMock = vi.fn();

vi.mock("@/core/routa-system", () => ({
  getRoutaSystem: () => system,
}));

vi.mock("@/core/fitness/repo-root", () => ({
  getCurrentRoutaRepoRoot: () => getCurrentRoutaRepoRootMock(),
}));

import { isContextError, resolveRepoRoot } from "../shared";

describe("harness repo root resolution", () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "routa-harness-repo-root-"));
    system.codebaseStore.get.mockResolvedValue(undefined);
    system.codebaseStore.listByWorkspace.mockResolvedValue([]);
    getCurrentRoutaRepoRootMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("prefers the current routa repo for the default workspace when no explicit repo is selected", async () => {
    getCurrentRoutaRepoRootMock.mockReturnValue("/Users/phodal/ai/routa-js");

    await expect(resolveRepoRoot({ workspaceId: "default" })).resolves.toBe("/Users/phodal/ai/routa-js");
    expect(system.codebaseStore.listByWorkspace).not.toHaveBeenCalled();
  });

  it("falls back to workspace codebases when no current routa repo is available", async () => {
    system.codebaseStore.listByWorkspace.mockResolvedValue([
      {
        id: "cb-default",
        repoPath: tempDir,
        isDefault: true,
      },
    ]);

    await expect(resolveRepoRoot({ workspaceId: "default" })).resolves.toBe(tempDir);
  });

  it("treats missing directories as context errors", () => {
    expect(isContextError(`repoPath 不存在或不是目录: ${path.join(tempDir, "missing")}`)).toBe(true);
  });
});
