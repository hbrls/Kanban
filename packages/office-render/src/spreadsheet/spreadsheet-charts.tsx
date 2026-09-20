"use client";

import { useEffect, useRef } from "react";

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  cellText,
  columnIndexFromAddress,
  type RecordValue,
} from "../shared/office-preview-utils";
import { drawSpreadsheetChartFrame } from "./spreadsheet-chart-frame";
import { spreadsheetChartRendererOptions, type SpreadsheetChartRendererOptions } from "./spreadsheet-chart-options";
import {
  chartY,
  spreadsheetChartTickValues,
  spreadsheetChartZeroBaselineY,
} from "./spreadsheet-chart-scale";
import { spreadsheetChartCanvasFont, spreadsheetChartTextWidth } from "./spreadsheet-chart-typography";
import { protocolColorToCss } from "./spreadsheet-conditional-visuals";
import {
  spreadsheetColumnLeft,
  spreadsheetDrawingBounds,
  spreadsheetEmuToPx,
  type SpreadsheetLayout,
  spreadsheetRowTop,
} from "./spreadsheet-layout";

type SpreadsheetChartAxisSpec = {
  majorGridLines: boolean;
  majorUnit?: number;
  maximum?: number;
  minimum?: number;
  numberFormat: string;
  position: string;
  title?: string;
};

type SpreadsheetChartLegendPosition = "bottom" | "left" | "none" | "right" | "top";
type SpreadsheetChartType = "area" | "bar" | "bubble" | "doughnut" | "line" | "pie" | "radar" | "scatter" | "surface";
type SpreadsheetChartDataLabelPosition = "above" | "below" | "bestFit" | "center" | "insideEnd" | "outsideEnd";
type SpreadsheetChartLegendItem = {
  color: string;
  label: string;
  marker: SpreadsheetChartSeries["marker"];
  showLine: boolean;
};

export type SpreadsheetChartLegendEntryLayout = {
  item: SpreadsheetChartLegendItem;
  x: number;
  y: number;
};

type SpreadsheetChartErrorBars = {
  amount: number;
  color: string;
  direction: "both" | "minus" | "plus";
};

type SpreadsheetChartTrendline = {
  color: string;
  type: string;
};

type SpreadsheetChartScale = {
  maxValue: number;
  minValue: number;
};

export const SPREADSHEET_CHART_LINE_WIDTH = 2;
export const SPREADSHEET_CHART_MARKER_RADIUS = 4;

type SpreadsheetChartDataLabels = {
  position: SpreadsheetChartDataLabelPosition;
  showCategoryName: boolean;
  showPercent: boolean;
  showSeriesName: boolean;
  showValue: boolean;
};
const CHART_PALETTE = ["#1f6f8b", "#f9732a", "#5b7f2a", "#9467bd", "#8c564b", "#2ca02c", "#d62728"];

export type SpreadsheetChartPlotArea = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type SpreadsheetChartSeries = {
  axis?: "primary" | "secondary";
  color: string;
  errorBars?: SpreadsheetChartErrorBars;
  label: string;
  marker: "diamond" | "square" | null;
  trendlines: SpreadsheetChartTrendline[];
  type?: SpreadsheetChartType;
  values: number[];
};

export type SpreadsheetBarGeometry = {
  barWidth: number;
  categoryIndex: number;
  centerX: number;
  series: SpreadsheetChartSeries;
  value: number;
};

export type SpreadsheetChartSpec = {
  categories: string[];
  height: number;
  left: number;
  legendOverlay: boolean;
  legendPosition: SpreadsheetChartLegendPosition;
  dataLabels?: SpreadsheetChartDataLabels;
  options?: SpreadsheetChartRendererOptions;
  series: SpreadsheetChartSeries[];
  showDataLabels: boolean;
  title: string;
  top: number;
  type: SpreadsheetChartType;
  width: number;
  xAxis?: SpreadsheetChartAxisSpec;
  secondaryYAxis?: SpreadsheetChartAxisSpec;
  yAxis?: SpreadsheetChartAxisSpec;
  zIndex: number;
};

export function buildSpreadsheetCharts({
  activeSheet,
  charts: workbookCharts,
  layout,
  sheets,
}: {
  activeSheet: RecordValue | undefined;
  charts: RecordValue[];
  layout: SpreadsheetLayout;
  sheets: RecordValue[];
}): SpreadsheetChartSpec[] {
  const protocolCharts = [
    ...buildSheetDrawingCharts(activeSheet, layout),
    ...buildRootSpreadsheetCharts(activeSheet, workbookCharts, layout),
  ];
  if (protocolCharts.length > 0) return protocolCharts;

  if (asString(activeSheet?.name) !== "01_Dashboard") return [];
  if (cellText(cellAt(activeSheet, 1, 0)) !== "AI Coding Delivery Dashboard") return [];

  const statusCategories: string[] = [];
  const statusValues: number[] = [];
  for (let rowIndex = 18; rowIndex <= 23; rowIndex += 1) {
    const category = cellText(cellAt(activeSheet, rowIndex, 0));
    const value = cellNumberAt(activeSheet, rowIndex, 1);
    if (category && value != null) {
      statusCategories.push(category);
      statusValues.push(value);
    }
  }

  const fallbackCharts: SpreadsheetChartSpec[] = [];
  if (statusCategories.length > 0) {
    fallbackCharts.push({
      categories: statusCategories,
      height: 280,
      left: spreadsheetColumnLeft(layout, 5),
      legendOverlay: false,
      legendPosition: "none",
      series: [spreadsheetChartSeries("Count", statusValues, 0)],
      showDataLabels: false,
      title: "Tasks by Status",
      top: spreadsheetRowTop(layout, 16),
      type: "bar",
      width: 450,
      zIndex: 0,
    });
  }

  const timeSeriesSheet = sheets.find((sheet) => asString(sheet.name) === "03_TimeSeries");
  const monthLabels: string[] = [];
  const fitnessValues: number[] = [];
  const coverageValues: number[] = [];
  for (let rowIndex = 5; rowIndex <= 22; rowIndex += 1) {
    const serial = cellNumberAt(timeSeriesSheet, rowIndex, 0);
    const fitness = cellNumberAt(timeSeriesSheet, rowIndex, 5);
    const coverage = cellNumberAt(timeSeriesSheet, rowIndex, 3);
    if (serial != null && fitness != null && coverage != null) {
      monthLabels.push(excelSerialMonthLabel(serial));
      fitnessValues.push(fitness);
      coverageValues.push(coverage * 100);
    }
  }

  if (monthLabels.length > 0) {
    fallbackCharts.push({
      categories: monthLabels,
      height: 280,
      left: spreadsheetColumnLeft(layout, 0),
      legendOverlay: false,
      legendPosition: "bottom",
      series: [
        spreadsheetChartSeries("Fitness Score", fitnessValues, 0),
        spreadsheetChartSeries("Coverage %", coverageValues, 1),
      ],
      showDataLabels: false,
      title: "Fitness Score vs Coverage",
      top: spreadsheetRowTop(layout, 30),
      type: "line",
      width: 640,
      zIndex: fallbackCharts.length,
    });
  }

  return fallbackCharts;
}

