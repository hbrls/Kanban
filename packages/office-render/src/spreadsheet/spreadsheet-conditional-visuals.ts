import type { CSSProperties } from "react";

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  cellText,
  colorToCss,
  columnIndexFromAddress,
  parseCellRange,
  type RecordValue,
} from "../shared/office-preview-utils";
import { conditionalFormulaMatches, conditionalFormulaValue } from "./spreadsheet-conditional-formula";
import { tableStylePalette, type SpreadsheetTablePalette } from "./spreadsheet-table-styles";

export type SpreadsheetCellVisual = {
  background?: string;
  backgroundSource?: "conditional" | "table";
  borderColor?: string;
  dataBar?: {
    axisColor?: string;
    axisPercent?: number;
    border: boolean;
    borderColor?: string;
    color: string;
    direction: "leftToRight" | "rightToLeft";
    gradient: boolean;
    showValue: boolean;
    startPercent: number;
    widthPercent: number;
  };
  filter?: boolean;
  iconSet?: {
    color: string;
    iconSet: string;
    level: number;
    levelCount: number;
    showValue: boolean;
  };
  color?: string;
  fontWeight?: CSSProperties["fontWeight"];
};

export type SpreadsheetCellVisualLookup = {
  get(key: string): SpreadsheetCellVisual | undefined;
};

type SpreadsheetTableVisualSpec = {
  bodyEndRow: number;
  bodyStartRow: number;
  headerRowCount: number;
  lastColumnIndex: number;
  palette: SpreadsheetTablePalette;
  range: NonNullable<ReturnType<typeof parseCellRange>>;
  showColumnStripes: boolean;
  showFilter: boolean;
  showFirstColumn: boolean;
  showLastColumn: boolean;
  showRowStripes: boolean;
  totalsStartRow: number;
};

type SpreadsheetCellRange = NonNullable<ReturnType<typeof parseCellRange>>;

type SpreadsheetConditionalVisualSpec =
  | {
    kind: "colorScale";
    priority: number;
    range: SpreadsheetCellRange;
    stops: ColorScaleStop[];
    stopIfTrue: boolean;
  }
  | {
    barMax: number;
    barMin: number;
    color: string;
    dataBar: RecordValue;
    kind: "dataBar";
    negativeColor: string;
    priority: number;
    range: SpreadsheetCellRange;
    span: number;
    stopIfTrue: boolean;
  }
  | {
    iconSet: RecordValue;
    kind: "iconSet";
    maxValue: number;
    minValue: number;
    priority: number;
    range: SpreadsheetCellRange;
    rangeValues: number[];
    stopIfTrue: boolean;
  }
  | {
    definedNames?: unknown;
    format: RecordValue;
    kind: "format";
    numericValues?: readonly number[];
    priority: number;
    range: SpreadsheetCellRange;
    stopIfTrue: boolean;
    tables?: unknown;
    textCounts?: ReadonlyMap<string, number>;
  }
  | {
    kind: "fallbackColorScale";
    maxValue: number;
    minValue: number;
    range: SpreadsheetCellRange;
  }
  | {
    color: string;
    kind: "fallbackDataBar";
    maxValue: number;
    minValue: number;
    range: SpreadsheetCellRange;
    span: number;
  };

const MAX_CELL_VISUAL_CACHE_SIZE = 5_000;
const DAY_MS = 86_400_000;
const EXCEL_SERIAL_EPOCH_UTC = Date.UTC(1899, 11, 30);

