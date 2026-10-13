/**
 * RemoteTraceProvider — Postgres-backed trace storage.
 *
 * Wraps the existing PgTraceStore with the TraceStorageProvider interface.
 */

import type { Database } from "../db/index";
import { PgTraceStore } from "../db/pg-trace-store";
import type { TraceStorageProvider } from "./types";
import type { TraceRecord } from "../trace/types";
import type { TraceQuery } from "../trace/reader";

export class RemoteTraceProvider implements TraceStorageProvider {
  private store: PgTraceStore;

  constructor(db: Database) {
    this.store = new PgTraceStore(db);
  }

  async append(record: TraceRecord): Promise<void> {
    await this.store.save(record);
  }

  async query(query: TraceQuery): Promise<TraceRecord[]> {
    return this.store.query(query);
  }

  async getById(id: string): Promise<TraceRecord | null> {
    return this.store.getById(id);
  }

  async stats(): Promise<{
    totalDays: number;
    totalFiles: number;
    totalRecords: number;
    uniqueSessions: number;
    eventTypes: Record<string, number>;
  }> {
    // Basic stats from Postgres — not as detailed as local
    const records = await this.store.query({ limit: 10000 });
    const sessions = new Set<string>();
    const eventTypes: Record<string, number> = {};
    const days = new Set<string>();

    for (const r of records) {
      sessions.add(r.sessionId);
      eventTypes[r.eventType] = (eventTypes[r.eventType] || 0) + 1;
      days.add(r.timestamp.slice(0, 10));
    }

    return {
      totalDays: days.size,
      totalFiles: 0,
      totalRecords: records.length,
      uniqueSessions: sessions.size,
      eventTypes,
    };
  }
}
