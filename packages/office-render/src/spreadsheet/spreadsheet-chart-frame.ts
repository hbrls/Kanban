export type SpreadsheetChartFrame = {
  chartArea: SpreadsheetChartRect;
  plotArea: SpreadsheetChartRect;
};

export type SpreadsheetChartFrameInput = {
  height: number;
  width: number;
};

export type SpreadsheetChartPlotAreaInput = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type SpreadsheetChartRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export function spreadsheetChartFrame(
  chart: SpreadsheetChartFrameInput,
  plot: SpreadsheetChartPlotAreaInput,
): SpreadsheetChartFrame {
  return {
    chartArea: {
      height: Math.max(0, chart.height - 1),
      left: 0.5,
      top: 0.5,
      width: Math.max(0, chart.width - 1),
    },
    plotArea: {
      height: Math.max(0, plot.bottom - plot.top),
      left: plot.left + 0.5,
      top: plot.top + 0.5,
      width: Math.max(0, plot.right - plot.left),
    },
  };
}

export function drawSpreadsheetChartFrame(
  context: CanvasRenderingContext2D,
  chart: SpreadsheetChartFrameInput,
  plot: SpreadsheetChartPlotAreaInput,
) {
  const frame = spreadsheetChartFrame(chart, plot);
  context.save();
  context.strokeStyle = "#d9d9d9";
  context.lineWidth = 1;
  context.setLineDash([]);
  context.strokeRect(frame.chartArea.left, frame.chartArea.top, frame.chartArea.width, frame.chartArea.height);
  context.strokeStyle = "#bfbfbf";
  context.strokeRect(frame.plotArea.left, frame.plotArea.top, frame.plotArea.width, frame.plotArea.height);
  context.restore();
}
