import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  default: { spawn: spawnMock },
}));

import { runCommand } from "../process.js";

type MockChildProcess = EventEmitter & {
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
  pid: number;
  signalCode: NodeJS.Signals | null;
  stderr: EventEmitter;
  stdout: EventEmitter;
};

function createMockChildProcess(pid = 4321): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.pid = pid;
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn((signal: NodeJS.Signals) => {
    child.killed = true;
    child.signalCode = signal;
    return true;
  });
  return child;
}

describe("runCommand", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("kills the shell process group on timeout so pipeline children do not hang the caller", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);
    const processKillSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    const resultPromise = runCommand("sleep 10 | cat", { stream: false, timeoutMs: 50 });

    await vi.advanceTimersByTimeAsync(50);

    expect(spawnMock).toHaveBeenCalledWith("/bin/bash", ["-c", "sleep 10 | cat"], expect.objectContaining({
      detached: true,
    }));
    expect(processKillSpy).toHaveBeenCalledWith(-4321, "SIGTERM");

    child.signalCode = "SIGTERM";
    child.emit("close", null);

    const result = await resultPromise;

    expect(result.exitCode).toBe(124);
    expect(result.output).toContain("Command timed out after 50ms");
  });

  it("drops git local environment variables before running child commands", async () => {
    const child = createMockChildProcess();
    spawnMock.mockReturnValue(child);
    const originalGitDir = process.env.GIT_DIR;
    const originalGitWorkTree = process.env.GIT_WORK_TREE;
    const originalGitIndexFile = process.env.GIT_INDEX_FILE;

    try {
      process.env.GIT_DIR = "/tmp/current/.git";
      process.env.GIT_WORK_TREE = "/tmp/current";
      process.env.GIT_INDEX_FILE = "/tmp/current/index";

      const resultPromise = runCommand("git status", {
        env: {
          CUSTOM_ENV: "kept",
          GIT_INDEX_FILE: "/tmp/override-index",
          NODE_ENV: process.env.NODE_ENV ?? "test",
        },
        stream: false,
      });

      expect(spawnMock).toHaveBeenCalledWith("/bin/bash", ["-c", "git status"], expect.objectContaining({
        env: expect.objectContaining({
          CUSTOM_ENV: "kept",
        }),
      }));
      const spawnEnv = spawnMock.mock.calls[0][2].env as NodeJS.ProcessEnv;
      expect(spawnEnv.GIT_DIR).toBeUndefined();
      expect(spawnEnv.GIT_WORK_TREE).toBeUndefined();
      expect(spawnEnv.GIT_INDEX_FILE).toBeUndefined();

      child.emit("close", 0);

      const result = await resultPromise;
      expect(result.exitCode).toBe(0);
    } finally {
      if (originalGitDir === undefined) {
        delete process.env.GIT_DIR;
      } else {
        process.env.GIT_DIR = originalGitDir;
      }
      if (originalGitWorkTree === undefined) {
        delete process.env.GIT_WORK_TREE;
      } else {
        process.env.GIT_WORK_TREE = originalGitWorkTree;
      }
      if (originalGitIndexFile === undefined) {
        delete process.env.GIT_INDEX_FILE;
      } else {
        process.env.GIT_INDEX_FILE = originalGitIndexFile;
      }
    }
  });
});
