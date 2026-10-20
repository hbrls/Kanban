/**
 * Next.js Instrumentation — runs once on server startup.
 * Used to start the in-process cron scheduler for the local Node.js backend.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { trace } from "@opentelemetry/api";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeNextRuntimeTelemetry } = await import(
      "./core/telemetry/node-otel"
    );
    const telemetry = initializeNextRuntimeTelemetry();

    if (telemetry.enabled) {
      const span = trace
        .getTracer("routa.nextjs.runtime")
        .startSpan("routa.instrumentation.register");
      span.setAttribute("next.runtime", "nodejs");
      span.setAttribute("routa.otel.output_path", telemetry.outputPath ?? "");
      span.end();
    }

  }
}
