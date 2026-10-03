import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import path from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { loadEnvFile, runCheckSchedulesDb, type ScheduleDbQueryRunner } from "../check-schedules-db.js";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function writeEnvFile(dir: string, content: string): string {
  const envPath = path.join(dir, ".env.local");
  writeFileSync(envPath, content, "utf8");
  return envPath;
}

function createFakeRunner({
  schedules = [],
  indexes = [],
  createWorkspaceIndexSpy,
  createEnabledNextRunIndexSpy,
}: {
  schedules?: Array<{ table_name: string }>;
  indexes?: Array<{ indexname: string }>;
  createWorkspaceIndexSpy?: () => void;
  createEnabledNextRunIndexSpy?: () => void;
}) {
  let failed = false;

  const runner: ScheduleDbQueryRunner = {
    getSchedules: async () => {
      if (failed) {
        throw new Error("db failed");
      }
      return schedules as Array<{ table_name: string }>;
    },
    getIndexes: async () => {
      if (failed) {
        throw new Error("db failed");
      }
      return indexes as Array<{ indexname: string }>;
    },
    createWorkspaceIndex: async () => {
      createWorkspaceIndexSpy?.();
    },
    createEnabledNextRunIndex: async () => {
      createEnabledNextRunIndexSpy?.();
    },
  };

  return {
    runner,
    fail: () => {
      failed = true;
    },
  };
}

describe("loadEnvFile", () => {
  it("parses export syntax and quoted values", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "routa-hook-env-"));
    const envPath = writeEnvFile(
      dir,
      [
        "# comment",
        `DATABASE_URL='postgres://user:pass@127.0.0.1:5432/db'`,
        "ANOTHER=plain",
        "export SPACED='has spaces'",
        "",
      ].join("\n"),
    );

    const loaded = loadEnvFile(envPath);
    rmSync(dir, { recursive: true, force: true });

    expect(loaded.DATABASE_URL).toBe("postgres://user:pass@127.0.0.1:5432/db");
    expect(loaded.ANOTHER).toBe("plain");
    expect(loaded.SPACED).toBe("has spaces");
  });
});

describe("runCheckSchedulesDb", () => {
  it("loads DATABASE_URL from .env.local and succeeds when schema exists", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "routa-hook-checkdb-"));
    const previousUrl = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      const envPath = writeEnvFile(
        dir,
        "DATABASE_URL=postgres://user:pass@127.0.0.1:5432/routa",
      );

      const receivedUrls: string[] = [];
      const fake = createFakeRunner({
        schedules: [{ table_name: "schedules" }],
        indexes: [{ indexname: "pk" }],
        createWorkspaceIndexSpy: () => {
          // no-op
        },
      });

      const code = await runCheckSchedulesDb({
        envFile: envPath,
        queryRunner: (url) => {
          receivedUrls.push(url);
          return fake.runner;
        },
      });

      expect(code).toBe(0);
      expect(receivedUrls).toEqual(["postgres://user:pass@127.0.0.1:5432/routa"]);
    } finally {
      if (previousUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previousUrl;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns failure when DATABASE_URL is unavailable", async () => {
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const code = await runCheckSchedulesDb({ envFile: "/definitely/missing/.env.local" });

    if (previousUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousUrl;
    }

    expect(code).toBe(1);
  });

  it("returns failure when query execution fails", async () => {
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const fake = createFakeRunner({ schedules: [{ table_name: "schedules" }] });
    fake.fail();
    const code = await runCheckSchedulesDb({
      databaseUrl: "postgres://user:pass@127.0.0.1:5432/routa",
      queryRunner: () => fake.runner,
    });

    if (previousUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousUrl;
    }
    expect(code).toBe(1);
  });

  it("applies missing indexes when index count is low", async () => {
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const callState: { workspace: number; enabled: number } = { workspace: 0, enabled: 0 };
    const fake = createFakeRunner({
      schedules: [{ table_name: "schedules" }],
      indexes: [{ indexname: "pk" }],
      createWorkspaceIndexSpy: () => {
        callState.workspace += 1;
      },
      createEnabledNextRunIndexSpy: () => {
        callState.enabled += 1;
      },
    });

    const code = await runCheckSchedulesDb({
      databaseUrl: "postgres://user:pass@127.0.0.1:5432/routa",
      queryRunner: () => fake.runner,
    });

    if (previousUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousUrl;
    }
    expect(code).toBe(0);
    expect(callState.workspace).toBe(1);
    expect(callState.enabled).toBe(1);
  });
});
