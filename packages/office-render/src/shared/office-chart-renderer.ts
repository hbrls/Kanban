import {
  asArray,
  asNumber,
  asRecord,
  asString,
  colorToCss,
  fillToCss,
  type RecordValue,
} from "./office-preview-utils";

export type OfficeChartRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

const PRESENTATION_CHART_COLORS = ["#156082", "#E97132", "#196B24", "#0F9ED5", "#A02B93", "#4EA72E"];

type ChartSeries = {
  categories: string[];
  color: string;
  errorBars?: ChartErrorBars;
  name: string;
  trendlines: ChartTrendline[];
  values: number[];
};

type ChartErrorBars = {
  amount: number;
  color: string;
  direction: "both" | "minus" | "plus";
};

type ChartTrendline = {
  color: string;
  type: string;
};

type ChartPlot = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type ChartRenderOptions = {
  showDataLabels: boolean;
  showMajorGridlines: boolean;
  xAxisTitle: string;
  yAxisTitle: string;
};

export function presentationChartById(charts: RecordValue[], id: string): RecordValue | null {
  if (!id) return null;
  return charts.find((chart) => presentationChartId(chart) === id) ?? null;
}

export function presentationChartId(chart: RecordValue): string {
  return (
    asString(chart.id) ||
    asString(chart.uri) ||
    asString(chart.chartId) ||
    asString(chart.relationshipId) ||
    asString(chart.name)
  );
}

export function presentationChartReferenceId(value: unknown): string {
  const record = asRecord(value);
  return (
    asString(record?.id) ||
    asString(record?.chartId) ||
    asString(record?.relationshipId) ||
    asString(record?.referenceId) ||
    asString(record?.ref)
  );
}

