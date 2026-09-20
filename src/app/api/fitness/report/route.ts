import { promises as fsp } from "fs";
import * as path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  isFitnessContextError,
  normalizeFitnessContextValue,
  resolveFitnessRepoRoot,
  type FitnessContext,
} from "@/core/fitness/repo-root";

const FITNESS_PROFILES = ["generic", "agent_orchestrator"] as const;

type FitnessProfile = (typeof FITNESS_PROFILES)[number];

type ReportApiProfileResult = {
  profile: FitnessProfile;
  status: "ok" | "missing" | "error";
  source: "snapshot";
  report?: unknown;
  error?: string;
};

type ReportResponse = {
  generatedAt: string;
  requestedProfiles: FitnessProfile[];
  profiles: ReportApiProfileResult[];
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseReportContext(searchParams: URLSearchParams): FitnessContext {
  return {
    workspaceId: normalizeFitnessContextValue(searchParams.get("workspaceId")),
    codebaseId: normalizeFitnessContextValue(searchParams.get("codebaseId")),
    repoPath: normalizeFitnessContextValue(searchParams.get("repoPath")),
  };
}

function profileSnapshotPath(repoRoot: string, profile: FitnessProfile) {
  return path.join(
    repoRoot,
    "docs/fitness/reports",
    profile === "generic" ? "harness-fluency-latest.json" : "harness-fluency-agent-orchestrator-latest.json",
  );
}

export async function GET(request: NextRequest) {
  try {
    const context = parseReportContext(request.nextUrl.searchParams);
    const repoRoot = await resolveFitnessRepoRoot(context, {
      preferCurrentRepoForDefaultWorkspace: true,
    });
    const results: ReportApiProfileResult[] = [];

    for (const profile of FITNESS_PROFILES) {
      const snapshotPath = profileSnapshotPath(repoRoot, profile);

      try {
        await fsp.access(snapshotPath);
        const raw = await fsp.readFile(snapshotPath, "utf-8");
        results.push({
          profile,
          source: "snapshot",
          status: "ok",
          report: JSON.parse(raw),
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          results.push({
            profile,
            source: "snapshot",
            status: "missing",
            error: "快照文件不存在",
          });
          continue;
        }

        results.push({
          profile,
          source: "snapshot",
          status: "error",
          error: toMessage(error),
        });
      }
    }

    const response: ReportResponse = {
      generatedAt: new Date().toISOString(),
      requestedProfiles: [...FITNESS_PROFILES],
      profiles: results,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = toMessage(error);
    if (isFitnessContextError(message)) {
      return NextResponse.json(
        {
          error: "Fitness 快照上下文无效",
          details: message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "获取 Fitness 快照失败",
        details: message,
      },
      { status: 500 },
    );
  }
}
