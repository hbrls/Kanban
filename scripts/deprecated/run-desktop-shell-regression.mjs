#!/usr/bin/env node

import { spawn } from "node:child_process";

import { isServerReachable, waitForServer } from "../page-snapshot-lib.mjs";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3301";
const TIMEOUT_MS = 60_000;
const PLAYWRIGHT_ARGS = process.argv.slice(2);

function spawnWithLogs(command, args, env) {
  const logs = [];
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    process.stderr.write(text);
  });

  return {
    child,
    getLogs: () => logs.join("").slice(-6000),
  };
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function main() {
  const useManagedServer = process.env.ROUTA_E2E_ASSUME_SERVER !== "1";
  let serverProcess = null;

  if (useManagedServer) {
    const alreadyRunning = await isServerReachable(BASE_URL);
    if (alreadyRunning) {
      console.error(`Refusing to start managed desktop-shell server because ${BASE_URL} is already in use.`);
      process.exit(1);
    }

    const url = new globalThis.URL(BASE_URL);
    serverProcess = spawnWithLogs(
      "npx",
      ["next", "dev", "--webpack", "--hostname", url.hostname, "--port", url.port || "3301"],
      process.env,
    );

    try {
      await waitForServer(BASE_URL, TIMEOUT_MS, serverProcess.getLogs);
    } catch (error) {
      serverProcess.child.kill("SIGTERM");
      throw error;
    }
  }

  const runner = spawnWithLogs(
    "npx",
    [
      "playwright",
      "test",
      "e2e/desktop-shell-visual.spec.ts",
      "--project=chromium",
      "--workers=1",
      ...PLAYWRIGHT_ARGS,
    ],
    {
      ...process.env,
      PLAYWRIGHT_BASE_URL: BASE_URL,
    },
  );

  const result = await waitForExit(runner.child);

  if (serverProcess) {
    serverProcess.child.kill("SIGTERM");
    await waitForExit(serverProcess.child);
  }

  if (result.code !== 0) {
    process.exit(result.code);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
