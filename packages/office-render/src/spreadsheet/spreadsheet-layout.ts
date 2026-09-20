import {
  asArray,
  asNumber,
  asRecord,
  asString,
  type CellMerge,
  columnIndexFromAddress,
  EXCEL_MAX_COLUMN_COUNT,
  EXCEL_MAX_ROW_COUNT,
  parseCellRange,
  type RecordValue,
} from "../shared/office-preview-utils";

export const SPREADSHEET_ROW_HEADER_WIDTH = 40;
export const SPREADSHEET_COLUMN_HEADER_HEIGHT = 20;
export const SPREADSHEET_DEFAULT_COLUMN_WIDTH = 88;
export const SPREADSHEET_DEFAULT_ROW_HEIGHT = 20;
export const SPREADSHEET_EMU_PER_PIXEL = 9525;
export const SPREADSHEET_FONT_FAMILY = "Aptos, Calibri, Arial, Helvetica, sans-serif";

const EXCEL_POINTS_TO_PX = 96 / 72;

export type SpreadsheetLayout = {
  columnCount: number;
  columnOffsets: number[];
  columnStyleIndexes: Array<number | null>;
  columnWidths: number[];
  coveredCells: Set<string>;
  freezePanes: SpreadsheetFreezePanes;
  gridHeight: number;
  gridWidth: number;
  maxColumn: number;
  mergeByStart: Map<string, CellMerge>;
  rowCount: number;
  rowHeights: number[];
  rowOffsets: number[];
  rowRecordsByIndex: Map<number, RecordValue>;
  rows: RecordValue[];
  rowsByIndex: Map<number, Map<number, RecordValue>>;
};

export type SpreadsheetLayoutOverrides = {
  columnWidths?: Record<number, number | undefined>;
  rowHeights?: Record<number, number | undefined>;
};

export type SpreadsheetFreezePanes = {
  columnCount: number;
  rowCount: number;
};

export type SpreadsheetViewportPoint = {
  x: number;
  y: number;
};

export type SpreadsheetViewportRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type SpreadsheetFloatingHitRegion = SpreadsheetViewportRect & {
  frozenColumns: boolean;
  frozenRows: boolean;
};

export type SpreadsheetViewportScroll = {
  left: number;
  top: number;
};

export type SpreadsheetViewportSize = {
  height: number;
  width: number;
};

export type SpreadsheetVisibleCellRange = {
  endColumnIndex: number;
  endRowOffset: number;
  startColumnIndex: number;
  startRowOffset: number;
};

export type SpreadsheetCellHit = {
  columnIndex: number;
  rowIndex: number;
  rowOffset: number;
};

