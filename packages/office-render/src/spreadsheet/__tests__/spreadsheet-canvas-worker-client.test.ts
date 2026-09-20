import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSpreadsheetCanvasWorkerRenderer,
  type SpreadsheetCanvasWorkerFactory,
} from "../spreadsheet-canvas-worker-client";
import type { SpreadsheetCanvasRenderPlan } from "../spreadsheet-canvas-renderer";

describe("spreadsheet canvas worker client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes an offscreen worker renderer when the browser supports it", () => {
    const posted: unknown[] = [];
    const terminated = vi.fn();
    const worker = {
      postMessage: vi.fn((message: unknown) => posted.push(message)),
      terminate: terminated,
    } as unknown as Worker;
    const createWorker: SpreadsheetCanvasWorkerFactory = () => worker;
    const offscreen = {} as OffscreenCanvas;
    const canvas = {
      transferControlToOffscreen: vi.fn(() => offscreen),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("Worker", function Worker() {});
    vi.stubGlobal("OffscreenCanvas", function OffscreenCanvas() {});
    vi.stubGlobal("HTMLCanvasElement", function HTMLCanvasElement() {});
    Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
      configurable: true,
      value: () => offscreen,
    });

    const renderer = createSpreadsheetCanvasWorkerRenderer(canvas, createWorker);
    expect(renderer).not.toBeNull();
    expect(posted[0]).toEqual({ canvas: offscreen, kind: "init" });

    renderer?.render(testPlan());
    expect(posted[1]).toEqual({ kind: "render", plan: testPlan() });

    renderer?.destroy();
    expect(posted[2]).toEqual({ kind: "dispose" });
    expect(terminated).toHaveBeenCalled();
  });

  it("falls back when offscreen canvas support is missing", () => {
    vi.stubGlobal("Worker", undefined);
    vi.stubGlobal("OffscreenCanvas", undefined);

    expect(createSpreadsheetCanvasWorkerRenderer({} as HTMLCanvasElement, () => {
      throw new Error("should not create worker");
    })).toBeNull();
  });
});

function testPlan(): SpreadsheetCanvasRenderPlan {
  return {
    bitmap: { cssHeight: 20, cssWidth: 40, pixelHeight: 40, pixelRatio: 2, pixelWidth: 80 },
    cells: [],
    columnHeaders: [],
    corner: { height: 20, left: 0, top: 0, width: 40 },
    rowHeaders: [],
  };
}
