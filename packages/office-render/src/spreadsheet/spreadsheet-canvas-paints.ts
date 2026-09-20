import {
  asArray,
  asNumber,
  asRecord,
  asString,
  columnIndexFromAddress,
  type RecordValue,
} from "../shared/office-preview-utils";
import type { SpreadsheetCanvasCellPaint } from "./spreadsheet-canvas-commands";
import {
  spreadsheetCellKey,
  type SpreadsheetLayout,
  type SpreadsheetVisibleCellRange,
} from "./spreadsheet-layout";
import { visibleCellIntersectsRange } from "./spreadsheet-render-snapshot";

type SpreadsheetCellEdits = Record<string, string | undefined>;

type SpreadsheetCanvasProjectedStyle = {
  background?: unknown;
  borderBottomColor?: unknown;
  borderBottomWidth?: unknown;
  borderRightColor?: unknown;
  borderRightWidth?: unknown;
  color?: unknown;
  fontFamily?: unknown;
  fontSize?: unknown;
  fontStyle?: unknown;
  fontWeight?: unknown;
  paddingLeft?: unknown;
  textAlign?: unknown;
  verticalAlign?: unknown;
};

type SpreadsheetCanvasPaintProjector = {
  cellStyle: (
    cell: RecordValue,
    row: RecordValue | undefined,
    columnIndex: number,
    key: string,
  ) => SpreadsheetCanvasProjectedStyle;
  cellText: (
    cell: RecordValue,
    row: RecordValue | undefined,
    columnIndex: number,
    key: string,
  ) => string;
};

export function buildSpreadsheetCanvasCellPaints({
  cellEdits,
  layout,
  project,
  visibleRange,
}: {
  cellEdits: SpreadsheetCellEdits;
  layout: SpreadsheetLayout;
  project: SpreadsheetCanvasPaintProjector;
  visibleRange: SpreadsheetVisibleCellRange;
}): Map<string, SpreadsheetCanvasCellPaint> {
  const paints = new Map<string, SpreadsheetCanvasCellPaint>();

  for (const row of layout.rows) {
    const rowIndex = asNumber(row.index, 1);
    const rowOffset = rowIndex - 1;
    if (rowOffset < visibleRange.startRowOffset || rowOffset > visibleRange.endRowOffset) continue;
    const rowRecord = layout.rowRecordsByIndex.get(rowIndex);
    for (const cellRecord of asArray(row.cells)) {
      const cell = asRecord(cellRecord);
      const address = asString(cell?.address);
      const columnIndex = columnIndexFromAddress(address);
      if (!cell || columnIndex < 0) continue;
      if (!visibleCellIntersectsRange(layout, rowOffset, columnIndex, visibleRange)) continue;
      const key = spreadsheetCellKey(rowIndex, columnIndex);
      const cellStyle = project.cellStyle(cell, rowRecord, columnIndex, key);
      paints.set(key, spreadsheetCanvasPaintFromStyle(
        cellStyle,
        cellEdits[key] ?? project.cellText(cell, rowRecord, columnIndex, key),
      ));
    }
  }

  for (const [key, text] of Object.entries(cellEdits)) {
    if (text == null || paints.has(key)) continue;
    const [rowIndex, columnIndex] = key.split(":").map(Number);
    if (!Number.isFinite(rowIndex) || !Number.isFinite(columnIndex)) continue;
    const rowOffset = rowIndex - 1;
    if (!visibleCellIntersectsRange(layout, rowOffset, columnIndex, visibleRange)) continue;
    paints.set(key, { text });
  }

  return paints;
}

function spreadsheetCanvasPaintFromStyle(
  style: SpreadsheetCanvasProjectedStyle,
  text: string,
): SpreadsheetCanvasCellPaint {
  return {
    borderBottom: spreadsheetCanvasBorder(style.borderBottomColor, style.borderBottomWidth),
    borderRight: spreadsheetCanvasBorder(style.borderRightColor, style.borderRightWidth),
    color: spreadsheetCanvasString(style.color),
    fill: spreadsheetCanvasString(style.background),
    fontFamily: spreadsheetCanvasString(style.fontFamily),
    fontSize: spreadsheetCanvasNumber(style.fontSize),
    fontStyle: spreadsheetCanvasFontStyle(style.fontStyle),
    fontWeight: spreadsheetCanvasFontWeight(style.fontWeight),
    paddingLeft: spreadsheetCanvasNumber(style.paddingLeft),
    text,
    textAlign: spreadsheetCanvasTextAlign(style.textAlign),
    verticalAlign: spreadsheetCanvasVerticalAlign(style.verticalAlign),
  };
}

function spreadsheetCanvasString(value: unknown): string | undefined {
  const text = asString(value);
  return text ? text : undefined;
}

function spreadsheetCanvasNumber(value: unknown): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(asString(value));
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function spreadsheetCanvasBorder(
  color: unknown,
  width: unknown,
): SpreadsheetCanvasCellPaint["borderBottom"] {
  const borderColor = spreadsheetCanvasString(color);
  const borderWidth = spreadsheetCanvasCssNumber(width);
  if (!borderColor && borderWidth == null) return undefined;
  return { color: borderColor, width: borderWidth };
}

function spreadsheetCanvasCssNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = asString(value).match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const numberValue = Number(match[0]);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function spreadsheetCanvasFontStyle(value: unknown): string | undefined {
  const normalized = asString(value).toLowerCase();
  return normalized === "italic" ? "italic" : undefined;
}

function spreadsheetCanvasFontWeight(value: unknown): number | string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = asString(value);
  return text ? text : undefined;
}

function spreadsheetCanvasTextAlign(value: unknown): SpreadsheetCanvasCellPaint["textAlign"] {
  const normalized = asString(value).toLowerCase();
  if (normalized === "center" || normalized === "right") return normalized;
  return normalized === "left" ? "left" : undefined;
}

function spreadsheetCanvasVerticalAlign(value: unknown): SpreadsheetCanvasCellPaint["verticalAlign"] {
  const normalized = asString(value).toLowerCase();
  if (normalized === "bottom") return "bottom";
  if (normalized === "middle") return "middle";
  return normalized === "top" ? "top" : undefined;
}