export function buildSpreadsheetLayout(
  sheet: RecordValue | undefined,
  overrides: SpreadsheetLayoutOverrides = {},
): SpreadsheetLayout {
  const rows = asArray(sheet?.rows).map(asRecord).filter((row): row is RecordValue => row != null);
  let maxColumn = 0;
  let maxRow = 1;
  const rowRecordsByIndex = new Map<number, RecordValue>();
  const rowsByIndex = new Map<number, Map<number, RecordValue>>();

  for (const row of rows) {
    const rowIndex = asNumber(row.index, 1);
    maxRow = Math.max(maxRow, rowIndex);
    const cells = new Map<number, RecordValue>();
    rowRecordsByIndex.set(rowIndex, row);
    for (const cell of asArray(row.cells)) {
      const cellRecord = asRecord(cell);
      const address = asString(cellRecord?.address);
      const columnIndex = columnIndexFromAddress(address);
      maxColumn = Math.max(maxColumn, columnIndex);
      if (cellRecord) cells.set(columnIndex, cellRecord);
    }
    rowsByIndex.set(rowIndex, cells);
  }

  const columnWidthByIndex = new Map<number, number>();
  const columnStyleIndexByIndex = new Map<number, number | null>();
  const columns = asArray(sheet?.columns).map(asRecord).filter((column): column is RecordValue => column != null);
  for (const column of columns) {
    const min = Math.max(1, asNumber(column.min, asNumber(column.index, 1)));
    const max = Math.max(min, asNumber(column.max, min));
    const width = spreadsheetColumnHidden(column) ? 0 : excelColumnWidthPx(asNumber(column.width, asNumber(sheet?.defaultColWidth, 10)));
    const styleIndex = spreadsheetStyleIndex(column.styleIndex);
    for (let index = min - 1; index <= max - 1; index += 1) {
      columnWidthByIndex.set(index, width);
      columnStyleIndexByIndex.set(index, styleIndex);
      maxColumn = Math.max(maxColumn, index);
    }
  }

  for (const drawing of asArray(sheet?.drawings)) {
    const drawingRecord = asRecord(drawing);
    for (const anchor of [asRecord(drawingRecord?.fromAnchor), asRecord(drawingRecord?.toAnchor)]) {
      if (!anchor) continue;
      const columnIndex = protocolNumber(anchor.colId, -1);
      const rowIndex = protocolNumber(anchor.rowId, -1);
      if (columnIndex >= 0) maxColumn = Math.max(maxColumn, columnIndex);
      if (rowIndex >= 0) maxRow = Math.max(maxRow, rowIndex + 1);
    }
  }

  if (columns.length === 0) {
    for (const [index, width] of knownSpreadsheetColumnWidths(asString(sheet?.name))) {
      columnWidthByIndex.set(index, width);
      maxColumn = Math.max(maxColumn, index);
    }
  }

  const mergeByStart = new Map<string, CellMerge>();
  const coveredCells = new Set<string>();
  for (const mergeRecord of asArray(sheet?.mergedCells)) {
    const mergeValue = asRecord(mergeRecord);
    const reference = (
      asString(mergeValue?.reference) ||
      (asString(mergeValue?.startAddress) && asString(mergeValue?.endAddress)
        ? `${asString(mergeValue?.startAddress)}:${asString(mergeValue?.endAddress)}`
        : "") ||
      asString(mergeRecord)
    );
    const merge = parseCellRange(reference);
    if (!merge || (merge.columnSpan === 1 && merge.rowSpan === 1)) continue;
    mergeByStart.set(spreadsheetCellKey(merge.startRow, merge.startColumn), merge);
    maxColumn = Math.max(maxColumn, merge.startColumn + merge.columnSpan - 1);
    for (let row = merge.startRow; row < merge.startRow + merge.rowSpan; row += 1) {
      for (let column = merge.startColumn; column < merge.startColumn + merge.columnSpan; column += 1) {
        if (row === merge.startRow && column === merge.startColumn) continue;
        coveredCells.add(spreadsheetCellKey(row, column));
      }
    }
  }

  const rowCount = clampInteger(maxRow, 1, EXCEL_MAX_ROW_COUNT);
  const columnCount = clampInteger(Math.max(maxColumn + 1, 6), 1, EXCEL_MAX_COLUMN_COUNT);
  const columnWidths = Array.from(
    { length: columnCount },
    (_, index) => columnWidthByIndex.get(index) ?? SPREADSHEET_DEFAULT_COLUMN_WIDTH,
  );
  const columnStyleIndexes = Array.from(
    { length: columnCount },
    (_, index) => columnStyleIndexByIndex.get(index) ?? null,
  );
  const rowHeights = Array.from({ length: rowCount }, (_, index) => {
    const row = rowRecordsByIndex.get(index + 1);
    return spreadsheetRowHidden(row) ? 0 : excelRowHeightPx(asNumber(row?.height));
  });
  applySpreadsheetSizeOverrides(columnWidths, overrides.columnWidths);
  applySpreadsheetSizeOverrides(rowHeights, overrides.rowHeights);
  const columnOffsets = prefixSums(SPREADSHEET_ROW_HEADER_WIDTH, columnWidths);
  const rowOffsets = prefixSums(SPREADSHEET_COLUMN_HEADER_HEIGHT, rowHeights);
  const freezePanes = clampSpreadsheetFreezePanes(readSpreadsheetFreezePanes(sheet), columnCount, rowCount);

  return {
    columnCount,
    columnOffsets,
    columnStyleIndexes,
    columnWidths,
    coveredCells,
    freezePanes,
    gridHeight: rowOffsets[rowOffsets.length - 1] ?? SPREADSHEET_COLUMN_HEADER_HEIGHT,
    gridWidth: columnOffsets[columnOffsets.length - 1] ?? SPREADSHEET_ROW_HEADER_WIDTH,
    maxColumn,
    mergeByStart,
    rowCount,
    rowHeights,
    rowOffsets,
    rowRecordsByIndex,
    rows,
    rowsByIndex,
  };
}

