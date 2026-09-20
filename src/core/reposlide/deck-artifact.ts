import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const REPOSLIDE_PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export interface RepoSlideDeckArtifact {
  absolutePath: string;
  fileName: string;
}

export function buildRepoSlideDownloadPath(sessionId: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/reposlide-result/download`;
}

export async function resolveRepoSlideDeckArtifact(
  sessionCwd: string,
  deckPath?: string,
): Promise<RepoSlideDeckArtifact | undefined> {
  if (!deckPath || !path.isAbsolute(deckPath) || path.extname(deckPath).toLowerCase() !== ".pptx") {
    return undefined;
  }

  const absolutePath = await realpathIfExists(deckPath);
  if (!absolutePath) {
    return undefined;
  }

  const stats = await fs.stat(absolutePath).catch(() => null);
  if (!stats?.isFile()) {
    return undefined;
  }

  const allowedRoots = (await Promise.all([
    realpathIfExists(sessionCwd),
    realpathIfExists(os.tmpdir()),
  ])).filter((value): value is string => Boolean(value));

  if (!allowedRoots.some((root) => isWithinRoot(absolutePath, root))) {
    return undefined;
  }

  return {
    absolutePath,
    fileName: path.basename(absolutePath),
  };
}

async function realpathIfExists(targetPath: string): Promise<string | undefined> {
  try {
    return await fs.realpath(targetPath);
  } catch {
    return undefined;
  }
}

function isWithinRoot(targetPath: string, rootPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}
