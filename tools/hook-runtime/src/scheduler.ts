import type { MetricExecution } from "./fitness.js";
import type { HookMetric } from "./metrics.js";

export type MetricRunner = (
  metric: HookMetric,
  index: number,
  total: number,
) => Promise<MetricExecution>;

type RunMetricsOptions = {
  concurrency?: number;
  failFast?: boolean;
  onMetricStart?: (metric: HookMetric, index: number, total: number) => void;
  onMetricComplete?: (result: MetricExecution, index: number, total: number) => void;
};

export type MetricBatchResult = {
  results: MetricExecution[];
  skippedMetrics: HookMetric[];
};

export async function runMetrics(
  metrics: HookMetric[],
  runner: MetricRunner,
  options: RunMetricsOptions = {},
): Promise<MetricBatchResult> {
  const total = metrics.length;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 1, total || 1));
  const failFast = options.failFast ?? true;
  const results: Array<MetricExecution | undefined> = new Array(total);

  let nextIndex = 0;
  let stopScheduling = false;

  async function worker(): Promise<void> {
    while (!stopScheduling) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= total) {
        return;
      }

      const metric = metrics[currentIndex];
      const displayIndex = currentIndex + 1;
      options.onMetricStart?.(metric, displayIndex, total);

      const result = await runner(metric, displayIndex, total);
      results[currentIndex] = result;
      options.onMetricComplete?.(result, displayIndex, total);

      if (!result.passed && failFast) {
        stopScheduling = true;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, async () => worker()));

  return {
    results: results.filter((result): result is MetricExecution => Boolean(result)),
    skippedMetrics: metrics.filter((_, index) => results[index] === undefined),
  };
}
