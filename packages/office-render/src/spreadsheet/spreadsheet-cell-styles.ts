import type { CSSProperties } from "react";

import {
  asNumber,
  asRecord,
  asString,
  cellText,
  colorToCss,
  columnIndexFromAddress,
  cssFontSize,
  resolveStyleRecord,
  rowIndexFromAddress,
  spreadsheetFillToCss,
  styleAt,
  type RecordValue,
} from "../shared/office-preview-utils";
import { spreadsheetFontFamily } from "./spreadsheet-data-access";

type SpreadsheetLayoutStyleLookup = {
  columnStyleIndexes: Array<number | null>;
};

type SpreadsheetCellVisualLike = {
  background?: string;
  backgroundSource?: string;
  borderColor?: string;
  color?: string;
  fontWeight?: CSSProperties["fontWeight"];
  iconSet?: ({
    showValue?: boolean;
  } & Record<string, unknown>) | null;
};

const sheetCellStyle: CSSProperties = {
  borderBottomColor: "#e2e8f0",
  borderBottomStyle: "solid",
  borderBottomWidth: 1,
  borderRightColor: "#e2e8f0",
  borderRightStyle: "solid",
  borderRightWidth: 1,
  boxSizing: "border-box",
  color: "#0f172a",
  fontFamily: spreadsheetFontFamily(""),
  lineHeight: 1.35,
  overflow: "hidden",
  overflowWrap: "break-word",
  padding: "7px 9px",
  verticalAlign: "top",
  whiteSpace: "pre-wrap",
};