function buildSheetDrawingCharts(
  activeSheet: RecordValue | undefined,
  layout: SpreadsheetLayout,
): SpreadsheetChartSpec[] {
  return asArray(activeSheet?.drawings)
    .map(asRecord)
    .filter((drawing): drawing is RecordValue => drawing != null)
    .map((drawing, index) => chartFromSheetDrawing(drawing, layout, index))
    .filter((chart): chart is SpreadsheetChartSpec => chart != null);
}

function chartFromSheetDrawing(
  drawing: RecordValue,
  layout: SpreadsheetLayout,
  zIndex: number,
): SpreadsheetChartSpec | null {
  const chart = asRecord(drawing.chart);
  if (!chart) return null;

  const bounds = spreadsheetDrawingBounds(layout, drawing);

  return chartFromRecord(chart, {
    height: chartDimension(bounds.height > 24 ? bounds.height : 0, 0, 120),
    left: bounds.left,
    top: bounds.top,
    width: chartDimension(bounds.width > 24 ? bounds.width : 0, 0, 180),
    zIndex,
  });
}

function buildRootSpreadsheetCharts(
  activeSheet: RecordValue | undefined,
  charts: RecordValue[],
  layout: SpreadsheetLayout,
): SpreadsheetChartSpec[] {
  const sheetName = asString(activeSheet?.name);
  return charts
    .filter((chart) => asString(chart.sheetName) === sheetName)
    .map((chart, index) => {
      const anchor = asRecord(chart.anchor);
      const fromCol = protocolNumber(anchor?.fromCol, 0);
      const fromRow = protocolNumber(anchor?.fromRow, 0);
      const toCol = Math.max(fromCol + 5, protocolNumber(anchor?.toCol, fromCol + 5));
      const toRow = Math.max(fromRow + 10, protocolNumber(anchor?.toRow, fromRow + 10));
      const left = spreadsheetColumnLeft(layout, fromCol) + spreadsheetEmuToPx(anchor?.fromColOffsetEmu);
      const top = spreadsheetRowTop(layout, fromRow) + spreadsheetEmuToPx(anchor?.fromRowOffsetEmu);
      const right = spreadsheetColumnLeft(layout, toCol) + spreadsheetEmuToPx(anchor?.toColOffsetEmu);
      const bottom = spreadsheetRowTop(layout, toRow) + spreadsheetEmuToPx(anchor?.toRowOffsetEmu);

      return chartFromRecord(chart, {
        height: chartDimension(bottom - top, 0, 220),
        left,
        top,
        width: chartDimension(right - left, 0, 360),
        zIndex: 10_000 + index,
      });
    })
    .filter((chart): chart is SpreadsheetChartSpec => chart != null);
}

function chartFromRecord(
  chart: RecordValue,
  bounds: { height: number; left: number; top: number; width: number; zIndex: number },
): SpreadsheetChartSpec | null {
  const seriesRecords = asArray(chart.series).map(asRecord).filter((item): item is RecordValue => item != null);
  const series = seriesRecords
    .map((item, index) => spreadsheetChartSeries(
      asString(item.label) || asString(item.name) || `Series ${index + 1}`,
      asArray(item.values).map((value) => protocolNumber(value, Number.NaN)).filter(Number.isFinite),
      index,
      protocolColorToCss(item.color),
      chartSeriesHasMarker(item),
      item,
    ))
    .filter((item) => item.values.length > 0);
  if (series.length === 0) return null;

  const categories = asArray(seriesRecords[0]?.categories).map(asString).filter(Boolean);
  const dataLabels = spreadsheetChartDataLabels(chart);
  return {
    categories: categories.length > 0 ? categories : series[0].values.map((_, index) => String(index + 1)),
    height: bounds.height,
    left: bounds.left,
    legendOverlay: spreadsheetLegendOverlay(chart.legend),
    legendPosition: spreadsheetLegendPosition(chart.legend),
    dataLabels,
    options: spreadsheetChartRendererOptions(chart),
    series,
    showDataLabels: dataLabels != null,
    title: asString(chart.title),
    top: bounds.top,
    type: spreadsheetChartType(chart),
    width: bounds.width,
    xAxis: spreadsheetChartAxis(chart.xAxis),
    secondaryYAxis: spreadsheetChartAxis(chart.secondaryYAxis ?? chart.y2Axis ?? chart.rightAxis),
    yAxis: spreadsheetChartAxis(chart.yAxis),
    zIndex: bounds.zIndex,
  };
}

function spreadsheetChartSeries(
  label: string,
  values: number[],
  index: number,
  color?: string,
  markerVisible = true,
  source?: RecordValue,
): SpreadsheetChartSeries {
  const seriesColor = color ?? chartPalette(index);
  const errorBars = source ? chartSeriesErrorBars(source, seriesColor) : undefined;
  return {
    axis: chartSeriesAxis(source),
    color: seriesColor,
    ...(errorBars ? { errorBars } : {}),
    label,
    marker: markerVisible ? (index % 2 === 0 ? "diamond" : "square") : null,
    trendlines: source ? chartSeriesTrendlines(source, seriesColor) : [],
    ...(source ? chartSeriesType(source) : {}),
    values,
  };
}

function chartSeriesAxis(series: RecordValue | undefined): SpreadsheetChartSeries["axis"] {
  if (!series) return "primary";
  if (series.useSecondaryAxis === true || series.secondaryAxis === true) return "secondary";
  const axis = asString(series.axis ?? series.axisId ?? series.yAxisId).toLowerCase();
  return axis === "2" || axis === "secondary" || axis === "right" ? "secondary" : "primary";
}

function chartSeriesType(series: RecordValue): Pick<SpreadsheetChartSeries, "type"> {
  if (series.chartType == null && series.type == null) return {};
  return { type: spreadsheetChartType(series) };
}

function chartSeriesHasMarker(series: RecordValue): boolean {
  return series.marker === true || asRecord(series.marker) != null;
}

