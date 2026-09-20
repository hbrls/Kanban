import { asNumber, asRecord, asString, type RecordValue } from "../shared/office-preview-utils";

export type SpreadsheetChartRendererOptions = {
  barGrouping: "clustered" | "percentStacked" | "stacked";
  barGapWidth: number;
  barOverlap: number;
  firstSliceAngle: number;
  holeSize: number;
  varyColors: boolean;
};

export function spreadsheetChartRendererOptions(chart: RecordValue): SpreadsheetChartRendererOptions {
  const barOptions = chartOptionsRecord(chart, "bar");
  const pieOptions = chartOptionsRecord(chart, "pie");
  const doughnutOptions = chartOptionsRecord(chart, "doughnut");
  return {
    barGrouping: chartBarGrouping(barOptions),
    barGapWidth: chartOptionNumber(barOptions, ["gapWidth"], 150),
    barOverlap: chartOptionNumber(barOptions, ["overlap"], 0),
    firstSliceAngle: chartOptionNumber(doughnutOptions ?? pieOptions ?? chart, ["firstSliceAngle", "firstSliceAng"], 0),
    holeSize: chartOptionNumber(doughnutOptions ?? chart, ["holeSize"], 55),
    varyColors: chartOptionBoolean(barOptions ?? doughnutOptions ?? pieOptions ?? chart, "varyColors"),
  };
}

function chartBarGrouping(record: RecordValue | null): SpreadsheetChartRendererOptions["barGrouping"] {
  const value = record?.grouping;
  if (asString(value) === "3" || asString(value).toLowerCase() === "percentstacked") return "percentStacked";
  if (asString(value) === "2" || asString(value).toLowerCase() === "stacked") return "stacked";
  return "clustered";
}

function chartOptionsRecord(chart: RecordValue, family: string): RecordValue | null {
  return asRecord(chart[`${family}Options`]) ??
    asRecord(chart[`${family}ChartOptions`]) ??
    asRecord(chart[`${family}Chart`]);
}

function chartOptionNumber(record: RecordValue | null, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = asNumber(record?.[key], Number.NaN);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function chartOptionBoolean(record: RecordValue | null, key: string): boolean {
  const value = record?.[key];
  return value === true || asString(value).toLowerCase() === "true" || asString(value) === "1";
}
