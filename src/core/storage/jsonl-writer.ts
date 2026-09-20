/**
 * JSONL Writer — Append-only JSON Lines file writer.
 *
 * Provides serialized (queue-based) writes to prevent concurrent
 * append operations from producing corrupted JSON lines.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * JSONL Writer with serialized writes for concurrency safety.
 */
export class JsonlWriter {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private filePath: string) {}

  /**
   * Append a single record as a JSON line.
   * Writes are serialized to prevent interleaving.
   */
  async append(record: unknown): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.doAppend(record));
    return this.writeQueue;
  }

  /**
   * Append multiple records atomically (one line per record).
   */
  async appendBatch(records: unknown[]): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.doAppendBatch(records));
    return this.writeQueue;
  }

  private async doAppend(record: unknown): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const line = JSON.stringify(record) + "\n";
    await fs.appendFile(this.filePath, line, "utf-8");
  }

  private async doAppendBatch(records: unknown[]): Promise<void> {
    if (records.length === 0) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
    await fs.appendFile(this.filePath, lines, "utf-8");
  }

  /** Get the file path this writer targets. */
  get path(): string {
    return this.filePath;
  }
}

/**
 * Read all records from a JSONL file.
 * Skips empty lines and malformed JSON (logs warnings).
 *
 * @returns Parsed records sorted by insertion order.
 */
export async function readJsonlFile<T = unknown>(filePath: string): Promise<T[]> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const records: T[] = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed) as T);
      } catch {
        console.warn(`[JSONL] Skipping malformed line in ${filePath}: ${trimmed.slice(0, 80)}`);
      }
    }
    return records;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/**
 * List all .jsonl files in a directory.
 */
export async function listJsonlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
      .map((e) => path.join(dir, e.name))
      .sort();
  } catch {
    return [];
  }
}
