/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { JsonlWriter, readJsonlFile } from "../jsonl-writer";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "jsonl-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("JsonlWriter", () => {
  it("appends a single record", async () => {
    const filePath = path.join(tmpDir, "test.jsonl");
    const writer = new JsonlWriter(filePath);

    await writer.append({ id: "1", msg: "hello" });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content.trim()).toBe('{"id":"1","msg":"hello"}');
  });

  it("appends multiple records as separate lines", async () => {
    const filePath = path.join(tmpDir, "test.jsonl");
    const writer = new JsonlWriter(filePath);

    await writer.append({ id: "1" });
    await writer.append({ id: "2" });

    const lines = (await fs.readFile(filePath, "utf-8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ id: "1" });
    expect(JSON.parse(lines[1])).toEqual({ id: "2" });
  });

  it("creates parent directories automatically", async () => {
    const filePath = path.join(tmpDir, "nested", "deep", "test.jsonl");
    const writer = new JsonlWriter(filePath);

    await writer.append({ ok: true });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content.trim()).toBe('{"ok":true}');
  });

  it("appendBatch writes multiple records atomically", async () => {
    const filePath = path.join(tmpDir, "batch.jsonl");
    const writer = new JsonlWriter(filePath);

    await writer.appendBatch([{ a: 1 }, { b: 2 }, { c: 3 }]);

    const lines = (await fs.readFile(filePath, "utf-8")).trim().split("\n");
    expect(lines).toHaveLength(3);
  });
});

describe("readJsonlFile", () => {
  it("reads records from a JSONL file", async () => {
    const filePath = path.join(tmpDir, "read.jsonl");
    await fs.writeFile(filePath, '{"id":"1"}\n{"id":"2"}\n', "utf-8");

    const records = await readJsonlFile<{ id: string }>(filePath);
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe("1");
    expect(records[1].id).toBe("2");
  });

  it("skips empty lines", async () => {
    const filePath = path.join(tmpDir, "empty-lines.jsonl");
    await fs.writeFile(filePath, '{"id":"1"}\n\n\n{"id":"2"}\n', "utf-8");

    const records = await readJsonlFile(filePath);
    expect(records).toHaveLength(2);
  });

  it("skips malformed lines", async () => {
    const filePath = path.join(tmpDir, "malformed.jsonl");
    await fs.writeFile(filePath, '{"id":"1"}\nnot-json\n{"id":"2"}\n', "utf-8");

    const records = await readJsonlFile(filePath);
    expect(records).toHaveLength(2);
  });

  it("returns empty array for non-existent file", async () => {
    const records = await readJsonlFile(path.join(tmpDir, "nope.jsonl"));
    expect(records).toEqual([]);
  });

  it("roundtrip: write then read produces equivalent objects", async () => {
    const filePath = path.join(tmpDir, "roundtrip.jsonl");
    const writer = new JsonlWriter(filePath);

    const original = { uuid: "abc", type: "user_message", message: "hello", sessionId: "s1", timestamp: "2025-01-01T00:00:00Z" };
    await writer.append(original);

    const records = await readJsonlFile(filePath);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(original);
  });
});