function chartSeriesErrorBars(series: RecordValue, color: string): SpreadsheetChartErrorBars | undefined {
  const record = asRecord(series.errorBars) ?? asRecord(series.yErrorBars);
  if (!record) return undefined;
  const amount = protocolNumber(record.amount ?? record.value ?? record.fixedValue ?? record.val, Number.NaN);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const direction = asString(record.direction || record.type).toLowerCase();
  return {
    amount,
    color: protocolColorToCss(record.color) ?? color,
    direction: direction.includes("plus") ? "plus" : direction.includes("minus") ? "minus" : "both",
  };
}

function chartSeriesTrendlines(series: RecordValue, color: string): SpreadsheetChartTrendline[] {
  return recordList(series.trendlines ?? series.trendline)
    .map((record) => ({
      color: protocolColorToCss(record.color) ?? color,
      type: asString(record.type || record.name) || "linear",
    }));
}

function recordList(value: unknown): RecordValue[] {
  const records = asArray(value).map(asRecord).filter((record): record is RecordValue => record != null);
  const single = asRecord(value);
  return records.length > 0 ? records : single ? [single] : [];
}

function spreadsheetLegendPosition(value: unknown): SpreadsheetChartLegendPosition {
  const legend = asRecord(value);
  if (!legend) return "none";
  switch (asString(legend.position).toLowerCase()) {
    case "1":
    case "l":
    case "left":
      return "left";
    case "2":
    case "t":
    case "top":
      return "top";
    case "3":
    case "r":
    case "right":
      return "right";
    case "4":
    case "b":
    case "bottom":
      return "bottom";
    default:
      return "none";
  }
}

function spreadsheetLegendOverlay(value: unknown): boolean {
  const legend = asRecord(value);
  return legend?.overlay === true || asString(legend?.overlay).toLowerCase() === "true" || asString(legend?.overlay) === "1";
}

function spreadsheetChartDataLabels(chart: RecordValue): SpreadsheetChartDataLabels | undefined {
  if (chart.hasDataLabels === true || chart.dataLabels === true) {
    return {
      position: "bestFit",
      showCategoryName: false,
      showPercent: false,
      showSeriesName: false,
      showValue: true,
    };
  }

  const dataLabels = asRecord(chart.dataLabels);
  if (!dataLabels) return undefined;
  const spec = {
    position: spreadsheetChartDataLabelPosition(dataLabels.position ?? dataLabels.labelPosition ?? dataLabels.dLblPos),
    showCategoryName: chartBooleanFlag(dataLabels.showCategoryName ?? dataLabels.showCatName),
    showPercent: chartBooleanFlag(dataLabels.showPercent),
    showSeriesName: chartBooleanFlag(dataLabels.showSeriesName ?? dataLabels.showSerName),
    showValue: chartBooleanFlag(dataLabels.showValue ?? dataLabels.showVal ?? dataLabels.showBubbleSize),
  };
  return spec.showCategoryName || spec.showPercent || spec.showSeriesName || spec.showValue ? spec : undefined;
}

function spreadsheetChartDataLabelPosition(value: unknown): SpreadsheetChartDataLabelPosition {
  switch (asString(value).trim().toLowerCase()) {
    case "above":
      return "above";
    case "below":
      return "below";
    case "center":
    case "ctr":
      return "center";
    case "inend":
    case "insideend":
    case "insideEnd":
      return "insideEnd";
    case "outend":
    case "outsideend":
    case "outsideEnd":
      return "outsideEnd";
    case "bestfit":
    case "bestFit":
    default:
      return "bestFit";
  }
}

function spreadsheetChartType(chart: RecordValue): SpreadsheetChartType {
  const chartType = asString(chart.chartType ?? chart.type).toLowerCase();
  const chartTypeId = protocolNumber(chart.type, 0);
  if (chartType === "area" || chartTypeId === 2) return "area";
  if (chartType === "bubble" || chartTypeId === 5) return "bubble";
  if (chartType === "doughnut" || chartTypeId === 8) return "doughnut";
  if (chartType === "line" || chartTypeId === 13) return "line";
  if (chartType === "pie" || chartTypeId === 16) return "pie";
  if (chartType === "radar" || chartTypeId === 17) return "radar";
  if (chartType === "scatter" || chartTypeId === 18) return "scatter";
  if (chartType === "surface" || chartTypeId === 22) return "surface";
  return "bar";
}

function spreadsheetChartAxis(value: unknown): SpreadsheetChartAxisSpec | undefined {
  const axis = asRecord(value);
  if (!axis) return undefined;
  const scaling = asRecord(axis.scaling) ?? {};

  return {
    majorGridLines: axis.majorGridLines === true || asRecord(axis.majorGridLines) != null,
    majorUnit: optionalProtocolNumber(axis.majorUnit ?? scaling.majorUnit),
    maximum: optionalProtocolNumber(axis.maximum ?? axis.max ?? scaling.maximum ?? scaling.max),
    minimum: optionalProtocolNumber(axis.minimum ?? axis.min ?? scaling.minimum ?? scaling.min),
    numberFormat: asString(axis.numberFormat),
    position: asString(axis.position ?? axis.axisPosition),
    ...(asString(axis.title) ? { title: asString(axis.title) } : {}),
  };
}

function chartDimension(exactValue: number, fallbackValue: number, minimum: number): number {
  if (Number.isFinite(exactValue) && exactValue > 0) return Math.max(24, exactValue);
  if (Number.isFinite(fallbackValue) && fallbackValue > 0) return Math.max(24, fallbackValue);
  return minimum;
}

function optionalProtocolNumber(value: unknown): number | undefined {
  const number = protocolNumber(value, Number.NaN);
  return Number.isFinite(number) ? number : undefined;
}

function protocolNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
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

function cellAt(sheet: RecordValue | undefined, rowIndex: number, columnIndex: number): RecordValue | null {
  return rowsByIndexForSheet(sheet).get(rowIndex)?.get(columnIndex) ?? null;
}

