"use client";

import { parseDiffFromFile } from "@pierre/diffs";
import type { FileContents, FileDiffMetadata } from "@pierre/diffs";

export interface ParsedDiffPreview {
  additions: number;
  deletions: number;
  lines: Array<{
    kind: "meta" | "hunk" | "add" | "remove" | "context";
    text: string;
    oldLineNumber?: number;
    newLineNumber?: number;
    sourceLineIndex?: number;
  }>;
}

export interface CommitDiffFile {
  path: string;
  previousPath?: string;
  status: "modified" | "added" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  startLineIndex: number; // Line index in the patch where this file's diff starts
}

export interface CommitDiffFileSection extends CommitDiffFile {
  patch: string;
}

export function parseUnifiedDiffPreview(diff: { patch: string; additions?: number; deletions?: number }): ParsedDiffPreview {
  const lines = diff.patch.split("\n");
  let additions = diff.additions ?? 0;
  let deletions = diff.deletions ?? 0;
  let oldLineNumber = 0;
  let newLineNumber = 0;
  let countedBodyLines = false;

  const parsedLines = lines.map((line, sourceLineIndex) => {
    if (line.startsWith("+++ b/")) return { kind: "meta" as const, text: line, sourceLineIndex };
    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (diff.additions == null) additions += 1;
      countedBodyLines = true;
      const parsedLine = { kind: "add" as const, text: line, newLineNumber, sourceLineIndex };
      newLineNumber += 1;
      return parsedLine;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      if (diff.deletions == null) deletions += 1;
      countedBodyLines = true;
      const parsedLine = { kind: "remove" as const, text: line, oldLineNumber, sourceLineIndex };
      oldLineNumber += 1;
      return parsedLine;
    }
    if (line.startsWith("@@")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match) {
        oldLineNumber = Number.parseInt(match[1] ?? "0", 10);
        newLineNumber = Number.parseInt(match[2] ?? "0", 10);
      }
      return { kind: "hunk" as const, text: line, sourceLineIndex };
    }
    if (
      line.startsWith("diff --git ")
      || line.startsWith("index ")
      || line.startsWith("--- ")
      || line.startsWith("new file mode ")
      || line.startsWith("deleted file mode ")
      || line.startsWith("similarity index ")
      || line.startsWith("rename from ")
      || line.startsWith("rename to ")
    ) {
      return { kind: "meta" as const, text: line, sourceLineIndex };
    }
    if (line.startsWith(" ")) {
      countedBodyLines = true;
      const parsedLine = { kind: "context" as const, text: line, oldLineNumber, newLineNumber, sourceLineIndex };
      oldLineNumber += 1;
      newLineNumber += 1;
      return parsedLine;
    }
    return { kind: "context" as const, text: line, sourceLineIndex };
  });

  return {
    additions: countedBodyLines ? additions : diff.additions ?? additions,
    deletions: countedBodyLines ? deletions : diff.deletions ?? deletions,
    lines: parsedLines,
  };
}

export function reconstructFileContentsFromUnifiedDiff(parsedDiff: ParsedDiffPreview): { oldContents: string; newContents: string } | null {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let foundBodyLine = false;
  let oldEndsWithNewline = true;
  let newEndsWithNewline = true;
  let lastBodyLineKind: "context" | "remove" | "add" | null = null;

  for (const line of parsedDiff.lines) {
    if (line.kind === "context" && line.text.startsWith(" ")) {
      const content = line.text.slice(1);
      oldLines.push(content);
      newLines.push(content);
      foundBodyLine = true;
      lastBodyLineKind = "context";
    } else if (line.kind === "remove") {
      oldLines.push(line.text.slice(1));
      foundBodyLine = true;
      lastBodyLineKind = "remove";
    } else if (line.kind === "add") {
      newLines.push(line.text.slice(1));
      foundBodyLine = true;
      lastBodyLineKind = "add";
    } else if (line.text === "\\ No newline at end of file") {
      if (lastBodyLineKind === "context") {
        oldEndsWithNewline = false;
        newEndsWithNewline = false;
      } else if (lastBodyLineKind === "remove") {
        oldEndsWithNewline = false;
      } else if (lastBodyLineKind === "add") {
        newEndsWithNewline = false;
      }
    }
  }

  if (!foundBodyLine) {
    return null;
  }

  return {
    oldContents: joinReconstructedFileLines(oldLines, oldEndsWithNewline),
    newContents: joinReconstructedFileLines(newLines, newEndsWithNewline),
  };
}

function joinReconstructedFileLines(lines: string[], endsWithNewline: boolean): string {
  if (lines.length === 0) return "";
  return `${lines.join("\n")}${endsWithNewline ? "\n" : ""}`;
}

export function buildPierreDiffFromFullUnifiedPatch(file: CommitDiffFileSection): FileDiffMetadata | null {
  const parsedDiff = parseUnifiedDiffPreview({
    patch: file.patch,
    additions: file.additions,
    deletions: file.deletions,
  });
  const contents = reconstructFileContentsFromUnifiedDiff(parsedDiff);

  if (!contents) {
    return null;
  }

  const oldFile: FileContents = {
    name: file.previousPath ?? file.path,
    contents: contents.oldContents,
    cacheKey: `${file.startLineIndex}:old:${file.previousPath ?? file.path}:${contents.oldContents.length}`,
  };
  const newFile: FileContents = {
    name: file.path,
    contents: contents.newContents,
    cacheKey: `${file.startLineIndex}:new:${file.path}:${contents.newContents.length}`,
  };

  try {
    return parseDiffFromFile(oldFile, newFile, { context: 3 });
  } catch {
    return null;
  }
}

export function renderUnifiedDiffLines(parsedDiff: ParsedDiffPreview) {
  return parsedDiff.lines.map((line, index) => (
    <div
      key={`${line.kind}-${line.sourceLineIndex ?? index}-${line.oldLineNumber ?? ""}-${line.newLineNumber ?? ""}`}
      className={
        line.kind === "add"
          ? "grid grid-cols-[3rem_3rem_1.5rem_minmax(0,1fr)] bg-emerald-950/70 px-3 text-emerald-100"
          : line.kind === "remove"
            ? "grid grid-cols-[3rem_3rem_1.5rem_minmax(0,1fr)] bg-rose-950/60 px-3 text-rose-100"
            : line.kind === "hunk"
              ? "bg-sky-950/60 px-3 text-sky-100"
              : line.kind === "meta"
                ? "bg-slate-900 px-3 text-slate-400"
                : "grid grid-cols-[3rem_3rem_1.5rem_minmax(0,1fr)] px-3 text-slate-200"
      }
    >
      {line.kind === "add" || line.kind === "remove" || line.kind === "context" ? (
        <>
          <span className="select-none pr-2 text-right text-slate-500">
            {typeof line.oldLineNumber === "number" ? (
              <span data-testid={`kanban-diff-old-line-${index}`}>{line.oldLineNumber}</span>
            ) : ""}
          </span>
          <span className="select-none pr-2 text-right text-slate-500">
            {typeof line.newLineNumber === "number" ? (
              <span data-testid={`kanban-diff-new-line-${index}`}>{line.newLineNumber}</span>
            ) : ""}
          </span>
          <span className="select-none text-center">
            {line.text[0] ?? " "}
          </span>
          <span>{line.text.slice(1) || " "}</span>
        </>
      ) : (
        line.text || " "
      )}
    </div>
  ));
}
