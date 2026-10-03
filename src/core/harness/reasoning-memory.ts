import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getProjectStorageDir } from "@/core/storage/folder-slug";

const SCHEMA_VERSION = 1;
const DEFAULT_MAX_RESULTS = 3;

export type ReasoningMemoryOutcome = "success" | "failure" | "mixed";

export interface ReasoningMemoryItem {
  id: string;
  title: string;
  description?: string;
  content: string;
  outcome: ReasoningMemoryOutcome;
  sourceTaskIds: string[];
  sourceSessionIds: string[];
  tags: string[];
  confidence: number;
  evidenceCount: number;
  createdAt: string;
  updatedAt: string;
  repoPath?: string;
  featureIds: string[];
  filePaths: string[];
  lanes: string[];
  providers: string[];
}

export interface SaveReasoningMemoryInput {
  id?: string;
  title: string;
  description?: string;
  content: string;
  outcome?: ReasoningMemoryOutcome;
  sourceTaskIds?: string[];
  sourceSessionIds?: string[];
  tags?: string[];
  confidence?: number;
  evidenceCount?: number;
  createdAt?: string;
  updatedAt?: string;
  repoPath?: string;
  featureIds?: string[];
  filePaths?: string[];
  lanes?: string[];
  providers?: string[];
}

export interface SaveReasoningMemoryResult {
  saved: ReasoningMemoryItem;
  storagePath: string;
}

export interface ReasoningMemorySearchHints {
  query?: string;
  sourceTaskIds?: string[];
  sourceSessionIds?: string[];
  tags?: string[];
  featureIds?: string[];
  filePaths?: string[];
  lane?: string;
  provider?: string;
  maxResults?: number;
}

export interface ReasoningMemorySearchResult extends ReasoningMemoryItem {
  score: number;
  matchReasons: string[];
}

interface ReasoningMemoryDocument {
  schemaVersion: number;
  memories: ReasoningMemoryItem[];
}

export function getReasoningMemoryStoragePath(repoRoot: string): string {
  return path.join(getProjectStorageDir(path.resolve(repoRoot)), "reasoning-memory", "memories.json");
}

export function loadReasoningMemories(repoRoot: string): ReasoningMemoryItem[] {
  const storagePath = getReasoningMemoryStoragePath(repoRoot);
  if (!fs.existsSync(storagePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(storagePath, "utf8")) as unknown;
    const rawMemories = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.memories)
        ? parsed.memories
        : [];
    return rawMemories
      .map((memory) => normalizeLoadedMemory(memory))
      .filter((memory): memory is ReasoningMemoryItem => Boolean(memory));
  } catch {
    return [];
  }
}