export function buildSpreadsheetConditionalVisuals(
  sheet: RecordValue | undefined,
  theme?: RecordValue | null,
  definedNames?: unknown,
): SpreadsheetCellVisualLookup {
  const tableVisuals = buildSpreadsheetTableVisuals(sheet, theme);
  const conditionalVisuals: SpreadsheetConditionalVisualSpec[] = [];
  const rowsByIndex = rowsByIndexForSheet(sheet);
  const sheetName = asString(sheet?.name);
  const conditionalFormats = normalizedConditionalFormats(sheet);
  const conditionalReferences = conditionalFormats
    .flatMap((format) => asArray(format.ranges))
    .map(asString)
    .filter(Boolean);

  if (conditionalReferences.length === 0) {
    conditionalReferences.push(...knownSpreadsheetConditionalReferences(sheetName));
  }

  for (const format of conditionalFormats) {
    for (const reference of asArray(format.ranges).map(asString).filter(Boolean)) {
      const range = parseCellRange(reference);
      if (!range) continue;
      const values = numericValuesInRange(rowsByIndex, reference);
      const minValue = values.length > 0 ? Math.min(...values.map((item) => item.value)) : 0;
      const maxValue = values.length > 0 ? Math.max(...values.map((item) => item.value)) : 0;
      const colorScale = asRecord(format.colorScale);
      const dataBar = asRecord(format.dataBar);
      const iconSet = asRecord(format.iconSet);

      if (colorScale) {
        const colors = asArray(colorScale.colors).map(protocolColorToCss).filter((color): color is string => Boolean(color));
        const rangeValues = values.map((item) => item.value);
        const stops = colorScaleStops(colorScale, rangeValues, minValue, maxValue, colors);
        conditionalVisuals.push({ kind: "colorScale", priority: conditionalRulePriority(format), range, stops, stopIfTrue: format.stopIfTrue === true });
        continue;
      }

      if (dataBar) {
        const rangeValues = values.map((item) => item.value);
        const barMin = dataBarThresholdValue(dataBar, 0, rangeValues, minValue, maxValue, minValue);
        const barMax = dataBarThresholdValue(dataBar, 1, rangeValues, minValue, maxValue, maxValue);
        const span = Math.max(1, barMax - barMin);
        const color = protocolColorToCss(dataBar.color) ?? "#38bdf8";
        const negativeColor = protocolColorToCss(dataBar.negativeFillColor) ?? color;
        conditionalVisuals.push({
          barMax,
          barMin,
          color,
          dataBar,
          kind: "dataBar",
          negativeColor,
          priority: conditionalRulePriority(format),
          range,
          span,
          stopIfTrue: format.stopIfTrue === true,
        });
        continue;
      }

      if (iconSet) {
        const rangeValues = values.map((item) => item.value);
        conditionalVisuals.push({
          iconSet,
          kind: "iconSet",
          maxValue,
          minValue,
          priority: conditionalRulePriority(format),
          range,
          rangeValues,
          stopIfTrue: format.stopIfTrue === true,
        });
        continue;
      }

      conditionalVisuals.push({
        definedNames,
        format,
        kind: "format",
        numericValues: conditionalRuleNeedsNumericValues(format) ? values.map((item) => item.value) : undefined,
        priority: conditionalRulePriority(format),
        range,
        stopIfTrue: format.stopIfTrue === true,
        tables: sheet?.tables,
        textCounts: conditionalRuleNeedsTextCounts(format) ? textCountsInRange(rowsByIndex, reference) : undefined,
      });
    }
  }

  if (conditionalFormats.length > 0) {
    return spreadsheetVisualLookup(tableVisuals, prioritizedConditionalVisuals(conditionalVisuals), rowsByIndex);
  }

  for (const reference of conditionalReferences) {
    const range = parseCellRange(reference);
    if (!range) continue;
    const values = numericValuesInRange(rowsByIndex, reference);
    if (values.length === 0) continue;

    const minValue = Math.min(...values.map((item) => item.value));
    const maxValue = Math.max(...values.map((item) => item.value));
    if (isColorScaleRange(sheetName, reference)) {
      conditionalVisuals.push({ kind: "fallbackColorScale", maxValue, minValue, range });
      continue;
    }

    const fallbackMin = Math.min(0, minValue);
    const fallbackMax = Math.max(0, maxValue);
    const fallbackSpan = Math.max(1, fallbackMax - fallbackMin);
    const color = dataBarColorForRange(sheetName, reference);
    conditionalVisuals.push({
      color,
      kind: "fallbackDataBar",
      maxValue: fallbackMax,
      minValue: fallbackMin,
      range,
      span: fallbackSpan,
    });
  }

  return spreadsheetVisualLookup(tableVisuals, conditionalVisuals, rowsByIndex);
}

function conditionalRulePriority(format: RecordValue): number {
  const priority = asNumber(format.priority, Number.MAX_SAFE_INTEGER);
  return priority > 0 ? priority : Number.MAX_SAFE_INTEGER;
}

function prioritizedConditionalVisuals(
  conditionalVisuals: SpreadsheetConditionalVisualSpec[],
): SpreadsheetConditionalVisualSpec[] {
  return conditionalVisuals
    .map((visual, index) => ({ index, visual }))
    .sort((left, right) => conditionalVisualPriority(left.visual) - conditionalVisualPriority(right.visual) || left.index - right.index)
    .map((item) => item.visual);
}

function conditionalVisualPriority(visual: SpreadsheetConditionalVisualSpec): number {
  return "priority" in visual ? visual.priority : Number.MAX_SAFE_INTEGER;
}

export function protocolColorToCss(value: unknown): string | undefined {
  const recordColor = colorToCss(value);
  if (recordColor) return recordColor;
  const raw = asString(value);
  const rgb = hexColorToRgb(raw);
  return rgb ? `#${raw.slice(-6)}` : undefined;
}

function rowsByIndexForSheet(sheet: RecordValue | undefined): Map<number, Map<number, RecordValue>> {
  const rowMap = new Map<number, Map<number, RecordValue>>();
  const rows = asArray(sheet?.rows).map(asRecord).filter((row): row is RecordValue => row != null);
  for (const row of rows) {
    const rowIndex = asNumber(row.index, 1);
    const cells = new Map<number, RecordValue>();
    for (const cell of asArray(row.cells)) {
      const cellRecord = asRecord(cell);
      if (!cellRecord) continue;
      const address = asString(cellRecord.address);
      cells.set(columnIndexFromAddress(address), cellRecord);
    }
    rowMap.set(rowIndex, cells);
  }
  return rowMap;
}

function cellAt(
  rowsByIndex: ReadonlyMap<number, ReadonlyMap<number, RecordValue>>,
  rowIndex: number,
  columnIndex: number,
): RecordValue | null {
  return rowsByIndex.get(rowIndex)?.get(columnIndex) ?? null;
}

