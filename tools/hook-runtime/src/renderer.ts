import { formatDuration, type MetricExecution } from "./fitness.js";
import type { HookMetric } from "./metrics.js";
import type { CommandOutputEvent } from "./process.js";

const ANSI_RESET = "\u001B[0m";
const ANSI_YELLOW = "\u001B[33m";
const ANSI_GREEN = "\u001B[32m";
const ANSI_RED = "\u001B[31m";
const ANSI_CYAN = "\u001B[36m";
const ANSI_BLUE = "\u001B[34m";
const ANSI_DIM = "\u001B[2m";

function shouldUseColor(stream?: NodeJS.WriteStream): boolean {
  if (!stream?.isTTY) {
    return false;
  }

  if (process.env.NO_COLOR === "1") {
    return false;
  }

  if (process.env.FORCE_COLOR === "0") {
    return false;
  }

  return true;
}

function colorize(stream: NodeJS.WriteStream | undefined, colorCode: string, text: string): string {
  if (!shouldUseColor(stream)) {
    return text;
  }

  return `${colorCode}${text}${ANSI_RESET}`;
}

type MetricStatus = "queued" | "running" | "passed" | "failed";

type ReporterOptions = {
  concurrency: number;
  stream?: NodeJS.WriteStream;
  tailLines: number;
};

type MetricState = {
  durationMs?: number;
  index: number;
  metric: HookMetric;
  status: MetricStatus;
};

export type HumanMetricReporter = {
  start(): void;
  onMetricComplete(result: MetricExecution, index: number, total: number): void;
  onMetricOutput(metricName: string, event: CommandOutputEvent): void;
  onMetricStart(metric: HookMetric, index: number, total: number): void;
  close(): void;
};

export class RollingLogBuffer {
  private readonly lines: string[] = [];

  private readonly partials = new Map<string, string>();

  constructor(private readonly tailLines: number) {}

  append(source: string, text: string): void {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const combined = `${this.partials.get(source) ?? ""}${normalized}`;
    const parts = combined.split("\n");
    const partial = parts.pop() ?? "";

    for (const line of parts) {
      this.pushLine(source, line);
    }

    if (partial) {
      this.partials.set(source, partial);
      return;
    }

    this.partials.delete(source);
  }

  flush(source: string): void {
    const partial = this.partials.get(source);
    if (!partial) {
      return;
    }

    this.pushLine(source, partial);
    this.partials.delete(source);
  }

  snapshot(): string[] {
    return [...this.lines];
  }

  private pushLine(source: string, line: string): void {
    this.lines.push(`[${source}] ${line}`.trimEnd());
    if (this.lines.length > this.tailLines) {
      this.lines.splice(0, this.lines.length - this.tailLines);
    }
  }
}

class DynamicHumanMetricReporter implements HumanMetricReporter {
  private readonly logBuffer: RollingLogBuffer;

  private readonly states: MetricState[];

  private renderTimer: NodeJS.Timeout | undefined;

  private renderedLineCount = 0;

  private cursorHidden = false;

  constructor(
    metrics: HookMetric[],
    private readonly options: ReporterOptions,
  ) {
    this.logBuffer = new RollingLogBuffer(options.tailLines);
    this.states = metrics.map((metric, index) => ({
      metric,
      index: index + 1,
      status: "queued",
    }));
  }

  start(): void {
    this.scheduleRender();
  }

  onMetricStart(metric: HookMetric, index: number): void {
    const state = this.states[index - 1];
    if (!state || state.metric.name !== metric.name) {
      return;
    }

    state.status = "running";
    this.scheduleRender();
  }

  onMetricOutput(metricName: string, event: CommandOutputEvent): void {
    const normalized = event.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (const chunk of normalized.split("\n")) {
      if (this.shouldCaptureOutputLine(chunk)) {
        this.logBuffer.append(metricName, `${chunk}\n`);
      }
    }
    this.scheduleRender();
  }

  onMetricComplete(result: MetricExecution, index: number): void {
    const state = this.states[index - 1];
    if (!state || state.metric.name !== result.metric.name) {
      return;
    }

    this.logBuffer.flush(result.metric.name);
    state.status = result.passed ? "passed" : "failed";
    state.durationMs = result.durationMs;
    this.scheduleRender();
  }

  close(): void {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
    }

    for (const state of this.states) {
      this.logBuffer.flush(state.metric.name);
    }

