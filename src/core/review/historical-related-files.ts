import { safeExecSync } from "../utils/safe-exec";

export interface HistoricalRelatedFile {
  path: string;
  score: number;
  sourceFiles: string[];
  relatedCommits: string[];
}

interface HistoricalRelatedFilesOptions {
  repoRoot: string;
  diffRange: string;
  head: string;
  changedFiles: string[];
  maxSourceFiles?: number;
  maxCommitsPerFile?: number;
  maxResults?: number;
}

interface BlameChunk {
  commit: string;
  start: number;
  end: number;
}

interface CandidateAccumulator {
  score: number;
  sourceFiles: Set<string>;
  relatedCommits: Set<string>;
}

const BLAME_HEADER_PATTERN = /^([0-9a-f]{40}) \d+ (\d+) (\d+)$/;
const DIFF_HUNK_PATTERN = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export function buildHistoricalRelatedFiles(
  options: HistoricalRelatedFilesOptions,
): HistoricalRelatedFile[] | undefined {
  const sourceFiles = options.changedFiles
    .map((file) => file.trim())
    .filter(Boolean)
    .slice(0, options.maxSourceFiles ?? 8);

  if (sourceFiles.length === 0) {
    return undefined;
  }

  const changedFileSet = new Set(sourceFiles);
  const blameCache = new Map<string, BlameChunk[]>();
  const commitFileCache = new Map<string, string[]>();
  const candidateMap = new Map<string, CandidateAccumulator>();

  for (const sourceFile of sourceFiles) {
    if (!fileExistsAtRevision(options.repoRoot, options.head, sourceFile)) {
      continue;
    }

    const lineSamples = collectInterestingLines(
      options.repoRoot,
      options.diffRange,
      sourceFile,
    );

    if (lineSamples.length === 0) {
      continue;
    }

    const blameChunks = loadBlameChunks(
      options.repoRoot,
      options.head,
      sourceFile,
      blameCache,
    );

    if (blameChunks.length === 0) {
      continue;
    }

    const commitHits = collectInterestingCommits(blameChunks, lineSamples);
    const rankedCommits = [...commitHits.entries()]
      .sort((left, right) => {
        const scoreDiff = right[1] - left[1];
        return scoreDiff !== 0 ? scoreDiff : left[0].localeCompare(right[0]);
      })
      .slice(0, options.maxCommitsPerFile ?? 8);

    for (const [commit, hits] of rankedCommits) {
      const touchedFiles = loadChangedFilesForCommit(
        options.repoRoot,
        commit,
        commitFileCache,
      );

      for (const candidatePath of touchedFiles) {
        if (
          !candidatePath
          || candidatePath === sourceFile
          || changedFileSet.has(candidatePath)
        ) {
          continue;
        }

        const entry = candidateMap.get(candidatePath) ?? {
          score: 0,
          sourceFiles: new Set<string>(),
          relatedCommits: new Set<string>(),
        };

        entry.score += hits;
        entry.sourceFiles.add(sourceFile);
        entry.relatedCommits.add(commit);
        candidateMap.set(candidatePath, entry);
      }
    }
  }

  if (candidateMap.size === 0) {
    return undefined;
  }

  const relatedFiles = [...candidateMap.entries()]
    .map(([candidatePath, entry]) => ({
      path: candidatePath,
      score: entry.score,
      sourceFiles: [...entry.sourceFiles].sort(),
      relatedCommits: [...entry.relatedCommits].sort(),
    }))
    .sort((left, right) => {
      const scoreDiff = right.score - left.score;
      return scoreDiff !== 0 ? scoreDiff : left.path.localeCompare(right.path);
    })
    .slice(0, options.maxResults ?? 10);

  return relatedFiles.length > 0 ? relatedFiles : undefined;
}

function fileExistsAtRevision(
  repoRoot: string,
  revision: string,
  filePath: string,
): boolean {
  try {
    safeExecSync("git", ["cat-file", "-e", `${revision}:${filePath}`], {
      cwd: repoRoot,
    });
    return true;
  } catch {
    return false;
  }
}

function tryGitOutput(repoRoot: string, args: string[]): string | undefined {
  try {
    return safeExecSync("git", args, { cwd: repoRoot });
  } catch {
    return undefined;
  }
}

function collectInterestingLines(
  repoRoot: string,
  diffRange: string,
  filePath: string,
): number[] {
  const rawDiff = tryGitOutput(repoRoot, ["diff", "--unified=0", diffRange, "--", filePath]);
  if (!rawDiff) {
    return [];
  }

  const interestingLines = new Set<number>();
  for (const line of rawDiff.split(/\r?\n/)) {
    const match = DIFF_HUNK_PATTERN.exec(line);
    if (!match) {
      continue;
    }

    const start = Number.parseInt(match[1] ?? "0", 10);
    const count = Number.parseInt(match[2] ?? "1", 10);
    const span = count > 0 ? count : 1;
    const end = start + span - 1;

    for (const lineNumber of [start - 1, start, end, end + 1]) {
      if (lineNumber > 0) {
        interestingLines.add(lineNumber);
      }
    }
  }

  return [...interestingLines].sort((left, right) => left - right);
}

function loadBlameChunks(
  repoRoot: string,
  revision: string,
  filePath: string,
  cache: Map<string, BlameChunk[]>,
): BlameChunk[] {
  const cacheKey = `${revision}:${filePath}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const rawBlame = tryGitOutput(repoRoot, ["blame", "--incremental", revision, "--", filePath]);
  if (!rawBlame) {
    cache.set(cacheKey, []);
    return [];
  }

  const chunks: BlameChunk[] = [];
  let currentChunk: BlameChunk | undefined;

  for (const line of rawBlame.split(/\r?\n/)) {
    const headerMatch = BLAME_HEADER_PATTERN.exec(line);
    if (headerMatch) {
      const start = Number.parseInt(headerMatch[2] ?? "0", 10);
      const numLines = Number.parseInt(headerMatch[3] ?? "0", 10);

      currentChunk = {
        commit: headerMatch[1] ?? "",
        start,
        end: start + numLines,
      };
      continue;
    }

    if (line.startsWith("filename ") && currentChunk) {
      chunks.push(currentChunk);
      currentChunk = undefined;
    }
  }

  chunks.sort((left, right) => left.start - right.start);
  cache.set(cacheKey, chunks);
  return chunks;
}

function collectInterestingCommits(
  blameChunks: BlameChunk[],
  lineNumbers: number[],
): Map<string, number> {
  const commitHits = new Map<string, number>();

  for (const lineNumber of lineNumbers) {
    const chunk = blameChunks.find(
      (candidate) => lineNumber >= candidate.start && lineNumber < candidate.end,
    );
    if (!chunk) {
      continue;
    }

    commitHits.set(chunk.commit, (commitHits.get(chunk.commit) ?? 0) + 1);
  }

  return commitHits;
}

function loadChangedFilesForCommit(
  repoRoot: string,
  commit: string,
  cache: Map<string, string[]>,
): string[] {
  const cached = cache.get(commit);
  if (cached) {
    return cached;
  }

  const rawFiles = tryGitOutput(
    repoRoot,
    ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-m", commit],
  );
  if (!rawFiles) {
    cache.set(commit, []);
    return [];
  }

  const files = [...new Set(
    rawFiles
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )];
  cache.set(commit, files);
  return files;
}