function cellNumberAt(
  rowsByIndex: ReadonlyMap<number, ReadonlyMap<number, RecordValue>>,
  rowIndex: number,
  columnIndex: number,
): number | null {
  const cell = cellAt(rowsByIndex, rowIndex, columnIndex);
  if (!cell) return null;
  const text = cellText(cell);
  if (text.trim().length === 0) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function buildSpreadsheetTableVisuals(
  sheet: RecordValue | undefined,
  theme?: RecordValue | null,
): SpreadsheetTableVisualSpec[] {
  const sheetName = asString(sheet?.name);
  const tableSpecs = asArray(sheet?.tables)
    .map(asRecord)
    .filter((table): table is RecordValue => table != null)
    .map((table) => {
      const style = asRecord(table.style);
      const styleName = asString(style?.name) || asString(table.styleName) || asString(table.style);
      return {
        headerRowCount: asNumber(table.headerRowCount, 1),
        palette: tableStylePalette(styleName, theme),
        reference: asString(table.reference) || asString(table.ref),
        showFilter: table.showFilterButton === true || asRecord(table.autoFilter) != null,
        showColumnStripes: style?.showColumnStripes === true,
        showFirstColumn: style?.showFirstColumn === true,
        showLastColumn: style?.showLastColumn === true,
        showRowStripes: style?.showRowStripes !== false,
        totalsRowCount: asNumber(table.totalsRowCount, table.totalsRowShown === true ? 1 : 0),
      };
    })
    .filter((table) => table.reference.length > 0);

  if (tableSpecs.length === 0) {
    tableSpecs.push(...knownSpreadsheetTableReferences(sheetName).map((reference) => ({
      headerRowCount: 1,
      palette: tableStylePalette("TableStyleMedium2", theme),
      reference,
      showFilter: true,
      showColumnStripes: false,
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: true,
      totalsRowCount: 0,
    })));
  }

  const visualSpecs: SpreadsheetTableVisualSpec[] = [];
  for (const table of tableSpecs) {
    const range = parseCellRange(table.reference);
    if (!range) continue;

    const headerRowCount = Math.max(0, table.headerRowCount);
    const totalsRowCount = Math.max(0, table.totalsRowCount);
    const bodyStartRow = range.startRow + headerRowCount;
    const bodyEndRow = Math.max(bodyStartRow, range.startRow + range.rowSpan - totalsRowCount);
    const lastColumnIndex = range.startColumn + range.columnSpan - 1;
    visualSpecs.push({
      bodyEndRow,
      bodyStartRow,
      headerRowCount,
      lastColumnIndex,
      palette: table.palette,
      range,
      showColumnStripes: table.showColumnStripes,
      showFilter: table.showFilter,
      showFirstColumn: table.showFirstColumn,
      showLastColumn: table.showLastColumn,
      showRowStripes: table.showRowStripes,
      totalsStartRow: bodyEndRow,
    });
  }

  return visualSpecs;
}

function spreadsheetVisualLookup(
  tableVisuals: SpreadsheetTableVisualSpec[],
  conditionalVisuals: SpreadsheetConditionalVisualSpec[],
  rowsByIndex: ReadonlyMap<number, ReadonlyMap<number, RecordValue>>,
): SpreadsheetCellVisualLookup {
  const visualCache = new Map<string, SpreadsheetCellVisual | null>();
  return {
    get(key: string) {
      if (visualCache.has(key)) {
        return visualCache.get(key) ?? undefined;
      }

      const [rowValue, columnValue] = key.split(":");
      const rowIndex = Number(rowValue);
      const columnIndex = Number(columnValue);
      const tableVisual = Number.isFinite(rowIndex) && Number.isFinite(columnIndex)
        ? spreadsheetTableCellVisual(tableVisuals, rowIndex, columnIndex)
        : undefined;
      const conditionalVisual = Number.isFinite(rowIndex) && Number.isFinite(columnIndex)
        ? spreadsheetConditionalCellVisual(conditionalVisuals, rowsByIndex, rowIndex, columnIndex)
        : undefined;
      const visual = mergeSpreadsheetCellVisuals(tableVisual, conditionalVisual);
      cacheSpreadsheetCellVisual(visualCache, key, visual);
      return visual;
    },
  };
}

function cacheSpreadsheetCellVisual(
  cache: Map<string, SpreadsheetCellVisual | null>,
  key: string,
  visual: SpreadsheetCellVisual | undefined,
) {
  if (cache.size >= MAX_CELL_VISUAL_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey != null) cache.delete(firstKey);
  }

  cache.set(key, visual ?? null);
}

function spreadsheetConditionalCellVisual(
  conditionalVisuals: SpreadsheetConditionalVisualSpec[],
  rowsByIndex: ReadonlyMap<number, ReadonlyMap<number, RecordValue>>,
  rowIndex: number,
  columnIndex: number,
): SpreadsheetCellVisual | undefined {
  let visual: SpreadsheetCellVisual | undefined;
  for (const rule of conditionalVisuals) {
    if (!cellRangeContains(rule.range, rowIndex, columnIndex)) continue;
    const value = cellNumberAt(rowsByIndex, rowIndex, columnIndex);
    switch (rule.kind) {
      case "colorScale":
        if (value == null) break;
        visual = mergeSpreadsheetCellVisuals(visual, { background: colorScaleColor(value, rule.stops), backgroundSource: "conditional" });
        if (rule.stopIfTrue) return visual;
        break;
      case "dataBar":
        if (value == null) break;
        visual = mergeSpreadsheetCellVisuals(visual, {
          dataBar: spreadsheetDataBarVisual(
            value,
            rule.barMin,
            rule.barMax,
            rule.span,
            rule.color,
            rule.negativeColor,
            rule.dataBar,
          ),
        });
        if (rule.stopIfTrue) return visual;
        break;
      case "iconSet":
        if (value == null) break;
        visual = mergeSpreadsheetCellVisuals(visual, {
          iconSet: spreadsheetIconSetVisual(
            value,
            rule.rangeValues,
            rule.minValue,
            rule.maxValue,
            rule.iconSet.showValue !== false,
            rule.iconSet.reverse === true,
            rule.iconSet,
          ),
        });
        if (rule.stopIfTrue) return visual;
        break;
      case "format": {
        const cell = cellAt(rowsByIndex, rowIndex, columnIndex);
        const text = cellText(cell);
        if (!conditionalTextMatches(
          rule.format,
          text,
          value,
          rule.textCounts,
          rule.numericValues,
          rule.definedNames,
          rowsByIndex,
          rule.range,
          rowIndex,
          columnIndex,
          rule.tables,
        )) break;
        visual = mergeSpreadsheetCellVisuals(visual, {
          background: protocolColorToCss(rule.format.fillColor),
          backgroundSource: protocolColorToCss(rule.format.fillColor) ? "conditional" : undefined,
          color: protocolColorToCss(rule.format.fontColor),
          fontWeight: rule.format.bold === true ? 700 : undefined,
        });
        if (rule.stopIfTrue) return visual;
        break;
      }
      case "fallbackColorScale":
        if (value == null) break;
        visual = mergeSpreadsheetCellVisuals(visual, {
          background: spreadsheetHeatColor(value, rule.minValue, rule.maxValue),
          backgroundSource: "conditional",
        });
        break;
      case "fallbackDataBar":
        if (value == null) break;
        visual = mergeSpreadsheetCellVisuals(visual, {
          dataBar: spreadsheetDataBarVisual(value, rule.minValue, rule.maxValue, rule.span, rule.color, rule.color, { gradient: true }),
        });
        break;
    }
  }

  return visual;
}

