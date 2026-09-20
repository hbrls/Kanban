import { drawSpreadsheetCanvasRenderPlan } from "./spreadsheet-canvas-renderer";
import type { SpreadsheetCanvasWorkerMessage } from "./spreadsheet-canvas-worker-protocol";

let canvas: OffscreenCanvas | null = null;

self.onmessage = (event: MessageEvent<SpreadsheetCanvasWorkerMessage>) => {
  const message = event.data;
  if (message.kind === "init") {
    canvas = message.canvas;
    return;
  }
  if (message.kind === "dispose") {
    canvas = null;
    self.close();
    return;
  }
  if (!canvas) return;
  if (canvas.width !== message.plan.bitmap.pixelWidth) canvas.width = message.plan.bitmap.pixelWidth;
  if (canvas.height !== message.plan.bitmap.pixelHeight) canvas.height = message.plan.bitmap.pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) return;
  drawSpreadsheetCanvasRenderPlan(context, message.plan);
};

export {};
