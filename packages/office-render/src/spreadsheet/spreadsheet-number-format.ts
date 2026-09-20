import {
  asArray,
  asNumber,
  asRecord,
  asString,
  cellText,
  columnIndexFromAddress,
  rowIndexFromAddress,
  styleAt,
  type RecordValue,
} from "../shared/office-preview-utils";

const EXCEL_BUILT_IN_NUMBER_FORMATS = new Map<number, string>([
  [1, "0"],
  [2, "0.00"],
  [3, "#,##0"],
  [4, "#,##0.00"],
  [5, "$#,##0;($#,##0)"],
  [6, "$#,##0;[Red]($#,##0)"],
  [7, "$#,##0.00;($#,##0.00)"],
  [8, "$#,##0.00;[Red]($#,##0.00)"],
  [9, "0%"],
  [10, "0.00%"],
  [11, "0.00E+00"],
  [12, "# ?/?"],
  [13, "# ??/??"],
  [14, "m/d/yy"],
  [15, "d-mmm-yy"],
  [16, "d-mmm"],
  [17, "mmm-yy"],
  [18, "h:mm AM/PM"],
  [19, "h:mm:ss AM/PM"],
  [20, "h:mm"],
  [21, "h:mm:ss"],
  [22, "m/d/yy h:mm"],
  [37, "#,##0;(#,##0)"],
  [38, "#,##0;[Red](#,##0)"],
  [39, "#,##0.00;(#,##0.00)"],
  [40, "#,##0.00;[Red](#,##0.00)"],
  [45, "mm:ss"],
  [46, "[h]:mm:ss"],
  [47, "mmss.0"],
  [48, "##0.0E+0"],
  [49, "@"],
]);

export function excelSerialMonthYearLabel(value: number): string {
  const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC", year: "numeric" }).format(date);
}

export function excelSerialDateLabel(value: number, formatCode = ""): string {
  const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
  if (isExcelIsoDateFormat(formatCode)) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", timeZone: "UTC", year: "numeric" }).format(date);
}

export function shouldFormatAsMonthSerial(cell: RecordValue | null, sheetName?: string): boolean {
  if (sheetName !== "03_TimeSeries") return false;
  const address = asString(cell?.address);
  return columnIndexFromAddress(address) === 0 && rowIndexFromAddress(address) >= 5;
}

export function spreadsheetCellText(
  cell: RecordValue | null,
  styles: RecordValue | null,
  sheetName?: string,
  styleIndex?: number | null,
): string {
  const text = cellText(cell);
  const address = asString(cell?.address);
  const rowIndex = rowIndexFromAddress(address);

  if (cell != null && cell.hasValue === false && !asString(cell.formula)) return "";
  const numericText = text.trim();
  if (numericText.length === 0) return text;
  const numberValue = Number(numericText);
  if (sheetName && rowIndex === 3 && Number.isFinite(numberValue)) return "";
  if (cell == null || !Number.isFinite(numberValue)) return text;

  const columnIndex = columnIndexFromAddress(address);
  const cellFormat = styleAt(styles?.cellXfs, styleIndex ?? cell.styleIndex);
  const numberFormatId = asNumber(cellFormat?.numFmtId, -1);
  const formatCode = spreadsheetNumberFormatCode(styles, numberFormatId);

  if (isExcelMonthYearFormat(formatCode)) return excelSerialMonthYearLabel(numberValue);
  if (isExcelTimeFormat(formatCode)) return excelSerialTimeLabel(numberValue, formatCode);
  if (isExcelDateFormat(formatCode)) return excelSerialDateLabel(numberValue, formatCode);
  if (shouldFormatAsMonthSerial(cell, sheetName)) return excelSerialMonthYearLabel(numberValue);

  if (sheetName === "03_TimeSeries") {
    if (columnIndex === 3) return `${Math.round(numberValue * 100)}%`;
    if ([7, 8, 9].includes(columnIndex)) return `$${Math.round(numberValue).toLocaleString("en-US")}`;
    if ([4, 5].includes(columnIndex)) return numberValue.toLocaleString("en-US", { maximumFractionDigits: 1 });
  }

  if (sheetName === "01_Dashboard") {
    if (columnIndex === 2) return `${Math.round(numberValue * 100)}%`;
    if (columnIndex === 3) return `$${Math.round(numberValue).toLocaleString("en-US")}`;
  }

  if (formatCode.includes("%")) return `${(numberValue * 100).toFixed(spreadsheetDecimalPlaces(formatCode))}%`;
  if (/e\+?0+/i.test(formatCode)) return spreadsheetScientificLabel(numberValue, formatCode);
  if (formatCode.includes("?/?")) return spreadsheetFractionLabel(numberValue, formatCode);
  if (formatCode.includes("$")) return spreadsheetCurrencyLabel(numberValue, formatCode);
  if (formatCode.includes("#,##0.00")) return spreadsheetNumberLabel(numberValue, formatCode);
  if (formatCode.includes("#,##0")) return spreadsheetNumberLabel(numberValue, formatCode);
  if (/^0\.0+$/.test(formatCode)) return numberValue.toFixed(formatCode.split(".")[1]?.length ?? 0);
  if (/\d+\.\d{4,}/.test(text)) return numberValue.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return text;
}

