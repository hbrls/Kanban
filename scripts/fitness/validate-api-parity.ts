#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { fromRoot } from "../lib/paths";

const NEXTJS_URL = process.env.NEXTJS_URL ?? "http://localhost:3000";
const RUST_URL = process.env.RUST_URL ?? "http://localhost:3210";

const COLORS = {
  red: "\u001b[0;31m",
  green: "\u001b[0;32m",
  yellow: "\u001b[0;33m",
  blue: "\u001b[0;34m",
  reset: "\u001b[0m",
};

type Options = {
  runRuntime: boolean;
  nextjsOnly: boolean;
  rustOnly: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    runRuntime: false,
    nextjsOnly: false,
    rustOnly: false,
  };

  for (const arg of argv) {
    if (arg === "--runtime") options.runRuntime = true;
    if (arg === "--nextjs-only") {
      options.runRuntime = true;
      options.nextjsOnly = true;
    }
    if (arg === "--rust-only") {
      options.runRuntime = true;
      options.rustOnly = true;
    }
  }

  return options;
}

function heading(content: string): void {
  process.stdout.write(`${content}\n`);
}

function runApiContractTests(baseUrl: string, extraArgs: string[] = []): number {
  const result = spawnSync(process.execPath, ["--import", "tsx", fromRoot("tests", "api-contract", "run.ts"), ...extraArgs], {
    cwd: fromRoot(),
    stdio: "inherit",
    env: {
      ...process.env,
      BASE_URL: baseUrl,
    },
  });
  return result.status ?? 1;
}

function readJsonTotalPassed(baseUrl: string): number {
  const result = spawnSync(process.execPath, ["--import", "tsx", fromRoot("tests", "api-contract", "run.ts"), "--json"], {
    cwd: fromRoot(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: {
      ...process.env,
      BASE_URL: baseUrl,
    },
  });
  if (result.status !== 0 || !result.stdout) {
    return 0;
  }
  try {
    const parsed = JSON.parse(result.stdout) as { totalPassed?: number };
    return parsed.totalPassed ?? 0;
  } catch {
    return 0;
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  let errors = 0;

  heading(`\n${COLORS.blue}╔══════════════════════════════════════════════════╗${COLORS.reset}`);
  heading(`${COLORS.blue}║       Routa.js API Parity Validation             ║${COLORS.reset}`);
  heading(`${COLORS.blue}╚══════════════════════════════════════════════════╝${COLORS.reset}\n`);

  heading(`${COLORS.blue}[1/2] Static route parity check...${COLORS.reset}\n`);
  const staticCheck = spawnSync(process.execPath, ["--import", "tsx", fromRoot("scripts", "fitness", "check-api-parity.ts")], {
    cwd: fromRoot(),
    stdio: "inherit",
  });
  if (staticCheck.status === 0) {
    heading(`\n${COLORS.green}✅ Static route check passed${COLORS.reset}\n`);
  } else {
    heading(`\n${COLORS.red}❌ Static route check failed${COLORS.reset}`);
    heading(`${COLORS.yellow}   Run: node --import tsx scripts/fitness/check-api-parity.ts --fix-hint${COLORS.reset}\n`);
    errors += 1;
  }

  if (options.runRuntime) {
    heading(`${COLORS.blue}[2/2] Runtime contract tests...${COLORS.reset}\n`);

    if (!options.rustOnly) {
      heading(`${COLORS.blue}── Testing Next.js backend (${NEXTJS_URL}) ──${COLORS.reset}\n`);
      if (runApiContractTests(NEXTJS_URL) === 0) {
        heading(`${COLORS.green}✅ Next.js contract tests passed${COLORS.reset}\n`);
      } else {
        heading(`${COLORS.red}❌ Next.js contract tests failed${COLORS.reset}\n`);
        errors += 1;
      }
    }

    if (!options.nextjsOnly) {
      heading(`${COLORS.blue}── Testing Rust backend (${RUST_URL}) ──${COLORS.reset}\n`);
      if (runApiContractTests(RUST_URL) === 0) {
        heading(`${COLORS.green}✅ Rust contract tests passed${COLORS.reset}\n`);
      } else {
        heading(`${COLORS.red}❌ Rust contract tests failed${COLORS.reset}\n`);
        errors += 1;
      }
    }

    if (!options.nextjsOnly && !options.rustOnly) {
      heading(`${COLORS.blue}── Cross-comparing results ──${COLORS.reset}\n`);
      const nextjsPassed = readJsonTotalPassed(NEXTJS_URL);
      const rustPassed = readJsonTotalPassed(RUST_URL);
      heading(`  Next.js passed: ${nextjsPassed} tests`);
      heading(`  Rust passed:    ${rustPassed} tests`);

      if (nextjsPassed === rustPassed) {
        heading(`  ${COLORS.green}✅ Both backends have identical test results${COLORS.reset}\n`);
      } else {
        heading(`  ${COLORS.yellow}⚠️  Backends differ in test results${COLORS.reset}\n`);
        errors += 1;
      }
    }
  } else {
    heading(`${COLORS.yellow}[2/2] Skipping runtime tests (use --runtime, --nextjs-only, or --rust-only)${COLORS.reset}\n`);
  }

  if (errors === 0) {
    heading(`${COLORS.green}══════════════════════════════════════════════════${COLORS.reset}`);
    heading(`${COLORS.green}  ✅ All parity checks passed!${COLORS.reset}`);
    heading(`${COLORS.green}══════════════════════════════════════════════════${COLORS.reset}\n`);
    return;
  }

  heading(`${COLORS.red}══════════════════════════════════════════════════${COLORS.reset}`);
  heading(`${COLORS.red}  ❌ ${errors} parity check(s) failed${COLORS.reset}`);
  heading(`${COLORS.red}══════════════════════════════════════════════════${COLORS.reset}\n`);
  process.exit(1);
}

main();
