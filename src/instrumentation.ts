/**
 * Next.js Instrumentation — runs once on server startup.
 * Used to start the in-process cron scheduler for the local Node.js backend.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { trace } from "@opentelemetry/api";

function resolveRuntimeServicesDelayMs(): number {
  const rawValue = process.env.ROUTA_RUNTIME_SERVICES_DELAY_MS;
  if (!rawValue) {
    return 5_000;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5_000;
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeNextRuntimeTelemetry } = await import(
      "./core/telemetry/node-otel"
    );
    const { startSchedulerService } = await import(
      "./core/scheduling/scheduler-service"
    );
    const { startBackgroundWorker } = await import(
      "./core/background-worker"
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

    // Delay startup slightly to let the HTTP server become ready
    setTimeout(() => {
      const servicesSpan = telemetry.enabled
        ? trace
          .getTracer("routa.nextjs.runtime")
          .startSpan("routa.runtime.services.start")
        : null;
      const skipRuntimeServices = process.env.ROUTA_SKIP_RUNTIME_SERVICES === "1";

      if (!skipRuntimeServices) {
        startSchedulerService();
        startBackgroundWorker();
      }

      servicesSpan?.setAttribute("routa.scheduler.started", !skipRuntimeServices);
      servicesSpan?.setAttribute(
        "routa.background_worker.started",
        !skipRuntimeServices
      );
      servicesSpan?.end();
    }, resolveRuntimeServicesDelayMs());
  }
}
