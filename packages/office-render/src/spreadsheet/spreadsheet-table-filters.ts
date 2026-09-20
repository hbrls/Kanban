import {
  asArray,
  asNumber,
  asRecord,
  asString,
  cellText,
  columnLabel,
  parseCellRange,
  type RecordValue,
} from "../shared/office-preview-utils";

export type SpreadsheetTableFilterTarget = {
  bodyEndRow: number;
  bodyStartRow: number;
  columnIndex: number;
  columnName: string;
  headerRowIndex: number;
  id: string;
  tableName: string;
};

export type SpreadsheetTableFilterState = Record<string, string[] | undefined>;

export type SpreadsheetTableFilterValue = {
  count: number;
  label: string;
  value: string;
};

export type SpreadsheetTableFilterTextProvider = (
  cell: RecordValue | null,
  rowIndex: number,
  columnIndex: number,
) => string;

export type SpreadsheetTableFilterSizeOverrides = {
  columnWidths?: Record<number, number | undefined>;
  rowHeights?: Record<number, number | undefined>;
};

export function buildSpreadsheetTableFilterTargets(sheet: RecordValue | undefined): SpreadsheetTableFilterTarget[] {
  const targets: SpreadsheetTableFilterTarget[] = [];
  const tables = asArray(sheet?.tables).map(asRecord).filter((table): table is RecordValue => table != null);

  for (const table of tables) {
    if (!spreadsheetTableHasFilter(table)) continue;
    const reference = asString(table.reference) || asString(table.ref) || asString(asRecord(table.autoFilter)?.reference);
    const range = parseCellRange(reference);
    if (!range) continue;

    const headerRowCount = Math.max(1, asNumber(table.headerRowCount, 1));
    const totalsRowCount = Math.max(0, asNumber(table.totalsRowCount, table.totalsRowShown === true ? 1 : 0));
    const headerRowIndex = range.startRow + headerRowCount - 1;
    const bodyStartRow = headerRowIndex + 1;
    const bodyEndRow = Math.max(bodyStartRow, range.startRow + range.rowSpan - totalsRowCount);
    const tableName = asString(table.displayName) || asString(table.name) || reference;
    const columns = asArray(table.columns).map(asRecord);

    for (let offset = 0; offset < range.columnSpan; offset += 1) {
      const columnIndex = range.startColumn + offset;
      const column = columns[offset];
      targets.push({
        bodyEndRow,
        bodyStartRow,
        columnIndex,
        columnName: asString(column?.name) || spreadsheetHeaderCellText(sheet, headerRowIndex, columnIndex) || columnLabel(columnIndex),
        headerRowIndex,
        id: `${tableName}:${columnIndex}`,
        tableName,
      });
    }
  }

  return targets;
}

export function spreadsheetTableFilterTargetAt(
  targets: SpreadsheetTableFilterTarget[],
  rowIndex: number,
  columnIndex: number,
): SpreadsheetTableFilterTarget | null {
  return targets.find((target) => target.headerRowIndex === rowIndex && target.columnIndex === columnIndex) ?? null;
}

export function spreadsheetTableFilterValues(
  sheet: RecordValue | undefined,
  target: SpreadsheetTableFilterTarget,
  textProvider: SpreadsheetTableFilterTextProvider = defaultSpreadsheetTableFilterText,
): SpreadsheetTableFilterValue[] {
  const rows = spreadsheetRowsByIndex(sheet);
  const values = new Map<string, SpreadsheetTableFilterValue>();
  for (let rowIndex = target.bodyStartRow; rowIndex < target.bodyEndRow; rowIndex += 1) {
    const value = normalizeSpreadsheetFilterValue(textProvider(rows.get(rowIndex)?.get(target.columnIndex) ?? null, rowIndex, target.columnIndex));
    const current = values.get(value);
    if (current) {
      current.count += 1;
    } else {
      values.set(value, {
        count: 1,
        label: value || "(Blanks)",
        value,
      });
    }
  }

  return Array.from(values.values());
}

