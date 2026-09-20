import {
  spreadsheetCellKey,
  spreadsheetVisibleCellRange,
  type SpreadsheetLayout,
  type SpreadsheetViewportScroll,
  type SpreadsheetViewportSize,
  type SpreadsheetVisibleCellRange,
} from "./spreadsheet-layout";

export type SpreadsheetRenderSnapshot = {
  visibleColumnIndexes: number[];
  visibleMergeStarts: Set<string>;
  visibleRange: SpreadsheetVisibleCellRange;
  visibleRowOffsets: number[];
};

export function buildSpreadsheetRenderSnapshot({
  layout,
  scroll,
  viewportSize,
}: {
  layout: SpreadsheetLayout;
  scroll: SpreadsheetViewportScroll;
  viewportSize: SpreadsheetViewportSize;
}): SpreadsheetRenderSnapshot {
  const visibleRange = spreadsheetVisibleCellRange(layout, viewportSize, scroll);
  const visibleMergeStarts = visibleMergedCellStarts(layout, visibleRange);
  return {
    visibleColumnIndexes: sortedVisibleIndexes(
      visibleRange.startColumnIndex,
      visibleRange.endColumnIndex,
      visibleMergeStarts,
      "column",
    ),
    visibleMergeStarts,
    visibleRange,
    visibleRowOffsets: sortedVisibleIndexes(
      visibleRange.startRowOffset,
      visibleRange.endRowOffset,
      visibleMergeStarts,
      "row",
    ),
  };
}

export function visibleMergedCellStarts(
  layout: SpreadsheetLayout,
  visibleRange: SpreadsheetVisibleCellRange,
): Set<string> {
  const keys = new Set<string>();
  for (const [key, merge] of layout.mergeByStart) {
    const rowStart = merge.startRow - 1;
    const rowEnd = rowStart + merge.rowSpan - 1;
    const columnStart = merge.startColumn;
    const columnEnd = columnStart + merge.columnSpan - 1;
    if (
      rowStart <= visibleRange.endRowOffset &&
      rowEnd >= visibleRange.startRowOffset &&
      columnStart <= visibleRange.endColumnIndex &&
      columnEnd >= visibleRange.startColumnIndex
    ) {
      keys.add(key);
    }
  }

  return keys;
}

export function sortedVisibleIndexes(
  start: number,
  end: number,
  visibleMergeStarts: Set<string>,
  axis: "column" | "row",
): number[] {
  const indexes = rangeIndexes(start, end);
  for (const key of visibleMergeStarts) {
    const [rowIndex, columnIndex] = key.split(":").map(Number);
    if (!Number.isFinite(rowIndex) || !Number.isFinite(columnIndex)) continue;
    indexes.add(axis === "row" ? rowIndex - 1 : columnIndex);
  }

  return [...indexes].sort((left, right) => left - right);
}

export function visibleCellIntersectsRange(
  layout: SpreadsheetLayout,
  rowOffset: number,
  columnIndex: number,
  visibleRange: SpreadsheetVisibleCellRange,
): boolean {
  const merge = layout.mergeByStart.get(spreadsheetCellKey(rowOffset + 1, columnIndex));
  const rowStart = rowOffset;
  const rowEnd = rowOffset + (merge?.rowSpan ?? 1) - 1;
  const columnStart = columnIndex;
  const columnEnd = columnIndex + (merge?.columnSpan ?? 1) - 1;
  return rowStart <= visibleRange.endRowOffset &&
    rowEnd >= visibleRange.startRowOffset &&
    columnStart <= visibleRange.endColumnIndex &&
    columnEnd >= visibleRange.startColumnIndex;
}

function rangeIndexes(start: number, end: number): Set<number> {
  const indexes = new Set<number>();
  for (let index = Math.max(0, start); index <= end; index += 1) {
    indexes.add(index);
  }
  return indexes;
}