function applySpreadsheetSizeOverrides(sizes: number[], overrides: Record<number, number | undefined> | undefined) {
  if (!overrides) return;
  for (const [rawIndex, rawSize] of Object.entries(overrides)) {
    const index = Number(rawIndex);
    const size = typeof rawSize === "number" ? rawSize : Number.NaN;
    if (!Number.isInteger(index) || index < 0 || index >= sizes.length || !Number.isFinite(size)) continue;
    sizes[index] = Math.max(0, size);
  }
}

export function spreadsheetCellKey(rowIndex: number, columnIndex: number): string {
  return `${rowIndex}:${columnIndex}`;
}

export function spreadsheetColumnLeft(layout: SpreadsheetLayout, columnIndex: number): number {
  return layout.columnOffsets[columnIndex] ?? layout.gridWidth;
}

export function spreadsheetRowTop(layout: SpreadsheetLayout, zeroBasedRowIndex: number): number {
  return layout.rowOffsets[zeroBasedRowIndex] ?? layout.gridHeight;
}

export function spreadsheetFrozenBodyWidth(layout: SpreadsheetLayout): number {
  return layout.columnOffsets[layout.freezePanes.columnCount] != null
    ? (layout.columnOffsets[layout.freezePanes.columnCount] ?? SPREADSHEET_ROW_HEADER_WIDTH) - SPREADSHEET_ROW_HEADER_WIDTH
    : 0;
}

export function spreadsheetFrozenBodyHeight(layout: SpreadsheetLayout): number {
  return layout.rowOffsets[layout.freezePanes.rowCount] != null
    ? (layout.rowOffsets[layout.freezePanes.rowCount] ?? SPREADSHEET_COLUMN_HEADER_HEIGHT) - SPREADSHEET_COLUMN_HEADER_HEIGHT
    : 0;
}

export function spreadsheetViewportPointToWorld(
  layout: SpreadsheetLayout,
  point: SpreadsheetViewportPoint,
  scroll: SpreadsheetViewportScroll,
): SpreadsheetViewportPoint {
  const frozenRight = SPREADSHEET_ROW_HEADER_WIDTH + spreadsheetFrozenBodyWidth(layout);
  const frozenBottom = SPREADSHEET_COLUMN_HEADER_HEIGHT + spreadsheetFrozenBodyHeight(layout);
  return {
    x: point.x < frozenRight ? point.x : point.x + scroll.left,
    y: point.y < frozenBottom ? point.y : point.y + scroll.top,
  };
}

export function spreadsheetHitCellAtViewportPoint(
  layout: SpreadsheetLayout,
  point: SpreadsheetViewportPoint,
  scroll: SpreadsheetViewportScroll,
): SpreadsheetCellHit | null {
  const world = spreadsheetViewportPointToWorld(layout, point, scroll);
  if (world.x < SPREADSHEET_ROW_HEADER_WIDTH || world.y < SPREADSHEET_COLUMN_HEADER_HEIGHT) {
    return null;
  }

  const columnIndex = offsetIndexAt(layout.columnOffsets, world.x);
  const rowOffset = offsetIndexAt(layout.rowOffsets, world.y);
  if (columnIndex < 0 || rowOffset < 0 || columnIndex >= layout.columnCount || rowOffset >= layout.rowCount) {
    return null;
  }

  return {
    columnIndex,
    rowIndex: rowOffset + 1,
    rowOffset,
  };
}