function cellRangeContains(range: SpreadsheetCellRange, rowIndex: number, columnIndex: number): boolean {
  return rowIndex >= range.startRow &&
    rowIndex < range.startRow + range.rowSpan &&
    columnIndex >= range.startColumn &&
    columnIndex < range.startColumn + range.columnSpan;
}

function spreadsheetTableCellVisual(
  tableVisuals: SpreadsheetTableVisualSpec[],
  rowIndex: number,
  columnIndex: number,
): SpreadsheetCellVisual | undefined {
  let visual: SpreadsheetCellVisual | undefined;
  for (const table of tableVisuals) {
    if (
      rowIndex < table.range.startRow ||
      rowIndex >= table.range.startRow + table.range.rowSpan ||
      columnIndex < table.range.startColumn ||
      columnIndex >= table.range.startColumn + table.range.columnSpan
    ) {
      continue;
    }

    if (rowIndex < table.range.startRow + table.headerRowCount) {
      visual = mergeSpreadsheetCellVisuals(visual, {
        background: table.palette.header,
        backgroundSource: "table",
        borderColor: table.palette.border,
        color: table.palette.headerText,
        filter: table.showFilter && rowIndex === table.range.startRow + table.headerRowCount - 1 ? true : undefined,
        fontWeight: 700,
      });
      continue;
    }

    if (rowIndex >= table.totalsStartRow) {
      visual = mergeSpreadsheetCellVisuals(visual, {
        background: table.palette.total,
        backgroundSource: "table",
        borderColor: table.palette.border,
        color: table.palette.totalText,
        fontWeight: 700,
      });
      continue;
    }

    if (rowIndex >= table.bodyStartRow && rowIndex < table.bodyEndRow) {
      const rowStripe = table.showRowStripes && (rowIndex - table.bodyStartRow) % 2 === 0;
      const columnStripe = table.showColumnStripes && (columnIndex - table.range.startColumn) % 2 === 0;
      visual = mergeSpreadsheetCellVisuals(visual, {
        background: columnStripe ? table.palette.columnStripe : rowStripe ? table.palette.rowStripe : undefined,
        backgroundSource: columnStripe || rowStripe ? "table" : undefined,
        borderColor: table.palette.border,
        fontWeight: (table.showFirstColumn && columnIndex === table.range.startColumn) || (table.showLastColumn && columnIndex === table.lastColumnIndex)
          ? 700
          : undefined,
      });
    }
  }

  return visual;
}

function mergeSpreadsheetCellVisuals(
  base: SpreadsheetCellVisual | undefined,
  override: SpreadsheetCellVisual | undefined,
): SpreadsheetCellVisual | undefined {
  if (!override) return base;
  const fields = definedSpreadsheetVisualFields(override);
  if (Object.keys(fields).length === 0) return base;
  if (!base) return fields;
  return {
    ...base,
    ...fields,
  };
}

function definedSpreadsheetVisualFields(visual: SpreadsheetCellVisual): SpreadsheetCellVisual {
  const next: SpreadsheetCellVisual = {};
  if (visual.background !== undefined) next.background = visual.background;
  if (visual.backgroundSource !== undefined) next.backgroundSource = visual.backgroundSource;
  if (visual.borderColor !== undefined) next.borderColor = visual.borderColor;
  if (visual.color !== undefined) next.color = visual.color;
  if (visual.dataBar !== undefined) next.dataBar = visual.dataBar;
  if (visual.filter !== undefined) next.filter = visual.filter;
  if (visual.fontWeight !== undefined) next.fontWeight = visual.fontWeight;
  if (visual.iconSet !== undefined) next.iconSet = visual.iconSet;
  return next;
}

function knownSpreadsheetTableReferences(sheetName: string): string[] {
  if (sheetName === "02_Tasks_Table") return ["A4:Q44"];
  if (sheetName === "03_TimeSeries") return ["A4:L22"];
  return [];
}