export function spreadsheetTableFilterRowHeightOverrides(
  sheet: RecordValue | undefined,
  filters: SpreadsheetTableFilterState,
  textProvider: SpreadsheetTableFilterTextProvider = defaultSpreadsheetTableFilterText,
): Record<number, number> {
  const activeTargets = buildSpreadsheetTableFilterTargets(sheet).filter((target) => {
    const selected = filters[target.id];
    return selected != null;
  });
  if (activeTargets.length === 0) return {};

  const rows = spreadsheetRowsByIndex(sheet);
  const overrides: Record<number, number> = {};
  for (const target of activeTargets) {
    const selected = new Set(filters[target.id] ?? []);
    for (let rowIndex = target.bodyStartRow; rowIndex < target.bodyEndRow; rowIndex += 1) {
      const rowOffset = rowIndex - 1;
      if (overrides[rowOffset] === 0) continue;
      const value = normalizeSpreadsheetFilterValue(textProvider(rows.get(rowIndex)?.get(target.columnIndex) ?? null, rowIndex, target.columnIndex));
      if (!selected.has(value)) overrides[rowOffset] = 0;
    }
  }

  return overrides;
}

export function spreadsheetTableFilterActiveKeys(
  targets: SpreadsheetTableFilterTarget[],
  filters: SpreadsheetTableFilterState,
): Set<string> {
  const keys = new Set<string>();
  for (const target of targets) {
    if (filters[target.id] == null) continue;
    keys.add(`${target.headerRowIndex}:${target.columnIndex}`);
  }
  return keys;
}

export function spreadsheetTableFilterSelectionForToggle(
  currentSelection: string[] | undefined,
  allValues: string[],
  toggledValue: string,
): string[] | undefined {
  const selected = new Set(currentSelection ?? allValues);
  if (selected.has(toggledValue)) selected.delete(toggledValue);
  else selected.add(toggledValue);
  const next = allValues.filter((value) => selected.has(value));
  return next.length === allValues.length ? undefined : next;
}

export function mergeSpreadsheetLayoutOverrides(
  base: SpreadsheetTableFilterSizeOverrides,
  next: SpreadsheetTableFilterSizeOverrides,
): SpreadsheetTableFilterSizeOverrides {
  return {
    columnWidths: {
      ...base.columnWidths,
      ...next.columnWidths,
    },
    rowHeights: {
      ...base.rowHeights,
      ...next.rowHeights,
    },
  };
}

function spreadsheetTableHasFilter(table: RecordValue): boolean {
  return table.showFilterButton === true || asRecord(table.autoFilter) != null;
}

function spreadsheetHeaderCellText(
  sheet: RecordValue | undefined,
  rowIndex: number,
  columnIndex: number,
): string {
  return cellText(spreadsheetRowsByIndex(sheet).get(rowIndex)?.get(columnIndex) ?? null).trim();
}

function spreadsheetRowsByIndex(sheet: RecordValue | undefined): Map<number, Map<number, RecordValue>> {
  const rows = new Map<number, Map<number, RecordValue>>();
  for (const row of asArray(sheet?.rows).map(asRecord).filter((row): row is RecordValue => row != null)) {
    const rowIndex = asNumber(row.index, 1);
    const cells = new Map<number, RecordValue>();
    for (const cell of asArray(row.cells).map(asRecord).filter((cell): cell is RecordValue => cell != null)) {
      const address = asString(cell.address);
      const match = /^([A-Z]+)(\d+)$/i.exec(address);
      if (!match) continue;
      cells.set(columnIndexFromLetters(match[1] ?? ""), cell);
    }
    rows.set(rowIndex, cells);
  }
  return rows;
}

function defaultSpreadsheetTableFilterText(cell: RecordValue | null): string {
  return cellText(cell);
}

function normalizeSpreadsheetFilterValue(value: string): string {
  return value.trim();
}

function columnIndexFromLetters(letters: string): number {
  let value = 0;
  for (const letter of letters.toUpperCase()) {
    const code = letter.charCodeAt(0);
    if (code < 65 || code > 90) continue;
    value = value * 26 + code - 64;
  }
  return Math.max(0, value - 1);
}