export function spreadsheetVisibleCellRange(
  layout: SpreadsheetLayout,
  viewport: SpreadsheetViewportSize,
  scroll: SpreadsheetViewportScroll,
  overscan = 2,
): SpreadsheetVisibleCellRange {
  if (layout.columnCount <= 0 || layout.rowCount <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    const padding = Math.max(0, Math.trunc(overscan));
    return {
      endColumnIndex: Math.min(Math.max(0, layout.columnCount - 1), 20 + padding),
      endRowOffset: Math.min(Math.max(0, layout.rowCount - 1), 50 + padding),
      startColumnIndex: 0,
      startRowOffset: 0,
    };
  }

  const startX = Math.max(SPREADSHEET_ROW_HEADER_WIDTH, scroll.left);
  const endX = Math.min(layout.gridWidth - 0.001, Math.max(startX, scroll.left + viewport.width));
  const startY = Math.max(SPREADSHEET_COLUMN_HEADER_HEIGHT, scroll.top);
  const endY = Math.min(layout.gridHeight - 0.001, Math.max(startY, scroll.top + viewport.height));
  const startColumnIndex = offsetIndexAt(layout.columnOffsets, startX);
  const endColumnIndex = offsetIndexAt(layout.columnOffsets, endX);
  const startRowOffset = offsetIndexAt(layout.rowOffsets, startY);
  const endRowOffset = offsetIndexAt(layout.rowOffsets, endY);
  const padding = Math.max(0, Math.trunc(overscan));

  return {
    endColumnIndex: clampInteger(
      (endColumnIndex < 0 ? layout.columnCount - 1 : endColumnIndex) + padding,
      0,
      layout.columnCount - 1,
    ),
    endRowOffset: clampInteger(
      (endRowOffset < 0 ? layout.rowCount - 1 : endRowOffset) + padding,
      0,
      layout.rowCount - 1,
    ),
    startColumnIndex: clampInteger(
      (startColumnIndex < 0 ? 0 : startColumnIndex) - padding,
      0,
      layout.columnCount - 1,
    ),
    startRowOffset: clampInteger(
      (startRowOffset < 0 ? 0 : startRowOffset) - padding,
      0,
      layout.rowCount - 1,
    ),
  };
}

export function spreadsheetViewportIntersectsRect(
  rect: SpreadsheetViewportRect,
  viewport: SpreadsheetViewportSize,
  scroll: SpreadsheetViewportScroll,
  overscanPx = 240,
): boolean {
  if (viewport.width <= 0 || viewport.height <= 0) return true;

  const overscan = Math.max(0, overscanPx);
  const viewportLeft = scroll.left - overscan;
  const viewportTop = scroll.top - overscan;
  const viewportRight = scroll.left + viewport.width + overscan;
  const viewportBottom = scroll.top + viewport.height + overscan;
  const rectRight = rect.left + rect.width;
  const rectBottom = rect.top + rect.height;

  return rectRight >= viewportLeft &&
    rect.left <= viewportRight &&
    rectBottom >= viewportTop &&
    rect.top <= viewportBottom;
}

export function spreadsheetDrawingBounds(layout: SpreadsheetLayout, drawing: RecordValue): SpreadsheetViewportRect {
  const fromAnchor = asRecord(drawing.fromAnchor);
  const toAnchor = asRecord(drawing.toAnchor);
  const fromCol = protocolNumber(fromAnchor?.colId, 0);
  const fromRow = protocolNumber(fromAnchor?.rowId, 0);
  const left = spreadsheetColumnLeft(layout, fromCol) + spreadsheetEmuToPx(fromAnchor?.colOffset);
  const top = spreadsheetRowTop(layout, fromRow) + spreadsheetEmuToPx(fromAnchor?.rowOffset);
  const bbox = asRecord(asRecord(drawing.shape)?.bbox);
  const width = firstPositiveDimension(
    spreadsheetEmuToPx(drawing.extentCx),
    spreadsheetAnchorEdgePx(toAnchor, "column", layout) - left,
    spreadsheetEmuToPx(bbox?.widthEmu),
  );
  const height = firstPositiveDimension(
    spreadsheetEmuToPx(drawing.extentCy),
    spreadsheetAnchorEdgePx(toAnchor, "row", layout) - top,
    spreadsheetEmuToPx(bbox?.heightEmu),
  );

  return {
    height: Math.max(24, height),
    left,
    top,
    width: Math.max(24, width),
  };
}

