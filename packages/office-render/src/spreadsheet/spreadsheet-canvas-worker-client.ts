import type { SpreadsheetCanvasRenderPlan } from "./spreadsheet-canvas-renderer";
import {
  spreadsheetCanvasRenderMessage,
  spreadsheetCanvasWorkerCapabilities,
  type SpreadsheetCanvasWorkerInitMessage,
} from "./spreadsheet-canvas-worker-protocol";

export type SpreadsheetCanvasWorkerRenderer = {
  destroy(): void;
  render(plan: SpreadsheetCanvasRenderPlan): void;
};

export type SpreadsheetCanvasWorkerFactory = () => Worker;

export function createSpreadsheetCanvasWorkerRenderer(
  canvas: HTMLCanvasElement,
  createWorker: SpreadsheetCanvasWorkerFactory = defaultSpreadsheetCanvasWorkerFactory,
): SpreadsheetCanvasWorkerRenderer | null {
  if (spreadsheetCanvasWorkerCapabilities().preferredRenderer !== "worker-offscreen-canvas") return null;
  if (typeof canvas.transferControlToOffscreen !== "function") return null;

  try {
    const worker = createWorker();
    const offscreenCanvas = canvas.transferControlToOffscreen();
    const initMessage: SpreadsheetCanvasWorkerInitMessage = {
      canvas: offscreenCanvas,
      kind: "init",
    };
    worker.postMessage(initMessage, [offscreenCanvas]);
    return {
      destroy: () => {
        worker.postMessage({ kind: "dispose" });
        worker.terminate();
      },
      render: (plan) => worker.postMessage(spreadsheetCanvasRenderMessage(plan)),
    };
  } catch {
    return null;
  }
}

function defaultSpreadsheetCanvasWorkerFactory(): Worker {
  return new Worker(new URL("./spreadsheet-canvas.worker.ts", import.meta.url), { type: "module" });
}
