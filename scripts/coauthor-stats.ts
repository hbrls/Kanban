#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type Options = {
  range?: string;
  includeMerges: boolean;
  json: boolean;
  table: boolean;
};

type CoAuthorRecord = {
  commit: string;
  tool: string;
  model: string;
  email: string;
  rawName: string;
};

type Summary = {
  totalCoAuthorLines: number;
  commitsWithCoAuthor: number;
  uniqueTools: number;
  uniqueModels: number;
  topTools: Array<{ name: string; count: number }>;
  topModels: Array<{ name: string; count: number }>;
  topToolModelPairs: Array<{ tool: string; model: string; count: number }>;
};

const UNKNOWN_MODEL = "(unknown)";

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    includeMerges: false,
    json: false,
    table: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--include-merges") {
      options.includeMerges = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--table") {
      options.table = true;
      continue;
    }
    if (arg === "--range") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("--range requires a value, e.g. --range origin/main..HEAD");
      }
      options.range = next;
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp(): void {
  console.log(`
Co-author stats

Usage:
  node --import tsx scripts/coauthor-stats.ts [--range <git-range>] [--include-merges] [--json] [--table]

Examples:
  node --import tsx scripts/coauthor-stats.ts
  node --import tsx scripts/coauthor-stats.ts --range origin/main..HEAD
  node --import tsx scripts/coauthor-stats.ts --json
  node --import tsx scripts/coauthor-stats.ts --table
`);
}

function runGitLog(options: Options): string {
  const args = ["log", "--pretty=format:%H%x1f%B%x1e"];
  if (!options.includeMerges) {
    args.push("--no-merges");
  }
  if (options.range) {
    args.push(options.range);
  } else {
    args.push("--all");
  }
  return execFileSync("git", args, { encoding: "utf8" });
}

function parseRecords(logOutput: string): CoAuthorRecord[] {
  const commits = logOutput.split("\x1e").filter((entry) => entry.trim().length > 0);
  const records: CoAuthorRecord[] = [];

  for (const entry of commits) {
    const separator = entry.indexOf("\x1f");
    if (separator === -1) {
      continue;
    }
    const commit = entry.slice(0, separator).trim();
    const body = entry.slice(separator + 1);
    const lines = body.split(/\r?\n/);

    for (const line of lines) {
      const parsed = parseCoAuthorLine(line);
      if (!parsed) {
        continue;
      }
      records.push({
        commit,
        tool: parsed.tool,
        model: parsed.model,
        email: parsed.email,
        rawName: parsed.name,
      });
    }
  }

  return records;
}

function parseCoAuthorLine(line: string): { name: string; tool: string; model: string; email: string } | null {
  const match = line.match(/^Co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/i);
  if (!match) {
    return null;
  }

  const name = match[1].trim();
  const email = match[2].trim();
  const { tool, model } = splitToolModel(name);

  return { name, tool, model, email };
}

export function splitToolModel(name: string): { tool: string; model: string } {
  if (!name.endsWith(")")) {
    return { tool: name, model: UNKNOWN_MODEL };
  }

  const openIdx = name.lastIndexOf("(");
  if (openIdx === -1) {
    return { tool: name, model: UNKNOWN_MODEL };
  }

  const tool = name.slice(0, openIdx).trim();
  const model = name.slice(openIdx + 1, -1).trim();
  if (!tool || !model) {
    return { tool: name, model: UNKNOWN_MODEL };
  }
  return { tool, model };
}

export function summarize(records: CoAuthorRecord[]): Summary {
  const commitsWithCoAuthor = new Set(records.map((record) => record.commit)).size;

  const toolCounts = countBy(records, (record) => record.tool);
  const modelCounts = countBy(records, (record) => record.model);
  const pairCounts = countBy(records, (record) => `${record.tool}\u0000${record.model}`);

  return {
    totalCoAuthorLines: records.length,
    commitsWithCoAuthor,
    uniqueTools: toolCounts.size,
    uniqueModels: modelCounts.size,
    topTools: mapToSortedArray(toolCounts).slice(0, 20),
    topModels: mapToSortedArray(modelCounts).slice(0, 20),
    topToolModelPairs: mapToSortedArray(pairCounts)
      .slice(0, 30)
      .map(({ name, count }) => {
        const [tool, model] = name.split("\u0000");
        return { tool, model, count };
      }),
  };
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function mapToSortedArray(counts: Map<string, number>): Array<{ name: string; count: number }> {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name);
    });
}

function printSummary(summary: Summary): void {
  console.log("Co-authored-by summary");
  console.log("=====================");
  console.log(`total_coauthor_lines: ${summary.totalCoAuthorLines}`);
  console.log(`commits_with_coauthor: ${summary.commitsWithCoAuthor}`);
  console.log(`unique_tools: ${summary.uniqueTools}`);
  console.log(`unique_models: ${summary.uniqueModels}`);
  console.log("");

  console.log("Top tools");
  for (const item of summary.topTools) {
    console.log(`  ${item.count.toString().padStart(4, " ")}  ${item.name}`);
  }
  console.log("");

  console.log("Top models");
  for (const item of summary.topModels) {
    console.log(`  ${item.count.toString().padStart(4, " ")}  ${item.name}`);
  }
  console.log("");

  console.log("Top tool + model pairs");
  for (const item of summary.topToolModelPairs) {
    console.log(`  ${item.count.toString().padStart(4, " ")}  ${item.tool} (${item.model})`);
  }
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function printMarkdownTableSummary(summary: Summary): void {
  console.log("## Co-authored-by Summary");
  console.log("");
  console.log("| metric | value |");
  console.log("|---|---:|");
  console.log(`| total_coauthor_lines | ${summary.totalCoAuthorLines} |`);
  console.log(`| commits_with_coauthor | ${summary.commitsWithCoAuthor} |`);
  console.log(`| unique_tools | ${summary.uniqueTools} |`);
  console.log(`| unique_models | ${summary.uniqueModels} |`);
  console.log("");

  console.log("## Top Tools");
  console.log("");
  console.log("| tool | count |");
  console.log("|---|---:|");
  for (const item of summary.topTools) {
    console.log(`| ${escapeMarkdownCell(item.name)} | ${item.count} |`);
  }
  console.log("");

  console.log("## Top Models");
  console.log("");
  console.log("| model | count |");
  console.log("|---|---:|");
  for (const item of summary.topModels) {
    console.log(`| ${escapeMarkdownCell(item.name)} | ${item.count} |`);
  }
  console.log("");

  console.log("## Top Tool + Model Pairs");
  console.log("");
  console.log("| tool | model | count |");
  console.log("|---|---|---:|");
  for (const item of summary.topToolModelPairs) {
    console.log(`| ${escapeMarkdownCell(item.tool)} | ${escapeMarkdownCell(item.model)} | ${item.count} |`);
  }
}

function main(): void {
  try {
    const options = parseArgs(process.argv.slice(2));
    const logOutput = runGitLog(options);
    const records = parseRecords(logOutput);
    const summary = summarize(records);

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    if (options.table) {
      printMarkdownTableSummary(summary);
      return;
    }

    printSummary(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