export function spreadsheetFloatingHitRegions(
  layout: SpreadsheetLayout,
  rect: SpreadsheetViewportRect,
  scroll: SpreadsheetViewportScroll,
): SpreadsheetFloatingHitRegion[] {
  const xSegments = spreadsheetAxisViewportSegments(
    rect.left,
    rect.width,
    SPREADSHEET_ROW_HEADER_WIDTH,
    spreadsheetFrozenBodyWidth(layout),
    scroll.left,
  );
  const ySegments = spreadsheetAxisViewportSegments(
    rect.top,
    rect.height,
    SPREADSHEET_COLUMN_HEADER_HEIGHT,
    spreadsheetFrozenBodyHeight(layout),
    scroll.top,
  );

  const regions: SpreadsheetFloatingHitRegion[] = [];
  for (const xSegment of xSegments) {
    for (const ySegment of ySegments) {
      regions.push({
        frozenColumns: xSegment.frozen,
        frozenRows: ySegment.frozen,
        height: ySegment.size,
        left: xSegment.start,
        top: ySegment.start,
        width: xSegment.size,
      });
    }
  }

  return regions;
}

export function spreadsheetViewportRectSegments(
  layout: SpreadsheetLayout,
  rect: SpreadsheetViewportRect,
  scroll: SpreadsheetViewportScroll,
): SpreadsheetViewportRect[] {
  const xSegments = spreadsheetAxisViewportSegments(
    rect.left,
    rect.width,
    SPREADSHEET_ROW_HEADER_WIDTH,
    spreadsheetFrozenBodyWidth(layout),
    scroll.left,
  );
  const ySegments = spreadsheetAxisViewportSegments(
    rect.top,
    rect.height,
    SPREADSHEET_COLUMN_HEADER_HEIGHT,
    spreadsheetFrozenBodyHeight(layout),
    scroll.top,
  );

  const segments: SpreadsheetViewportRect[] = [];
  for (const xSegment of xSegments) {
    for (const ySegment of ySegments) {
      if (!xSegment.frozen && !ySegment.frozen) continue;
      segments.push({
        height: ySegment.size,
        left: xSegment.start,
        top: ySegment.start,
        width: xSegment.size,
      });
    }
  }

  return segments;
}

export function spreadsheetEmuToPx(value: unknown): number {
  const numericValue = typeof value === "string" ? Number(value) : asNumber(value, 0);
  return Number.isFinite(numericValue) ? numericValue / SPREADSHEET_EMU_PER_PIXEL : 0;
}

function spreadsheetAnchorEdgePx(
  anchor: RecordValue | null,
  axis: "column" | "row",
  layout: SpreadsheetLayout,
): number {
  if (!anchor) return 0;

  if (axis === "column") {
    return spreadsheetColumnLeft(layout, protocolNumber(anchor.colId, layout.columnCount)) +
      spreadsheetEmuToPx(anchor.colOffset);
  }

  return spreadsheetRowTop(layout, protocolNumber(anchor.rowId, layout.rowCount)) +
    spreadsheetEmuToPx(anchor.rowOffset);
}

function firstPositiveDimension(...values: number[]): number {
  return values.find((value) => Number.isFinite(value) && value > 0) ?? 0;
}

function prefixSums(initial: number, sizes: number[]): number[] {
  const offsets = [initial];
  for (const size of sizes) {
    offsets.push((offsets[offsets.length - 1] ?? initial) + size);
  }
  return offsets;
}

function excelColumnWidthPx(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return SPREADSHEET_DEFAULT_COLUMN_WIDTH;
  return Math.max(32, Math.min(560, Math.floor(width * 7 + 5)));
}

function excelRowHeightPx(heightPoints: number): number {
  return heightPoints && heightPoints > 0
    ? Math.max(18, Math.round(heightPoints * EXCEL_POINTS_TO_PX))
    : SPREADSHEET_DEFAULT_ROW_HEIGHT;
}

