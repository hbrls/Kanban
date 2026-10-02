import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
  default: {
    spawnSync: spawnSyncMock,
  },
}));

import {
  buildSessionStartDoctorOutput,
  formatGitControlPlaneDoctorReport,
  inspectGitControlPlane,
} from "../lib/git-control-plane-doctor.js";

function gitOk(stdout: string) {
  return {
    status: 0,
    stdout,
    stderr: "",
  };
}

function gitMissing(stderr = "") {
  return {
    status: 1,
    stdout: "",
    stderr,
  };
}

function installGitMock(values: {
  repoRoot?: string | null;
  coreWorktree?: string | null;
  userName?: string | null;
  userEmail?: string | null;
}) {
  spawnSyncMock.mockImplementation((_command: string, args: string[]) => {
    const joined = args.join(" ");

    if (joined === "rev-parse --show-toplevel") {
      return values.repoRoot ? gitOk(`${values.repoRoot}\n`) : gitMissing("not a git repo");
    }

    if (joined === "config --local --get core.worktree") {
      return values.coreWorktree ? gitOk(`${values.coreWorktree}\n`) : gitMissing();
    }

    if (joined === "config --local --get user.name") {
      return values.userName ? gitOk(`${values.userName}\n`) : gitMissing();
    }

    if (joined === "config --local --get user.email") {
      return values.userEmail ? gitOk(`${values.userEmail}\n`) : gitMissing();
    }

    throw new Error(`Unexpected git invocation: ${joined}`);
  });
}

describe("git control plane doctor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns when local core.worktree is set", () => {
    installGitMock({
      repoRoot: "/repo",
      coreWorktree: "/repo/.git/worktrees",
      userName: "Codex",
    });

    const report = inspectGitControlPlane("/repo");
    const hookOutput = buildSessionStartDoctorOutput(report);

    expect(report.status).toBe("warning");
    expect(report.localCoreWorktree).toBe("/repo/.git/worktrees");
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unexpected-core-worktree",
        }),
        expect.objectContaining({
          code: "suspicious-local-user-name",
        }),
      ]),
    );
    expect(formatGitControlPlaneDoctorReport(report)).toContain("core.worktree is set");
    expect(hookOutput?.systemMessage).toContain("core.worktree");
    expect(hookOutput?.systemMessage).not.toContain("hooks:sync");
  });

  it("warns when local git identity placeholders are set", () => {
    installGitMock({
      repoRoot: "/repo",
      userName: "Test",
      userEmail: "placeholder@example.com",
    });

    const report = inspectGitControlPlane("/repo");
    const hookOutput = buildSessionStartDoctorOutput(report);

    expect(report.status).toBe("warning");
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "suspicious-local-user-name",
        }),
        expect.objectContaining({
          code: "suspicious-local-user-email",
        }),
      ]),
    );
    expect(hookOutput?.hookSpecificOutput.additionalContext).toContain("placeholder");
  });

  it("reports ok when local git config is clean", () => {
    installGitMock({
      repoRoot: "/repo",
    });

    const report = inspectGitControlPlane("/repo");

    expect(report.status).toBe("ok");
    expect(report.issues).toEqual([]);
    expect(report.localCoreWorktree).toBeNull();
    expect(buildSessionStartDoctorOutput(report)).toBeNull();
  });

  it("skips outside a git worktree", () => {
    installGitMock({ repoRoot: null });

    const report = inspectGitControlPlane("/not-a-repo");

    expect(report.status).toBe("skipped");
    expect(report.repoRoot).toBeNull();
  });
});
