import { describe, expect, it } from "vitest";

import { buildSpreadsheetLayout } from "../spreadsheet-layout";
import {
  clampSpreadsheetResizeSize,
  spreadsheetResizeDragFromHit,
  spreadsheetResizeHitAtViewportPoint,
  spreadsheetResizeSizeFromPoint,
} from "../spreadsheet-resize";

describe("spreadsheet resize controller", () => {
  it("detects column header boundary hits from prefix-sum layout", () => {
    const layout = buildSpreadsheetLayout({
      columns: [
        { max: 1, min: 1, width: 10 },
        { max: 2, min: 2, width: 20 },
      ],
      rows: [{ cells: [{ address: "A1" }], index: 1 }],
    });

    expect(spreadsheetResizeHitAtViewportPoint(layout, { x: 114, y: 8 }, { left: 0, top: 0 })).toEqual({
      axis: "column",
      boundary: 115,
      index: 0,
      originalSize: 75,
    });
  });

  it("detects row header boundary hits from prefix-sum layout", () => {
    const layout = buildSpreadsheetLayout({
      rows: [
        { cells: [{ address: "A1" }], height: 30, index: 1 },
        { cells: [{ address: "A2" }], index: 2 },
      ],
    });

    expect(spreadsheetResizeHitAtViewportPoint(layout, { x: 12, y: 61 }, { left: 0, top: 0 })).toEqual({
      axis: "row",
      boundary: 60,
      index: 0,
      originalSize: 40,
    });
  });

  it("computes clamped drag sizes in worksheet space", () => {
    const layout = buildSpreadsheetLayout({
      columns: [{ max: 1, min: 1, width: 10 }],
      rows: [{ cells: [{ address: "A1" }], index: 1 }],
    });
    const hit = spreadsheetResizeHitAtViewportPoint(layout, { x: 114, y: 8 }, { left: 0, top: 0 });
    expect(hit).not.toBeNull();

    const drag = spreadsheetResizeDragFromHit(layout, hit!, { x: 114, y: 8 }, { left: 0, top: 0 });
    expect(spreadsheetResizeSizeFromPoint(layout, drag, { x: 150, y: 8 }, { left: 0, top: 0 })).toBe(111);
    expect(clampSpreadsheetResizeSize("column", -1)).toBe(24);
    expect(clampSpreadsheetResizeSize("row", 999)).toBe(240);
  });

  it("applies interactive size overrides without mutating protocol rows or columns", () => {
    const layout = buildSpreadsheetLayout(
      {
        columns: [{ max: 1, min: 1, width: 10 }],
        rows: [{ cells: [{ address: "A1" }], height: 30, index: 1 }],
      },
      {
        columnWidths: { 0: 140 },
        rowHeights: { 0: 44 },
      },
    );

    expect(layout.columnWidths[0]).toBe(140);
    expect(layout.rowHeights[0]).toBe(44);
    expect(layout.columnOffsets.slice(0, 2)).toEqual([40, 180]);
    expect(layout.rowOffsets.slice(0, 2)).toEqual([20, 64]);
  });
});
