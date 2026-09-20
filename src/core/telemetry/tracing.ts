import {
  context,
  trace,
  SpanStatusCode,
  type Attributes,
  type Span,
} from "@opentelemetry/api";

const RUNTIME_TRACER_NAME = "routa.nextjs.runtime";

export function getRuntimeTracer() {
  return trace.getTracer(RUNTIME_TRACER_NAME);
}

type RunWithSpanOptions = {
  attributes?: Attributes;
};

export async function runWithSpan<T>(
  name: string,
  options: RunWithSpanOptions,
  work: (span: Span) => Promise<T> | T
): Promise<T> {
  const span = getRuntimeTracer().startSpan(name, {
    attributes: options.attributes,
  });

  try {
    return await context.with(trace.setSpan(context.active(), span), () =>
      Promise.resolve(work(span))
    );
  } catch (error) {
    if (error instanceof Error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    } else {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: String(error),
      });
    }
    throw error;
  } finally {
    span.end();
  }
}
