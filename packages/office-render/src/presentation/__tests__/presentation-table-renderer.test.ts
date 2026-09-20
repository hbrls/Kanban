import { describe, expect, it } from "vitest";

import { drawPresentationTable, presentationTableGrid } from "../presentation-table-renderer";

describe("presentationTableGrid", () => {
  const rect = { height: 200, left: 0, top: 0, width: 400 };

  it("proportionally scales column widths to fill the rect", () => {
    const grid = presentationTableGrid(
      { columns: [1_000, 1_000], rows: [{ cells: [{}, {}], height: 1_000 }] },
      rect,
    );
    expect(grid.columns).toEqual([200, 200]);
    expect(grid.rows).toEqual([200]);
  });

  it("handles gridSpan by counting spanned columns", () => {
    const grid = presentationTableGrid(
      {
        columns: [2_000, 1_000, 1_000],
        rows: [
          { cells: [{ gridSpan: 2 }, {}], height: 2_000 },
          { cells: [{}, {}, {}], height: 1_000 },
        ],
      },
      rect,
    );
    // total EMU: 4000; scale = 400/4000 = 0.1
    expect(grid.columns).toEqual([200, 100, 100]);
    expect(grid.rows[0]).toBeCloseTo(133.3, 0);
    expect(grid.rows[1]).toBeCloseTo(66.7, 0);
  });

  it("accepts columnWidths and gridColumns as alternative field names", () => {
    const byColumnWidths = presentationTableGrid(
      { columnWidths: [1_000, 1_000], rows: [] },
      rect,
    );
    const byGridColumns = presentationTableGrid(
      { gridColumns: [1_000, 1_000], rows: [] },
      rect,
    );
    expect(byColumnWidths.columns).toEqual(byGridColumns.columns);
  });

  it("returns a single column/row when dimensions are missing", () => {
    const grid = presentationTableGrid(
      { rows: [{ cells: [{}], height: 1_000 }] },
      rect,
    );
    expect(grid.columns).toHaveLength(1);
    expect(grid.rows).toHaveLength(1);
  });

  it("returns empty rows array for empty table", () => {
    const grid = presentationTableGrid({}, rect);
    expect(grid.columns).toHaveLength(1);
    expect(grid.rows).toHaveLength(0);
  });

  it("expands rendered row backgrounds when table text needs more height", () => {
    const context = mockCanvasContext();

    drawPresentationTable(
      context,
      {},
      {
        columns: [1_000],
        rows: [
          {
            cells: [
              {
                fill: { color: { type: 1, value: "003D4F" }, type: 1 },
                paragraphs: [
                  {
                    runs: [
                      {
                        text: "A long table cell value that wraps across several lines in a narrow PowerPoint table.",
                        textStyle: { fontSize: 1200 },
                      },
                    ],
                  },
                ],
              },
            ],
            height: 1_000,
          },
        ],
      },
      { height: 28, left: 0, top: 0, width: 120 },
      { height: 1_000, width: 1_000 },
      { height: 1_000, width: 1_000 },
      1,
    );

    expect(context.fillRects.some((rect) => rect.fillStyle === "#003D4F" && rect.height > 28)).toBe(true);
  });

  it("uses PowerPoint table cell margins by default and preserves explicit zero margins", () => {
    const context = mockCanvasContext();

    drawPresentationTable(
      context,
      {},
      {
        columns: [1_000],
        rows: [
          {
            cells: [
              {
                paragraphs: [{ runs: [{ text: "Default", textStyle: { fontSize: 1200 } }] }],
              },
            ],
            height: 1_000,
          },
          {
            cells: [
              {
                leftMargin: 0,
                paragraphs: [{ runs: [{ text: "Zero", textStyle: { fontSize: 1200 } }] }],
              },
            ],
            height: 1_000,
          },
        ],
      },
      { height: 80, left: 0, top: 0, width: 120 },
      { height: 800_000, width: 1_200_000 },
      { height: 80, width: 120 },
      0.1,
    );

    expect(context.fillTexts.find((text) => text.text === "Default")?.x).toBeCloseTo(9.14, 1);
    expect(context.fillTexts.find((text) => text.text === "Zero")?.x).toBe(0);
  });
});

function mockCanvasContext(): CanvasRenderingContext2D & {
  fillRects: Array<{ fillStyle: string; height: number; width: number; x: number; y: number }>;
  fillTexts: Array<{ text: string; x: number; y: number }>;
} {
  const state = {
    fillStyle: "",
    fillRects: [] as Array<{ fillStyle: string; height: number; width: number; x: number; y: number }>,
    fillTexts: [] as Array<{ text: string; x: number; y: number }>,
  };
  return ({
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      state.fillStyle = String(value);
    },
    get fillRects() {
      return state.fillRects;
    },
    get fillTexts() {
      return state.fillTexts;
    },
    beginPath: () => {},
    clip: () => {},
    fillRect: (x: number, y: number, width: number, height: number) => {
      state.fillRects.push({ fillStyle: state.fillStyle, height, width, x, y });
    },
    fillText: (text: string, x: number, y: number) => {
      state.fillTexts.push({ text, x, y });
    },
    lineTo: () => {},
    measureText: (text: string) => ({ width: text.length * 6 }) as TextMetrics,
    moveTo: () => {},
    rect: () => {},
    restore: () => {},
    save: () => {},
    setLineDash: () => {},
    stroke: () => {},
    translate: () => {},
  } as unknown) as CanvasRenderingContext2D & {
    fillRects: Array<{ fillStyle: string; height: number; width: number; x: number; y: number }>;
    fillTexts: Array<{ text: string; x: number; y: number }>;
  };
}