function cellNumberAt(sheet: RecordValue | undefined, rowIndex: number, columnIndex: number): number | null {
  const text = cellText(cellAt(sheet, rowIndex, columnIndex)).trim();
  if (text.length === 0) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function chartBooleanFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value === 1;
  const normalized = asString(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function excelSerialMonthLabel(value: number): string {
  const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC", year: "2-digit" }).format(date);
}

export function SpreadsheetChartLayer({ charts }: { charts: SpreadsheetChartSpec[] }) {
  if (charts.length === 0) return null;

  return (
    <div aria-hidden="true" style={{ inset: 0, pointerEvents: "none", position: "absolute" }}>
      {charts.map((chart, index) => (
        <SpreadsheetCanvasChart chart={chart} key={`${chart.type}-${chart.title}-${index}`} />
      ))}
    </div>
  );
}

function SpreadsheetCanvasChart({ chart }: { chart: SpreadsheetChartSpec }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(chart.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(chart.height * pixelRatio));
    canvas.style.width = `${chart.width}px`;
    canvas.style.height = `${chart.height}px`;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, chart.width, chart.height);
    drawSpreadsheetChart(context, chart);
  }, [chart]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        background: "#ffffff",
        borderColor: "#e5e7eb",
        borderStyle: "solid",
        borderWidth: 1,
        height: chart.height,
        left: chart.left,
        position: "absolute",
        top: chart.top,
        width: chart.width,
        zIndex: chart.zIndex,
      }}
      title={chart.title}
    />
  );
}

function drawSpreadsheetChart(context: CanvasRenderingContext2D, chart: SpreadsheetChartSpec) {
  const width = chart.width;
  const height = chart.height;
  const plot = spreadsheetChartPlotArea(chart);
  const values = chart.series.flatMap((series) => series.values);
  const primaryValues = chart.series.filter((series) => series.axis !== "secondary").flatMap((series) => series.values);
  const secondaryValues = chart.series.filter((series) => series.axis === "secondary").flatMap((series) => series.values);
  const ticks = spreadsheetChartTickValues(chart, primaryValues.length > 0 ? primaryValues : values);
  const secondaryTicks = secondaryValues.length > 0
    ? spreadsheetChartTickValues({ ...chart, yAxis: chart.secondaryYAxis ?? chart.yAxis }, secondaryValues)
    : [];
  const primaryScale = chartScaleFromTicks(ticks);
  const secondaryScale = secondaryTicks.length > 0 ? chartScaleFromTicks(secondaryTicks) : undefined;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  drawSpreadsheetChartFrame(context, chart, plot);
  context.fillStyle = "#111827";
  context.font = spreadsheetChartCanvasFont("title");
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillText(chart.title, width / 2, 34);

  if (isCartesianChart(chart.type)) {
    drawChartGrid(context, chart, plot, ticks, secondaryTicks);
  }

  if (isComboChart(chart)) {
    drawComboChart(context, chart, plot, primaryScale, secondaryScale);
  } else {
    switch (chart.type) {
    case "area":
    case "surface":
      drawAreaChart(context, chart, plot, primaryScale.minValue, primaryScale.maxValue);
      break;
    case "bubble":
      drawScatterChart(context, chart, plot, primaryScale.minValue, primaryScale.maxValue, true);
      break;
    case "doughnut":
      drawPieChart(context, chart, plot, true);
      break;
    case "line":
      drawLineChart(context, chart, plot, primaryScale, secondaryScale);
      break;
    case "pie":
      drawPieChart(context, chart, plot, false);
      break;
    case "radar":
      drawRadarChart(context, chart, plot, ticks);
      break;
    case "scatter":
      drawScatterChart(context, chart, plot, primaryScale.minValue, primaryScale.maxValue, false);
      break;
    case "bar":
    default:
      drawBarChart(context, chart, plot, primaryScale.minValue, primaryScale.maxValue);
      break;
    }
  }

  if (chart.showDataLabels) {
    drawChartDataLabels(context, chart, plot, primaryScale.minValue, primaryScale.maxValue);
  }
  drawChartLegend(context, chart, plot);
}

function isComboChart(chart: SpreadsheetChartSpec): boolean {
  return chart.series.some((series) => series.type != null && series.type !== chart.type);
}

function drawComboChart(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  primaryScale: SpreadsheetChartScale,
  secondaryScale?: SpreadsheetChartScale,
) {
  const barSeries = chart.series.filter((series) => effectiveSeriesType(series, chart) === "bar");
  const lineSeries = chart.series.filter((series) => effectiveSeriesType(series, chart) === "line");

  if (barSeries.length > 0) {
    drawBarChart(
      context,
      { ...chart, categories: lineSeries.length > 0 ? [] : chart.categories, series: barSeries, type: "bar" },
      plot,
      primaryScale.minValue,
      primaryScale.maxValue,
    );
  }

  if (lineSeries.length > 0) {
    drawLineChart(context, { ...chart, series: lineSeries, type: "line" }, plot, primaryScale, secondaryScale);
  }
}

function effectiveSeriesType(series: SpreadsheetChartSeries, chart: SpreadsheetChartSpec): SpreadsheetChartType {
  return series.type ?? chart.type;
}

function chartScaleFromTicks(ticks: number[]): SpreadsheetChartScale {
  return {
    maxValue: ticks[ticks.length - 1] ?? 1,
    minValue: ticks[0] ?? 0,
  };
}

export function spreadsheetChartPlotArea(chart: SpreadsheetChartSpec): SpreadsheetChartPlotArea {
  const reservesLegendSpace = chart.legendPosition !== "none" && !chart.legendOverlay;
  const hasBottomLegend = reservesLegendSpace && chart.legendPosition === "bottom";
  const hasTopLegend = reservesLegendSpace && chart.legendPosition === "top";
  const hasLeftLegend = reservesLegendSpace && chart.legendPosition === "left";
  const hasRightLegend = reservesLegendSpace && chart.legendPosition === "right";
  const hasSecondaryAxis = chart.series.some((series) => series.axis === "secondary");
  const categoryLabelHeight = isLineAxisChart(chart.type) ? 46 : isCircularChart(chart.type) || chart.type === "radar" ? 8 : 30;
  const legendHeight = hasBottomLegend ? 42 : 0;
  const top = (chart.title ? 58 : 24) + (hasTopLegend ? 28 : 0);
  const bottom = Math.max(top + 48, chart.height - categoryLabelHeight - legendHeight);
  const leftBase = isLineAxisChart(chart.type) ? 64 : isCircularChart(chart.type) || chart.type === "radar" ? 28 : 52;
  const rightBase = hasRightLegend ? 126 : 22;
  const primaryValues = chart.series.filter((series) => series.axis !== "secondary").flatMap((series) => series.values);
  const secondaryValues = chart.series.filter((series) => series.axis === "secondary").flatMap((series) => series.values);
  const leftAxisGutter = isCircularChart(chart.type) || chart.type === "radar"
    ? leftBase
    : Math.max(leftBase, spreadsheetChartAxisGutter(chart, chart.yAxis, primaryValues));
  const rightAxisGutter = hasSecondaryAxis
    ? Math.max(42, spreadsheetChartAxisGutter(chart, chart.secondaryYAxis ?? chart.yAxis, secondaryValues, 10))
    : 0;

  return {
    bottom,
    left: leftAxisGutter + (hasLeftLegend ? 108 : 0),
    right: chart.width - rightBase - rightAxisGutter,
    top,
  };
}

