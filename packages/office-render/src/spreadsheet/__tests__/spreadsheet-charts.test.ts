import { describe, expect, it } from "vitest";

import {
  buildSpreadsheetCharts,
  formatChartTick,
  SPREADSHEET_CHART_LINE_WIDTH,
  SPREADSHEET_CHART_MARKER_RADIUS,
  spreadsheetBarChartGeometry,
  spreadsheetChartHorizontalLegendLayout,
  spreadsheetChartPlotArea,
  spreadsheetChartTickValues,
} from "../spreadsheet-charts";
import { spreadsheetChartFrame } from "../spreadsheet-chart-frame";
import { spreadsheetChartZeroBaselineY } from "../spreadsheet-chart-scale";
import { spreadsheetChartCanvasFont, spreadsheetChartTextWidth } from "../spreadsheet-chart-typography";
import { buildSpreadsheetLayout, spreadsheetColumnLeft, spreadsheetEmuToPx, spreadsheetRowTop } from "../spreadsheet-layout";

describe("spreadsheet charts", () => {
  it("uses Excel-like line chart stroke and marker sizing", () => {
    expect(SPREADSHEET_CHART_LINE_WIDTH).toBe(2);
    expect(SPREADSHEET_CHART_MARKER_RADIUS).toBe(4);
  });

  it("builds chart specs from sheet drawing anchors", () => {
    const sheet = {
      drawings: [
        {
          chart: {
            legend: { position: 4 },
            series: [
              {
                categories: ["Jan 25", "Feb 25"],
                marker: {},
                name: "Fitness Score",
                values: [62.6, 64.5],
              },
            ],
            title: "Fitness Score vs Coverage",
            type: 13,
            yAxis: { minimum: 0 },
          },
          extentCx: "1905000",
          extentCy: "952500",
          fromAnchor: {
            colId: "1",
            colOffset: "9525",
            rowId: "2",
            rowOffset: "19050",
          },
        },
      ],
      name: "01_Dashboard",
      rows: [
        { cells: [{ address: "A1", value: "AI Coding Delivery Dashboard" }], index: 1 },
        { cells: [{ address: "B3", value: 62.6 }], index: 3 },
      ],
    };
    const layout = buildSpreadsheetLayout(sheet);

    const charts = buildSpreadsheetCharts({
      activeSheet: sheet,
      charts: [],
      layout,
      sheets: [sheet],
    });

    expect(charts).toHaveLength(1);
    expect(charts[0]).toMatchObject({
      categories: ["Jan 25", "Feb 25"],
      height: 100,
      left: spreadsheetColumnLeft(layout, 1) + 1,
      legendPosition: "bottom",
      title: "Fitness Score vs Coverage",
      top: spreadsheetRowTop(layout, 2) + 2,
      type: "line",
      width: 200,
      yAxis: { minimum: 0 },
      zIndex: 0,
    });
    expect(charts[0]?.series[0]).toMatchObject({
      color: "#1f6f8b",
      label: "Fitness Score",
      marker: "diamond",
      values: [62.6, 64.5],
    });
  });

  it("builds root workbook chart bounds from two-cell anchor offsets", () => {
    const sheet = {
      name: "01_Dashboard",
      rows: Array.from({ length: 16 }, (_, index) => ({
        cells: index === 0 ? [{ address: "A1", value: "Dashboard" }] : [],
        index: index + 1,
      })),
    };
    const layout = buildSpreadsheetLayout(sheet);
    const charts = buildSpreadsheetCharts({
      activeSheet: sheet,
      charts: [
        {
          anchor: {
            fromCol: "1",
            fromColOffsetEmu: "95250",
            fromRow: "2",
            fromRowOffsetEmu: "190500",
            toCol: "6",
            toColOffsetEmu: "190500",
            toRow: "16",
            toRowOffsetEmu: "95250",
          },
          series: [{ categories: ["Jan", "Feb"], name: "Fitness", values: [10, 20] }],
          sheetName: "01_Dashboard",
          title: "Root Chart",
          type: 13,
        },
      ],
      layout,
      sheets: [sheet],
    });
    const left = spreadsheetColumnLeft(layout, 1) + spreadsheetEmuToPx("95250");
    const top = spreadsheetRowTop(layout, 2) + spreadsheetEmuToPx("190500");
    const right = spreadsheetColumnLeft(layout, 6) + spreadsheetEmuToPx("190500");
    const bottom = spreadsheetRowTop(layout, 16) + spreadsheetEmuToPx("95250");

    expect(charts[0]).toMatchObject({
      height: bottom - top,
      left,
      title: "Root Chart",
      top,
      width: right - left,
      zIndex: 10000,
    });
  });

  it("uses Excel-like zero-based ticks and plot margins for line charts", () => {
    const chart = {
      categories: ["Jan 25", "Feb 25", "Mar 25"],
      height: 280,
      left: 0,
      legendOverlay: false,
      legendPosition: "bottom" as const,
      series: [
        { color: "#1f6f8b", label: "Fitness Score", marker: "diamond" as const, trendlines: [], values: [62.6, 78.1, 89.9] },
      ],
      showDataLabels: false,
      title: "Fitness Score vs Coverage",
      top: 0,
      type: "line" as const,
      width: 640,
      yAxis: { majorGridLines: true, minimum: 0, numberFormat: "", position: "" },
      zIndex: 0,
    };

    expect(spreadsheetChartTickValues(chart, chart.series[0].values)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(spreadsheetChartPlotArea(chart)).toMatchObject({
      bottom: 192,
      left: 64,
      right: 618,
      top: 58,
    });
  });

  it("expands chart scales below zero and projects a zero baseline", () => {
    const chart = {
      categories: ["Q1", "Q2", "Q3"],
      height: 260,
      left: 0,
      legendOverlay: false,
      legendPosition: "bottom" as const,
      series: [{ color: "#1f6f8b", label: "Delta", marker: null, trendlines: [], values: [-30, 0, 30] }],
      showDataLabels: false,
      title: "Variance",
      top: 0,
      type: "bar" as const,
      width: 420,
      zIndex: 0,
    };
    const ticks = spreadsheetChartTickValues(chart, chart.series[0].values);

    expect(ticks).toEqual([-30, -15, 0, 15, 30]);
    expect(spreadsheetChartZeroBaselineY({ bottom: 198, top: 58 }, ticks[0]!, ticks.at(-1)!)).toBe(128);
  });

  it("reserves chart plot space for non-overlay left and top legends", () => {
    const baseChart = {
      categories: ["Jan", "Feb"],
      height: 240,
      left: 0,
      series: [{ color: "#1f6f8b", label: "Series", marker: "square" as const, trendlines: [], values: [10, 20] }],
      showDataLabels: false,
      title: "Legend Layout",
      top: 0,
      type: "line" as const,
      width: 360,
      yAxis: { majorGridLines: true, minimum: 0, numberFormat: "", position: "" },
      zIndex: 0,
    };

    expect(spreadsheetChartPlotArea({ ...baseChart, legendOverlay: false, legendPosition: "left" })).toMatchObject({
      left: 172,
      right: 338,
      top: 58,
    });
    expect(spreadsheetChartPlotArea({ ...baseChart, legendOverlay: true, legendPosition: "left" })).toMatchObject({
      left: 64,
      right: 338,
      top: 58,
    });
    expect(spreadsheetChartPlotArea({ ...baseChart, legendOverlay: false, legendPosition: "top" })).toMatchObject({
      top: 86,
    });
  });

  it("widens chart axis gutters for long formatted tick labels", () => {
    const chart = {
      categories: ["Q1", "Q2"],
      height: 260,
      left: 0,
      legendOverlay: false,
      legendPosition: "bottom" as const,
      series: [
        { color: "#1f6f8b", label: "Revenue", marker: "square" as const, trendlines: [], values: [500_000, 1_250_000] },
        { axis: "secondary" as const, color: "#f9732a", label: "Margin", marker: "diamond" as const, trendlines: [], values: [0.32, 0.42] },
      ],
      showDataLabels: false,
      title: "Revenue and Margin",
      top: 0,
      type: "line" as const,
      width: 520,
      secondaryYAxis: { majorGridLines: false, minimum: 0, numberFormat: "0.00%", position: "right" },
      yAxis: { majorGridLines: true, minimum: 0, numberFormat: "$#,##0.00", position: "left" },
      zIndex: 0,
    };

    expect(spreadsheetChartPlotArea(chart)).toMatchObject({
      left: 122,
      right: 440,
    });
  });

  it("lays out horizontal chart legends from label widths", () => {
    const layout = spreadsheetChartHorizontalLegendLayout(420, 220, [
      { color: "#1f6f8b", label: "Backlog", marker: "square", showLine: true },
      { color: "#f9732a", label: "Completed Coverage", marker: "diamond", showLine: true },
      { color: "#5b7f2a", label: "QA", marker: null, showLine: false },
    ]);

    expect(layout.map((entry) => Math.round(entry.x))).toEqual([35, 138, 319]);
    expect(layout.every((entry) => entry.y === 220)).toBe(true);
  });

  it("uses Excel-like chart typography for canvas text metrics", () => {
    expect(spreadsheetChartCanvasFont("title")).toBe("400 24px Aptos, Calibri, Arial, sans-serif");
    expect(spreadsheetChartCanvasFont("axisLabel")).toBe("400 13px Aptos, Calibri, Arial, sans-serif");
    expect(spreadsheetChartTextWidth("Coverage %", "legend")).toBe(72);
  });

  it("projects Excel-like chart and plot area frame geometry", () => {
    const chart = {
      categories: ["Jan", "Feb"],
      height: 280,
      left: 0,
      legendOverlay: false,
      legendPosition: "bottom" as const,
      series: [{ color: "#1f6f8b", label: "Series", marker: "square" as const, trendlines: [], values: [10, 20] }],
      showDataLabels: false,
      title: "Frame",
      top: 0,
      type: "line" as const,
      width: 640,
      yAxis: { majorGridLines: true, minimum: 0, numberFormat: "", position: "" },
      zIndex: 0,
    };

    expect(spreadsheetChartFrame(chart, spreadsheetChartPlotArea(chart))).toEqual({
      chartArea: { height: 279, left: 0.5, top: 0.5, width: 639 },
      plotArea: { height: 134, left: 64.5, top: 58.5, width: 554 },
    });
  });

  it("formats chart tick labels from axis number formats", () => {
    expect(formatChartTick(0.42, "0%")).toBe("42%");
    expect(formatChartTick(0.125, "0.00%")).toBe("12.50%");
    expect(formatChartTick(1234.5, "$#,##0.00")).toBe("$1,234.50");
    expect(formatChartTick(1234.5, "#,##0")).toBe("1,235");
    expect(formatChartTick(12.345, "0.0")).toBe("12.3");
  });

  it("preserves non-line chart families from protocol ids", () => {
    const chartTypes = [
      [2, "area"],
      [5, "bubble"],
      [8, "doughnut"],
      [16, "pie"],
      [17, "radar"],
      [18, "scatter"],
      [22, "surface"],
    ] as const;

    const sheet = {
      drawings: chartTypes.map(([type], index) => ({
        chart: {
          series: [{ categories: ["1", "2", "3"], name: `Series ${index + 1}`, values: [10, 20, 30] }],
          title: `Chart ${index + 1}`,
          type,
          yAxis: { minimum: 0 },
        },
        extentCx: "1905000",
        extentCy: "952500",
        fromAnchor: { colId: "1", rowId: String(index + 1) },
      })),
      name: "Charts",
      rows: [],
    };
    const layout = buildSpreadsheetLayout(sheet);

    const charts = buildSpreadsheetCharts({
      activeSheet: sheet,
      charts: [],
      layout,
      sheets: [sheet],
    });

    expect(charts.map((chart) => chart.type)).toEqual(chartTypes.map(([, type]) => type));
    expect(spreadsheetChartPlotArea(charts[2]!)).toMatchObject({
      left: 28,
      right: 178,
    });
    expect(spreadsheetChartTickValues(charts[0]!, charts[0]?.series[0]?.values ?? [])).toHaveLength(6);
  });

  it("uses chart series markers only when the protocol exposes them", () => {
    const sheet = {
      drawings: [
        {
          chart: {
            series: [
              { categories: ["A", "B"], name: "No markers", values: [1, 2] },
              { categories: ["A", "B"], marker: {}, name: "With markers", values: [2, 3] },
            ],
            title: "Series markers",
            type: 13,
          },
          extentCx: "1905000",
          extentCy: "952500",
          fromAnchor: { colId: "1", rowId: "1" },
        },
      ],
      name: "Charts",
      rows: [],
    };
    const charts = buildSpreadsheetCharts({
      activeSheet: sheet,
      charts: [],
      layout: buildSpreadsheetLayout(sheet),
      sheets: [sheet],
    });

    expect(charts[0]?.series.map((series) => series.marker)).toEqual([null, "square"]);
  });

  it("preserves chart data-label visibility from protocol", () => {
    const sheet = {
      drawings: [
        {
          chart: {
            dataLabels: { showValue: true },
            series: [{ categories: ["A", "B"], name: "Values", values: [1, 2] }],
            title: "Data Labels",
            type: 4,
          },
          extentCx: "1905000",
          extentCy: "952500",
          fromAnchor: { colId: "1", rowId: "1" },
        },
      ],
      name: "Charts",
      rows: [],
    };
    const charts = buildSpreadsheetCharts({
      activeSheet: sheet,
      charts: [],
      layout: buildSpreadsheetLayout(sheet),
      sheets: [sheet],
    });

    expect(charts[0]?.showDataLabels).toBe(true);
  });

  it("preserves chart data-label flags and position from protocol", () => {
    const sheet = {
      drawings: [
        {
          chart: {
            dataLabels: {
              position: "outEnd",
              showCategoryName: true,
              showPercent: true,
              showSeriesName: true,
              showValue: false,
            },
            series: [{ categories: ["A", "B"], name: "Values", values: [1, 2] }],
            title: "Data Labels",
            type: 16,
          },
          extentCx: "1905000",
          extentCy: "952500",
          fromAnchor: { colId: "1", rowId: "1" },
        },
      ],
      name: "Charts",
      rows: [],
    };
    const charts = buildSpreadsheetCharts({
      activeSheet: sheet,
      charts: [],
      layout: buildSpreadsheetLayout(sheet),
      sheets: [sheet],
    });

    expect(charts[0]?.dataLabels).toEqual({
      position: "outsideEnd",
      showCategoryName: true,
      showPercent: true,
      showSeriesName: true,
      showValue: false,
    });
  });


  it("does not show chart data labels when protocol show flags are false", () => {
    const sheet = {
      drawings: [
        {
          chart: {
            dataLabels: {
              showBubbleSize: false,
              showCategoryName: false,
              showLegendKey: false,
              showPercent: false,
              showSeriesName: false,
              showValue: false,
            },
            series: [{ categories: ["A", "B"], name: "Values", values: [1, 2] }],
            title: "Hidden Data Labels",
            type: 13,
          },
          extentCx: "1905000",
          extentCy: "952500",
          fromAnchor: { colId: "1", rowId: "1" },
        },
      ],
      name: "Charts",
      rows: [],
    };
    const charts = buildSpreadsheetCharts({
      activeSheet: sheet,
      charts: [],
      layout: buildSpreadsheetLayout(sheet),
      sheets: [sheet],
    });

    expect(charts[0]?.showDataLabels).toBe(false);
  });

  it("preserves protocol axis titles for chart rendering", () => {
    const sheet = {
      drawings: [
        {
          chart: {
            series: [{ categories: ["Q1", "Q2"], name: "Revenue", values: [10, 20] }],
            title: "Revenue Trend",
            type: 13,
            xAxis: { title: "Quarter" },
            yAxis: { minimum: 0, title: "USD" },
          },
          extentCx: "1905000",
          extentCy: "952500",
          fromAnchor: { colId: "1", rowId: "1" },
        },
      ],
      name: "Charts",
      rows: [],
    };
    const charts = buildSpreadsheetCharts({
      activeSheet: sheet,
      charts: [],
      layout: buildSpreadsheetLayout(sheet),
      sheets: [sheet],
    });

    expect(charts[0]?.xAxis?.title).toBe("Quarter");
    expect(charts[0]?.yAxis?.title).toBe("USD");
  });

  it("preserves protocol trendline and error bar hints for chart rendering", () => {
    const sheet = {
      drawings: [
        {
          chart: {
            series: [
              {
                categories: ["Q1", "Q2", "Q3"],
                errorBars: { amount: 2, direction: "both" },
                name: "Revenue",
                trendlines: [{ type: "linear" }],
                values: [10, 20, 30],
              },
            ],
            title: "Revenue Trend",
            type: 13,
            yAxis: { minimum: 0 },
          },
          extentCx: "1905000",
          extentCy: "952500",
          fromAnchor: { colId: "1", rowId: "1" },
        },
      ],
      name: "Charts",
      rows: [],
    };
    const charts = buildSpreadsheetCharts({
      activeSheet: sheet,
      charts: [],
      layout: buildSpreadsheetLayout(sheet),
      sheets: [sheet],
    });

    expect(charts[0]?.series[0]?.errorBars).toMatchObject({ amount: 2, direction: "both" });
    expect(charts[0]?.series[0]?.trendlines).toEqual([{ color: "#1f6f8b", type: "linear" }]);
  });

  it("preserves secondary-axis series and reserves right-axis plot space", () => {
    const sheet = {
      drawings: [
        {
          chart: {
            secondaryYAxis: { maximum: 1, minimum: 0, numberFormat: "0%" },
            series: [
              { categories: ["Q1", "Q2"], name: "Revenue", values: [100, 120] },
              { axis: "secondary", categories: ["Q1", "Q2"], name: "Margin", values: [0.3, 0.4] },
            ],
            title: "Revenue and Margin",
            type: 13,
            yAxis: { minimum: 0 },
          },
          extentCx: "3810000",
          extentCy: "1905000",
          fromAnchor: { colId: "1", rowId: "1" },
        },
      ],
      name: "Charts",
      rows: [],
    };
    const charts = buildSpreadsheetCharts({
      activeSheet: sheet,
      charts: [],
      layout: buildSpreadsheetLayout(sheet),
      sheets: [sheet],
    });

    expect(charts[0]?.series.map((series) => series.axis)).toEqual(["primary", "secondary"]);
    expect(charts[0]?.secondaryYAxis).toMatchObject({ maximum: 1, minimum: 0, numberFormat: "0%" });
    expect(spreadsheetChartPlotArea(charts[0]!).right).toBe(336);
  });

  it("preserves series-level chart types for combo rendering", () => {
    const sheet = {
      drawings: [
        {
          chart: {
            series: [
              { categories: ["Q1", "Q2"], name: "Revenue", type: "bar", values: [100, 120] },
              { categories: ["Q1", "Q2"], name: "Margin", type: "line", values: [30, 40] },
            ],
            title: "Combo",
            type: 4,
            yAxis: { minimum: 0 },
          },
          extentCx: "3810000",
          extentCy: "1905000",
          fromAnchor: { colId: "1", rowId: "1" },
        },
      ],
      name: "Charts",
      rows: [],
    };
    const charts = buildSpreadsheetCharts({
      activeSheet: sheet,
      charts: [],
      layout: buildSpreadsheetLayout(sheet),
      sheets: [sheet],
    });

    expect(charts[0]?.type).toBe("bar");
    expect(charts[0]?.series.map((series) => series.type)).toEqual(["bar", "line"]);
  });

  it("preserves chart family options for renderer layout", () => {
    const sheet = {
      drawings: [
        {
          chart: {
            barOptions: { gapWidth: 50, grouping: 2, overlap: 25, varyColors: true },
            series: [{ categories: ["Q1", "Q2"], name: "Revenue", values: [10, 20] }],
            title: "Revenue",
            type: 1,
          },
        },
        {
          chart: {
            doughnutOptions: { firstSliceAngle: 45, holeSize: 70 },
            series: [{ categories: ["A", "B"], name: "Share", values: [40, 60] }],
            title: "Share",
            type: 5,
          },
        },
      ],
      name: "01_Dashboard",
      rows: [{ cells: [{ address: "A1", value: "AI Coding Delivery Dashboard" }], index: 1 }],
    };
    const layout = buildSpreadsheetLayout(sheet);
    const charts = buildSpreadsheetCharts({ activeSheet: sheet, charts: [], layout, sheets: [sheet] });

    expect(charts[0]?.options).toMatchObject({ barGapWidth: 50, barGrouping: "stacked", barOverlap: 25, varyColors: true });
    expect(charts[1]?.options).toMatchObject({ firstSliceAngle: 45, holeSize: 70 });
  });

  it("clusters bar geometry for every protocol series", () => {
    const chart = {
      categories: ["Q1", "Q2"],
      height: 240,
      left: 0,
      legendOverlay: false,
      legendPosition: "bottom" as const,
      series: [
        { color: "#1f6f8b", label: "Backlog", marker: null, trendlines: [], values: [10, 20] },
        { color: "#f9732a", label: "Done", marker: null, trendlines: [], values: [5, 15] },
      ],
      showDataLabels: false,
      title: "Multi-series bar",
      top: 0,
      type: "bar" as const,
      width: 360,
      zIndex: 0,
    };
    const bars = spreadsheetBarChartGeometry(chart, { left: 52, right: 338 });

    expect(bars).toHaveLength(4);
    expect(bars.map((bar) => bar.value)).toEqual([10, 5, 20, 15]);
    expect(bars[0]!.centerX).toBeLessThan(bars[1]!.centerX);
    expect(bars[1]!.centerX).toBeLessThan(bars[2]!.centerX);
    expect(bars.every((bar) => bar.barWidth > 0)).toBe(true);
  });

  it("uses protocol bar gap width when clustering bars", () => {
    const baseChart = {
      categories: ["Q1"],
      height: 240,
      left: 0,
      legendOverlay: false,
      legendPosition: "bottom" as const,
      series: [
        { color: "#1f6f8b", label: "Backlog", marker: null, trendlines: [], values: [10] },
        { color: "#f9732a", label: "Done", marker: null, trendlines: [], values: [5] },
      ],
      showDataLabels: false,
      title: "Gap width",
      top: 0,
      type: "bar" as const,
      width: 360,
      zIndex: 0,
    };
    const wideGap = spreadsheetBarChartGeometry(
      { ...baseChart, options: { barGapWidth: 300, barGrouping: "clustered", barOverlap: 0, firstSliceAngle: 0, holeSize: 55, varyColors: false } },
      { left: 52, right: 338 },
    );
    const narrowGap = spreadsheetBarChartGeometry(
      { ...baseChart, options: { barGapWidth: 50, barGrouping: "clustered", barOverlap: 0, firstSliceAngle: 0, holeSize: 55, varyColors: false } },
      { left: 52, right: 338 },
    );

    expect(narrowGap[0]!.barWidth).toBeGreaterThan(wideGap[0]!.barWidth);
  });
});