export function spreadsheetCellStyle(
  cell: RecordValue | null,
  styles: RecordValue | null,
  visual?: SpreadsheetCellVisualLike,
  sheetName?: string,
  styleIndex?: number | null,
  showGridLines = true,
): CSSProperties {
  const cellFormat = styleAt(styles?.cellXfs, styleIndex ?? cell?.styleIndex);
  const font = styleAt(styles?.fonts, cellFormat?.fontId);
  const fill = styleAt(styles?.fills, cellFormat?.fillId);
  const border = styleAt(styles?.borders, cellFormat?.borderId);
  const alignment = asRecord(cellFormat?.alignment);
  const fontFill = resolveStyleRecord(font, ["fill", "color"]);
  const fillColor = spreadsheetFillToCss(fill);
  const fontColor = colorToCss(fontFill?.color ?? fontFill);
  const hyperlinkFormula = /^=?\s*HYPERLINK\s*\(/i.test(asString(cell?.formula));
  const gridLineColor = showGridLines ? "#e2e8f0" : "transparent";
  const bottomBorder = spreadsheetBorderCss(border, "bottom", gridLineColor);
  const rightBorder = spreadsheetBorderCss(border, "right", gridLineColor);
  const fallbackStyle = knownSpreadsheetCellStyle(cell, sheetName);
  const horizontalAlignment = asString(alignment?.horizontal) || asString(cellFormat?.horizontalAlignment);
  const verticalAlignment = asString(alignment?.vertical) || asString(cellFormat?.verticalAlignment);
  const wrapText = spreadsheetBool(alignment?.wrapText ?? cellFormat?.wrapText, true);
  const shrinkToFit = spreadsheetBool(alignment?.shrinkToFit ?? cellFormat?.shrinkToFit, false);
  const indent = Math.max(0, asNumber(alignment?.indent ?? cellFormat?.indent, 0));
  const fontSize = font != null ? cssFontSize(font.fontSize, 13) : fallbackStyle.fontSize;
  const textDirection = !horizontalAlignment && /[\u0590-\u08ff]/u.test(cellText(cell)) ? "rtl" : undefined;
  const fallbackTextAlign = visual?.iconSet?.showValue === false
    ? "left"
    : (fallbackStyle.textAlign ?? (textDirection === "rtl" ? "right" : spreadsheetDefaultTextAlign(cell)));
  const justifyContent = horizontalAlignment
    ? spreadsheetHorizontalJustifyContent(horizontalAlignment)
    : spreadsheetJustifyContentForTextAlign(fallbackTextAlign);
  const visualBackground = visual?.background;
  const background = visual?.backgroundSource === "table"
    ? fillColor ?? visualBackground ?? fallbackStyle.background
    : visualBackground ?? fillColor ?? fallbackStyle.background;

  return {
    ...sheetCellStyle,
    ...fallbackStyle,
    alignItems: spreadsheetVerticalAlignItems(verticalAlignment),
    background,
    borderBottomColor: visual?.borderColor ?? bottomBorder.color,
    borderBottomStyle: bottomBorder.style,
    borderBottomWidth: bottomBorder.width,
    borderRightColor: visual?.borderColor ?? rightBorder.color,
    borderRightStyle: rightBorder.style,
    borderRightWidth: rightBorder.width,
    color: visual?.color ?? fontColor ?? (hyperlinkFormula ? "#0563c1" : fallbackStyle.color) ?? sheetCellStyle.color,
    cursor: hyperlinkFormula ? "pointer" : undefined,
    direction: textDirection,
    display: "flex",
    fontFamily: spreadsheetFontFamily(asString(font?.typeface)),
    fontSize: shrinkToFit && typeof fontSize === "number" ? Math.max(8, fontSize * 0.88) : fontSize,
    fontStyle: font?.italic === true ? "italic" : fallbackStyle.fontStyle,
    fontWeight: visual?.fontWeight ?? (font?.bold === true ? 700 : fallbackStyle.fontWeight),
    justifyContent,
    paddingLeft: indent > 0 ? 9 + indent * 12 : sheetCellStyle.paddingLeft,
    textAlign: horizontalAlignment ? spreadsheetHorizontalTextAlign(horizontalAlignment, fallbackTextAlign) : fallbackTextAlign,
    textDecorationLine: hyperlinkFormula ? "underline" : undefined,
    textOverflow: wrapText ? undefined : "ellipsis",
    verticalAlign: spreadsheetVerticalAlign(verticalAlignment) ?? fallbackStyle.verticalAlign ?? sheetCellStyle.verticalAlign,
    whiteSpace: wrapText ? sheetCellStyle.whiteSpace : "nowrap",
  };
}

export function spreadsheetBorderCss(
  border: RecordValue | null,
  side: "bottom" | "right",
  gridLineColor: string,
): {
  color: CSSProperties["borderBottomColor"];
  style: CSSProperties["borderBottomStyle"];
  width: CSSProperties["borderBottomWidth"];
} {
  const line = spreadsheetBorderLine(border, side);
  const rawStyle = asString(line?.style ?? border?.[`${side}Style`] ?? border?.[`${side}_style`]).toLowerCase();
  if (rawStyle === "none") return { color: "transparent", style: "solid", width: 1 };

  const explicitColor =
    spreadsheetBorderColor(line?.color) ??
    spreadsheetBorderColor(border?.[`${side}Color`]) ??
    spreadsheetBorderColor(border?.[`${side}_color`]) ??
    spreadsheetBorderColor(border?.[`${side}BorderColor`]) ??
    spreadsheetBorderColor(border?.[`${side}_border_color`]);

  return {
    color: explicitColor ?? gridLineColor,
    style: spreadsheetBorderStyle(rawStyle),
    width: spreadsheetBorderWidth(rawStyle),
  };
}

export function spreadsheetBorderColor(value: unknown): string | null {
  const structured = colorToCss(asRecord(value));
  if (structured) return structured;
  const text = asString(value);
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`;
  if (/^[0-9a-f]{8}$/i.test(text)) return `#${text.slice(2)}`;
  return null;
}

export function spreadsheetBorderLine(border: RecordValue | null, side: "bottom" | "right"): RecordValue | null {
  return asRecord(border?.[side]) ?? asRecord(border?.[`${side}Border`]) ?? asRecord(border?.[`${side}_border`]);
}

export function spreadsheetBorderStyle(value: string): CSSProperties["borderBottomStyle"] {
  if (value.includes("dash")) return "dashed";
  if (value.includes("dot")) return "dotted";
  if (value === "double") return "double";
  return "solid";
}

export function spreadsheetBorderWidth(value: string): number {
  if (value.includes("thick")) return 3;
  if (value.includes("medium") || value === "double") return 2;
  return 1;
}

export function spreadsheetShowGridLines(sheet: RecordValue | undefined): boolean {
  if (sheet?.showGridLines === false) return false;
  const value = asString(sheet?.showGridLines).toLowerCase();
  return value !== "false" && value !== "0";
}

export function spreadsheetBool(value: unknown, fallback: boolean): boolean {
  if (value === true || value === false) return value;
  const normalized = asString(value).toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return fallback;
}

export function spreadsheetHorizontalTextAlign(
  value: string,
  fallback: CSSProperties["textAlign"],
): CSSProperties["textAlign"] {
  const normalized = value.toLowerCase();
  if (normalized === "center" || normalized === "centercontinuous" || normalized === "distributed") return "center";
  if (normalized === "right") return "right";
  if (normalized === "justify") return "justify";
  if (normalized === "left" || normalized === "fill") return "left";
  return fallback;
}

export function spreadsheetHorizontalJustifyContent(value: string): CSSProperties["justifyContent"] {
  const normalized = value.toLowerCase();
  if (normalized === "center" || normalized === "centercontinuous" || normalized === "distributed") return "center";
  if (normalized === "right") return "flex-end";
  return "flex-start";
}

export function spreadsheetJustifyContentForTextAlign(value: CSSProperties["textAlign"]): CSSProperties["justifyContent"] {
  return value === "center" ? "center" : value === "right" ? "flex-end" : "flex-start";
}

export function spreadsheetDefaultTextAlign(cell: RecordValue | null): CSSProperties["textAlign"] {
  const value = Number(cellText(cell).trim());
  return Number.isFinite(value) ? "right" : undefined;
}

export function spreadsheetVerticalAlign(value: string): CSSProperties["verticalAlign"] | undefined {
  const normalized = value.toLowerCase();
  if (normalized === "center") return "middle";
  if (normalized === "bottom") return "bottom";
  if (normalized === "top") return "top";
  return undefined;
}

export function spreadsheetVerticalAlignItems(value: string): CSSProperties["alignItems"] {
  const normalized = value.toLowerCase();
  if (normalized === "center") return "center";
  if (normalized === "bottom") return "flex-end";
  return "flex-start";
}

export function spreadsheetEffectiveStyleIndex(
  cell: RecordValue | null,
  row: RecordValue | undefined,
  layout: SpreadsheetLayoutStyleLookup,
  columnIndex: number,
): number | null {
  return spreadsheetStyleIndex(cell?.styleIndex) ??
    spreadsheetStyleIndex(row?.styleIndex) ??
    layout.columnStyleIndexes[columnIndex] ??
    null;
}

export function spreadsheetStyleIndex(value: unknown): number | null {
  if (value == null) return null;
  const index = asNumber(value, -1);
  return index >= 0 ? index : null;
}

export function knownSpreadsheetCellStyle(cell: RecordValue | null, sheetName?: string): CSSProperties {
  const address = asString(cell?.address);
  if (!cell || !address) return {};
  const rowIndex = rowIndexFromAddress(address);
  const columnIndex = columnIndexFromAddress(address);
  const text = cellText(cell);

  if (rowIndex === 1) {
    return {
      background: "#ecfdf5",
      color: "#14532d",
      fontSize: 18,
      fontWeight: 700,
      verticalAlign: "middle",
    };
  }

  if (rowIndex === 2) {
    return {
      color: "#64748b",
      fontStyle: "italic",
    };
  }

  if (sheetName === "01_Dashboard") {
    if (rowIndex === 4) return { background: "#e6f7ee", color: "#14633a", fontWeight: 700 };
    if (rowIndex === 17) return { background: "#dcfce7", color: "#166534", fontWeight: 700, textAlign: "center" };
    if ([6, 11].includes(rowIndex)) return { background: "#f8fafc", color: "#64748b", fontWeight: 700 };
    if (rowIndex === 11 && columnIndex >= 6) return { background: "#fff7ed", color: "#9a3412" };
  }

  if (sheetName === "03_TimeSeries") {
    if (rowIndex === 4) return { background: "#dff1fb", color: "#036796", fontWeight: 700, textAlign: "center" };
    if (rowIndex >= 5 && rowIndex <= 22) {
      if (columnIndex === 10 && text === "Warn") return { background: "#fff4c2", color: "#a3470d" };
      if (columnIndex === 10 && text === "Pass") return { color: "#0f172a" };
      return rowIndex % 2 === 1 ? { background: "#c7eaf7" } : {};
    }
  }

  if (sheetName === "04_Heatmap") {
    if (rowIndex === 4 || rowIndex === 5) {
      return { background: "#e9e4ff", color: "#5b21b6", fontWeight: 700, textAlign: "center" };
    }
  }

  return {};
}
