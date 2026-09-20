import { describe, expect, it } from "vitest";

import {
  createSpreadsheetCanvasFrameScheduler,
  spreadsheetCanvasRenderPlanSignature,
} from "../spreadsheet-canvas-frame-scheduler";
import type { SpreadsheetCanvasRenderPlan } from "../spreadsheet-canvas-renderer";

describe("spreadsheet canvas frame scheduler", () => {
  it("coalesces canvas render plans into one frame", () => {
    const draws: SpreadsheetCanvasRenderPlan[] = [];
    const callbacks: Array<() => void> = [];
    const scheduler = createSpreadsheetCanvasFrameScheduler({
      draw: (plan) => draws.push(plan),
      requestFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
    });

    scheduler.schedule(testPlan({ cellLeft: 10 }));
    scheduler.schedule(testPlan({ cellLeft: 20 }));
    expect(draws).toEqual([]);

    callbacks[0]?.();
    expect(draws).toEqual([testPlan({ cellLeft: 20 })]);
  });

  it("skips unchanged render-plan signatures", () => {
    const draws: SpreadsheetCanvasRenderPlan[] = [];
    const scheduler = createSpreadsheetCanvasFrameScheduler({
      draw: (plan) => draws.push(plan),
      requestFrame: (callback) => {
        callback();
        return 1;
      },
    });

    scheduler.schedule(testPlan({ cellLeft: 10 }));
    scheduler.schedule(testPlan({ cellLeft: 10 }));
    scheduler.schedule(testPlan({ cellLeft: 11 }));

    expect(draws).toEqual([
      testPlan({ cellLeft: 10 }),
      testPlan({ cellLeft: 11 }),
    ]);
  });

  it("captures viewport and edge command changes in the signature", () => {
    expect(spreadsheetCanvasRenderPlanSignature(testPlan({ cellLeft: 10 })))
      .not.toBe(spreadsheetCanvasRenderPlanSignature(testPlan({ cellLeft: 11 })));
    expect(spreadsheetCanvasRenderPlanSignature(testPlan({ cellLeft: 10, width: 200 })))
      .not.toBe(spreadsheetCanvasRenderPlanSignature(testPlan({ cellLeft: 10 })));
  });
});

function testPlan({
  cellLeft,
  width = 120,
}: {
  cellLeft: number;
  width?: number;
}): SpreadsheetCanvasRenderPlan {
  return {
    bitmap: {
      cssHeight: 80,
      cssWidth: width,
      pixelHeight: 160,
      pixelRatio: 2,
      pixelWidth: width * 2,
    },
    cells: [{ height: 20, left: cellLeft, top: 0, width: 80 }],
    columnHeaders: [{ height: 20, left: cellLeft, text: "A", top: 0, width: 80 }],
    corner: { height: 20, left: 0, top: 0, width: 40 },
    rowHeaders: [{ height: 20, left: 0, text: "1", top: 0, width: 40 }],
  };
}
