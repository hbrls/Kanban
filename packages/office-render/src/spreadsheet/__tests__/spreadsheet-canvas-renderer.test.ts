import { describe, expect, it } from "vitest";

import { buildSpreadsheetCanvasCommands } from "../spreadsheet-canvas-commands";
import {
  buildSpreadsheetCanvasRenderPlan,
  spreadsheetCanvasBitmapSize,
  spreadsheetCanvasFont,
} from "../spreadsheet-canvas-renderer";
import { buildSpreadsheetLayout } from "../spreadsheet-layout";

describe("spreadsheet canvas renderer", () => {
  it("syncs canvas bitmap size from viewport and device pixel ratio", () => {
    expect(spreadsheetCanvasBitmapSize({ height: 90.4, width: 140.6 }, 2)).toEqual({
      cssHeight: 90,
      cssWidth: 141,
      pixelHeight: 180,
      pixelRatio: 2,
      pixelWidth: 282,
    });
    expect(spreadsheetCanvasBitmapSize({ height: 0, width: 0 }, 0)).toEqual({
      cssHeight: 0,
      cssWidth: 0,
      pixelHeight: 1,
      pixelRatio: 1,
      pixelWidth: 1,
    });
  });

  it("projects visible worksheet commands into viewport canvas coordinates", () => {
    const layout = buildSpreadsheetLayout({
      columns: [
        { max: 1, min: 1, width: 10 },
        { max: 2, min: 2, width: 10 },
      ],
      rows: [
        { cells: [{ address: "A1" }], index: 1 },
        { cells: [{ address: "B2" }], index: 2 },
      ],
    });
    const commands = buildSpreadsheetCanvasCommands({
      layout,
      scroll: { left: 60, top: 20 },
      viewportSize: { height: 80, width: 180 },
    });

    const plan = buildSpreadsheetCanvasRenderPlan({
      commands,
      pixelRatio: 1,
      scroll: { left: 60, top: 20 },
      viewportSize: { height: 80, width: 180 },
    });

    expect(plan.columnHeaders[0]).toMatchObject({
      height: 20,
      left: -20,
      text: undefined,
      top: 0,
      width: 75,
    });
    expect(plan.rowHeaders[0]).toMatchObject({
      height: 20,
      left: 0,
      text: undefined,
      top: 0,
      width: 40,
    });
    expect(plan.cells[0]).toMatchObject({
      height: 20,
      left: -20,
      top: 0,
      width: 75,
    });
  });

  it("projects cell paint commands without duplicating DOM text", () => {
    const layout = buildSpreadsheetLayout({
      rows: [{ cells: [{ address: "A1" }], index: 1 }],
    });
    const commands = buildSpreadsheetCanvasCommands({
      cellPaints: new Map([[
        "1:0",
        {
          borderBottom: { color: "#123456", width: 2 },
          borderRight: { color: "#654321", width: 3 },
          color: "#222222",
          fill: "#fafafa",
          fontFamily: "Aptos, sans-serif",
          fontSize: 15,
          fontStyle: "italic",
          fontWeight: 700,
          paddingLeft: 17,
          text: "Hello",
          textAlign: "right",
          verticalAlign: "bottom",
        },
      ]]),
      layout,
      scroll: { left: 0, top: 0 },
      viewportSize: { height: 80, width: 180 },
    });

    const plan = buildSpreadsheetCanvasRenderPlan({
      commands,
      pixelRatio: 1,
      scroll: { left: 0, top: 0 },
      viewportSize: { height: 80, width: 180 },
    });

    expect(plan.cells[0]).toMatchObject({
      borderBottom: { color: "#123456", width: 2 },
      borderRight: { color: "#654321", width: 3 },
      color: "#222222",
      fill: "#fafafa",
      fontFamily: "Aptos, sans-serif",
      fontSize: 15,
      fontStyle: "italic",
      fontWeight: 700,
      paddingLeft: 17,
      text: undefined,
      textAlign: "right",
      verticalAlign: "bottom",
    });
  });

  it("falls back to the Excel-like spreadsheet font stack for canvas cells", () => {
    expect(spreadsheetCanvasFont({ height: 20, left: 0, text: "Hello", top: 0, width: 80 }))
      .toBe("500 13px Aptos, Calibri, Arial, Helvetica, sans-serif");
  });
});
