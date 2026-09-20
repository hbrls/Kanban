import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

type ScanResult = {
  durationMs: number;
  failedChecks: string[];
  file: string;
  ok: boolean;
  status: "match" | "mismatch" | "error";
  stderr?: string;
};

const repoRoot = process.cwd();
const roots = positionalArgs().map((arg) => path.resolve(repoRoot, arg));
const limit = numberArg("--limit");
const skip = numberArg("--skip") ?? 0;
const assertMode = process.argv.includes("--assert");
const compareScript = path.resolve(repoRoot, "scripts/office-wasm-reader/compare-walnut-pptx-protocol.ts");

if (roots.length === 0) {
  console.error("Usage: npm run scan:office-wasm-reader:pptx -- <pptx-file-or-directory> [--skip=N] [--limit=N] [--assert]");
  process.exit(1);
}

const files = roots.flatMap(collectPptxFiles).slice(skip, limit == null ? undefined : skip + limit);
const startedAt = Date.now();
const results = files.map(scanFile);
const failedCheckCounts = new Map<string, number>();
for (const result of results) {
  for (const check of result.failedChecks) {
    failedCheckCounts.set(check, (failedCheckCounts.get(check) ?? 0) + 1);
  }
}

const summary = {
  durationMs: Date.now() - startedAt,
  failedCheckCounts: Object.fromEntries([...failedCheckCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  files: results,
  mismatchCount: results.filter((result) => result.status === "mismatch").length,
  okCount: results.filter((result) => result.status === "match").length,
  total: results.length,
  errorCount: results.filter((result) => result.status === "error").length,
};

console.log(JSON.stringify(summary, null, 2));
if (assertMode && (summary.mismatchCount > 0 || summary.errorCount > 0)) {
  process.exit(1);
}

function scanFile(file: string): ScanResult {
  const startedAt = Date.now();
  const comparatorArgs = ["--import", "tsx", compareScript, file];
  if (assertMode) {
    comparatorArgs.push("--assert");
  }
  const child = spawnSync(process.execPath, comparatorArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  });
  const durationMs = Date.now() - startedAt;
  const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
  if (child.status !== 0) {
    return {
      durationMs,
      failedChecks: [],
      file: path.relative(repoRoot, file),
      ok: false,
      status: "error",
      stderr: trimOutput(output),
    };
  }

  if (assertMode) {
    return {
      durationMs,
      failedChecks: [],
      file: path.relative(repoRoot, file),
      ok: true,
      status: "match",
    };
  }

  const decoded = parseComparatorJson(output);
  if (!decoded) {
    return {
      durationMs,
      failedChecks: [],
      file: path.relative(repoRoot, file),
      ok: false,
      status: "error",
      stderr: trimOutput(output),
    };
  }

  const parity = asRecord(decoded.parity);
  const failedChecks = Array.isArray(parity?.failedChecks) ? parity.failedChecks.filter(isString) : [];
  return {
    durationMs,
    failedChecks,
    file: path.relative(repoRoot, file),
    ok: failedChecks.length === 0,
    status: failedChecks.length === 0 ? "match" : "mismatch",
  };
}

function parseComparatorJson(output: string): Record<string, unknown> | null {
  const marker = "\n{\n  \"byteComparison\"";
  const start = output.indexOf(marker);
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function collectPptxFiles(root: string): string[] {
  if (!existsSync(root)) {
    throw new Error(`Path does not exist: ${root}`);
  }

  const stats = statSync(root);
  if (stats.isFile()) {
    return isPptxFile(root) ? [root] : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectPptxFiles(fullPath));
    } else if (entry.isFile() && isPptxFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function isPptxFile(file: string): boolean {
  return path.extname(file).toLowerCase() === ".pptx" && !path.basename(file).startsWith("~$");
}

function positionalArgs(): string[] {
  return process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
}

function numberArg(name: string): number | null {
  const prefix = `${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function trimOutput(value: string): string {
  return value.trim().split("\n").slice(-20).join("\n");
}