function spreadsheetColumnHidden(column: RecordValue): boolean {
  return column.hidden === true || asString(column.hidden).toLowerCase() === "true" || asNumber(column.hidden) === 1;
}

function spreadsheetRowHidden(row: RecordValue | undefined): boolean {
  return row?.hidden === true || asString(row?.hidden).toLowerCase() === "true" || asNumber(row?.hidden) === 1;
}

function spreadsheetStyleIndex(value: unknown): number | null {
  if (value == null) return null;
  const index = asNumber(value, -1);
  return index >= 0 ? index : null;
}

function protocolNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function readSpreadsheetFreezePanes(sheet: RecordValue | undefined): SpreadsheetFreezePanes {
  const freeze = asRecord(sheet?.freezePanes) ??
    asRecord(sheet?.freezePane) ??
    asRecord(asRecord(sheet?.viewport)?.freezePanes);
  return {
    columnCount: Math.trunc(protocolNumber(
      freeze?.columnCount ?? freeze?.columns ?? freeze?.colCount ?? freeze?.xSplit,
      0,
    )),
    rowCount: Math.trunc(protocolNumber(
      freeze?.rowCount ?? freeze?.rows ?? freeze?.ySplit,
      0,
    )),
  };
}

function clampSpreadsheetFreezePanes(
  freezePanes: SpreadsheetFreezePanes,
  columnCount: number,
  rowCount: number,
): SpreadsheetFreezePanes {
  return {
    columnCount: clampInteger(freezePanes.columnCount, 0, Math.max(0, columnCount - 1)),
    rowCount: clampInteger(freezePanes.rowCount, 0, Math.max(0, rowCount - 1)),
  };
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

type SpreadsheetAxisViewportSegment = {
  frozen: boolean;
  size: number;
  start: number;
};

function spreadsheetAxisViewportSegments(
  start: number,
  size: number,
  headerSize: number,
  frozenBodySize: number,
  scroll: number,
): SpreadsheetAxisViewportSegment[] {
  if (size <= 0) return [];

  const end = start + size;
  const frozenEnd = headerSize + Math.max(0, frozenBodySize);
  const segments: SpreadsheetAxisViewportSegment[] = [];
  const frozenSegmentEnd = Math.min(end, frozenEnd);
  if (frozenSegmentEnd > start) {
    segments.push({
      frozen: true,
      size: frozenSegmentEnd - start,
      start,
    });
  }

  const scrollStart = Math.max(start, frozenEnd);
  if (end > scrollStart) {
    const projectedStart = scrollStart - scroll;
    const projectedEnd = end - scroll;
    const clippedStart = Math.max(projectedStart, frozenEnd);
    if (projectedEnd > clippedStart) {
      segments.push({
        frozen: false,
        size: projectedEnd - clippedStart,
        start: clippedStart,
      });
    }
  }

  return segments;
}

function offsetIndexAt(offsets: number[], value: number): number {
  if (offsets.length < 2 || value < (offsets[0] ?? 0) || value >= (offsets[offsets.length - 1] ?? 0)) {
    return -1;
  }

  let low = 0;
  let high = offsets.length - 2;
  while (low <= high) {
    const index = Math.floor((low + high) / 2);
    const start = offsets[index] ?? 0;
    const end = offsets[index + 1] ?? start;
    if (value < start) {
      high = index - 1;
    } else if (value >= end) {
      low = index + 1;
    } else {
      return index;
    }
  }

  return -1;
}

function knownSpreadsheetColumnWidths(sheetName: string): Map<number, number> {
  const widths = new Map<number, number>();
  if (sheetName === "03_TimeSeries") {
    [108, 100, 116, 108, 108, 118, 118, 118, 118, 118, 126, 460].forEach((width, index) => {
      widths.set(index, width);
    });
  }

  if (sheetName === "04_Heatmap") {
    [190, 118, 118, 118, 118, 118, 118, 118, 118, 120, 108, 108, 132, 320].forEach((width, index) => {
      widths.set(index, width);
    });
  }

  return widths;
}
