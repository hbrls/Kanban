export type SpreadsheetChartAxisScaleInput = {
  majorUnit?: number;
  maximum?: number;
  minimum?: number;
};

export type SpreadsheetChartScaleInput = {
  type: string;
  yAxis?: SpreadsheetChartAxisScaleInput;
};

export function spreadsheetChartTickValues(chart: SpreadsheetChartScaleInput, values: number[]): number[] {
  const tickCount = isLineAxisChartType(chart.type) || chart.type === "radar" ? 6 : 5;
  const finiteValues = values.filter(Number.isFinite);
  const observedMin = finiteValues.length > 0 ? Math.min(...finiteValues) : 0;
  const observedMax = finiteValues.length > 0 ? Math.max(...finiteValues) : 1;
  const majorUnit = chart.yAxis?.majorUnit;
  const minValue = chart.yAxis?.minimum ?? chartScaleMinimum(observedMin, majorUnit);
  let maxValue = chart.yAxis?.maximum ?? chartScaleMaximum(observedMax, majorUnit, tickCount);

  if (!Number.isFinite(maxValue) || maxValue <= minValue) {
    maxValue = minValue + Math.max(1, Math.abs(minValue || 1));
  }

  if (majorUnit && majorUnit > 0) {
    const ticks: number[] = [];
    for (let value = minValue; value <= maxValue + majorUnit / 1000; value += majorUnit) {
      ticks.push(roundChartNumber(value));
    }
    return ticks.length >= 2 ? ticks : [minValue, maxValue];
  }

  return Array.from({ length: tickCount }, (_, index) => {
    const ratio = index / Math.max(1, tickCount - 1);
    return roundChartNumber(minValue + ratio * (maxValue - minValue));
  });
}

export function chartY(
  value: number,
  plot: Pick<{ bottom: number; top: number }, "bottom" | "top">,
  minValue: number,
  maxValue: number,
): number {
  if (maxValue <= minValue) return plot.bottom;
  const ratio = (value - minValue) / (maxValue - minValue);
  return plot.bottom - ratio * (plot.bottom - plot.top);
}

export function spreadsheetChartZeroBaselineY(
  plot: Pick<{ bottom: number; top: number }, "bottom" | "top">,
  minValue: number,
  maxValue: number,
): number {
  const zero = Math.max(minValue, Math.min(maxValue, 0));
  return chartY(zero, plot, minValue, maxValue);
}

function chartScaleMinimum(observedMin: number, majorUnit?: number): number {
  if (!Number.isFinite(observedMin) || observedMin >= 0) return 0;
  if (majorUnit && majorUnit > 0) return Math.floor(observedMin / majorUnit) * majorUnit;
  return -niceChartMax(Math.abs(observedMin), 5);
}

function chartScaleMaximum(observedMax: number, majorUnit: number | undefined, tickCount: number): number {
  const nonNegativeMax = Math.max(0, observedMax);
  if (majorUnit && majorUnit > 0) return Math.ceil(nonNegativeMax / majorUnit) * majorUnit;
  return niceChartMax(nonNegativeMax, tickCount);
}

function niceChartMax(observedMax: number, tickCount: number): number {
  if (!Number.isFinite(observedMax) || observedMax <= 0) return 1;
  const intervalCount = Math.max(1, tickCount - 1);
  const roughStep = observedMax / intervalCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = normalized <= 1 ? magnitude : normalized <= 2 ? 2 * magnitude : normalized <= 5 ? 5 * magnitude : 10 * magnitude;
  return Math.max(step, Math.ceil(observedMax / step) * step);
}

function roundChartNumber(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isLineAxisChartType(type: string): boolean {
  return type === "area" || type === "bubble" || type === "line" || type === "scatter" || type === "surface";
}
