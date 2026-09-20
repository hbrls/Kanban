#!/usr/bin/env node

import { setTimeout as delay } from "node:timers/promises";

import { TerminalManager } from "../../src/core/acp/terminal-manager";

async function waitFor(condition: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await delay(25);
  }
}

async function main(): Promise<void> {
  const manager = new TerminalManager();
  const notifications: Array<Record<string, unknown>> = [];
  const shell = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
  const args = process.platform === "win32"
    ? ["-NoLogo", "-NoProfile"]
    : ["-i"];

  const { terminalId } = manager.create(
    {
      command: shell,
      args,
      cwd: process.cwd(),
      cols: 80,
      rows: 24,
      env: {},
    },
    "pty-smoke-session",
    (notification) => notifications.push(notification.params),
  );

  try {
    manager.resize(terminalId, 100, 30);
    manager.write(terminalId, "printf 'ROUTA_PTY_SMOKE\\n'; exit\n");

    await waitFor(
      () => manager.getOutput(terminalId).output.includes("ROUTA_PTY_SMOKE"),
      5000,
      "terminal output",
    );

    const exit = await manager.waitForExit(terminalId);
    if (exit.exitCode !== 0) {
      throw new Error(`Expected exit code 0, got ${exit.exitCode}`);
    }

    const updates = notifications.map((entry) => (entry.update ?? {}) as Record<string, unknown>);
    const hasCreated = updates.some((update) => update.sessionUpdate === "terminal_created");
    const hasOutput = updates.some((update) => update.sessionUpdate === "terminal_output");
    const hasExited = updates.some((update) => update.sessionUpdate === "terminal_exited");

    if (!hasCreated || !hasOutput || !hasExited) {
      throw new Error(
        `Missing expected terminal notifications: created=${hasCreated} output=${hasOutput} exited=${hasExited}`,
      );
    }

    const output = manager.getOutput(terminalId).output;
    console.log(`terminal-pty-smoke: ok (${output.includes("ROUTA_PTY_SMOKE") ? "output" : "missing-output"})`);
  } finally {
    manager.release(terminalId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
