#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "./index.js";

export function handleCliError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}

export async function main(): Promise<void> {
  process.exitCode = await runCli(process.argv.slice(2));
}

const modulePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;

if (invokedPath === modulePath) {
  void main().catch((error) => {
    handleCliError(error);
  });
}
