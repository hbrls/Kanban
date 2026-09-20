import {
  SPREADSHEET_COLUMN_HEADER_HEIGHT,
  SPREADSHEET_DEFAULT_COLUMN_WIDTH,
  SPREADSHEET_DEFAULT_ROW_HEIGHT,
  SPREADSHEET_ROW_HEADER_WIDTH,
  spreadsheetViewportPointToWorld,
  type SpreadsheetLayout,
  type SpreadsheetViewportPoint,
  type SpreadsheetViewportScroll,
} from "./spreadsheet-layout";

const RESIZE_HIT_SLOP_PX = 5;
const MIN_COLUMN_WIDTH_PX = 24;
const MAX_COLUMN_WIDTH_PX = 560;
const MIN_ROW_HEIGHT_PX = 12;
const MAX_ROW_HEIGHT_PX = 240;

export type SpreadsheetResizeAxis = "column" | "row";

export type SpreadsheetResizeHit = {
  axis: SpreadsheetResizeAxis;
  boundary: number;
  index: number;
  originalSize: number;
};

export type SpreadsheetResizeDrag = SpreadsheetResizeHit & {
  startWorldPosition: number;
};

export function spreadsheetResizeHitAtViewportPoint(
  layout: SpreadsheetLayout,
  point: SpreadsheetViewportPoint,
  scroll: SpreadsheetViewportScroll,
  slopPx = RESIZE_HIT_SLOP_PX,
): SpreadsheetResizeHit | null {
  const world = spreadsheetViewportPointToWorld(layout, point, scroll);
  if (point.y >= 0 && point.y <= SPREADSHEET_COLUMN_HEADER_HEIGHT && world.x >= SPREADSHEET_ROW_HEADER_WIDTH) {
    const boundaryIndex = nearestResizeBoundary(layout.columnOffsets, world.x, slopPx);
    if (boundaryIndex > 0 && boundaryIndex <= layout.columnCount) {
      const index = boundaryIndex - 1;
      return {
        axis: "column",
        boundary: layout.columnOffsets[boundaryIndex] ?? world.x,
        index,
        originalSize: layout.columnWidths[index] ?? SPREADSHEET_DEFAULT_COLUMN_WIDTH,
      };
    }
  }

  if (point.x >= 0 && point.x <= SPREADSHEET_ROW_HEADER_WIDTH && world.y >= SPREADSHEET_COLUMN_HEADER_HEIGHT) {
    const boundaryIndex = nearestResizeBoundary(layout.rowOffsets, world.y, slopPx);
    if (boundaryIndex > 0 && boundaryIndex <= layout.rowCount) {
      const index = boundaryIndex - 1;
      return {
        axis: "row",
        boundary: layout.rowOffsets[boundaryIndex] ?? world.y,
        index,
        originalSize: layout.rowHeights[index] ?? SPREADSHEET_DEFAULT_ROW_HEIGHT,
      };
    }
  }

  return null;
}

export function spreadsheetResizeDragFromHit(
  layout: SpreadsheetLayout,
  hit: SpreadsheetResizeHit,
  point: SpreadsheetViewportPoint,
  scroll: SpreadsheetViewportScroll,
): SpreadsheetResizeDrag {
  const world = spreadsheetViewportPointToWorld(layout, point, scroll);
  return {
    ...hit,
    startWorldPosition: hit.axis === "column" ? world.x : world.y,
  };
}

export function spreadsheetResizeSizeFromPoint(
  layout: SpreadsheetLayout,
  drag: SpreadsheetResizeDrag,
  point: SpreadsheetViewportPoint,
  scroll: SpreadsheetViewportScroll,
): number {
  const world = spreadsheetViewportPointToWorld(layout, point, scroll);
  const currentPosition = drag.axis === "column" ? world.x : world.y;
  return clampSpreadsheetResizeSize(drag.axis, drag.originalSize + currentPosition - drag.startWorldPosition);
}

export function clampSpreadsheetResizeSize(axis: SpreadsheetResizeAxis, size: number): number {
  if (!Number.isFinite(size)) return axis === "column" ? SPREADSHEET_DEFAULT_COLUMN_WIDTH : SPREADSHEET_DEFAULT_ROW_HEIGHT;
  if (axis === "column") return Math.max(MIN_COLUMN_WIDTH_PX, Math.min(MAX_COLUMN_WIDTH_PX, Math.round(size)));
  return Math.max(MIN_ROW_HEIGHT_PX, Math.min(MAX_ROW_HEIGHT_PX, Math.round(size)));
}

function nearestResizeBoundary(offsets: number[], worldPosition: number, slopPx: number): number {
  if (offsets.length <= 1) return -1;
  const insertion = lowerBound(offsets, worldPosition);
  const candidates = [insertion, insertion - 1, insertion + 1];
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const index of candidates) {
    if (index <= 0 || index >= offsets.length) continue;
    const distance = Math.abs((offsets[index] ?? worldPosition) - worldPosition);
    if (distance <= slopPx && distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function lowerBound(values: number[], value: number): number {
  let left = 0;
  let right = values.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if ((values[middle] ?? 0) < value) left = middle + 1;
    else right = middle;
  }
  return left;
}
