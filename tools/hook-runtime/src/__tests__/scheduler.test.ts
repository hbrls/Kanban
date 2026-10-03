import { describe, expect, it } from "vitest";

import type { MetricExecution } from "../fitness.js";
import type { HookMetric } from "../metrics.js";
import { runMetrics } from "../scheduler.js";

function buildMetric(name: string): HookMetric {
  return {
    command: `echo ${name}`,
    hardGate: true,
    name,
    sourceFile: "docs/fitness/unit-test.md",
  };
}

describe("runMetrics", () => {
  it("respects the configured concurrency", async () => {
    const metrics = [buildMetric("eslint_pass"), buildMetric("ts_test_pass"), buildMetric("clippy_pass")];
    let active = 0;
    let maxActive = 0;

    const results = await runMetrics(
      metrics,
      async (metric): Promise<MetricExecution> => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return {
          metric,
          durationMs: 20,
          exitCode: 0,
          output: metric.name,
          passed: true,
        };
      },
      { concurrency: 2 },
    );

    expect(maxActive).toBe(2);
    expect(results.results).toHaveLength(3);
    expect(results.skippedMetrics).toEqual([]);
  });

  it("stops scheduling new metrics after the first failure when failFast is enabled", async () => {
    const metrics = [
      buildMetric("eslint_pass"),
      buildMetric("ts_typecheck_pass"),
      buildMetric("ts_test_pass"),
      buildMetric("rust_test_pass"),
    ];
    const started: string[] = [];

    const result = await runMetrics(
      metrics,
      async (metric): Promise<MetricExecution> => {
        started.push(metric.name);
        await new Promise((resolve) => setTimeout(resolve, metric.name === "eslint_pass" ? 5 : 25));
        return {
          metric,
          durationMs: 10,
          exitCode: metric.name === "eslint_pass" ? 1 : 0,
          output: metric.name,
          passed: metric.name !== "eslint_pass",
        };
      },
      { concurrency: 2, failFast: true },
    );

    expect(started).toEqual(["eslint_pass", "ts_typecheck_pass"]);
    expect(result.results).toHaveLength(2);
    expect(result.skippedMetrics.map((metric) => metric.name)).toEqual([
      "ts_test_pass",
      "rust_test_pass",
    ]);
  });
});