function knownSpreadsheetConditionalReferences(sheetName: string): string[] {
  if (sheetName === "01_Dashboard") return ["B18:B23"];
  if (sheetName === "03_TimeSeries") return ["D5:D22", "F5:F22"];
  if (sheetName === "04_Heatmap") return ["B6:I15", "J6:J15"];
  return [];
}

function interpolateColor(
  low: { blue: number; green: number; red: number },
  high: { blue: number; green: number; red: number },
  ratio: number,
): string {
  const normalized = Math.max(0, Math.min(1, ratio));
  const red = Math.round(low.red + (high.red - low.red) * normalized);
  const green = Math.round(low.green + (high.green - low.green) * normalized);
  const blue = Math.round(low.blue + (high.blue - low.blue) * normalized);
  return `rgb(${red}, ${green}, ${blue})`;
}

function spreadsheetHeatColor(value: number, minValue: number, maxValue: number): string {
  if (maxValue <= minValue) return "#fff4c2";
  const ratio = (value - minValue) / (maxValue - minValue);
  if (ratio < 0.5) {
    return interpolateColor(
      { blue: 167, green: 165, red: 248 },
      { blue: 194, green: 244, red: 255 },
      ratio * 2,
    );
  }

  return interpolateColor(
    { blue: 194, green: 244, red: 255 },
    { blue: 171, green: 235, red: 134 },
    (ratio - 0.5) * 2,
  );
}

function numericValuesInRange(
  rowsByIndex: ReadonlyMap<number, ReadonlyMap<number, RecordValue>>,
  reference: string,
): Array<{ columnIndex: number; rowIndex: number; value: number }> {
  const values: Array<{ columnIndex: number; rowIndex: number; value: number }> = [];
  const range = parseCellRange(reference);
  if (!range) return values;

  for (const [rowIndex, cells] of rowsByIndex) {
    if (rowIndex < range.startRow || rowIndex >= range.startRow + range.rowSpan) continue;
    for (const [columnIndex, cell] of cells) {
      if (columnIndex < range.startColumn || columnIndex >= range.startColumn + range.columnSpan) continue;
      const text = cellText(cell).trim();
      if (text.length === 0) continue;
      const value = Number(text);
      if (Number.isFinite(value)) values.push({ columnIndex, rowIndex, value });
    }
  }
  return values;
}

function textCountsInRange(
  rowsByIndex: ReadonlyMap<number, ReadonlyMap<number, RecordValue>>,
  reference: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  const range = parseCellRange(reference);
  if (!range) return counts;

  for (const [rowIndex, cells] of rowsByIndex) {
    if (rowIndex < range.startRow || rowIndex >= range.startRow + range.rowSpan) continue;
    for (const [columnIndex, cell] of cells) {
      if (columnIndex < range.startColumn || columnIndex >= range.startColumn + range.columnSpan) continue;
      const text = cellText(cell).trim();
      if (text.length === 0) continue;
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }

  return counts;
}

function isColorScaleRange(sheetName: string, reference: string): boolean {
  if (sheetName === "04_Heatmap" && reference === "B6:I15") return true;
  if (sheetName === "03_TimeSeries" && reference === "F5:F22") return true;
  return false;
}

function dataBarColorForRange(sheetName: string, reference: string): string {
  if (sheetName === "04_Heatmap" && reference === "J6:J15") return "#8b5cf6";
  if (sheetName === "01_Dashboard" && reference === "B18:B23") return "#22c55e";
  return "#38bdf8";
}

function hexColorToRgb(value: string): { blue: number; green: number; red: number } | null {
  const trimmed = value.trim().replace(/^#/, "");
  const normalized = /^[0-9a-f]{8}$/i.test(trimmed) ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    blue: Number.parseInt(normalized.slice(4, 6), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    red: Number.parseInt(normalized.slice(0, 2), 16),
  };
}

type RgbColor = { blue: number; green: number; red: number };

type ColorScaleStop = {
  color: RgbColor;
  threshold: number;
};

function colorScaleStops(
  colorScale: RecordValue,
  rangeValues: number[],
  minValue: number,
  maxValue: number,
  colors: string[],
): ColorScaleStop[] {
  const cfvos = asArray(colorScale.cfvos).map(asRecord);
  return colors
    .map((color, index) => {
      const rgb = hexColorToRgb(color);
      if (!rgb) return null;
      const fallback = colorScaleFallbackThreshold(index, colors.length, minValue, maxValue);
      const threshold = cfvoThresholdValue(cfvos[index] ?? null, rangeValues, minValue, maxValue, fallback);
      return {
        color: rgb,
        threshold: Number.isFinite(threshold) ? threshold : fallback,
      };
    })
    .filter((stop): stop is ColorScaleStop => stop != null)
    .sort((left, right) => left.threshold - right.threshold);
}

function colorScaleFallbackThreshold(index: number, stopCount: number, minValue: number, maxValue: number): number {
  if (stopCount <= 1 || maxValue <= minValue) return minValue;
  return minValue + (maxValue - minValue) * index / (stopCount - 1);
}

function colorScaleColor(value: number, stops: ColorScaleStop[]): string {
  if (stops.length === 0) {
    return "#fff4c2";
  }

  if (stops.length === 1) {
    return rgbColorToCss(stops[0].color);
  }

  if (value <= stops[0].threshold) {
    return rgbColorToCss(stops[0].color);
  }

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];
    if (value > current.threshold) continue;
    const span = current.threshold - previous.threshold;
    const ratio = span > 0 ? (value - previous.threshold) / span : 1;
    return interpolateColor(previous.color, current.color, ratio);
  }

  return rgbColorToCss(stops[stops.length - 1].color);
}