export function saveReasoningMemory(repoRoot: string, input: SaveReasoningMemoryInput): SaveReasoningMemoryResult {
  const storagePath = getReasoningMemoryStoragePath(repoRoot);
  const now = new Date().toISOString();
  const memories = loadReasoningMemories(repoRoot);
  const existing = input.id ? memories.find((memory) => memory.id === input.id) : undefined;
  const saved = normalizeSavedMemory(input, existing, now);
  const nextMemories = existing
    ? memories.map((memory) => (memory.id === saved.id ? saved : memory))
    : [...memories, saved];
  const document: ReasoningMemoryDocument = {
    schemaVersion: SCHEMA_VERSION,
    memories: nextMemories,
  };

  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  fs.writeFileSync(storagePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  return { saved, storagePath };
}

export function searchReasoningMemories(
  repoRoot: string,
  hints: ReasoningMemorySearchHints = {},
): ReasoningMemorySearchResult[] {
  const memories = loadReasoningMemories(repoRoot);
  const maxResults = normalizeMaxResults(hints.maxResults);
  const queryTokens = tokenize(hints.query);
  const featureIds = normalizeStringArray(hints.featureIds);
  const filePaths = normalizePathArray(hints.filePaths);
  const tags = normalizeStringArray(hints.tags);
  const sourceTaskIds = normalizeStringArray(hints.sourceTaskIds);
  const sourceSessionIds = normalizeStringArray(hints.sourceSessionIds);
  const lane = normalizeOptionalString(hints.lane);
  const provider = normalizeOptionalString(hints.provider);
  const hasHardHint =
    featureIds.length > 0 ||
    filePaths.length > 0 ||
    tags.length > 0 ||
    sourceTaskIds.length > 0 ||
    sourceSessionIds.length > 0 ||
    Boolean(lane) ||
    Boolean(provider) ||
    queryTokens.length > 0;

  return memories
    .map((memory) =>
      scoreReasoningMemory(memory, {
        queryTokens,
        featureIds,
        filePaths,
        tags,
        sourceTaskIds,
        sourceSessionIds,
        lane,
        provider,
        hasHardHint,
      }),
    )
    .filter((result): result is ReasoningMemorySearchResult => Boolean(result))
    .sort((a, b) => b.score - a.score || compareIsoDesc(a.updatedAt, b.updatedAt))
    .slice(0, maxResults);
}

export function buildRelevantStrategyMemoryPromptSection(
  results: ReasoningMemorySearchResult[],
): string | undefined {
  if (results.length === 0) {
    return undefined;
  }

  const lines = ["## Relevant Strategy Memory", ""];
  results.forEach((memory, index) => {
    lines.push(`${index + 1}. ${memory.title}`);
    lines.push(`   Outcome: ${memory.outcome}; confidence: ${memory.confidence.toFixed(2)}`);
    if (memory.matchReasons.length > 0) {
      lines.push(`   Why matched: ${memory.matchReasons.slice(0, 3).join("; ")}`);
    }
    lines.push(`   Lesson: ${memory.content}`);
    if (memory.featureIds.length > 0 || memory.filePaths.length > 0) {
      const scopes = [
        ...memory.featureIds.map((featureId) => `feature:${featureId}`),
        ...memory.filePaths.slice(0, 3).map((filePath) => `file:${filePath}`),
      ];
      lines.push(`   Scope: ${scopes.join(", ")}`);
    }
  });

  lines.push("");
  lines.push("Use these as concise operational lessons. Do not invent details beyond the evidence shown.");
  return lines.join("\n");
}

interface ScoreContext {
  queryTokens: string[];
  featureIds: string[];
  filePaths: string[];
  tags: string[];
  sourceTaskIds: string[];
  sourceSessionIds: string[];
  lane?: string;
  provider?: string;
  hasHardHint: boolean;
}

function scoreReasoningMemory(
  memory: ReasoningMemoryItem,
  context: ScoreContext,
): ReasoningMemorySearchResult | undefined {
  let score = 0;
  const matchReasons: string[] = [];

  const matchedFeatures = intersect(memory.featureIds, context.featureIds);
  if (matchedFeatures.length > 0) {
    score += matchedFeatures.length * 40;
    matchReasons.push(`feature ${matchedFeatures.slice(0, 2).join(", ")}`);
  }

  const matchedFiles = matchFiles(memory.filePaths, context.filePaths);
  if (matchedFiles.exact.length > 0) {
    score += matchedFiles.exact.length * 50;
    matchReasons.push(`file ${matchedFiles.exact.slice(0, 2).join(", ")}`);
  }
  if (matchedFiles.basename.length > 0) {
    score += matchedFiles.basename.length * 15;
    matchReasons.push(`file name ${matchedFiles.basename.slice(0, 2).join(", ")}`);
  }

  const matchedTags = intersect(memory.tags, context.tags);
  if (matchedTags.length > 0) {
    score += matchedTags.length * 12;
    matchReasons.push(`tag ${matchedTags.slice(0, 2).join(", ")}`);
  }

  const matchedTaskIds = intersect(memory.sourceTaskIds, context.sourceTaskIds);
  if (matchedTaskIds.length > 0) {
    score += matchedTaskIds.length * 20;
    matchReasons.push(`task ${matchedTaskIds.slice(0, 2).join(", ")}`);
  }

  const matchedSessionIds = intersect(memory.sourceSessionIds, context.sourceSessionIds);
  if (matchedSessionIds.length > 0) {
    score += matchedSessionIds.length * 16;
    matchReasons.push(`session ${matchedSessionIds.slice(0, 2).join(", ")}`);
  }

  if (context.lane && memory.lanes.includes(context.lane)) {
    score += 16;
    matchReasons.push(`lane ${context.lane}`);
  }

  if (context.provider && memory.providers.includes(context.provider)) {
    score += 10;
    matchReasons.push(`provider ${context.provider}`);
  }

  const textOverlap = countTokenOverlap(tokenize(memoryText(memory)), context.queryTokens);
  if (textOverlap > 0) {
    score += Math.min(textOverlap * 3, 30);
    matchReasons.push(`${textOverlap} query term${textOverlap === 1 ? "" : "s"}`);
  }

  score += memory.confidence * 8;
  score += Math.min(memory.evidenceCount, 5);

  if (score <= 0 || (context.hasHardHint && matchReasons.length === 0)) {
    return undefined;
  }

  return {
    ...memory,
    score,
    matchReasons,
  };
}

function normalizeLoadedMemory(input: unknown): ReasoningMemoryItem | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const title = normalizeRequiredString(input.title);
  const content = normalizeRequiredString(input.content);
  if (!title || !content) {
    return undefined;
  }

  const now = new Date().toISOString();
  return {
    id: normalizeOptionalString(input.id) ?? randomUUID(),
    title,
    description: normalizeOptionalString(input.description),
    content,
    outcome: normalizeOutcome(input.outcome),
    sourceTaskIds: normalizeStringArray(input.sourceTaskIds),
    sourceSessionIds: normalizeStringArray(input.sourceSessionIds),
    tags: normalizeStringArray(input.tags),
    confidence: normalizeConfidence(input.confidence),
    evidenceCount: normalizeEvidenceCount(input.evidenceCount),
    createdAt: normalizeOptionalString(input.createdAt) ?? now,
    updatedAt: normalizeOptionalString(input.updatedAt) ?? normalizeOptionalString(input.createdAt) ?? now,
    repoPath: normalizeOptionalString(input.repoPath),
    featureIds: normalizeStringArray(input.featureIds),
    filePaths: normalizePathArray(input.filePaths),
    lanes: normalizeStringArray(input.lanes),
    providers: normalizeStringArray(input.providers),
  };
}

