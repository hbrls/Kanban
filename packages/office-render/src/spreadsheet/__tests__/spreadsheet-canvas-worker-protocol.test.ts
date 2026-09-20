import { describe, expect, it } from "vitest";

import {
  spreadsheetCanvasRenderMessage,
  spreadsheetCanvasWorkerCapabilities,
} from "../spreadsheet-canvas-worker-protocol";
import type { SpreadsheetCanvasRenderPlan } from "../spreadsheet-canvas-renderer";

describe("spreadsheet canvas worker protocol", () => {
  it("prefers offscreen worker rendering only when every browser primitive is available", () => {
    expect(spreadsheetCanvasWorkerCapabilities({
      HTMLCanvasElement: { prototype: { transferControlToOffscreen: () => ({}) } },
      OffscreenCanvas: function OffscreenCanvas() {},
      Worker: function Worker() {},
    })).toEqual({
      canUseOffscreenCanvas: true,
      canUseWorker: true,
      preferredRenderer: "worker-offscreen-canvas",
    });

    expect(spreadsheetCanvasWorkerCapabilities({
      HTMLCanvasElement: { prototype: {} },
      OffscreenCanvas: function OffscreenCanvas() {},
      Worker: function Worker() {},
    })).toEqual({
      canUseOffscreenCanvas: false,
      canUseWorker: true,
      preferredRenderer: "main-thread-canvas",
    });
  });

  it("wraps render plans in a serializable worker message", () => {
    const plan: SpreadsheetCanvasRenderPlan = {
      bitmap: { cssHeight: 20, cssWidth: 40, pixelHeight: 40, pixelRatio: 2, pixelWidth: 80 },
      cells: [{ height: 20, left: 40, top: 20, width: 80 }],
      columnHeaders: [{ height: 20, left: 40, text: "A", top: 0, width: 80 }],
      corner: { height: 20, left: 0, top: 0, width: 40 },
      rowHeaders: [{ height: 20, left: 0, text: "1", top: 20, width: 40 }],
    };

    expect(spreadsheetCanvasRenderMessage(plan)).toEqual({
      kind: "render",
      plan,
    });
  });
});
