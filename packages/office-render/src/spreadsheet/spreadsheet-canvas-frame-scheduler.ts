import type { SpreadsheetCanvasRenderPlan } from "./spreadsheet-canvas-renderer";

export type SpreadsheetCanvasFrameScheduler = {
  destroy(): void;
  flush(): void;
  schedule(plan: SpreadsheetCanvasRenderPlan): void;
};

type FrameCallback = () => void;
type RequestFrame = (callback: FrameCallback) => number;
type CancelFrame = (handle: number) => void;

export function createSpreadsheetCanvasFrameScheduler({
  cancelFrame = defaultCancelFrame,
  draw,
  requestFrame = defaultRequestFrame,
}: {
  cancelFrame?: CancelFrame;
  draw: (plan: SpreadsheetCanvasRenderPlan) => void;
  requestFrame?: RequestFrame;
}): SpreadsheetCanvasFrameScheduler {
  let frame: number | null = null;
  let lastSignature = "";
  let pending: SpreadsheetCanvasRenderPlan | null = null;

  const flush = () => {
    frame = null;
    const plan = pending;
    pending = null;
    if (!plan) return;
    const signature = spreadsheetCanvasRenderPlanSignature(plan);
    if (signature === lastSignature) return;
    lastSignature = signature;
    draw(plan);
  };

  return {
    destroy: () => {
      pending = null;
      if (frame != null) cancelFrame(frame);
      frame = null;
    },
    flush,
    schedule: (plan) => {
      pending = plan;
      if (frame != null) return;
      let flushedSynchronously = false;
      frame = -1;
      const handle = requestFrame(() => {
        flushedSynchronously = true;
        flush();
      });
      if (!flushedSynchronously) frame = handle;
    },
  };
}

export function spreadsheetCanvasRenderPlanSignature(plan: SpreadsheetCanvasRenderPlan): string {
  const firstCell = plan.cells[0];
  const lastCell = plan.cells[plan.cells.length - 1];
  const firstColumnHeader = plan.columnHeaders[0];
  const lastColumnHeader = plan.columnHeaders[plan.columnHeaders.length - 1];
  const firstRowHeader = plan.rowHeaders[0];
  const lastRowHeader = plan.rowHeaders[plan.rowHeaders.length - 1];
  return [
    plan.bitmap.cssWidth,
    plan.bitmap.cssHeight,
    plan.bitmap.pixelWidth,
    plan.bitmap.pixelHeight,
    plan.cells.length,
    rectSignature(firstCell),
    rectSignature(lastCell),
    plan.columnHeaders.length,
    rectSignature(firstColumnHeader),
    rectSignature(lastColumnHeader),
    plan.rowHeaders.length,
    rectSignature(firstRowHeader),
    rectSignature(lastRowHeader),
  ].join("|");
}

function rectSignature(rect: { height: number; left: number; top: number; width: number } | undefined): string {
  if (!rect) return "";
  return `${rect.left},${rect.top},${rect.width},${rect.height}`;
}

function defaultRequestFrame(callback: FrameCallback): number {
  if (typeof window === "undefined") {
    callback();
    return 0;
  }
  return window.requestAnimationFrame(callback);
}

function defaultCancelFrame(handle: number) {
  if (typeof window === "undefined") return;
  window.cancelAnimationFrame(handle);
}
