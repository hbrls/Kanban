import fs from "node:fs/promises";
import path from "node:path";

import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

function hrTimeToUnixMs([seconds, nanoseconds]: readonly [number, number]): number {
  return (seconds * 1_000) + (nanoseconds / 1_000_000);
}

function normalizeValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeValue(nestedValue)])
    );
  }

  return value;
}

function serializeSpan(span: ReadableSpan) {
  const context = span.spanContext();

  return {
    traceId: context.traceId,
    spanId: context.spanId,
    traceFlags: context.traceFlags,
    parentSpanId: span.parentSpanContext?.spanId ?? null,
    name: span.name,
    kind: span.kind,
    startTimeUnixMs: hrTimeToUnixMs(span.startTime),
    endTimeUnixMs: hrTimeToUnixMs(span.endTime),
    durationMs: hrTimeToUnixMs(span.duration),
    status: {
      code: span.status.code,
      message: span.status.message ?? "",
    },
    attributes: normalizeValue(span.attributes),
    resourceAttributes: normalizeValue(span.resource.attributes),
    instrumentationScope: {
      name: span.instrumentationScope.name,
      version: span.instrumentationScope.version ?? "",
    },
    events: span.events.map((event) => ({
      name: event.name,
      timeUnixMs: hrTimeToUnixMs(event.time),
      attributes: normalizeValue(event.attributes ?? {}),
    })),
  };
}

export class JsonlFileSpanExporter implements SpanExporter {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly outputPath: string) {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: { code: number; error?: Error }) => void
  ): void {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.outputPath), { recursive: true });

      const payload = spans
        .map((span) => JSON.stringify(serializeSpan(span)))
        .join("\n");

      if (!payload) {
        return;
      }

      await fs.appendFile(this.outputPath, `${payload}\n`, "utf-8");
    });

    void this.writeQueue.then(
      () => resultCallback({ code: 0 }),
      (error) => resultCallback({
        code: 1,
        error: error instanceof Error ? error : new Error(String(error)),
      }),
    );
  }

  async shutdown(): Promise<void> {
    await this.writeQueue;
  }

  async forceFlush(): Promise<void> {
    await this.writeQueue;
  }
}