export function drawPresentationChart(
  context: CanvasRenderingContext2D,
  chart: RecordValue,
  rect: OfficeChartRect,
  slideScale: number,
): void {
  context.save();
  context.beginPath();
  context.rect(0, 0, rect.width, rect.height);
  context.clip();

  context.fillStyle = "rgba(255, 255, 255, 0.86)";
  context.fillRect(0, 0, rect.width, rect.height);
  context.strokeStyle = "rgba(203, 213, 225, 0.9)";
  context.lineWidth = Math.max(1, slideScale);
  context.strokeRect(0, 0, rect.width, rect.height);

  const title = asString(chart.title);
  const titleHeight = title ? Math.max(18, 20 * slideScale) : 0;
  if (title) {
    context.fillStyle = "#111827";
    context.font = `600 ${Math.max(10, 14 * slideScale)}px Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillText(title, rect.width / 2, Math.max(4, 8 * slideScale), Math.max(1, rect.width - 16));
  }

  const series = presentationChartSeries(chart);
  if (series.length === 0) {
    context.restore();
    return;
  }

  const options = presentationChartOptions(chart);
  const leftReserve = Math.max(22, 38 * slideScale) + (options.yAxisTitle ? Math.max(12, 18 * slideScale) : 0);
  const bottomReserve = Math.max(26, 44 * slideScale) + (options.xAxisTitle ? Math.max(12, 18 * slideScale) : 0);
  const plot = {
    height: Math.max(1, rect.height - titleHeight - bottomReserve),
    left: leftReserve,
    top: titleHeight + Math.max(10, 18 * slideScale),
    width: Math.max(1, rect.width - leftReserve - Math.max(16, 20 * slideScale)),
  };

  const type = asNumber(chart.type);
  if (type === 16 || type === 8) {
    drawPieChart(context, series[0], plot, type === 8, slideScale, options);
  } else if (type === 13 || type === 2 || type === 18) {
    drawLineChart(context, series, plot, slideScale, options);
  } else {
    drawBarChart(context, series, plot, asNumber(chart.barDirection) === 2, slideScale, options);
  }

  drawChartAxisTitles(context, options, plot, rect, slideScale);
  if (chart.hasLegend === true || asNumber(chart.hasLegend) > 0) {
    drawChartLegend(context, series, rect, slideScale);
  }
  context.restore();
}

function presentationChartOptions(chart: RecordValue): ChartRenderOptions {
  const dataLabels = asRecord(chart.dataLabels);
  const xAxis = asRecord(chart.xAxis);
  const yAxis = asRecord(chart.yAxis);
  return {
    showDataLabels: dataLabels?.showValue === true || asNumber(dataLabels?.showValue) > 0,
    showMajorGridlines: yAxis == null || asRecord(yAxis.majorGridlines) != null || asRecord(yAxis.majorGridLines) != null,
    xAxisTitle: asString(xAxis?.title),
    yAxisTitle: asString(yAxis?.title),
  };
}

function presentationChartSeries(chart: RecordValue): ChartSeries[] {
  const chartCategories = asArray(chart.categories).map(asString).filter(Boolean);
  return asArray(chart.series)
    .map(asRecord)
    .filter((series): series is RecordValue => series != null)
    .map((series, index) => {
      const values = asArray(series.values ?? series.data)
        .map((value) => asNumber(value, Number.NaN))
        .filter(Number.isFinite);
      const seriesCategories = asArray(series.categories).map(asString).filter(Boolean);
      const color = fillToCss(series.fill) ?? PRESENTATION_CHART_COLORS[index % PRESENTATION_CHART_COLORS.length] ?? "#156082";
      return {
        categories: seriesCategories.length > 0 ? seriesCategories : chartCategories,
        color,
        errorBars: chartSeriesErrorBars(series, color),
        name: asString(series.name) || `Series ${index + 1}`,
        trendlines: chartSeriesTrendlines(series, color),
        values,
      };
    })
    .filter((series) => series.values.length > 0);
}

function chartSeriesErrorBars(series: RecordValue, color: string): ChartErrorBars | undefined {
  const record = asRecord(series.errorBars) ?? asRecord(series.yErrorBars);
  if (!record) return undefined;

  const amount = asNumber(record.amount ?? record.value ?? record.fixedValue ?? record.val, Number.NaN);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const direction = asString(record.direction || record.type).toLowerCase();
  return {
    amount,
    color: chartProtocolColor(record.color, color),
    direction: direction.includes("plus") ? "plus" : direction.includes("minus") ? "minus" : "both",
  };
}

function chartSeriesTrendlines(series: RecordValue, color: string): ChartTrendline[] {
  return chartRecordList(series.trendlines ?? series.trendline)
    .map((record) => ({
      color: chartProtocolColor(record.color, color),
      type: asString(record.type || record.name) || "linear",
    }));
}

function chartRecordList(value: unknown): RecordValue[] {
  const records = asArray(value).map(asRecord).filter((record): record is RecordValue => record != null);
  const single = asRecord(value);
  return records.length > 0 ? records : single ? [single] : [];
}

function chartProtocolColor(value: unknown, fallback: string): string {
  const record = asRecord(value);
  return fillToCss(record) ?? colorToCss(record) ?? fallback;
}

function drawBarChart(
  context: CanvasRenderingContext2D,
  series: ChartSeries[],
  plot: ChartPlot,
  horizontal: boolean,
  slideScale: number,
  options: ChartRenderOptions,
): void {
  const values = series.flatMap((item) => item.values);
  const max = Math.max(1, ...values);
  drawChartGrid(context, plot, 0, max, slideScale, options.showMajorGridlines);
  const categoryCount = Math.max(...series.map((item) => item.values.length));
  if (categoryCount <= 0) return;

  if (horizontal) {
    const rowHeight = plot.height / categoryCount;
    const barHeight = Math.max(1, (rowHeight * 0.72) / series.length);
    for (const [seriesIndex, item] of series.entries()) {
      context.fillStyle = item.color;
      for (const [index, value] of item.values.entries()) {
        const width = (Math.max(0, value) / max) * plot.width;
        const x = plot.left;
        const y = plot.top + index * rowHeight + rowHeight * 0.14 + seriesIndex * barHeight;
        context.fillRect(x, y, width, Math.max(1, barHeight * 0.82));
        if (options.showDataLabels) {
          drawChartDataLabel(context, value, x + width + 3 * slideScale, y + barHeight * 0.41, slideScale, "left", "middle");
        }
      }
    }
    drawChartCategoryLabels(context, series[0]?.categories ?? [], plot, true, slideScale);
    return;
  }

  const columnWidth = plot.width / categoryCount;
  const barWidth = Math.max(1, (columnWidth * 0.72) / series.length);
  for (const [seriesIndex, item] of series.entries()) {
    context.fillStyle = item.color;
    for (const [index, value] of item.values.entries()) {
      const height = (Math.max(0, value) / max) * plot.height;
      const x = plot.left + index * columnWidth + columnWidth * 0.14 + seriesIndex * barWidth;
      const y = plot.top + plot.height - height;
      context.fillRect(x, y, Math.max(1, barWidth * 0.82), height);
      if (options.showDataLabels) {
        drawChartDataLabel(context, value, x + barWidth * 0.41, y - 2 * slideScale, slideScale, "center", "bottom");
      }
    }
  }
  drawChartCategoryLabels(context, series[0]?.categories ?? [], plot, false, slideScale);
}

function drawLineChart(
  context: CanvasRenderingContext2D,
  series: ChartSeries[],
  plot: ChartPlot,
  slideScale: number,
  options: ChartRenderOptions,
): void {
  const values = series.flatMap((item) => item.values);
  const range = chartAxisRange(values, false);
  drawChartGrid(context, plot, range.min, range.max, slideScale, options.showMajorGridlines);
  const maxPoints = Math.max(...series.map((item) => item.values.length));
  const xStep = maxPoints <= 1 ? plot.width : plot.width / (maxPoints - 1);

  for (const item of series) {
    context.strokeStyle = item.color;
    context.lineWidth = Math.max(1.5, slideScale * 1.8);
    context.beginPath();
    item.values.forEach((value, index) => {
      const x = plot.left + index * xStep;
      const y = plot.top + plot.height - ((value - range.min) / Math.max(1, range.max - range.min)) * plot.height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
      if (options.showDataLabels) {
        drawChartDataLabel(context, value, x, y - 4 * slideScale, slideScale, "center", "bottom");
      }
    });
    context.stroke();
    drawLineChartErrorBars(context, item, plot, range, xStep, slideScale);
    drawLineChartTrendlines(context, item, plot, range, xStep, slideScale);
  }
  drawChartCategoryLabels(context, series[0]?.categories ?? [], plot, false, slideScale);
}

function drawLineChartErrorBars(
  context: CanvasRenderingContext2D,
  series: ChartSeries,
  plot: ChartPlot,
  range: { max: number; min: number },
  xStep: number,
  slideScale: number,
): void {
  const errorBars = series.errorBars;
  if (!errorBars) return;

  context.save();
  context.strokeStyle = errorBars.color;
  context.lineWidth = Math.max(1, slideScale);
  const cap = Math.max(3, 4 * slideScale);
  series.values.forEach((value, index) => {
    const x = plot.left + index * xStep;
    const y = chartValueY(value, plot, range);
    const top = errorBars.direction === "minus" ? y : chartValueY(value + errorBars.amount, plot, range);
    const bottom = errorBars.direction === "plus" ? y : chartValueY(value - errorBars.amount, plot, range);
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.moveTo(x - cap, top);
    context.lineTo(x + cap, top);
    context.moveTo(x - cap, bottom);
    context.lineTo(x + cap, bottom);
    context.stroke();
  });
  context.restore();
}

function drawLineChartTrendlines(
  context: CanvasRenderingContext2D,
  series: ChartSeries,
  plot: ChartPlot,
  range: { max: number; min: number },
  xStep: number,
  slideScale: number,
): void {
  if (series.trendlines.length === 0 || series.values.length < 2) return;
  const regression = linearRegression(series.values);
  if (!regression) return;

  const firstIndex = 0;
  const lastIndex = series.values.length - 1;
  context.save();
  context.lineWidth = Math.max(1, 1.25 * slideScale);
  context.setLineDash([Math.max(3, 6 * slideScale), Math.max(2, 4 * slideScale)]);
  for (const trendline of series.trendlines) {
    context.strokeStyle = trendline.color;
    context.beginPath();
    context.moveTo(plot.left + firstIndex * xStep, chartValueY(regression.intercept, plot, range));
    context.lineTo(plot.left + lastIndex * xStep, chartValueY(regression.slope * lastIndex + regression.intercept, plot, range));
    context.stroke();
  }
  context.restore();
}

function drawPieChart(
  context: CanvasRenderingContext2D,
  series: ChartSeries,
  plot: ChartPlot,
  doughnut: boolean,
  slideScale: number,
  options: ChartRenderOptions,
): void {
  const total = series.values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return;
  const radius = Math.max(1, Math.min(plot.width, plot.height) * 0.42);
  const cx = plot.left + plot.width / 2;
  const cy = plot.top + plot.height / 2;
  let angle = -Math.PI / 2;
  for (const [index, value] of series.values.entries()) {
    const nextAngle = angle + (Math.max(0, value) / total) * Math.PI * 2;
    context.fillStyle = PRESENTATION_CHART_COLORS[index % PRESENTATION_CHART_COLORS.length] ?? series.color;
    context.beginPath();
    context.moveTo(cx, cy);
    context.arc(cx, cy, radius, angle, nextAngle);
    context.closePath();
    context.fill();
    if (options.showDataLabels) {
      const midAngle = angle + (nextAngle - angle) / 2;
      drawChartDataLabel(
        context,
        value,
        cx + Math.cos(midAngle) * radius * 0.68,
        cy + Math.sin(midAngle) * radius * 0.68,
        slideScale,
        "center",
        "middle",
      );
    }
    angle = nextAngle;
  }

  if (doughnut) {
    context.fillStyle = "rgba(255, 255, 255, 0.92)";
    context.beginPath();
    context.arc(cx, cy, radius * 0.48, 0, Math.PI * 2);
    context.fill();
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.95)";
  context.lineWidth = Math.max(1, slideScale);
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.stroke();
}

function drawChartGrid(
  context: CanvasRenderingContext2D,
  plot: ChartPlot,
  min: number,
  max: number,
  slideScale: number,
  showMajorGridlines: boolean,
): void {
  context.lineWidth = Math.max(0.5, slideScale);
  if (showMajorGridlines) {
    context.strokeStyle = "rgba(148, 163, 184, 0.42)";
    context.setLineDash([Math.max(2, slideScale * 3), Math.max(2, slideScale * 2)]);
    for (let index = 0; index <= 4; index++) {
      const y = plot.top + (plot.height / 4) * index;
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.left + plot.width, y);
      context.stroke();
    }
    context.setLineDash([]);
  }
  context.strokeStyle = "rgba(100, 116, 139, 0.65)";
  context.beginPath();
  context.moveTo(plot.left, plot.top);
  context.lineTo(plot.left, plot.top + plot.height);
  context.lineTo(plot.left + plot.width, plot.top + plot.height);
  context.stroke();

  context.fillStyle = "#64748b";
  context.font = `400 ${Math.max(8, 10 * slideScale)}px Arial, sans-serif`;
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (let index = 0; index <= 4; index++) {
    const value = max - ((max - min) / 4) * index;
    const y = plot.top + (plot.height / 4) * index;
    context.fillText(formatChartTick(value), plot.left - Math.max(4, 6 * slideScale), y);
  }
}

function drawChartAxisTitles(
  context: CanvasRenderingContext2D,
  options: ChartRenderOptions,
  plot: ChartPlot,
  rect: OfficeChartRect,
  slideScale: number,
): void {
  context.fillStyle = "#475569";
  context.font = `600 ${Math.max(8, 10 * slideScale)}px Arial, sans-serif`;

  if (options.xAxisTitle) {
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(options.xAxisTitle, plot.left + plot.width / 2, rect.height - Math.max(4, 7 * slideScale), plot.width);
  }

  if (options.yAxisTitle) {
    context.save();
    context.translate(Math.max(6, 10 * slideScale), plot.top + plot.height / 2);
    context.rotate(-Math.PI / 2);
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillText(options.yAxisTitle, 0, 0, plot.height);
    context.restore();
  }
}

function drawChartDataLabel(
  context: CanvasRenderingContext2D,
  value: number,
  x: number,
  y: number,
  slideScale: number,
  align: CanvasTextAlign,
  baseline: CanvasTextBaseline,
): void {
  context.fillStyle = "#334155";
  context.font = `600 ${Math.max(7, 9 * slideScale)}px Arial, sans-serif`;
  context.textAlign = align;
  context.textBaseline = baseline;
  context.fillText(formatChartTick(value), x, y, Math.max(24, 48 * slideScale));
}

function drawChartCategoryLabels(
  context: CanvasRenderingContext2D,
  categories: string[],
  plot: ChartPlot,
  horizontal: boolean,
  slideScale: number,
): void {
  if (categories.length === 0) return;
  context.fillStyle = "#64748b";
  context.font = `400 ${Math.max(7, 9 * slideScale)}px Arial, sans-serif`;
  context.textBaseline = "top";

  if (horizontal) {
    context.textAlign = "right";
    const rowHeight = plot.height / categories.length;
    categories.slice(0, 12).forEach((category, index) => {
      context.fillText(category, plot.left - Math.max(4, 6 * slideScale), plot.top + index * rowHeight + rowHeight * 0.3);
    });
    return;
  }

  context.textAlign = "center";
  const step = categories.length <= 1 ? plot.width : plot.width / categories.length;
  const labelEvery = Math.max(1, Math.ceil(categories.length / 8));
  categories.forEach((category, index) => {
    if (index % labelEvery !== 0) return;
    const x = plot.left + step * index + step / 2;
    context.fillText(category, x, plot.top + plot.height + Math.max(4, 6 * slideScale), step * labelEvery);
  });
}

function drawChartLegend(context: CanvasRenderingContext2D, series: ChartSeries[], rect: OfficeChartRect, slideScale: number): void {
  const swatch = Math.max(6, 8 * slideScale);
  const textSize = Math.max(8, 10 * slideScale);
  context.font = `400 ${textSize}px Arial, sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  let x = Math.max(8, rect.width * 0.2);
  const y = rect.height - Math.max(8, 14 * slideScale);
  for (const item of series.slice(0, 4)) {
    context.fillStyle = item.color;
    context.fillRect(x, y - swatch / 2, swatch, swatch);
    x += swatch + 4 * slideScale;
    context.fillStyle = "#64748b";
    context.fillText(item.name, x, y);
    x += context.measureText(item.name).width + 14 * slideScale;
  }
}

function chartAxisRange(values: number[], includeZero: boolean): { max: number; min: number } {
  if (values.length === 0) return { max: 1, min: 0 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (includeZero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const padding = (max - min) * 0.08;
  return { max: max + padding, min: min - padding };
}

function chartValueY(value: number, plot: ChartPlot, range: { max: number; min: number }): number {
  return plot.top + plot.height - ((value - range.min) / Math.max(1, range.max - range.min)) * plot.height;
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

function formatChartTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 10) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/u, "");
}
