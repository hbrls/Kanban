import fs from "node:fs/promises";
import path from "node:path";

const TRACE_FILE = path.resolve(
  process.env.ROUTA_OTEL_OUTPUT_PATH || "test-results/otel/trace-smoke.jsonl"
);
const EXPECTED_SPANS = [
  "routa.instrumentation.register",
  "routa.runtime.services.start",
];

async function main() {
  await fs.rm(TRACE_FILE, { force: true });

  process.env.NEXT_RUNTIME = "nodejs";
  process.env.ROUTA_OTEL_ENABLED = "1";
  process.env.ROUTA_OTEL_OUTPUT_PATH = TRACE_FILE;
  process.env.ROUTA_OTEL_SAMPLE_RATIO = "1";
  process.env.ROUTA_RUNTIME_SERVICES_DELAY_MS = "0";
  process.env.ROUTA_SKIP_RUNTIME_SERVICES = "1";

  const { register } = await import("../../src/instrumentation");
  const { shutdownNextRuntimeTelemetry } = await import(
    "../../src/core/telemetry/node-otel"
  );

  await register();
  await new Promise((resolve) => setTimeout(resolve, 250));
  await shutdownNextRuntimeTelemetry();

  const traceOutput = await fs.readFile(TRACE_FILE, "utf-8");
  const matchedSpans = EXPECTED_SPANS.filter((name) =>
    traceOutput.includes(`"name":"${name}"`)
  );

  if (matchedSpans.length !== EXPECTED_SPANS.length) {
    throw new Error(
      `Missing expected spans. Found=${matchedSpans.join(",") || "(none)"}`
    );
  }

  console.log(
    `✅ otel_trace_smoke: file=${TRACE_FILE} spans=${matchedSpans.join(",")}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