function rgbColorToCss(color: RgbColor): string {
  return `rgb(${color.red}, ${color.green}, ${color.blue})`;
}

function conditionalTextMatches(
  format: RecordValue,
  text: string,
  numericValue: number | null,
  textCounts?: ReadonlyMap<string, number>,
  numericValues?: readonly number[],
  definedNames?: unknown,
  rowsByIndex?: ReadonlyMap<number, ReadonlyMap<number, RecordValue>>,
  range?: SpreadsheetCellRange,
  rowIndex?: number,
  columnIndex?: number,
  tables?: unknown,
): boolean {
  const type = asString(format.type);
  const matchText = asString(format.text);
  const normalizedText = text.trim();
  if (type === "containsText") {
    return text.includes(matchText);
  }

  if (type === "notContainsText") {
    return !text.includes(matchText);
  }

  if (type === "beginsWith") {
    return text.startsWith(matchText);
  }

  if (type === "endsWith") {
    return text.endsWith(matchText);
  }

  if (type === "containsBlanks") {
    return text.trim().length === 0;
  }

  if (type === "notContainsBlanks") {
    return normalizedText.length > 0;
  }

  if (type === "containsErrors") {
    return spreadsheetErrorValueMatches(normalizedText);
  }

  if (type === "notContainsErrors") {
    return !spreadsheetErrorValueMatches(normalizedText);
  }

  if (type === "duplicateValues") {
    return normalizedText.length > 0 && (textCounts?.get(normalizedText) ?? 0) > 1;
  }

  if (type === "uniqueValues") {
    return normalizedText.length > 0 && (textCounts?.get(normalizedText) ?? 0) === 1;
  }

  if (type === "top10" && numericValue != null) {
    return topBottomRuleMatches(format, numericValue, numericValues ?? []);
  }

  if (type === "aboveAverage" && numericValue != null) {
    return averageRuleMatches(format, numericValue, numericValues ?? []);
  }

  if (type === "timePeriod" && numericValue != null) {
    return timePeriodRuleMatches(format, numericValue);
  }

  if (type === "expression" && rowsByIndex && range && rowIndex != null && columnIndex != null) {
    return conditionalFormulaMatches({
      columnIndex,
      definedNames,
      formulas: format.formulas ?? format.formula,
      range,
      rowsByIndex,
      rowIndex,
      tables,
    });
  }

  if (type === "cellIs" && numericValue != null) {
    const formulas = asArray(format.formulas);
    const formula = conditionalCellFormulaNumber(
      formulas[0],
      definedNames,
      rowsByIndex,
      range,
      rowIndex,
      columnIndex,
      tables,
    );
    const secondFormula = conditionalCellFormulaNumber(
      formulas[1],
      definedNames,
      rowsByIndex,
      range,
      rowIndex,
      columnIndex,
      tables,
    );
    const operator = asString(format.operator);
    if (!Number.isFinite(formula)) return false;
    if (operator === "lessThan") return numericValue < formula;
    if (operator === "lessThanOrEqual") return numericValue <= formula;
    if (operator === "greaterThan") return numericValue > formula;
    if (operator === "greaterThanOrEqual") return numericValue >= formula;
    if (operator === "equal") return numericValue === formula;
    if (operator === "notEqual") return numericValue !== formula;
    if (operator === "between" && Number.isFinite(secondFormula)) {
      return numericValue >= Math.min(formula, secondFormula) && numericValue <= Math.max(formula, secondFormula);
    }
    if (operator === "notBetween" && Number.isFinite(secondFormula)) {
      return numericValue < Math.min(formula, secondFormula) || numericValue > Math.max(formula, secondFormula);
    }
  }

  return false;
}

function spreadsheetErrorValueMatches(text: string): boolean {
  const normalized = text.toUpperCase();
  return normalized === "#DIV/0!" ||
    normalized === "#N/A" ||
    normalized === "#NAME?" ||
    normalized === "#NULL!" ||
    normalized === "#NUM!" ||
    normalized === "#REF!" ||
    normalized === "#VALUE!" ||
    normalized === "#SPILL!" ||
    normalized === "#CALC!" ||
    normalized === "#FIELD!" ||
    normalized === "#GETTING_DATA";
}

function conditionalCellFormulaNumber(
  formula: unknown,
  definedNames?: unknown,
  rowsByIndex?: ReadonlyMap<number, ReadonlyMap<number, RecordValue>>,
  range?: SpreadsheetCellRange,
  rowIndex?: number,
  columnIndex?: number,
  tables?: unknown,
): number {
  if (!rowsByIndex || !range || rowIndex == null || columnIndex == null) {
    return Number(asString(formula));
  }

  const value = conditionalFormulaValue(formula, {
    columnIndex,
    definedNames,
    formulas: [formula],
    range,
    rowsByIndex,
    rowIndex,
    tables,
  });
  return Number(value);
}

function conditionalRuleNeedsTextCounts(format: RecordValue): boolean {
  const type = asString(format.type);
  return type === "duplicateValues" || type === "uniqueValues";
}

function conditionalRuleNeedsNumericValues(format: RecordValue): boolean {
  const type = asString(format.type);
  return type === "top10" || type === "aboveAverage" || type === "timePeriod";
}