function normalizeSavedMemory(
  input: SaveReasoningMemoryInput,
  existing: ReasoningMemoryItem | undefined,
  now: string,
): ReasoningMemoryItem {
  const title = normalizeRequiredString(input.title);
  const content = normalizeRequiredString(input.content);
  if (!title) {
    throw new Error("Reasoning memory title is required.");
  }
  if (!content) {
    throw new Error("Reasoning memory content is required.");
  }

  return {
    id: input.id ?? existing?.id ?? randomUUID(),
    title,
    description: normalizeOptionalString(input.description) ?? existing?.description,
    content,
    outcome: normalizeOutcome(input.outcome ?? existing?.outcome),
    sourceTaskIds: normalizeStringArray(input.sourceTaskIds ?? existing?.sourceTaskIds),
    sourceSessionIds: normalizeStringArray(input.sourceSessionIds ?? existing?.sourceSessionIds),
    tags: normalizeStringArray(input.tags ?? existing?.tags),
    confidence: normalizeConfidence(input.confidence ?? existing?.confidence),
    evidenceCount: normalizeEvidenceCount(input.evidenceCount ?? existing?.evidenceCount),
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    repoPath: normalizeOptionalString(input.repoPath ?? existing?.repoPath),
    featureIds: normalizeStringArray(input.featureIds ?? existing?.featureIds),
    filePaths: normalizePathArray(input.filePaths ?? existing?.filePaths),
    lanes: normalizeStringArray(input.lanes ?? existing?.lanes),
    providers: normalizeStringArray(input.providers ?? existing?.providers),
  };
}

function normalizeOutcome(input: unknown): ReasoningMemoryOutcome {
  return input === "success" || input === "failure" || input === "mixed" ? input : "mixed";
}

function normalizeRequiredString(input: unknown): string | undefined {
  const normalized = normalizeOptionalString(input);
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalString(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  input.forEach((value) => {
    const item = normalizeOptionalString(value)?.toLowerCase();
    if (!item || seen.has(item)) {
      return;
    }
    seen.add(item);
    normalized.push(item);
  });
  return normalized;
}

function normalizePathArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  input.forEach((value) => {
    const item = normalizeOptionalString(value)?.replace(/\\/g, "/");
    if (!item) {
      return;
    }
    const key = item.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push(item);
  });
  return normalized;
}

function normalizeConfidence(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return 0.5;
  }
  return Math.min(Math.max(input, 0), 1);
}

function normalizeEvidenceCount(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return 1;
  }
  return Math.max(0, Math.floor(input));
}

function normalizeMaxResults(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.max(1, Math.min(10, Math.floor(input)));
}

function tokenize(input: unknown): string[] {
  if (typeof input !== "string") {
    return [];
  }
  const seen = new Set<string>();
  const tokens: string[] = [];
  input
    .toLowerCase()
    .split(/[^a-z0-9_/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .forEach((token) => {
      if (seen.has(token)) {
        return;
      }
      seen.add(token);
      tokens.push(token);
    });
  return tokens;
}

function memoryText(memory: ReasoningMemoryItem): string {
  return [
    memory.title,
    memory.description,
    memory.content,
    ...memory.tags,
    ...memory.featureIds,
    ...memory.filePaths,
  ]
    .filter(Boolean)
    .join(" ");
}

function countTokenOverlap(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const leftSet = new Set(left);
  return right.filter((token) => leftSet.has(token)).length;
}

function intersect(left: string[], right: string[]): string[] {
  if (left.length === 0 || right.length === 0) {
    return [];
  }
  const rightSet = new Set(right.map((item) => item.toLowerCase()));
  return left.filter((item) => rightSet.has(item.toLowerCase()));
}

function matchFiles(memoryFiles: string[], hintFiles: string[]): { exact: string[]; basename: string[] } {
  if (memoryFiles.length === 0 || hintFiles.length === 0) {
    return { exact: [], basename: [] };
  }
  const hintExact = new Set(hintFiles.map((filePath) => filePath.toLowerCase()));
  const hintBasenames = new Set(hintFiles.map((filePath) => path.basename(filePath).toLowerCase()));
  const exact: string[] = [];
  const basename: string[] = [];

  memoryFiles.forEach((filePath) => {
    const normalized = filePath.toLowerCase();
    if (hintExact.has(normalized)) {
      exact.push(filePath);
      return;
    }
    if (hintBasenames.has(path.basename(normalized))) {
      basename.push(filePath);
    }
  });

  return { exact, basename };
}

function compareIsoDesc(left: string, right: string): number {
  return Date.parse(right) - Date.parse(left);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
