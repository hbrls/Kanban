import { describe, expect, it } from "vitest";

import { buildSpreadsheetLayout } from "../spreadsheet-layout";
import {
  spreadsheetFrozenSelectionSegments,
  spreadsheetMergeStartForCell,
  spreadsheetMoveSelection,
  spreadsheetSelectionFromViewportPoint,
  spreadsheetSelectionWorldRect,
} from "../spreadsheet-selection";

describe("spreadsheet selection controller", () => {
  it("normalizes covered merged cells back to their merge start", () => {
    const layout = buildSpreadsheetLayout({
      mergedCells: [{ reference: "B2:D3" }],
      rows: [
        { cells: [{ address: "B2", value: "merged" }], index: 2 },
        { cells: [{ address: "D3" }], index: 3 },
      ],
    });

    expect(spreadsheetMergeStartForCell(layout, 3, 3)).toEqual({
      columnIndex: 1,
      rowIndex: 2,
      rowOffset: 1,
    });
    expect(spreadsheetSelectionFromViewportPoint(
      layout,
      { x: 240, y: 45 },
      { left: 0, top: 0 },
    )).toEqual({
      columnIndex: 1,
      rowIndex: 2,
      rowOffset: 1,
    });
  });

  it("projects selection rectangles from worksheet space", () => {
    const layout = buildSpreadsheetLayout({
      columns: [
        { max: 1, min: 1, width: 10 },
        { max: 2, min: 2, width: 20 },
      ],
      mergedCells: [{ reference: "A1:B2" }],
      rows: [
        { cells: [{ address: "A1" }], height: 30, index: 1 },
        { cells: [{ address: "B2" }], index: 2 },
      ],
    });

    expect(spreadsheetSelectionWorldRect(layout, { columnIndex: 0, rowIndex: 1, rowOffset: 0 })).toEqual({
      height: 60,
      left: 40,
      top: 20,
      width: 220,
    });
  });

  it("splits frozen selection overlays into fixed viewport segments", () => {
    const layout = buildSpreadsheetLayout({
      columns: [
        { max: 1, min: 1, width: 10 },
        { max: 2, min: 2, width: 20 },
        { max: 3, min: 3, width: 10 },
      ],
      freezePanes: { columnCount: 1, rowCount: 1 },
      rows: [
        { cells: [{ address: "A1" }], height: 30, index: 1 },
        { cells: [{ address: "B2" }], index: 2 },
      ],
    });

    expect(spreadsheetFrozenSelectionSegments(
      layout,
      { columnIndex: 0, rowIndex: 1, rowOffset: 0 },
      { left: 180, top: 60 },
    )).toEqual([
      {
        height: 40,
        left: 40,
        top: 20,
        width: 75,
      },
    ]);
  });

  it("moves keyboard selection through merged cells and clamps to the sheet bounds", () => {
    const layout = buildSpreadsheetLayout({
      mergedCells: [{ reference: "B2:C3" }],
      rows: [
        { cells: [{ address: "A1" }], index: 1 },
        { cells: [{ address: "B2" }], index: 2 },
        { cells: [{ address: "C3" }], index: 3 },
        { cells: [{ address: "B4" }], index: 4 },
      ],
    });

    expect(spreadsheetMoveSelection(layout, { columnIndex: 1, rowIndex: 2, rowOffset: 1 }, "right")).toEqual({
      columnIndex: 3,
      rowIndex: 2,
      rowOffset: 1,
    });
    expect(spreadsheetMoveSelection(layout, { columnIndex: 1, rowIndex: 2, rowOffset: 1 }, "down")).toEqual({
      columnIndex: 1,
      rowIndex: 4,
      rowOffset: 3,
    });
    expect(spreadsheetMoveSelection(layout, { columnIndex: 0, rowIndex: 1, rowOffset: 0 }, "left")).toEqual({
      columnIndex: 0,
      rowIndex: 1,
      rowOffset: 0,
    });
  });
});
