import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

type ScanResult = {
  durationMs: number;
  failedChecks: string[];
  file: string;
  ok: boolean;
  protocolDiffCount?: number;
  protocolDiffPaths?: string[];
  status: "match" | "mismatch" | "error";
  stderr?: string;
};

const repoRoot = process.cwd();
const parsedArgs = parseArgs(process.argv.slice(2));
const roots = parsedArgs.positionals.map((arg) => path.resolve(repoRoot, arg));
const limit = positiveIntegerArg("--limit");
const skip = positiveIntegerArg("--skip") ?? 0;
const timeoutMs = positiveIntegerArg("--timeout-ms");
const diffLimit = positiveIntegerArg("--diff-limit") ?? 20;
const assertMode = parsedArgs.flags.has("--assert");
const compactMode = parsedArgs.flags.has("--compact");
const diffMode = parsedArgs.flags.has("--diff") || assertMode;
const compareScript = path.resolve(
  repoRoot,
  "scripts/office-wasm-reader/compare-walnut-xlsx-protocol.ts",
);

if (roots.length === 0) {
  console.error(
    "Usage: npm run scan:office-wasm-reader:xlsx -- <xlsx-file-or-directory> [--skip=N] [--limit=N] [--timeout-ms=N] [--diff] [--diff-limit=N] [--assert] [--compact]",
  );
  process.exit(1);
}

const files = roots
  .flatMap(collectXlsxFiles)
  .slice(skip, limit == null ? undefined : skip + limit);
const startedAt = Date.now();
const results = files.map(scanFile);
const failedCheckCounts = new Map<string, number>();
const protocolDiffPathCounts = new Map<string, number>();

for (const result of results) {
  for (const check of result.failedChecks) {
    failedCheckCounts.set(check, (failedCheckCounts.get(check) ?? 0) + 1);
  }

  for (const diffPath of result.protocolDiffPaths ?? []) {
    protocolDiffPathCounts.set(
      diffPath,
      (protocolDiffPathCounts.get(diffPath) ?? 0) + 1,
    );
  }
}

const mismatchCount = results.filter(
  (result) => result.status === "mismatch",
).length;
const errorCount = results.filter((result) => result.status === "error").length;
const summary = {
  diff: diffMode,
  durationMs: Date.now() - startedAt,
  errorCount,
  failedCheckCounts: sortedCounts(failedCheckCounts),
  files: compactMode ? results.map(compactResult) : results,
  mismatchCount,
  okCount: results.filter((result) => result.status === "match").length,
  protocolDiffPathCounts: sortedCounts(protocolDiffPathCounts),
  total: results.length,
};

console.log(JSON.stringify(summary, null, 2));
if (assertMode && (mismatchCount > 0 || errorCount > 0)) {
  process.exit(1);
}

function scanFile(file: string): ScanResult {
  const startedAt = Date.now();
  const elapsedMs = () => Date.now() - startedAt;
  const args = ["--import", "tsx", compareScript];
  if (diffMode) {
    args.push("--diff", `--diff-limit=${diffLimit}`);
  }

  args.push(file);
  const child = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
    timeout: timeoutMs ?? undefined,
  });
  const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
  if (child.status !== 0) {
    return {
      durationMs: elapsedMs(),
      failedChecks: [],
      file: displayPath(file),
      ok: false,
      status: "error",
      stderr: trimOutput(output),
    };
  }

  const decoded = parseComparatorJson(output);
  if (!decoded) {
    return {
      durationMs: elapsedMs(),
      failedChecks: [],
      file: displayPath(file),
      ok: false,
      status: "error",
      stderr: trimOutput(output),
    };
  }

  const equivalence = asRecord(decoded.equivalence);
  const failedChecks =
    equivalence == null
      ? ["equivalence"]
      : Object.entries(equivalence)
          .filter(([, value]) => value !== true)
          .map(([key]) => key);
  const protocolDiff = asRecord(decoded.protocolDiff);
  const protocolDiffCount = numberValue(protocolDiff?.totalCount);
  const protocolDiffPaths = Array.isArray(protocolDiff?.shown)
    ? protocolDiff.shown
        .map((diff) => stringValue(asRecord(diff)?.path))
        .filter(Boolean)
    : [];
  const hasProtocolDiff =
    diffMode && (protocolDiffCount == null || protocolDiffCount > 0);
  const ok = failedChecks.length === 0 && !hasProtocolDiff;

  return {
    durationMs: elapsedMs(),
    failedChecks,
    file: displayPath(file),
    ok,
    protocolDiffCount: diffMode ? protocolDiffCount : undefined,
    protocolDiffPaths: diffMode ? protocolDiffPaths : undefined,
    status: ok ? "match" : "mismatch",
  };
}

function parseComparatorJson(output: string): Record<string, unknown> | null {
  const start = jsonObjectStart(output, "equivalence");
  if (start < 0) return null;
  try {
    return JSON.parse(output.slice(start)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function jsonObjectStart(output: string, firstKey: string): number {
  const startMarker = `{\n  "${firstKey}"`;
  if (output.startsWith(startMarker)) {
    return 0;
  }

  const nestedMarker = `\n${startMarker}`;
  const nestedStart = output.indexOf(nestedMarker);
  return nestedStart < 0 ? -1 : nestedStart + 1;
}

function collectXlsxFiles(root: string): string[] {
  if (!existsSync(root)) {
    throw new Error(`Path does not exist: ${root}`);
  }

  const stats = statSync(root);
  if (stats.isFile()) {
    return isXlsxFile(root) ? [root] : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectXlsxFiles(fullPath));
    } else if (entry.isFile() && isXlsxFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function isXlsxFile(file: string): boolean {
  return (
    path.extname(file).toLowerCase() === ".xlsx" &&
    !path.basename(file).startsWith("~$")
  );
}

function displayPath(file: string): string {
  const relative = path.relative(repoRoot, file);
  return relative.startsWith("..") ? file : relative;
}

function parseArgs(args: string[]): {
  flags: Set<string>;
  positionals: string[];
} {
  const flags = new Set<string>();
  const positionals: string[] = [];
  const flagsWithValues = new Set([
    "--limit",
    "--skip",
    "--timeout-ms",
    "--diff-limit",
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--")) {
      const [flag] = arg.split("=", 1);
      flags.add(flag);
      if (!arg.includes("=") && flagsWithValues.has(flag)) {
        index += 1;
      }
      continue;
    }

    positionals.push(arg);
  }

  return { flags, positionals };
}

function positiveIntegerArg(name: string): number | null {
  const equalsPrefix = `${name}=`;
  const equalsValue = process.argv
    .find((arg) => arg.startsWith(equalsPrefix))
    ?.slice(equalsPrefix.length);
  const separateValueIndex = process.argv.findIndex((arg) => arg === name);
  const separateValue =
    separateValueIndex >= 0 ? process.argv[separateValueIndex + 1] : undefined;
  const raw = equalsValue ?? separateValue;
  if (raw == null) return null;

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function trimOutput(output: string): string {
  return output.trim().slice(0, 8000);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function sortedCounts(counts: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    ),
  );
}

function compactResult(result: ScanResult): Record<string, unknown> {
  return {
    durationMs: result.durationMs,
    failedChecks:
      result.failedChecks.length > 0 ? result.failedChecks : undefined,
    file: result.file,
    ok: result.ok,
    protocolDiffCount: result.protocolDiffCount,
    protocolDiffPaths:
      result.protocolDiffPaths && result.protocolDiffPaths.length > 0
        ? result.protocolDiffPaths
        : undefined,
    status: result.status,
  };
}
