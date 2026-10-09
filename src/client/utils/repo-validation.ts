"use client";

import { desktopAwareFetch } from "@/client/utils/diagnostics";

export type RepoAccessFailureReason = "empty-path" | "http" | "network";

export interface RepoAccessResult {
  repoPath: string;
  accessible: boolean;
  reason?: RepoAccessFailureReason;
  /** HTTP status when the access probe completed with a non-2xx response. */
  status?: number;
}

export async function checkRepoAccess(repoPath: string): Promise<RepoAccessResult> {
  const trimmed = repoPath.trim();
  if (!trimmed) {
    return { repoPath: trimmed, accessible: false, reason: "empty-path" };
  }

  try {
    const response = await desktopAwareFetch(
      `/api/clone/branches?repoPath=${encodeURIComponent(trimmed)}`,
      { cache: "no-store" },
    );
    if (response.ok) {
      return { repoPath: trimmed, accessible: true };
    }
    return { repoPath: trimmed, accessible: false, reason: "http", status: response.status };
  } catch {
    return { repoPath: trimmed, accessible: false, reason: "network" };
  }
}

export async function isAccessibleRepoPath(repoPath: string): Promise<boolean> {
  return (await checkRepoAccess(repoPath)).accessible;
}

export async function collectRepoAccessResults(repoPaths: string[]): Promise<RepoAccessResult[]> {
  const uniquePaths = Array.from(new Set(repoPaths.map((repoPath) => repoPath.trim()).filter(Boolean)));
  return Promise.all(uniquePaths.map((repoPath) => checkRepoAccess(repoPath)));
}

export async function collectAccessibleRepoPaths(repoPaths: string[]): Promise<Set<string>> {
  const results = await collectRepoAccessResults(repoPaths);
  return new Set(results.filter((entry) => entry.accessible).map((entry) => entry.repoPath));
}
