import { describe, expect, it } from "vitest";

import {
  spreadsheetFrozenColumnHeaderRect,
  spreadsheetFrozenRowHeaderRect,
} from "../spreadsheet-frozen-headers";
import {
  buildSpreadsheetLayout,
  spreadsheetDrawingBounds,
  spreadsheetFloatingHitRegions,
  spreadsheetFrozenBodyHeight,
  spreadsheetFrozenBodyWidth,
  spreadsheetHitCellAtViewportPoint,
  spreadsheetVisibleCellRange,
  spreadsheetViewportIntersectsRect,
  spreadsheetViewportPointToWorld,
  spreadsheetViewportRectSegments,
} from "../spreadsheet-layout";

describe("spreadsheet frozen headers", () => {
  it("projects column and row headers from prefix-sum layout into viewport space", () => {
    const layout = buildSpreadsheetLayout({
      columns: [
        { max: 1, min: 1, width: 10 },
        { max: 2, min: 2, width: 20 },
      ],
      rows: [
        { cells: [{ address: "A1" }], height: 30, index: 1 },
        { cells: [{ address: "B2" }], index: 2 },
      ],
    });

    expect(spreadsheetFrozenColumnHeaderRect(layout, 1, 25)).toEqual({
      height: 20,
      left: 50,
      width: 145,
    });
    expect(spreadsheetFrozenRowHeaderRect(layout, 1, 15)).toEqual({
      height: 20,
      top: 25,
      width: 40,
    });
  });

  it("projects frozen worksheet body regions using Walnut-like viewport math", () => {
    const layout = buildSpreadsheetLayout({
      columns: [
        { max: 1, min: 1, width: 10 },
        { max: 2, min: 2, width: 20 },
      ],
      freezePanes: { columnCount: 2, rowCount: 2 },
      rows: [
        { cells: [{ address: "A1" }], height: 30, index: 1 },
        { cells: [{ address: "B2" }], index: 2 },
        { cells: [{ address: "C3" }], index: 3 },
      ],
    });

    expect(layout.freezePanes).toEqual({ columnCount: 2, rowCount: 2 });
    expect(spreadsheetFrozenBodyWidth(layout)).toBe(220);
    expect(spreadsheetFrozenBodyHeight(layout)).toBe(60);

    expect(spreadsheetViewportPointToWorld(layout, { x: 120, y: 65 }, { left: 200, top: 100 })).toEqual({
      x: 120,
      y: 65,
    });
    expect(spreadsheetViewportPointToWorld(layout, { x: 300, y: 120 }, { left: 200, top: 100 })).toEqual({
      x: 500,
      y: 220,
    });

    expect(spreadsheetHitCellAtViewportPoint(layout, { x: 120, y: 65 }, { left: 200, top: 100 })).toEqual({
      columnIndex: 1,
      rowIndex: 2,
      rowOffset: 1,
    });
  });

  it("splits frozen row and column rectangles into viewport hit regions", () => {
    const layout = buildSpreadsheetLayout({
      columns: [
        { max: 1, min: 1, width: 10 },
        { max: 2, min: 2, width: 20 },
      ],
      freezePanes: { columnCount: 2, rowCount: 2 },
      rows: [
        { cells: [{ address: "A1" }], height: 30, index: 1 },
        { cells: [{ address: "B2" }], index: 2 },
        { cells: [{ address: "C3" }], index: 3 },
      ],
    });

    expect(spreadsheetViewportRectSegments(
      layout,
      { height: 100, left: 115, top: 80, width: 300 },
      { left: 80, top: 30 },
    )).toEqual([
      {
        height: 70,
        left: 115,
        top: 80,
        width: 145,
      },
    ]);
  });

  it("finds visible cells from prefix sums with overscan", () => {
    const layout = buildSpreadsheetLayout({
      columns: Array.from({ length: 12 }, (_, index) => ({ max: index + 1, min: index + 1, width: 10 })),
      rows: Array.from({ length: 20 }, (_, index) => ({
        cells: [{ address: `A${index + 1}` }],
        index: index + 1,
      })),
    });

    expect(spreadsheetVisibleCellRange(
      layout,
      { height: 75, width: 260 },
      { left: 270, top: 105 },
      1,
    )).toEqual({
      endColumnIndex: 7,
      endRowOffset: 9,
      startColumnIndex: 2,
      startRowOffset: 3,
    });
  });

  it("keeps full production-scale layout while exposing only a viewport window", () => {
    const layout = buildSpreadsheetLayout({
      columns: Array.from({ length: 182 }, (_, index) => ({ max: index + 1, min: index + 1, width: 10 })),
      rows: Array.from({ length: 1500 }, (_, index) => ({
        cells: [{ address: `A${index + 1}` }],
        index: index + 1,
      })),
    });

    expect(layout.columnCount).toBe(182);
    expect(layout.rowCount).toBe(1500);
    expect(spreadsheetVisibleCellRange(
      layout,
      { height: 320, width: 640 },
      { left: 10_000, top: 20_000 },
      1,
    )).toEqual({
      endColumnIndex: 142,
      endRowOffset: 1016,
      startColumnIndex: 131,
      startRowOffset: 998,
    });
    expect(spreadsheetVisibleCellRange(
      layout,
      { height: 0, width: 0 },
      { left: 0, top: 0 },
      1,
    )).toEqual({
      endColumnIndex: 21,
      endRowOffset: 51,
      startColumnIndex: 0,
      startRowOffset: 0,
    });
  });

  it("keeps hidden rows and columns in prefix sums as zero-size layout entries", () => {
    const layout = buildSpreadsheetLayout({
      columns: [
        { hidden: true, max: 1, min: 1, styleIndex: 5, width: 10 },
        { max: 2, min: 2, styleIndex: 6, width: 10 },
      ],
      rows: [
        { cells: [{ address: "A1" }], hidden: true, index: 1 },
        { cells: [{ address: "B2" }], height: 30, index: 2, styleIndex: 7 },
      ],
    });

    expect(layout.columnWidths.slice(0, 2)).toEqual([0, 75]);
    expect(layout.columnStyleIndexes.slice(0, 2)).toEqual([5, 6]);
    expect(layout.rowRecordsByIndex.get(2)?.styleIndex).toBe(7);
    expect(layout.rowHeights.slice(0, 2)).toEqual([0, 40]);
    expect(layout.columnOffsets.slice(0, 3)).toEqual([40, 40, 115]);
    expect(layout.rowOffsets.slice(0, 3)).toEqual([20, 20, 60]);
    expect(spreadsheetVisibleCellRange(
      layout,
      { height: 80, width: 160 },
      { left: 0, top: 0 },
      0,
    )).toEqual({
      endColumnIndex: 2,
      endRowOffset: 1,
      startColumnIndex: 1,
      startRowOffset: 1,
    });
  });

  it("culls floating overlays against the scroll viewport with overscan", () => {
    expect(spreadsheetViewportIntersectsRect(
      { height: 80, left: 520, top: 380, width: 120 },
      { height: 240, width: 360 },
      { left: 120, top: 100 },
      0,
    )).toBe(false);

    expect(spreadsheetViewportIntersectsRect(
      { height: 80, left: 520, top: 380, width: 120 },
      { height: 240, width: 360 },
      { left: 120, top: 100 },
      120,
    )).toBe(true);

    expect(spreadsheetViewportIntersectsRect(
      { height: 80, left: 10_000, top: 10_000, width: 120 },
      { height: 0, width: 0 },
      { left: 120, top: 100 },
      0,
    )).toBe(true);
  });

  it("normalizes two-cell drawing anchors through the shared layout adapter", () => {
    const layout = buildSpreadsheetLayout({
      columns: Array.from({ length: 4 }, (_, index) => ({ max: index + 1, min: index + 1, width: 10 })),
      rows: Array.from({ length: 6 }, (_, index) => ({
        cells: [{ address: `A${index + 1}` }],
        index: index + 1,
      })),
    });

    expect(spreadsheetDrawingBounds(layout, {
      fromAnchor: { colId: "1", rowId: "2" },
      toAnchor: { colId: "3", rowId: "5" },
    })).toEqual({
      height: 60,
      left: 115,
      top: 60,
      width: 150,
    });

    expect(spreadsheetDrawingBounds(layout, {
      fromAnchor: { colId: "1", rowId: "2" },
      shape: { bbox: { heightEmu: 381_000, widthEmu: 762_000 } },
    })).toEqual({
      height: 40,
      left: 115,
      top: 60,
      width: 80,
    });
  });

  it("segments floating drawing hit regions across frozen panes", () => {
    const layout = buildSpreadsheetLayout({
      columns: Array.from({ length: 4 }, (_, index) => ({ max: index + 1, min: index + 1, width: 10 })),
      freezePanes: { columnCount: 1, rowCount: 1 },
      rows: Array.from({ length: 6 }, (_, index) => ({
        cells: [{ address: `A${index + 1}` }],
        index: index + 1,
      })),
    });

    expect(spreadsheetFloatingHitRegions(
      layout,
      { height: 60, left: 100, top: 30, width: 120 },
      { left: 0, top: 0 },
    )).toEqual([
      { frozenColumns: true, frozenRows: true, height: 10, left: 100, top: 30, width: 15 },
      { frozenColumns: true, frozenRows: false, height: 50, left: 100, top: 40, width: 15 },
      { frozenColumns: false, frozenRows: true, height: 10, left: 115, top: 30, width: 105 },
      { frozenColumns: false, frozenRows: false, height: 50, left: 115, top: 40, width: 105 },
    ]);
  });
});
