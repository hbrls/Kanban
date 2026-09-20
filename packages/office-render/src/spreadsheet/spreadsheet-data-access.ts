import {
  asArray,
  asNumber,
  asRecord,
  asString,
  colorToCss,
  columnIndexFromAddress,
  type RecordValue,
} from "../shared/office-preview-utils";

const DEFAULT_SPREADSHEET_FONT_FAMILY = "Aptos, Calibri, Arial, Helvetica, sans-serif";

export function rowsByIndexForSheet(sheet: RecordValue | undefined): Map<number, Map<number, RecordValue>> {
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

export function cellAt(sheet: RecordValue | undefined, rowIndex: number, columnIndex: number): RecordValue | null {
  return rowsByIndexForSheet(sheet).get(rowIndex)?.get(columnIndex) ?? null;
}

export function defaultSpreadsheetSheetIndex(sheets: RecordValue[]): number {
  if (sheets.length <= 1) return 0;
  const readmeFirst = /^00[_ -]?readme$/i.test(asString(sheets[0]?.name));
  return readmeFirst ? 1 : 0;
}

export function spreadsheetSheetTabColor(sheet: RecordValue | undefined): string | undefined {
  return colorToCss(asRecord(sheet?.tabColor) ?? sheet?.tabColor);
}

export function spreadsheetFontFamily(typeface: string): string {
  const normalized = typeface.trim();
  if (!normalized) return DEFAULT_SPREADSHEET_FONT_FAMILY;
  const escaped = normalized.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}", ${DEFAULT_SPREADSHEET_FONT_FAMILY}`;
}
