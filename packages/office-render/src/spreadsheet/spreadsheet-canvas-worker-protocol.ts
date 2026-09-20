import type { SpreadsheetCanvasRenderPlan } from "./spreadsheet-canvas-renderer";

export type SpreadsheetCanvasWorkerCapabilities = {
  canUseOffscreenCanvas: boolean;
  canUseWorker: boolean;
  preferredRenderer: "main-thread-canvas" | "worker-offscreen-canvas";
};

export type SpreadsheetCanvasWorkerInitMessage = {
  canvas: OffscreenCanvas;
  kind: "init";
};

export type SpreadsheetCanvasWorkerRenderMessage = {
  kind: "render";
  plan: SpreadsheetCanvasRenderPlan;
};

export type SpreadsheetCanvasWorkerDisposeMessage = {
  kind: "dispose";
};

export type SpreadsheetCanvasWorkerMessage =
  | SpreadsheetCanvasWorkerDisposeMessage
  | SpreadsheetCanvasWorkerInitMessage
  | SpreadsheetCanvasWorkerRenderMessage;

export type SpreadsheetCanvasWorkerEnv = {
  HTMLCanvasElement?: {
    prototype?: {
      transferControlToOffscreen?: unknown;
    };
  };
  OffscreenCanvas?: unknown;
  Worker?: unknown;
};

export function spreadsheetCanvasWorkerCapabilities(
  env: SpreadsheetCanvasWorkerEnv = globalThis as SpreadsheetCanvasWorkerEnv,
): SpreadsheetCanvasWorkerCapabilities {
  const canUseWorker = typeof env.Worker === "function";
  const canUseOffscreenCanvas = typeof env.OffscreenCanvas === "function" &&
    typeof env.HTMLCanvasElement?.prototype?.transferControlToOffscreen === "function";
  return {
    canUseOffscreenCanvas,
    canUseWorker,
    preferredRenderer: canUseWorker && canUseOffscreenCanvas ? "worker-offscreen-canvas" : "main-thread-canvas",
  };
}

export function spreadsheetCanvasRenderMessage(
  plan: SpreadsheetCanvasRenderPlan,
): SpreadsheetCanvasWorkerRenderMessage {
  return {
    kind: "render",
    plan,
  };
}