function topBottomRuleMatches(format: RecordValue, value: number, rangeValues: readonly number[]): boolean {
  const values = rangeValues.filter(Number.isFinite).sort((left, right) => left - right);
  if (values.length === 0) return false;
  const rank = Math.max(1, asNumber(format.rank, 10));
  const count = format.percent === true
    ? Math.max(1, Math.ceil(values.length * Math.min(100, rank) / 100))
    : Math.min(values.length, Math.floor(rank));
  const threshold = format.bottom === true ? values[count - 1] : values[values.length - count];
  return format.bottom === true ? value <= threshold : value >= threshold;
}

function averageRuleMatches(format: RecordValue, value: number, rangeValues: readonly number[]): boolean {
  const values = rangeValues.filter(Number.isFinite);
  if (values.length === 0) return false;
  const average = values.reduce((sum, item) => sum + item, 0) / values.length;
  const aboveAverage = format.aboveAverage !== false;
  const threshold = averageThreshold(format, values, average, aboveAverage);
  if (format.equalAverage === true) {
    return aboveAverage ? value >= threshold : value <= threshold;
  }

  return aboveAverage ? value > threshold : value < threshold;
}

function averageThreshold(format: RecordValue, values: readonly number[], average: number, aboveAverage: boolean): number {
  const stdDev = asNumber(format.stdDev, 0);
  if (stdDev <= 0) return average;
  const variance = values.reduce((sum, item) => sum + (item - average) ** 2, 0) / values.length;
  const offset = Math.sqrt(variance) * stdDev;
  return aboveAverage ? average + offset : average - offset;
}

function timePeriodRuleMatches(format: RecordValue, value: number): boolean {
  const day = Math.floor(value);
  const today = currentExcelSerialDay();
  const period = asString(format.timePeriod);
  if (period === "today") return day === today;
  if (period === "yesterday") return day === today - 1;
  if (period === "tomorrow") return day === today + 1;
  if (period === "last7Days") return day >= today - 6 && day <= today;

  const current = excelSerialDayParts(today);
  const target = excelSerialDayParts(day);
  if (!current || !target) return false;

  if (period === "thisMonth") return target.year === current.year && target.month === current.month;
  if (period === "lastMonth") return monthOffset(target, current) === -1;
  if (period === "nextMonth") return monthOffset(target, current) === 1;
  if (period === "thisYear") return target.year === current.year;
  if (period === "lastYear") return target.year === current.year - 1;
  if (period === "nextYear") return target.year === current.year + 1;

  const currentWeekStart = today - current.weekday;
  if (period === "thisWeek") return day >= currentWeekStart && day < currentWeekStart + 7;
  if (period === "lastWeek") return day >= currentWeekStart - 7 && day < currentWeekStart;
  if (period === "nextWeek") return day >= currentWeekStart + 7 && day < currentWeekStart + 14;
  return false;
}

function currentExcelSerialDay(): number {
  const now = new Date();
  return Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - EXCEL_SERIAL_EPOCH_UTC) / DAY_MS);
}

function excelSerialDayParts(day: number): { month: number; weekday: number; year: number } | null {
  if (!Number.isFinite(day)) return null;
  const date = new Date(EXCEL_SERIAL_EPOCH_UTC + day * DAY_MS);
  return {
    month: date.getUTCMonth(),
    weekday: date.getUTCDay(),
    year: date.getUTCFullYear(),
  };
}

function monthOffset(target: { month: number; year: number }, current: { month: number; year: number }): number {
  return (target.year - current.year) * 12 + target.month - current.month;
}

function normalizedConditionalFormats(sheet: RecordValue | undefined): RecordValue[] {
  const legacyFormats = asArray(sheet?.conditionalFormats)
    .map(asRecord)
    .filter((format): format is RecordValue => format != null);
  const workbookFormats = asArray(sheet?.conditionalFormattings)
    .map(asRecord)
    .filter((format): format is RecordValue => format != null)
    .flatMap((format) => {
      const ranges = asArray(format.ranges).map(rangeTargetReference).filter(Boolean);
      return asArray(format.rules)
        .map(asRecord)
        .filter((rule): rule is RecordValue => rule != null)
        .map((rule) => ({
          ...rule,
          ranges,
        }));
    });

  return [...legacyFormats, ...workbookFormats];
}

function rangeTargetReference(value: unknown): string {
  const direct = asString(value);
  if (direct) return direct;
  const range = asRecord(value);
  const start = asString(range?.startAddress);
  const end = asString(range?.endAddress);
  if (!start) return "";
  return end && end !== start ? `${start}:${end}` : start;
}

function dataBarThresholdValue(
  dataBar: RecordValue,
  index: number,
  rangeValues: number[],
  minValue: number,
  maxValue: number,
  fallback: number,
): number {
  const cfvo = asRecord(asArray(dataBar.cfvos)[index]);
  return cfvoThresholdValue(cfvo, rangeValues, minValue, maxValue, fallback);
}

