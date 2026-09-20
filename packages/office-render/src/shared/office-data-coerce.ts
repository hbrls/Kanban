import type { RecordValue } from "./office-types";

export function asRecord(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null ? (value as RecordValue) : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function bytesFromUnknown(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return new Uint8Array(value);
  }

  const record = asRecord(value);
  if (record == null) return null;

  const numericKeys = Object.keys(record)
    .filter((key) => /^\d+$/.test(key))
    .map(Number)
    .sort((left, right) => left - right);

  if (numericKeys.length === 0) return null;

  const bytes = new Uint8Array(numericKeys.length);
  for (const key of numericKeys) {
    bytes[key] = asNumber(record[String(key)]);
  }

  return bytes;
}

export function inferImageContentType(id: string): string {
  const extension = id.toLowerCase().split(".").pop();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

