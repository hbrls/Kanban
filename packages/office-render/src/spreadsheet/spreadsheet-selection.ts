import {
  spreadsheetCellKey,
  spreadsheetColumnLeft,
  spreadsheetHitCellAtViewportPoint,
  spreadsheetRowTop,
  spreadsheetViewportRectSegments,
  type SpreadsheetLayout,
  type SpreadsheetViewportPoint,
  type SpreadsheetViewportRect,
  type SpreadsheetViewportScroll,
} from "./spreadsheet-layout";

export type SpreadsheetSelection = {
  columnIndex: number;
  rowIndex: number;
  rowOffset: number;
};

export type SpreadsheetSelectionDirection = "down" | "left" | "right" | "up";

export function spreadsheetSelectionFromViewportPoint(
  layout: SpreadsheetLayout,
  point: SpreadsheetViewportPoint,
  scroll: SpreadsheetViewportScroll,
): SpreadsheetSelection | null {
  const hit = spreadsheetHitCellAtViewportPoint(layout, point, scroll);
  if (!hit) return null;

  return spreadsheetNormalizeSelection(layout, hit);
}

export function spreadsheetNormalizeSelection(
  layout: SpreadsheetLayout,
  selection: SpreadsheetSelection,
): SpreadsheetSelection {
  const clamped = spreadsheetClampSelection(layout, selection);
  const mergeStart = spreadsheetMergeStartForCell(layout, clamped.rowIndex, clamped.columnIndex);
  return mergeStart ?? clamped;
}

export function spreadsheetMoveSelection(
  layout: SpreadsheetLayout,
  selection: SpreadsheetSelection | null,
  direction: SpreadsheetSelectionDirection,
): SpreadsheetSelection {
  const current = spreadsheetNormalizeSelection(layout, selection ?? { columnIndex: 0, rowIndex: 1, rowOffset: 0 });
  const key = spreadsheetCellKey(current.rowIndex, current.columnIndex);
  const merge = layout.mergeByStart.get(key);
  const columnSpan = merge?.columnSpan ?? 1;
  const rowSpan = merge?.rowSpan ?? 1;

  if (direction === "left") {
    return spreadsheetNormalizeSelection(layout, {
      columnIndex: current.columnIndex - 1,
      rowIndex: current.rowIndex,
      rowOffset: current.rowOffset,
    });
  }
  if (direction === "right") {
    return spreadsheetNormalizeSelection(layout, {
      columnIndex: current.columnIndex + columnSpan,
      rowIndex: current.rowIndex,
      rowOffset: current.rowOffset,
    });
  }
  if (direction === "up") {
    return spreadsheetNormalizeSelection(layout, {
      columnIndex: current.columnIndex,
      rowIndex: current.rowIndex - 1,
      rowOffset: current.rowOffset - 1,
    });
  }

  return spreadsheetNormalizeSelection(layout, {
    columnIndex: current.columnIndex,
    rowIndex: current.rowIndex + rowSpan,
    rowOffset: current.rowOffset + rowSpan,
  });
}

export function spreadsheetClampSelection(
  layout: SpreadsheetLayout,
  selection: SpreadsheetSelection,
): SpreadsheetSelection {
  const columnIndex = clampIndex(selection.columnIndex, Math.max(0, layout.columnCount - 1));
  const rowOffset = clampIndex(selection.rowOffset, Math.max(0, layout.rowCount - 1));
  const rowIndex = clampIndex(selection.rowIndex, layout.rowCount, 1);
  return {
    columnIndex,
    rowIndex,
    rowOffset,
  };
}

export function spreadsheetMergeStartForCell(
  layout: SpreadsheetLayout,
  rowIndex: number,
  columnIndex: number,
): SpreadsheetSelection | null {
  const ownKey = spreadsheetCellKey(rowIndex, columnIndex);
  if (layout.mergeByStart.has(ownKey)) {
    return {
      columnIndex,
      rowIndex,
      rowOffset: rowIndex - 1,
    };
  }

  if (!layout.coveredCells.has(ownKey)) return null;

  for (const merge of layout.mergeByStart.values()) {
    const rowEnd = merge.startRow + merge.rowSpan - 1;
    const columnEnd = merge.startColumn + merge.columnSpan - 1;
    if (
      rowIndex >= merge.startRow &&
      rowIndex <= rowEnd &&
      columnIndex >= merge.startColumn &&
      columnIndex <= columnEnd
    ) {
      return {
        columnIndex: merge.startColumn,
        rowIndex: merge.startRow,
        rowOffset: merge.startRow - 1,
      };
    }
  }

  return null;
}

export function spreadsheetSelectionWorldRect(
  layout: SpreadsheetLayout,
  selection: SpreadsheetSelection,
): SpreadsheetViewportRect {
  const key = spreadsheetCellKey(selection.rowIndex, selection.columnIndex);
  const merge = layout.mergeByStart.get(key);
  const left = spreadsheetColumnLeft(layout, selection.columnIndex);
  const top = spreadsheetRowTop(layout, selection.rowOffset);
  return {
    height: spreadsheetRowTop(layout, selection.rowOffset + (merge?.rowSpan ?? 1)) - top,
    left,
    top,
    width: spreadsheetColumnLeft(layout, selection.columnIndex + (merge?.columnSpan ?? 1)) - left,
  };
}

export function spreadsheetFrozenSelectionSegments(
  layout: SpreadsheetLayout,
  selection: SpreadsheetSelection,
  scroll: SpreadsheetViewportScroll,
): SpreadsheetViewportRect[] {
  return spreadsheetViewportRectSegments(layout, spreadsheetSelectionWorldRect(layout, selection), scroll);
}

function clampIndex(value: number, max: number, min = 0): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