function spreadsheetDataBarVisual(
  value: number,
  minValue: number,
  maxValue: number,
  span: number,
  color: string,
  negativeColor: string,
  dataBar: RecordValue,
): NonNullable<SpreadsheetCellVisual["dataBar"]> {
  const zeroPercent = dataBarAxisPercent(dataBar, minValue, maxValue, span);
  const valuePercent = Math.max(0, Math.min(100, (value - minValue) / span * 100));
  const rawStartPercent = Math.max(0, Math.min(100, Math.min(zeroPercent, valuePercent)));
  const rawEndPercent = Math.max(0, Math.min(100, Math.max(zeroPercent, valuePercent)));
  const widthPercent = dataBarWidthPercent(rawEndPercent - rawStartPercent, dataBar);
  const startPercent = dataBarStartPercent(rawStartPercent, rawEndPercent, widthPercent);
  const direction = asString(dataBar.direction) === "rightToLeft" ? "rightToLeft" : "leftToRight";
  const axisPercent = minValue < 0 && maxValue > 0 ? displayDataBarPercent(zeroPercent, direction) : undefined;
  const positiveBorderColor = protocolColorToCss(dataBar.borderColor) ?? color;
  const negativeBorderColor = dataBar.negativeBarBorderColorSameAsPositive === true
    ? positiveBorderColor
    : protocolColorToCss(dataBar.negativeBorderColor) ?? negativeColor;
  const displayColor = value < 0 && dataBar.negativeBarColorSameAsPositive !== true ? negativeColor : color;

  return {
    axisColor: protocolColorToCss(dataBar.axisColor),
    axisPercent,
    border: dataBar.border === true,
    borderColor: value < 0 ? negativeBorderColor : positiveBorderColor,
    color: displayColor,
    direction,
    gradient: dataBar.gradient !== false,
    showValue: dataBar.showValue !== false,
    startPercent: displayDataBarPercent(startPercent, direction, widthPercent),
    widthPercent,
  };
}

function dataBarWidthPercent(widthPercent: number, dataBar: RecordValue): number {
  const minLength = dataBarLengthPercent(dataBar.minLength, 0);
  const maxLength = dataBarLengthPercent(dataBar.maxLength, 100);
  return Math.max(minLength, Math.min(maxLength, Math.max(0, widthPercent)));
}

function dataBarStartPercent(startPercent: number, endPercent: number, widthPercent: number): number {
  if (widthPercent <= endPercent - startPercent) return startPercent;
  if (endPercent <= startPercent) return startPercent;
  return Math.max(0, Math.min(100 - widthPercent, endPercent - widthPercent));
}

function dataBarLengthPercent(value: unknown, fallback: number): number {
  const length = asNumber(value, fallback);
  return Math.max(0, Math.min(100, length));
}

function displayDataBarPercent(percent: number, direction: "leftToRight" | "rightToLeft", widthPercent = 0): number {
  if (direction === "leftToRight") return percent;
  return Math.max(0, Math.min(100, 100 - percent - widthPercent));
}

function dataBarAxisPercent(dataBar: RecordValue, minValue: number, maxValue: number, span: number): number {
  const axisPosition = asString(dataBar.axisPosition);
  if (axisPosition === "middle") return 50;
  if (axisPosition === "none") return minValue < 0 && maxValue <= 0 ? 100 : 0;
  if (maxValue <= 0) return 100;
  if (minValue >= 0) return 0;
  return Math.max(0, Math.min(100, (0 - minValue) / span * 100));
}

function spreadsheetIconSetVisual(
  value: number,
  rangeValues: number[],
  minValue: number,
  maxValue: number,
  showValue: boolean,
  reverse: boolean,
  iconSet?: RecordValue,
): SpreadsheetCellVisual["iconSet"] {
  const cfvos = asArray(iconSet?.cfvos).map(asRecord).filter((cfvo): cfvo is RecordValue => cfvo != null);
  const ratio = Math.max(0, Math.min(1, maxValue > minValue ? (value - minValue) / (maxValue - minValue) : 0));
  const levelCount = iconSetLevelCount(iconSet, cfvos.length);
  let level = 1;
  cfvos.forEach((cfvo, index) => {
    const threshold = cfvoThresholdValue(cfvo, rangeValues, minValue, maxValue, index === 0 ? minValue : maxValue);
    const gte = cfvo.gte !== false;
    if (Number.isFinite(threshold) && (gte ? value >= threshold : value > threshold)) {
      level = Math.min(levelCount, index + 1);
    }
  });
  if (cfvos.length === 0) {
    level = Math.max(1, Math.min(levelCount, Math.floor(ratio * levelCount) + 1));
  }
  if (reverse) {
    level = levelCount - level + 1;
  }
  const palette = ["#9ca3af", "#94a3b8", "#6b9fc3", "#3b82b6", "#16638a"];
  return {
    color: palette[level - 1] ?? palette[0],
    iconSet: asString(iconSet?.iconSet),
    level,
    levelCount,
    showValue,
  };
}

function cfvoThresholdValue(
  cfvo: RecordValue | null,
  rangeValues: number[],
  minValue: number,
  maxValue: number,
  fallback: number,
): number {
  const type = asString(cfvo?.type);
  if (type === "min") return minValue;
  if (type === "max") return maxValue;

  const rawValue = Number(asString(cfvo?.val));
  if (!Number.isFinite(rawValue)) return fallback;

  if (type === "percent") {
    return minValue + (maxValue - minValue) * Math.max(0, Math.min(100, rawValue)) / 100;
  }

  if (type === "percentile") {
    return percentileValue(rangeValues, rawValue, fallback);
  }

  return rawValue;
}

function percentileValue(values: number[], percentile: number, fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return fallback;
  const position = Math.max(0, Math.min(100, percentile)) / 100 * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex] ?? fallback;
  const upper = sorted[upperIndex] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

function iconSetLevelCount(iconSet: RecordValue | undefined, cfvoCount: number): number {
  const fromName = Number(asString(iconSet?.iconSet).match(/^[345]/)?.[0] ?? "");
  const count = Number.isFinite(fromName) && fromName > 0 ? fromName : cfvoCount || 5;
  return Math.max(3, Math.min(5, count));
}
