import path from "node:path";

import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ParentBasedSampler,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_NAMESPACE,
} from "@opentelemetry/semantic-conventions";

import { JsonlFileSpanExporter } from "./file-span-exporter";

const OTEL_GLOBAL_KEY = "__routa_next_runtime_otel__";
const DEFAULT_OUTPUT_PATH = path.join(
  process.cwd(),
  "test-results",
  "otel",
  "next-runtime-spans.jsonl"
);

type OtelState = {
  enabled: boolean;
  outputPath?: string;
  sdk?: NodeSDK;
};

export type NextRuntimeTelemetryState = {
  enabled: boolean;
  outputPath?: string;
};

function isTelemetryEnabled(): boolean {
  return process.env.ROUTA_OTEL_ENABLED === "1";
}

function resolveSampleRatio(): number {
  const rawValue = process.env.ROUTA_OTEL_SAMPLE_RATIO;
  if (!rawValue) {
    return 1;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  if (parsed >= 1) {
    return 1;
  }

  return parsed;
}

function resolveOutputPath(): string {
  const configuredPath = process.env.ROUTA_OTEL_OUTPUT_PATH?.trim();
  return configuredPath && configuredPath.length > 0
    ? path.resolve(configuredPath)
    : DEFAULT_OUTPUT_PATH;
}

function getState(): OtelState | undefined {
  return (globalThis as Record<string, unknown>)[OTEL_GLOBAL_KEY] as OtelState | undefined;
}

function setState(state: OtelState): void {
  (globalThis as Record<string, unknown>)[OTEL_GLOBAL_KEY] = state;
}

export function initializeNextRuntimeTelemetry(): NextRuntimeTelemetryState {
  const existingState = getState();
  if (existingState) {
    return { enabled: existingState.enabled, outputPath: existingState.outputPath };
  }

  if (!isTelemetryEnabled()) {
    const disabledState = { enabled: false } satisfies OtelState;
    setState(disabledState);
    return disabledState;
  }

  const outputPath = resolveOutputPath();
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: process.env.ROUTA_OTEL_SERVICE_NAME ?? "routa-nextjs",
      [SEMRESATTRS_SERVICE_NAMESPACE]: "routa-js",
      "deployment.environment.name": process.env.NODE_ENV ?? "development",
    }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(resolveSampleRatio()),
    }),
    spanProcessors: [
      new SimpleSpanProcessor(new JsonlFileSpanExporter(outputPath)),
    ],
  });

  sdk.start();

  const startedState = {
    enabled: true,
    outputPath,
    sdk,
  } satisfies OtelState;

  setState(startedState);
  return startedState;
}

export async function shutdownNextRuntimeTelemetry(): Promise<void> {
  const state = getState();
  if (!state?.sdk) {
    return;
  }

  await state.sdk.shutdown();
}
