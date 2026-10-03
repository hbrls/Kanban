import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

type IndexRow = {
  indexname: string;
};

type TableRow = {
  table_name: string;
};

export type ScheduleDbQueryRunner = {
  getSchedules: () => Promise<TableRow[]>;
  getIndexes: () => Promise<IndexRow[]>;
  createWorkspaceIndex: () => Promise<unknown>;
  createEnabledNextRunIndex: () => Promise<unknown>;
};

type RunCheckSchedulesDbOptions = {
  databaseUrl?: string;
  envFile?: string;
  queryRunner?: (databaseUrl: string) => ScheduleDbQueryRunner;
};

function stripQuotes(raw: string): string {
  if (raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function trimComment(raw: string): string {
  let activeQuote: "'" | '"' | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (char === '"' || char === "'") {
      if (activeQuote === null) {
        activeQuote = char;
      } else if (activeQuote === char) {
        activeQuote = null;
      }
      continue;
    }

    if (char === "#" && activeQuote === null) {
      return raw.slice(0, index).trim();
    }
  }

  return raw.trim();
}

export function loadEnvFile(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) {
    return {};
  }

  const content = readFileSync(envPath, "utf8");
  const env: Record<string, string> = {};
  const lineRe = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/;

  for (const line of content.split("\n")) {
    const match = line.match(lineRe);
    if (!match) {
      continue;
    }

    const key = match[1];
    if (!key) {
      continue;
    }

    const rawValue = trimComment(match[2] ?? "");
    const value = stripQuotes(rawValue);
    env[key] = value;
  }

  return env;
}

function resolveEnvPath(envFile?: string): string {
  if (envFile) {
    return path.resolve(process.cwd(), envFile);
  }

  const source = fileURLToPath(import.meta.url);
  return path.join(path.dirname(source), "..", "..", "..", ".env.local");
}

export function createDefaultQueries(databaseUrl: string): ScheduleDbQueryRunner {
  const sql = neon(databaseUrl);
  return {
    getSchedules: async () =>
      (await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='schedules'`) as TableRow[],
    getIndexes: async () =>
      (await sql`SELECT indexname FROM pg_indexes WHERE tablename='schedules'`) as IndexRow[],
    createWorkspaceIndex: () =>
      sql`CREATE INDEX IF NOT EXISTS "schedules_workspace_idx" ON "schedules" ("workspace_id")`,
    createEnabledNextRunIndex: () =>
      sql`CREATE INDEX IF NOT EXISTS "schedules_enabled_next_run_idx" ON "schedules" ("enabled", "next_run_at")`,
  };
}

export async function runCheckSchedulesDb(options: RunCheckSchedulesDbOptions = {}): Promise<number> {
  const envPath = resolveEnvPath(options.envFile);
  const loadedEnv = loadEnvFile(envPath);
  for (const [key, value] of Object.entries(loadedEnv)) {
    process.env[key] = value;
  }

  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Run: export $(grep -v '^#' .env.local | xargs)");
    return 1;
  }

  const queries = options.queryRunner ? options.queryRunner(databaseUrl) : createDefaultQueries(databaseUrl);

  try {
    const schedules = await queries.getSchedules();
    console.log("schedules exists:", schedules.length > 0);

    const indexes = await queries.getIndexes();
    console.log("indexes:", indexes.map((entry) => entry.indexname).join(", "));

    if (schedules.length > 0 && indexes.length < 3) {
      await queries.createWorkspaceIndex();
      await queries.createEnabledNextRunIndex();
      console.log("missing indexes applied");
    }

    return 0;
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

const modulePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === modulePath) {
  runCheckSchedulesDb().then((code) => process.exit(code)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
