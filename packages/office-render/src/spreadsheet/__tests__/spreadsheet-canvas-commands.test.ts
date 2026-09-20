import { describe, expect, it } from "vitest";

import { buildSpreadsheetCanvasCommands } from "../spreadsheet-canvas-commands";
import { buildSpreadsheetLayout } from "../spreadsheet-layout";

describe("spreadsheet canvas commands", () => {
  it("projects visible worksheet cells and headers into canvas draw commands", () => {
    const layout = buildSpreadsheetLayout({
      columns: [
        { max: 1, min: 1, width: 10 },
        { max: 2, min: 2, width: 10 },
        { max: 3, min: 3, width: 10 },
      ],
      mergedCells: [{ reference: "B2:C3" }],
      rows: [
        { cells: [{ address: "A1" }], index: 1 },
        { cells: [{ address: "B2" }], index: 2 },
        { cells: [{ address: "C3" }], index: 3 },
      ],
    });

    const commands = buildSpreadsheetCanvasCommands({
      cellPaints: new Map([[
        "2:1",
        {
          borderBottom: { color: "#123456", width: 2 },
          borderRight: { color: "#654321", width: 3 },
          color: "#111111",
          fill: "#eeeeee",
          fontSize: 14,
          fontWeight: 700,
          text: "Merged",
          textAlign: "center",
          verticalAlign: "middle",
        },
      ]]),
      layout,
      scroll: { left: 0, top: 0 },
      viewportSize: { height: 100, width: 220 },
    });

    expect(commands.headers.slice(0, 3)).toEqual([
      { height: 20, label: "A", left: 40, top: 0, type: "column", width: 75 },
      { height: 20, label: "B", left: 115, top: 0, type: "column", width: 75 },
      { height: 20, label: "C", left: 190, top: 0, type: "column", width: 75 },
    ]);
    expect(commands.cells).toContainEqual({
      addressKey: "2:1",
      borderBottom: { color: "#123456", width: 2 },
      borderRight: { color: "#654321", width: 3 },
      color: "#111111",
      fill: "#eeeeee",
      fontSize: 14,
      fontWeight: 700,
      height: 40,
      left: 115,
      text: "Merged",
      textAlign: "center",
      top: 40,
      verticalAlign: "middle",
      width: 150,
    });
    expect(commands.cells.some((cell) => cell.addressKey === "3:2")).toBe(false);
  });
});
