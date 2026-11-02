/**
 * API endpoint for module dependency graph analysis.
 * Calls routa-cli graph analyze command and returns JSON.
 */

import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import type { DependencyGraph } from "@/types/graph";

const TIMEOUT_MS = 30000; // 30 seconds

function findRoutaCli(): string | null {
  // Try to find routa binary (contains CLI subcommands)
  const candidates = [
    join(process.cwd(), "target", "release", "routa"),
    join(process.cwd(), "target", "debug", "routa"),
    "routa", // In PATH
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // If not found locally, assume it's in PATH
  return "routa";
}

function executeRoutaCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const cli = findRoutaCli();
    if (!cli) {
      reject(new Error("routa-cli binary not found"));
      return;
    }

    const proc = spawn(cli, args);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`routa-cli execution timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    proc.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const repoRoot = searchParams.get("repoRoot");
    const lang = searchParams.get("lang") || "auto";
    const depth = searchParams.get("depth") || "fast";

    if (!repoRoot) {
      return NextResponse.json(
        { error: "repoRoot parameter is required" },
        { status: 400 }
      );
    }

    if (!existsSync(repoRoot)) {
      return NextResponse.json(
        { error: `Directory does not exist: ${repoRoot}` },
        { status: 400 }
      );
    }

    // Build routa-cli command arguments
    const args = [
      "graph",
      "analyze",
      "-d", repoRoot,
      "-l", lang,
      "--depth", depth,
      "-f", "json",
    ];

    const { stdout, stderr, exitCode } = await executeRoutaCli(args);

    if (exitCode !== 0) {
      console.error("[graph/analyze] routa-cli failed:", stderr);
      return NextResponse.json(
        {
          error: "Failed to analyze dependency graph",
          details: stderr || "Unknown error",
        },
        { status: 500 }
      );
    }

    // Parse JSON output
    let graph: DependencyGraph;
    try {
      graph = JSON.parse(stdout);
    } catch (error) {
      console.error("[graph/analyze] Failed to parse routa-cli output:", error);
      return NextResponse.json(
        {
          error: "Failed to parse graph analysis output",
          details: error instanceof Error ? error.message : "Invalid JSON",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(graph);
  } catch (error) {
    console.error("[graph/analyze] Unexpected error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
