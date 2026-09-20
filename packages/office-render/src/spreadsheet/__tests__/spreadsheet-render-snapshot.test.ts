import { describe, expect, it } from "vitest";

import { buildSpreadsheetLayout } from "../spreadsheet-layout";
import {
  buildSpreadsheetRenderSnapshot,
  visibleCellIntersectsRange,
} from "../spreadsheet-render-snapshot";

describe("spreadsheet render snapshot", () => {
  it("builds a reusable visible window snapshot with merge-start overscan", () => {
    const layout = buildSpreadsheetLayout({
      columns: Array.from({ length: 8 }, (_, index) => ({ max: index + 1, min: index + 1, width: 10 })),
      mergedCells: [{ reference: "B2:D4" }],
      rows: Array.from({ length: 12 }, (_, index) => ({
        cells: [{ address: `A${index + 1}` }],
        index: index + 1,
      })),
    });

    const snapshot = buildSpreadsheetRenderSnapshot({
      layout,
      scroll: { left: 260, top: 95 },
      viewportSize: { height: 60, width: 150 },
    });

    expect(snapshot.visibleRange).toMatchObject({
      endColumnIndex: 6,
      endRowOffset: 8,
      startColumnIndex: 0,
      startRowOffset: 1,
    });
    expect(snapshot.visibleMergeStarts.has("2:1")).toBe(true);
    expect(snapshot.visibleColumnIndexes).toContain(1);
    expect(snapshot.visibleRowOffsets).toContain(1);
    expect(visibleCellIntersectsRange(layout, 1, 1, snapshot.visibleRange)).toBe(true);
  });
});