function spreadsheetChartAxisGutter(
  chart: SpreadsheetChartSpec,
  axis: SpreadsheetChartAxisSpec | undefined,
  values: number[],
  padding = 18,
): number {
  const ticks = spreadsheetChartTickValues({ ...chart, yAxis: axis }, values);
  const maxLabelLength = Math.max(
    1,
    ...ticks.map((value) => formatChartTick(value, axis?.numberFormat).length),
  );
  return Math.ceil(maxLabelLength * spreadsheetChartTextWidth("0", "axisLabel") + padding);
}

function drawChartGrid(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  ticks: number[],
  secondaryTicks: number[] = [],
) {
  context.save();
  context.strokeStyle = "#c7c7c7";
  context.setLineDash([5, 5]);
  context.lineWidth = 1;
  context.fillStyle = "#737373";
  context.font = spreadsheetChartCanvasFont("axisLabel");
  context.textAlign = "right";
  context.textBaseline = "middle";

  const minValue = ticks[0] ?? 0;
  const maxValue = ticks[ticks.length - 1] ?? 1;
  const showHorizontalGrid = chart.yAxis?.majorGridLines !== false;
  for (const value of ticks) {
    const y = chartY(value, plot, minValue, maxValue);
    if (showHorizontalGrid) {
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
    }

    context.fillText(formatChartTick(value, chart.yAxis?.numberFormat), plot.left - 8, y);
  }

  if (isLineAxisChart(chart.type) && chart.categories.length > 0) {
    const pointCount = Math.max(1, chart.categories.length - 1);
    for (let index = 0; index < chart.categories.length; index += 1) {
      const x = plot.left + (index / pointCount) * (plot.right - plot.left);
      context.beginPath();
      context.moveTo(x, plot.top);
      context.lineTo(x, plot.bottom);
      context.stroke();
    }
  }

  context.setLineDash([]);
  context.strokeStyle = "#111827";
  context.beginPath();
  context.moveTo(plot.left, plot.top);
  context.lineTo(plot.left, plot.bottom);
  const axisY = spreadsheetChartZeroBaselineY(plot, minValue, maxValue);
  context.moveTo(plot.left, axisY);
  context.lineTo(plot.right, axisY);
  context.stroke();

  drawSecondaryChartAxis(context, chart, plot, secondaryTicks);
  drawChartAxisTitles(context, chart, plot);
  context.restore();
}

function drawSecondaryChartAxis(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  ticks: number[],
) {
  if (ticks.length === 0) return;
  const minValue = ticks[0] ?? 0;
  const maxValue = ticks[ticks.length - 1] ?? 1;

  context.save();
  context.strokeStyle = "#111827";
  context.beginPath();
  context.moveTo(plot.right, plot.top);
  context.lineTo(plot.right, plot.bottom);
  context.stroke();

  context.fillStyle = "#737373";
  context.font = spreadsheetChartCanvasFont("axisLabel");
  context.textAlign = "left";
  context.textBaseline = "middle";
  for (const value of ticks) {
    context.fillText(
      formatChartTick(value, chart.secondaryYAxis?.numberFormat),
      plot.right + 8,
      chartY(value, plot, minValue, maxValue),
    );
  }
  context.restore();
}

function drawChartAxisTitles(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
) {
  context.save();
  context.fillStyle = "#4b5563";
  context.font = spreadsheetChartCanvasFont("axisTitle");
  context.textAlign = "center";
  context.textBaseline = "middle";

  if (chart.yAxis?.title) {
    context.save();
    context.translate(14, (plot.top + plot.bottom) / 2);
    context.rotate(-Math.PI / 2);
    context.fillText(chart.yAxis.title, 0, 0);
    context.restore();
  }

  if (chart.xAxis?.title) {
    const offset = isLineAxisChart(chart.type) ? 48 : 38;
    context.fillText(chart.xAxis.title, (plot.left + plot.right) / 2, plot.bottom + offset);
  }

  context.restore();
}

function drawBarChart(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  minValue: number,
  maxValue: number,
) {
  context.save();
  const baselineY = spreadsheetChartZeroBaselineY(plot, minValue, maxValue);
  spreadsheetBarChartGeometry(chart, plot).forEach(({ barWidth, categoryIndex, centerX, series, value }) => {
    const y = chartY(value, plot, minValue, maxValue);
    const top = Math.min(y, baselineY);
    const height = Math.max(1, Math.abs(baselineY - y));
    context.fillStyle = chart.options?.varyColors && chart.series.length === 1
      ? chartPalette(categoryIndex)
      : series.color;
    context.beginPath();
    context.roundRect(centerX - barWidth / 2, top, barWidth, height, 3);
    context.fill();
  });

  context.fillStyle = "#737373";
  context.font = spreadsheetChartCanvasFont("axisLabel");
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  const slotWidth = (plot.right - plot.left) / barChartCategoryCount(chart);
  chart.categories.forEach((category, index) => {
    const centerX = plot.left + slotWidth * index + slotWidth / 2;
    context.fillText(category, centerX, plot.bottom + 20);
  });
  context.restore();
}

export function spreadsheetBarChartGeometry(
  chart: SpreadsheetChartSpec,
  plot: Pick<SpreadsheetChartPlotArea, "left" | "right">,
): SpreadsheetBarGeometry[] {
  const categoryCount = barChartCategoryCount(chart);
  const visibleSeries = chart.series.filter((series) => series.values.length > 0);
  const seriesCount = Math.max(1, visibleSeries.length);
  const slotWidth = (plot.right - plot.left) / categoryCount;
  const gapWidth = Math.max(0, Math.min(500, chart.options?.barGapWidth ?? 150));
  const overlap = Math.max(-100, Math.min(100, chart.options?.barOverlap ?? 0)) / 100;
  const groupWidth = Math.min(slotWidth * 0.92, slotWidth / (1 + gapWidth / 100));
  const rawBarWidth = groupWidth / (seriesCount - overlap * Math.max(0, seriesCount - 1));
  const barStep = rawBarWidth * (1 - overlap);
  const barWidth = Math.max(3, Math.min(48, rawBarWidth));
  const bars: SpreadsheetBarGeometry[] = [];

  for (let categoryIndex = 0; categoryIndex < categoryCount; categoryIndex += 1) {
    const categoryCenter = plot.left + slotWidth * categoryIndex + slotWidth / 2;
    visibleSeries.forEach((series, seriesIndex) => {
      const value = series.values[categoryIndex];
      if (!Number.isFinite(value)) return;
      const centerX = categoryCenter + (seriesIndex - (seriesCount - 1) / 2) * barStep;
      bars.push({ barWidth, categoryIndex, centerX, series, value });
    });
  }

  return bars;
}