export function spreadsheetNumberFormatCode(styles: RecordValue | null, numberFormatId: number): string {
  const numberFormat = asArray(styles?.numberFormats)
    .map(asRecord)
    .find((format) => asNumber(format?.id, -2) === numberFormatId);
  const customFormat = asString(numberFormat?.formatCode);
  return customFormat || EXCEL_BUILT_IN_NUMBER_FORMATS.get(numberFormatId) || "";
}

export function isExcelMonthYearFormat(formatCode: string): boolean {
  const normalized = formatCode.toLowerCase();
  return normalized.includes("mmm") && normalized.includes("yy") && !/(^|[^a-z])d{1,4}([^a-z]|$)/.test(normalized);
}

export function isExcelIsoDateFormat(formatCode: string): boolean {
  return /y{2,4}[-/]m{1,2}[-/]d{1,2}/i.test(formatCode);
}

export function isExcelDateFormat(formatCode: string): boolean {
  const normalized = formatCode.toLowerCase();
  if (!/[dmy]/.test(normalized)) return false;
  if (normalized.includes("%")) return false;
  return /(^|[^a-z])m{1,4}([^a-z]|$)/.test(normalized) ||
    /(^|[^a-z])d{1,4}([^a-z]|$)/.test(normalized) ||
    /(^|[^a-z])y{2,4}([^a-z]|$)/.test(normalized);
}

export function isExcelTimeFormat(formatCode: string): boolean {
  const normalized = formatCode.toLowerCase();
  return /\[?h\]?:mm/.test(normalized) || /^mm:ss/.test(normalized);
}

export function excelSerialTimeLabel(value: number, formatCode: string): string {
  const normalized = formatCode.toLowerCase();
  const totalSeconds = Math.max(0, Math.round(value * 86_400));
  const hoursTotal = Math.floor(totalSeconds / 3600);
  const hours = normalized.includes("[h]") ? hoursTotal : hoursTotal % 24;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (normalized.includes("am/pm")) {
    const suffix = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    const withSeconds = normalized.includes(":ss");
    return `${hour12}:${String(minutes).padStart(2, "0")}${withSeconds ? `:${String(seconds).padStart(2, "0")}` : ""} ${suffix}`;
  }
  if (/^mm:ss/.test(normalized)) return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (normalized.includes(":ss")) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function spreadsheetDecimalPlaces(formatCode: string): number {
  return formatCode.match(/\.([0#]+)/)?.[1]?.length ?? 0;
}

export function spreadsheetScientificLabel(value: number, formatCode: string): string {
  const decimals = spreadsheetDecimalPlaces(formatCode);
  return value.toExponential(decimals).replace("e", "E").replace(/E\+?(-?\d+)$/, (_match, exponent: string) => {
    const numericExponent = Number(exponent);
    const sign = numericExponent < 0 ? "-" : "+";
    return `E${sign}${String(Math.abs(numericExponent)).padStart(2, "0")}`;
  });
}

export function spreadsheetFractionLabel(value: number, formatCode: string): string {
  const denominatorLimit = formatCode.includes("??/??") ? 99 : 9;
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute);
  const fraction = absolute - whole;
  let bestNumerator = 0;
  let bestDenominator = 1;
  let bestError = Number.POSITIVE_INFINITY;
  for (let denominator = 1; denominator <= denominatorLimit; denominator += 1) {
    const numerator = Math.round(fraction * denominator);
    const error = Math.abs(fraction - numerator / denominator);
    if (error < bestError) {
      bestError = error;
      bestNumerator = numerator;
      bestDenominator = denominator;
    }
  }
  if (bestNumerator === 0) return `${sign}${whole}`;
  if (bestNumerator === bestDenominator) return `${sign}${whole + 1}`;
  return `${sign}${whole > 0 ? `${whole} ` : ""}${bestNumerator}/${bestDenominator}`;
}

export function spreadsheetCurrencyLabel(value: number, formatCode: string): string {
  const section = spreadsheetNumberFormatSection(value, formatCode);
  const decimals = spreadsheetDecimalPlaces(section);
  const absolute = Math.abs(value);
  const formatted = absolute.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  if (value < 0 && section.includes("(")) return `($${formatted})`;
  return `${value < 0 ? "-" : ""}$${formatted}`;
}

export function spreadsheetNumberLabel(value: number, formatCode: string): string {
  const section = spreadsheetNumberFormatSection(value, formatCode);
  const decimals = spreadsheetDecimalPlaces(section);
  const absolute = Math.abs(value);
  const formatted = absolute.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  if (value < 0 && section.includes("(")) return `(${formatted})`;
  return `${value < 0 ? "-" : ""}${formatted}`;
}

export function spreadsheetNumberFormatSection(value: number, formatCode: string): string {
  const sections = formatCode.split(";").map((section) => section.replace(/\[[^\]]+\]/g, ""));
  if (value < 0 && sections[1]) return sections[1];
  if (value === 0 && sections[2]) return sections[2];
  return sections[0] ?? formatCode;
}
