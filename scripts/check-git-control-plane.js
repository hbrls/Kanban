#!/usr/bin/env node

import fs from "node:fs";

import {
  buildSessionStartDoctorOutput,
  formatGitControlPlaneDoctorReport,
  inspectGitControlPlane,
} from "./lib/git-control-plane-doctor.js";

function hasJsonFlag(argv) {
  return argv.includes("--json");
}

function runCli(argv) {
  const report = inspectGitControlPlane(process.cwd());

  if (hasJsonFlag(argv)) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatGitControlPlaneDoctorReport(report)}\n`);
  }

  if (report.status === "warning") {
    process.exitCode = 1;
  }
}

function runHook(rawInput) {
  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    return false;
  }

  if (!payload || payload.hook_event_name !== "SessionStart") {
    return false;
  }

  const cwd = typeof payload.cwd === "string" && payload.cwd.length > 0 ? payload.cwd : process.cwd();
  const report = inspectGitControlPlane(cwd);
  const output = buildSessionStartDoctorOutput(report);

  if (output) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }

  return true;
}

const stdin = process.stdin.isTTY ? "" : fs.readFileSync(0, "utf8");
if (!runHook(stdin)) {
  runCli(process.argv.slice(2));
}