function barChartCategoryCount(chart: SpreadsheetChartSpec): number {
  return Math.max(1, chart.categories.length, ...chart.series.map((series) => series.values.length));
}

function drawLineChart(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  primaryScale: SpreadsheetChartScale,
  secondaryScale?: SpreadsheetChartScale,
) {
  const pointCount = Math.max(1, chart.categories.length - 1);
  const xForIndex = (index: number) => plot.left + (index / pointCount) * (plot.right - plot.left);
  const scaleForSeries = (series: SpreadsheetChartSeries) => (
    series.axis === "secondary" && secondaryScale ? secondaryScale : primaryScale
  );

  context.save();
  chart.series.forEach((series) => {
    const scale = scaleForSeries(series);
    context.strokeStyle = series.color;
    context.lineWidth = SPREADSHEET_CHART_LINE_WIDTH;
    context.setLineDash([]);
    context.beginPath();
    series.values.forEach((value, index) => {
      const x = xForIndex(index);
      const y = chartY(value, plot, scale.minValue, scale.maxValue);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    drawLineSeriesErrorBars(context, series, xForIndex, plot, scale);
    drawLineSeriesTrendlines(context, series, xForIndex, plot, scale);
  });

  context.fillStyle = "#737373";
  context.font = spreadsheetChartCanvasFont("axisLabel");
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  chart.categories.forEach((category, index) => {
    const x = xForIndex(index);
    const [first, ...rest] = category.split(/\s+/);
    context.fillText(first, x, plot.bottom + 20);
    if (rest.length > 0) {
      context.fillText(rest.join(" "), x, plot.bottom + 36);
    }
  });

  chart.series.forEach((series) => {
    if (!series.marker) return;
    const scale = scaleForSeries(series);
    context.fillStyle = series.color;
    series.values.forEach((value, index) => {
      const x = xForIndex(index);
      const y = chartY(value, plot, scale.minValue, scale.maxValue);
      context.beginPath();
      if (series.marker === "diamond") {
        context.moveTo(x, y - SPREADSHEET_CHART_MARKER_RADIUS);
        context.lineTo(x + SPREADSHEET_CHART_MARKER_RADIUS, y);
        context.lineTo(x, y + SPREADSHEET_CHART_MARKER_RADIUS);
        context.lineTo(x - SPREADSHEET_CHART_MARKER_RADIUS, y);
      } else {
        context.rect(x - SPREADSHEET_CHART_MARKER_RADIUS, y - SPREADSHEET_CHART_MARKER_RADIUS, SPREADSHEET_CHART_MARKER_RADIUS * 2, SPREADSHEET_CHART_MARKER_RADIUS * 2);
      }
      context.closePath();
      context.fill();
    });
  });
  context.restore();
}

function drawLineSeriesErrorBars(
  context: CanvasRenderingContext2D,
  series: SpreadsheetChartSeries,
  xForIndex: (index: number) => number,
  plot: SpreadsheetChartPlotArea,
  scale: SpreadsheetChartScale,
) {
  const errorBars = series.errorBars;
  if (!errorBars) return;

  context.save();
  context.strokeStyle = errorBars.color;
  context.lineWidth = 1;
  series.values.forEach((value, index) => {
    const x = xForIndex(index);
    const y = chartY(value, plot, scale.minValue, scale.maxValue);
    const top = errorBars.direction === "minus" ? y : chartY(value + errorBars.amount, plot, scale.minValue, scale.maxValue);
    const bottom = errorBars.direction === "plus" ? y : chartY(value - errorBars.amount, plot, scale.minValue, scale.maxValue);
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.moveTo(x - 4, top);
    context.lineTo(x + 4, top);
    context.moveTo(x - 4, bottom);
    context.lineTo(x + 4, bottom);
    context.stroke();
  });
  context.restore();
}

function drawLineSeriesTrendlines(
  context: CanvasRenderingContext2D,
  series: SpreadsheetChartSeries,
  xForIndex: (index: number) => number,
  plot: SpreadsheetChartPlotArea,
  scale: SpreadsheetChartScale,
) {
  if (series.trendlines.length === 0 || series.values.length < 2) return;
  const regression = linearRegression(series.values);
  if (!regression) return;
  const firstIndex = 0;
  const lastIndex = series.values.length - 1;

  context.save();
  context.lineWidth = 1.5;
  context.setLineDash([6, 4]);
  for (const trendline of series.trendlines) {
    context.strokeStyle = trendline.color;
    context.beginPath();
    context.moveTo(xForIndex(firstIndex), chartY(regression.intercept, plot, scale.minValue, scale.maxValue));
    context.lineTo(
      xForIndex(lastIndex),
      chartY(regression.slope * lastIndex + regression.intercept, plot, scale.minValue, scale.maxValue),
    );
    context.stroke();
  }
  context.restore();
}

function linearRegression(values: number[]): { intercept: number; slope: number } | null {
  const points = values
    .map((value, index) => ({ value, x: index }))
    .filter((point) => Number.isFinite(point.value));
  if (points.length < 2) return null;

  const count = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.value, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.value, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = count * sumXX - sumX * sumX;
  if (denominator === 0) return null;
  const slope = (count * sumXY - sumX * sumY) / denominator;
  return {
    intercept: (sumY - slope * sumX) / count,
    slope,
  };
}

function drawAreaChart(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  minValue: number,
  maxValue: number,
) {
  const pointCount = Math.max(1, chart.categories.length - 1);
  const xForIndex = (index: number) => plot.left + (index / pointCount) * (plot.right - plot.left);

  context.save();
  const baselineY = spreadsheetChartZeroBaselineY(plot, minValue, maxValue);
  chart.series.forEach((series) => {
    context.beginPath();
    series.values.forEach((value, index) => {
      const x = xForIndex(index);
      const y = chartY(value, plot, minValue, maxValue);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.lineTo(xForIndex(Math.max(0, series.values.length - 1)), baselineY);
    context.lineTo(xForIndex(0), baselineY);
    context.closePath();
    context.globalAlpha = 0.22;
    context.fillStyle = series.color;
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = series.color;
    context.lineWidth = 2;
    context.stroke();
  });
  drawLineCategoryLabels(context, chart, plot);
  context.restore();
}

function drawPieChart(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  isDoughnut: boolean,
) {
  const values = chart.series[0]?.values.map((value) => Math.max(0, value)) ?? [];
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return;

  const centerX = (plot.left + plot.right) / 2;
  const centerY = (plot.top + plot.bottom) / 2;
  const radius = Math.max(12, Math.min(plot.right - plot.left, plot.bottom - plot.top) * 0.42);
  let startAngle = ((chart.options?.firstSliceAngle ?? 0) - 90) * Math.PI / 180;

  context.save();
  values.forEach((value, index) => {
    const angle = (value / total) * Math.PI * 2;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, startAngle, startAngle + angle);
    context.closePath();
    context.fillStyle = chartPalette(index);
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.stroke();
    startAngle += angle;
  });

  if (isDoughnut) {
    const holeSize = Math.max(10, Math.min(90, chart.options?.holeSize ?? 55));
    context.beginPath();
    context.arc(centerX, centerY, radius * (holeSize / 100), 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
  }
  context.restore();
}

function drawScatterChart(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  minValue: number,
  maxValue: number,
  isBubble: boolean,
) {
  const xValues = chart.categories.map((category, index) => {
    const numeric = Number(category);
    return Number.isFinite(numeric) ? numeric : index + 1;
  });
  const minX = Math.min(...xValues, 0);
  const maxX = Math.max(...xValues, 1);
  const xForValue = (value: number) => {
    if (maxX <= minX) return plot.left;
    return plot.left + ((value - minX) / (maxX - minX)) * (plot.right - plot.left);
  };

  context.save();
  chart.series.forEach((series) => {
    context.fillStyle = series.color;
    series.values.forEach((value, index) => {
      const x = xForValue(xValues[index] ?? index + 1);
      const y = chartY(value, plot, minValue, maxValue);
      const radius = isBubble ? 7 : 5;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1;
      context.stroke();
    });
  });
  drawLineCategoryLabels(context, chart, plot);
  context.restore();
}

function drawRadarChart(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  ticks: number[],
) {
  const axisCount = Math.max(3, chart.categories.length, ...chart.series.map((series) => series.values.length));
  const maxValue = ticks[ticks.length - 1] ?? Math.max(...chart.series.flatMap((series) => series.values), 1);
  const centerX = (plot.left + plot.right) / 2;
  const centerY = (plot.top + plot.bottom) / 2;
  const radius = Math.max(12, Math.min(plot.right - plot.left, plot.bottom - plot.top) * 0.42);
  const pointFor = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index / axisCount) * Math.PI * 2;
    const ratio = maxValue > 0 ? Math.max(0, value) / maxValue : 0;
    return {
      x: centerX + Math.cos(angle) * radius * ratio,
      y: centerY + Math.sin(angle) * radius * ratio,
    };
  };
  const axisPoint = (index: number) => pointFor(index, maxValue);

  context.save();
  context.strokeStyle = "#d1d5db";
  context.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring += 1) {
    context.beginPath();
    for (let index = 0; index < axisCount; index += 1) {
      const point = pointFor(index, (maxValue * ring) / 4);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.closePath();
    context.stroke();
  }

  context.fillStyle = "#737373";
  context.font = spreadsheetChartCanvasFont("axisLabel");
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let index = 0; index < axisCount; index += 1) {
    const point = axisPoint(index);
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(point.x, point.y);
    context.stroke();
    const label = chart.categories[index];
    if (label) {
      context.fillText(label, point.x, point.y);
    }
  }

  chart.series.forEach((series) => {
    context.beginPath();
    series.values.forEach((value, index) => {
      const point = pointFor(index, value);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.globalAlpha = 0.16;
    context.fillStyle = series.color;
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = series.color;
    context.lineWidth = 2;
    context.stroke();
  });
  context.restore();
}

function drawLineCategoryLabels(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
) {
  const pointCount = Math.max(1, chart.categories.length - 1);
  const xForIndex = (index: number) => plot.left + (index / pointCount) * (plot.right - plot.left);

  context.fillStyle = "#737373";
  context.font = spreadsheetChartCanvasFont("axisLabel");
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  chart.categories.forEach((category, index) => {
    const x = xForIndex(index);
    const [first, ...rest] = category.split(/\s+/);
    context.fillText(first, x, plot.bottom + 20);
    if (rest.length > 0) {
      context.fillText(rest.join(" "), x, plot.bottom + 36);
    }
  });
}

function drawChartDataLabels(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  minValue: number,
  maxValue: number,
) {
  context.save();
  context.fillStyle = "#374151";
  context.font = spreadsheetChartCanvasFont("dataLabel");
  context.textAlign = "center";
  context.textBaseline = "middle";

  if (isCircularChart(chart.type)) {
    drawCircularDataLabels(context, chart, plot);
  } else if (chart.type === "bar") {
    drawBarDataLabels(context, chart, plot, minValue, maxValue);
  } else if (isLineAxisChart(chart.type)) {
    drawLineDataLabels(context, chart, plot, minValue, maxValue);
  }

  context.restore();
}

function drawLineDataLabels(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  minValue: number,
  maxValue: number,
) {
  const pointCount = Math.max(1, chart.categories.length - 1);
  const xForIndex = (index: number) => plot.left + (index / pointCount) * (plot.right - plot.left);
  chart.series.forEach((series) => {
    series.values.forEach((value, index) => {
      const pointY = chartY(value, plot, minValue, maxValue);
      const offset = chartDataLabelPointOffset(chart.dataLabels?.position ?? "above");
      const label = chartDataLabelText(chart, series, value, index);
      if (label) context.fillText(label, xForIndex(index), pointY + offset);
    });
  });
}

function drawBarDataLabels(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
  minValue: number,
  maxValue: number,
) {
  spreadsheetBarChartGeometry(chart, plot).forEach(({ categoryIndex, centerX, series, value }) => {
    const y = chartY(value, plot, minValue, maxValue);
    const baselineY = spreadsheetChartZeroBaselineY(plot, minValue, maxValue);
    const label = chartDataLabelText(chart, series, value, categoryIndex);
    if (!label) return;
    const position = chart.dataLabels?.position ?? "outsideEnd";
    const top = Math.min(y, baselineY);
    const bottom = Math.max(y, baselineY);
    const labelY = position === "center"
      ? top + (bottom - top) / 2
      : position === "insideEnd"
        ? value >= 0 ? top + 12 : bottom - 12
        : value >= 0 ? Math.max(plot.top + 10, top - 12) : Math.min(plot.bottom - 10, bottom + 12);
    context.fillText(label, centerX, labelY);
  });
}

function drawCircularDataLabels(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
) {
  const values = chart.series[0]?.values.map((value) => Math.max(0, value)) ?? [];
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return;
  const centerX = (plot.left + plot.right) / 2;
  const centerY = (plot.top + plot.bottom) / 2;
  const radius = Math.max(12, Math.min(plot.right - plot.left, plot.bottom - plot.top) * 0.32);
  let startAngle = -Math.PI / 2;
  values.forEach((value, index) => {
    const angle = (value / total) * Math.PI * 2;
    const midAngle = startAngle + angle / 2;
    const label = chartDataLabelText(chart, chart.series[0], value, index, total) ||
      chart.categories[index] ||
      formatChartTick(value, chart.yAxis?.numberFormat);
    context.fillText(label, centerX + Math.cos(midAngle) * radius, centerY + Math.sin(midAngle) * radius);
    startAngle += angle;
  });
}

function chartDataLabelPointOffset(position: SpreadsheetChartDataLabelPosition): number {
  if (position === "below") return 14;
  if (position === "center") return 0;
  return -14;
}

function chartDataLabelText(
  chart: SpreadsheetChartSpec,
  series: SpreadsheetChartSeries | undefined,
  value: number,
  index: number,
  total?: number,
): string {
  const labels = chart.dataLabels;
  if (!labels) return "";
  const parts: string[] = [];
  if (labels.showSeriesName && series?.label) parts.push(series.label);
  if (labels.showCategoryName && chart.categories[index]) parts.push(chart.categories[index] ?? "");
  if (labels.showValue) parts.push(formatChartTick(value, chart.yAxis?.numberFormat));
  if (labels.showPercent && total != null && total > 0) parts.push(`${Math.round((value / total) * 100)}%`);
  return parts.join(" ");
}

function drawChartLegend(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartSpec,
  plot: SpreadsheetChartPlotArea,
) {
  if (chart.legendPosition === "none") return;
  const items = chartLegendItems(chart);

  context.save();
  if (chart.legendPosition === "right") {
    let legendY = plot.top + 18;
    const legendX = plot.right + 18;
    items.forEach((item) => {
      drawLegendEntry(context, item, legendX, legendY);
      legendY += 20;
    });
    context.restore();
    return;
  }

  if (chart.legendPosition === "left") {
    let legendY = plot.top + 18;
    const legendX = 18;
    items.forEach((item) => {
      drawLegendEntry(context, item, legendX, legendY);
      legendY += 20;
    });
    context.restore();
    return;
  }

  const legendY = chart.legendPosition === "top" ? 48 : chart.height - 18;
  spreadsheetChartHorizontalLegendLayout(chart.width, legendY, items).forEach((entry) => {
    drawLegendEntry(context, entry.item, entry.x, entry.y);
  });
  context.restore();
}

export function spreadsheetChartHorizontalLegendLayout(
  chartWidth: number,
  y: number,
  items: SpreadsheetChartLegendItem[],
): SpreadsheetChartLegendEntryLayout[] {
  const widths = items.map(spreadsheetChartLegendItemWidth);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  let x = Math.max(12, chartWidth / 2 - totalWidth / 2);
  return items.map((item, index) => {
    const entry = { item, x, y };
    x += widths[index] ?? 0;
    return entry;
  });
}

function spreadsheetChartLegendItemWidth(item: SpreadsheetChartLegendItem): number {
  return Math.max(64, 34 + spreadsheetChartTextWidth(item.label, "legend") + 18);
}

function chartLegendItems(chart: SpreadsheetChartSpec): SpreadsheetChartLegendItem[] {
  if (isCircularChart(chart.type)) {
    return chart.categories.map((label, index) => ({
      color: chartPalette(index),
      label,
      marker: "square",
      showLine: false,
    }));
  }

  return chart.series.map((series) => ({
    color: series.color,
    label: series.label,
    marker: series.marker,
    showLine: true,
  }));
}

function drawLegendEntry(
  context: CanvasRenderingContext2D,
  item: SpreadsheetChartLegendItem,
  x: number,
  y: number,
) {
  context.strokeStyle = item.color;
  context.lineWidth = SPREADSHEET_CHART_LINE_WIDTH;
  context.fillStyle = item.color;
  if (item.showLine) {
    context.beginPath();
    context.moveTo(x, y - 4);
    context.lineTo(x + 18, y - 4);
    context.stroke();
    if (item.marker) drawChartMarker(context, item.marker, x + 9, y - 4, SPREADSHEET_CHART_MARKER_RADIUS);
  } else {
    context.fillRect(x, y - 10, 12, 12);
  }

  context.fillStyle = "#737373";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = spreadsheetChartCanvasFont("legend");
  context.fillText(item.label, x + 26, y);
}

function drawChartMarker(
  context: CanvasRenderingContext2D,
  marker: SpreadsheetChartSeries["marker"],
  x: number,
  y: number,
  radius: number,
) {
  context.beginPath();
  if (marker === "diamond") {
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y);
    context.lineTo(x, y + radius);
    context.lineTo(x - radius, y);
  } else {
    context.rect(x - radius, y - radius, radius * 2, radius * 2);
  }
  context.closePath();
  context.fill();
}

function isCartesianChart(type: SpreadsheetChartType): boolean {
  return type === "area" || type === "bar" || type === "bubble" || type === "line" || type === "scatter" || type === "surface";
}

function isLineAxisChart(type: SpreadsheetChartType): boolean {
  return type === "area" || type === "bubble" || type === "line" || type === "scatter" || type === "surface";
}

function isCircularChart(type: SpreadsheetChartType): boolean {
  return type === "doughnut" || type === "pie";
}

function chartPalette(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length] ?? "#1f6f8b";
}

export function formatChartTick(value: number, numberFormat = ""): string {
  const normalized = numberFormat.toLowerCase();
  if (normalized.includes("%")) {
    const decimals = chartFormatDecimalPlaces(numberFormat);
    return `${(value * 100).toFixed(decimals)}%`;
  }

  if (numberFormat.includes("$")) {
    const decimals = chartFormatDecimalPlaces(numberFormat);
    const formatted = Math.abs(value).toLocaleString("en-US", {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    });
    return `${value < 0 ? "-" : ""}$${formatted}`;
  }

  if (numberFormat.includes("#,##0.00")) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }

  if (numberFormat.includes("#,##0")) {
    return Math.round(value).toLocaleString("en-US");
  }

  if (/^0\.0+$/.test(numberFormat)) {
    return value.toFixed(chartFormatDecimalPlaces(numberFormat));
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function chartFormatDecimalPlaces(numberFormat: string): number {
  return numberFormat.match(/\.([0#]+)/)?.[1]?.length ?? 0;
}

export { spreadsheetChartTickValues } from "./spreadsheet-chart-scale";
