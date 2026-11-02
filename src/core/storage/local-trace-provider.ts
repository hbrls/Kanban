/**
 * LocalTraceProvider — JSONL file-based trace storage.
 *
 * Stores traces under ~/.routa/projects/{folder-slug}/traces/{YYYY-MM-DD}/
 *
 * For backward compatibility, also reads from the legacy path:
 *   {project}/.routa/traces/
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getTracesDir } from "./folder-slug";
import { JsonlWriter, readJsonlFile, listJsonlFiles } from "./jsonl-writer";
import type { TraceStorageProvider } from "./types";
import type { TraceRecord } from "../trace/types";
import type { TraceQuery } from "../trace/reader";

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
}

export class LocalTraceProvider implements TraceStorageProvider {
  private currentDay: string | null = null;
  private currentWriter: JsonlWriter | null = null;

  constructor(private projectPath: string) {}

  /** New trace directory: ~/.routa/projects/{slug}/traces */
  private get newBaseDir(): string {
    return getTracesDir(this.projectPath);
  }

  /** Legacy trace directory: {project}/.routa/traces */
  private get legacyBaseDir(): string {
    return path.join(this.projectPath, ".routa", "traces");
  }

  async append(record: TraceRecord): Promise<void> {
    const day = formatDay(new Date());
    const writer = await this.getWriter(day);
    await writer.append(record);
  }

  async query(query: TraceQuery = {}): Promise<TraceRecord[]> {
    const allDirs = await this.getAllTraceDirs();
    const traces: TraceRecord[] = [];

    for (const baseDir of allDirs) {
      const dayDirs = await this.listDayDirs(baseDir);
      const filtered = this.filterDaysByDate(dayDirs, query);

      for (const dayDir of filtered) {
        const files = await listJsonlFiles(dayDir);
        for (const file of files) {
          const records = await readJsonlFile<TraceRecord>(file);
          for (const record of records) {
            if (this.matchesQuery(record, query)) {
              traces.push(record);
            }
          }
        }
      }
    }

    // Sort by timestamp ascending
    traces.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const offset = query.offset ?? 0;
    const limit = query.limit ?? traces.length;
    return traces.slice(offset, offset + limit);
  }

  async getById(id: string): Promise<TraceRecord | null> {
    const allDirs = await this.getAllTraceDirs();

    for (const baseDir of allDirs) {
      const dayDirs = await this.listDayDirs(baseDir);
      for (const dayDir of dayDirs) {
        const files = await listJsonlFiles(dayDir);
        for (const file of files) {
          const records = await readJsonlFile<TraceRecord>(file);
          const found = records.find((r) => r.id === id);
          if (found) return found;
        }
      }
    }
    return null;
  }

  async stats(): Promise<{
    totalDays: number;
    totalFiles: number;
    totalRecords: number;
    uniqueSessions: number;
    eventTypes: Record<string, number>;
  }> {
    const allDirs = await this.getAllTraceDirs();
    let totalDays = 0;
    let totalFiles = 0;
    let totalRecords = 0;
    const sessions = new Set<string>();
    const eventTypes: Record<string, number> = {};

    for (const baseDir of allDirs) {
      const dayDirs = await this.listDayDirs(baseDir);
      totalDays += dayDirs.length;

      for (const dayDir of dayDirs) {
        const files = await listJsonlFiles(dayDir);
        totalFiles += files.length;

        for (const file of files) {
          const records = await readJsonlFile<TraceRecord>(file);
          totalRecords += records.length;
          for (const r of records) {
            sessions.add(r.sessionId);
            eventTypes[r.eventType] = (eventTypes[r.eventType] || 0) + 1;
          }
        }
      }
    }

    return {
      totalDays,
      totalFiles,
      totalRecords,
      uniqueSessions: sessions.size,
      eventTypes,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  /** Get or create a writer for the given day. */
  private async getWriter(day: string): Promise<JsonlWriter> {
    if (this.currentDay === day && this.currentWriter) {
      return this.currentWriter;
    }

    const dayDir = path.join(this.newBaseDir, day);
    await fs.mkdir(dayDir, { recursive: true });

    const datetime = formatDateTime(new Date());
    const filePath = path.join(dayDir, `traces-${datetime}.jsonl`);

    this.currentDay = day;
    this.currentWriter = new JsonlWriter(filePath);
    return this.currentWriter;
  }

  /** Get all trace base directories (new + legacy). */
  private async getAllTraceDirs(): Promise<string[]> {
    const dirs: string[] = [];

    // New path
    if (await this.dirExists(this.newBaseDir)) {
      dirs.push(this.newBaseDir);
    }

    // Legacy path (backward compatibility)
    if (await this.dirExists(this.legacyBaseDir)) {
      dirs.push(this.legacyBaseDir);
    }

    return dirs;
  }

  /** List day directories (YYYY-MM-DD) under a base dir. */
  private async listDayDirs(baseDir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map((e) => path.join(baseDir, e.name))
        .sort();
    } catch {
      return [];
    }
  }

  /** Filter day directories by date range from query. */
  private filterDaysByDate(dayDirs: string[], query: TraceQuery): string[] {
    if (!query.startDate && !query.endDate) return dayDirs;

    return dayDirs.filter((dir) => {
      const dayName = path.basename(dir);
      if (query.startDate && dayName < query.startDate) return false;
      if (query.endDate && dayName > query.endDate) return false;
      return true;
    });
  }

  /** Check if a trace record matches query filters. */
  private matchesQuery(record: TraceRecord, query: TraceQuery): boolean {
    if (query.sessionId && record.sessionId !== query.sessionId) return false;
    if (query.workspaceId && record.workspaceId !== query.workspaceId)
      return false;
    if (query.eventType && record.eventType !== query.eventType) return false;
    if (query.file) {
      const fileMatch = record.files?.some(
        (f: { path: string }) => f.path === query.file
      );
      if (!fileMatch) return false;
    }
    return true;
  }

  private async dirExists(dir: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}