    this.renderNow();
    if (this.cursorHidden) {
      this.options.stream?.write("\u001B[?25h");
      this.cursorHidden = false;
    }
  }

  private scheduleRender(): void {
    if (this.renderTimer) {
      return;
    }

    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined;
      this.renderNow();
    }, 50);
  }

  private renderNow(): void {
    const stream = this.options.stream;
    if (!stream) {
      return;
    }

    const lines = this.buildFrameLines();
    if (lines.length === 0) {
      return;
    }

    if (!this.cursorHidden) {
      stream.write("\u001B[?25l");
      this.cursorHidden = true;
    }

    if (this.renderedLineCount > 0) {
      stream.write(`\u001B[${this.renderedLineCount}A\r`);
      stream.write("\u001B[J");
    }

    stream.write(lines.join("\n"));
    stream.write("\n");
    this.renderedLineCount = lines.length;
  }

  private buildFrameLines(): string[] {
    const counts = this.states.reduce(
      (accumulator, state) => {
        accumulator[state.status] += 1;
        return accumulator;
      },
      { queued: 0, running: 0, passed: 0, failed: 0 },
    );
    const tail = this.logBuffer.snapshot();
    const stream = this.options.stream;
    const lines = [
      this.fitToWidth(
        `[fitness] jobs ${this.options.concurrency} | `
          + `${colorize(stream, ANSI_GREEN, `${counts.passed} passed`)} | `
          + `${colorize(stream, ANSI_RED, `${counts.failed} failed`)} | `
          + `${colorize(stream, ANSI_BLUE, `${counts.running} running`)} | `
          + `${colorize(stream, ANSI_YELLOW, `${counts.queued} queued`)}`,
      ),
      ...this.states.map((state) => this.fitToWidth(this.renderStateLine(state))),
      this.fitToWidth(colorize(stream, ANSI_DIM, `[fitness tail] last ${this.options.tailLines} lines`)),
      ...(tail.length > 0
        ? tail.map((line) => this.fitToWidth(this.emphasizeTailLine(line)))
        : [this.fitToWidth(colorize(stream, ANSI_DIM, "(no command output yet)"))]),
    ];

    return lines;
  }

  private fitToWidth(line: string): string {
    const width = this.options.stream?.columns;
    if (!width || line.length <= width) {
      return line;
    }

    if (width <= 3) {
      return ".".repeat(width);
    }

    return `${line.slice(0, width - 3)}...`;
  }

  private renderStateLine(state: MetricState): string {
    const suffix = state.durationMs === undefined ? "" : ` ${formatDuration(state.durationMs)}`;
    return `[${state.index}/${this.states.length}] ${this.statusLabel(state.status)} ${state.metric.name}${suffix}`;
  }

  private shouldCaptureOutputLine(line: string): boolean {
    if (!line.trim()) {
      return false;
    }

    const hint = /error|failed|fail|fatal|panic|exception|denied|unauthorized|timed out|timeout|assert|not found|cannot/i;
    return hint.test(line);
  }

  private statusLabel(status: MetricStatus): string {
    switch (status) {
      case "queued":
        return `${colorize(this.options.stream, ANSI_YELLOW, "◻")} WAIT`;
      case "running":
        return `${colorize(this.options.stream, ANSI_BLUE, "▶")} RUN`;
      case "passed":
        return `${colorize(this.options.stream, ANSI_GREEN, "✓")} PASS`;
      case "failed":
        return `${colorize(this.options.stream, ANSI_RED, "✗")} FAIL`;
    }
  }

  private emphasizeTailLine(line: string): string {
    const withWarns = colorize(this.options.stream, ANSI_YELLOW, line);
    if (/\b(error|failed|panic|timeout|denied|cannot)\b/i.test(line)) {
      return colorize(this.options.stream, ANSI_RED, line);
    }

    if (/\b(warn|warning|retry|retrying|timed out|skip|skipped)\b/i.test(line)) {
      return withWarns;
    }

    return line;
  }
}

class PlainHumanMetricReporter implements HumanMetricReporter {
  constructor(
    private readonly metrics: HookMetric[],
    private readonly options: ReporterOptions,
  ) {}

  start(): void {
    const totalLine = colorize(
      this.options.stream,
      ANSI_CYAN,
      `[fitness] Running ${this.metrics.length} metrics with ${this.options.concurrency} workers`,
    );
    console.log(totalLine);
    console.log("");
  }

  onMetricStart(metric: HookMetric, index: number, total: number): void {
    const status = `${colorize(this.options.stream, ANSI_BLUE, "▶")} RUN`;
    console.log(`[fitness ${index}/${total}] ${status} ${metric.name}`);
  }

  onMetricOutput(): void {}

  onMetricComplete(result: MetricExecution, index: number, total: number): void {
    const status = result.passed
      ? `${colorize(this.options.stream, ANSI_GREEN, "✓")} PASS`
      : `${colorize(this.options.stream, ANSI_RED, "✗")} FAIL`;
    console.log(
      `[fitness ${index}/${total}] ${status} ${result.metric.name} in ${formatDuration(result.durationMs)}`,
    );
  }

  close(): void {}
}

export function createHumanMetricReporter(
  metrics: HookMetric[],
  options: ReporterOptions,
  verbose = false,
): HumanMetricReporter {
  if (verbose && options.stream?.isTTY) {
    return new DynamicHumanMetricReporter(metrics, options);
  }

  return new PlainHumanMetricReporter(metrics, options);
}
