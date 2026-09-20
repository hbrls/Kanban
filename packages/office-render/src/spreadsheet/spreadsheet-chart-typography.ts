export type SpreadsheetChartTextRole = "axisLabel" | "axisTitle" | "dataLabel" | "legend" | "title";

const SPREADSHEET_CHART_FONT_FAMILY = "Aptos, Calibri, Arial, sans-serif";

const SPREADSHEET_CHART_TEXT = {
  axisLabel: { size: 13, weight: 400 },
  axisTitle: { size: 13, weight: 400 },
  dataLabel: { size: 12, weight: 400 },
  legend: { size: 13, weight: 400 },
  title: { size: 24, weight: 400 },
} satisfies Record<SpreadsheetChartTextRole, { size: number; weight: number }>;

export function spreadsheetChartCanvasFont(role: SpreadsheetChartTextRole): string {
  const style = SPREADSHEET_CHART_TEXT[role];
  return `${style.weight} ${style.size}px ${SPREADSHEET_CHART_FONT_FAMILY}`;
}

export function spreadsheetChartTextWidth(text: string, role: SpreadsheetChartTextRole): number {
  const style = SPREADSHEET_CHART_TEXT[role];
  return Math.ceil(text.length * style.size * 0.55);
}
