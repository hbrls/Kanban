/**
 * Database Connection — SQLite only
 *
 * The TypeScript/Next.js backend persists data in SQLite (better-sqlite3).
 * SQLite is loaded dynamically via createSqliteSystem() in routa-system.ts
 * to avoid bundling better-sqlite3 in web builds.
 *
 * Driver selection is lazy and cached for the lifetime of the process.
 */

// ─── Database Type Detection ────────────────────────────────────────────

export type DatabaseDriver = "sqlite" | "memory";

export type DatabaseRuntime = "serverless" | "node-local";

export function isServerlessRuntime(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export function getDatabaseRuntime(): DatabaseRuntime {
  return isServerlessRuntime() ? "serverless" : "node-local";
}

/**
 * Determine which database driver to use based on environment.
 *
 * Priority:
 * 1. ROUTA_DB_DRIVER env var (explicit override: "sqlite" | "memory")
 * 2. Serverless (Vercel / AWS Lambda) → memory
 * 3. Local Node.js backend → sqlite
 */
export function getDatabaseDriver(): DatabaseDriver {
  // 1. Explicit override always wins
  const driverOverride = process.env.ROUTA_DB_DRIVER;
  if (driverOverride === "sqlite" || driverOverride === "memory") {
    return driverOverride;
  }

  // 2. Serverless deployments have no persistent local storage
  if (isServerlessRuntime()) {
    return "memory";
  }

  // 3. Local Node.js backend: default to SQLite
  return "sqlite";
}

/**
 * Check if any database backend is configured.
 * Used by the system factory to decide between DB-backed and InMemory stores.
 */
export function isDatabaseConfigured(): boolean {
  return getDatabaseDriver() === "sqlite";
}

/**
 * Check if the database is SQLite.
 */
export function isSqlite(): boolean {
  return getDatabaseDriver() === "sqlite";
}
