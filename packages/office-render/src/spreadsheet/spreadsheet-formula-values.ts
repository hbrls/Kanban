"use client";

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  columnIndexFromAddress,
  columnLabel,
  parseCellRange,
  rowIndexFromAddress,
  type RecordValue,
} from "../shared/office-preview-utils";
import { conditionalFormulaValue } from "./spreadsheet-conditional-formula";

const DAY_MS = 86_400_000;
const EXCEL_SERIAL_EPOCH_UTC = Date.UTC(1899, 11, 30);

type WorkbookCellIndex = Map<string, Map<string, RecordValue>>;
type WorkbookRowsBySheet = Map<string, Map<number, Map<number, RecordValue>>>;

export function spreadsheetSheetWithVolatileFormulaValues(
  sheet: RecordValue | undefined,
  sheets: readonly RecordValue[],
  today = new Date(),
  sourceName = "",
): RecordValue | undefined {
  if (!sheet) return sheet;
  const workbookIndex = workbookCellsBySheet(sheets);
  const rowsBySheet = workbookRowsBySheet(sheets);
  const sheetName = asString(sheet.name);
  const rowsByIndex = rowsBySheet.get(sheetName) ?? new Map();
  let changed = false;
  const rows = asArray(sheet.rows).map((rowValue) => {
    const row = asRecord(rowValue);
    if (!row) return rowValue;
    let rowChanged = false;
    const cells = asArray(row.cells).map((cellValue) => {
      const cell = asRecord(cellValue);
      if (!cell) return cellValue;
      const formula = asString(cell.formula);
      const sourceNameValue = formulaWorkbookFilenameValue(formula, sourceName, asString(cell.value));
      if (sourceNameValue != null) {
        rowChanged = true;
        changed = true;
        return { ...cell, value: sourceNameValue };
      }

      if (!formulaShouldRefreshDisplayValue(cell, formula)) return cellValue;
      const value = evaluateVolatileFormula(formula, sheetName, workbookIndex, today) ??
        evaluatePreviewFormula(formula, sheetName, rowsByIndex, rowsBySheet, cell);
      if (value == null) return cellValue;
      rowChanged = true;
      changed = true;
      return { ...cell, value };
    });
    return rowChanged ? { ...row, cells } : rowValue;
  });

  return changed ? { ...sheet, rows } : sheet;
}

export function evaluateVolatileFormula(
  formula: string,
  currentSheetName: string,
  workbookIndex: WorkbookCellIndex,
  today = new Date(),
): string | null {
  const normalized = formula.trim().replace(/^=/, "");
  const todaySerial = excelTodaySerial(today);
  const daysLeft = normalized.match(/^\$?([A-Z]+)\$?(\d+)\s*-\s*TODAY\(\)$/i);
  if (daysLeft) {
    const address = `${daysLeft[1]?.toUpperCase()}${daysLeft[2]}`;
    const dueDate = workbookCellNumber(workbookIndex, currentSheetName, address);
    return dueDate == null ? null : formatFormulaNumber(dueDate - todaySerial);
  }

  if (/^COUNTIFS\(/i.test(normalized) && /TODAY\(\)/i.test(normalized)) {
    const args = splitFormulaArgs(functionArgs(normalized));
    if (args.length < 2 || args.length % 2 !== 0) return null;
    const ranges = [];
    for (let index = 0; index < args.length; index += 2) {
      const range = workbookRangeValues(workbookIndex, currentSheetName, args[index] ?? "");
      if (range.length === 0) return null;
      ranges.push({ criteria: args[index + 1] ?? "", range });
    }

    const rowCount = Math.min(...ranges.map((item) => item.range.length));
    let count = 0;
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
      if (ranges.every((item) => criteriaMatches(item.range[rowOffset], item.criteria, todaySerial))) {
        count += 1;
      }
    }
    return String(count);
  }

  return null;
}

function evaluatePreviewFormula(
  formula: string,
  sheetName: string,
  rowsByIndex: ReadonlyMap<number, ReadonlyMap<number, RecordValue>>,
  rowsBySheet: ReadonlyMap<string, ReadonlyMap<number, ReadonlyMap<number, RecordValue>>>,
  cell: RecordValue,
): string | null {
  const address = asString(cell.address);
  const rowIndex = rowIndexFromAddress(address);
  const columnIndex = columnIndexFromAddress(address);
  const value = conditionalFormulaValue(formula, {
    columnIndex,
    formulas: [formula],
    range: { startColumn: columnIndex, startRow: rowIndex },
    rowsByIndex,
    rowsBySheet,
    rowIndex,
    sheetName,
  });
  return formulaDisplayValue(value, formula);
}

function workbookCellsBySheet(sheets: readonly RecordValue[]): WorkbookCellIndex {
  const workbook = new Map<string, Map<string, RecordValue>>();
  for (const sheet of sheets) {
    const cells = new Map<string, RecordValue>();
    for (const row of asArray(sheet.rows)) {
      const rowRecord = asRecord(row);
      for (const cell of asArray(rowRecord?.cells)) {
        const cellRecord = asRecord(cell);
        const address = asString(cellRecord?.address).toUpperCase();
        if (cellRecord && address) cells.set(address, cellRecord);
      }
    }
    workbook.set(asString(sheet.name), cells);
  }
  return workbook;
}

function workbookRowsBySheet(sheets: readonly RecordValue[]): WorkbookRowsBySheet {
  const workbook = new Map<string, Map<number, Map<number, RecordValue>>>();
  for (const sheet of sheets) {
    const rowsByIndex = new Map<number, Map<number, RecordValue>>();
    for (const row of asArray(sheet.rows)) {
      const rowRecord = asRecord(row);
      if (!rowRecord) continue;
      const rowIndex = asNumber(rowRecord.index, 1);
      const cells = new Map<number, RecordValue>();
      for (const cell of asArray(rowRecord.cells)) {
        const cellRecord = asRecord(cell);
        if (!cellRecord) continue;
        cells.set(columnIndexFromAddress(asString(cellRecord.address)), cellRecord);
      }
      rowsByIndex.set(rowIndex, cells);
    }
    workbook.set(asString(sheet.name), rowsByIndex);
  }
  return workbook;
}

function formulaNeedsVolatileEvaluation(formula: string): boolean {
  return /\bTODAY\(\)/i.test(formula);
}

function formulaShouldRefreshDisplayValue(cell: RecordValue, formula: string): boolean {
  if (!formula) return false;
  return formulaNeedsVolatileEvaluation(formula) || asString(cell.value).trim().length === 0;
}

function formulaWorkbookFilenameValue(formula: string, sourceName: string, value: string): string | null {
  if (!sourceName || !/\bCELL\s*\(\s*"filename"/i.test(formula)) return null;
  const currentValue = value.trim();
  if (currentValue.length > 0 && currentValue !== "#NAME?") return null;
  const fileName = sourceName.split(/[\\/]/).pop() ?? sourceName;
  const firstDotIndex = fileName.indexOf(".");
  return firstDotIndex >= 0 ? fileName.slice(0, firstDotIndex) : fileName;
}

function formulaDisplayValue(value: unknown, formula: string): string | null {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? formatFormulaNumber(value) : null;
  const text = asString(value);
  if (text.length === 0 && !formulaNeedsVolatileEvaluation(formula)) return null;
  return text;
}

function workbookCellNumber(workbookIndex: WorkbookCellIndex, sheetName: string, address: string): number | null {
  const cell = workbookIndex.get(sheetName)?.get(address.toUpperCase());
  if (!cell) return null;
  const value = Number(asString(cell.value).trim());
  return Number.isFinite(value) ? value : null;
}

function workbookCellText(workbookIndex: WorkbookCellIndex, sheetName: string, address: string): string {
  const cell = workbookIndex.get(sheetName)?.get(address.toUpperCase());
  return asString(cell?.value);
}

function workbookRangeValues(
  workbookIndex: WorkbookCellIndex,
  currentSheetName: string,
  reference: string,
): string[] {
  const { rangeReference, sheetName } = splitSheetReference(reference, currentSheetName);
  const range = parseCellRange(rangeReference);
  if (!range) return [];
  const values: string[] = [];
  for (let row = range.startRow; row < range.startRow + range.rowSpan; row += 1) {
    for (let column = range.startColumn; column < range.startColumn + range.columnSpan; column += 1) {
      values.push(workbookCellText(workbookIndex, sheetName, `${columnLabel(column)}${row}`));
    }
  }
  return values;
}

function splitSheetReference(reference: string, currentSheetName: string): { rangeReference: string; sheetName: string } {
  const separator = reference.lastIndexOf("!");
  if (separator < 0) return { rangeReference: reference.trim(), sheetName: currentSheetName };
  return {
    rangeReference: reference.slice(separator + 1).trim(),
    sheetName: reference.slice(0, separator).replace(/^'|'$/g, "").trim(),
  };
}

function criteriaMatches(value: string | undefined, criteria: string, todaySerial: number): boolean {
  const normalized = criteria.trim();
  const todayMatch = normalized.match(/^"([<>=]{1,2})"\s*&\s*TODAY\(\)$/i);
  if (todayMatch) {
    return compareValues(Number(value), todaySerial, todayMatch[1] ?? "=");
  }

  const literal = spreadsheetStringLiteral(normalized) ?? normalized;
  const operatorMatch = literal.match(/^(<>|>=|<=|=|>|<)(.*)$/);
  if (!operatorMatch) return String(value ?? "") === literal;
  const operator = operatorMatch[1] ?? "=";
  const expected = operatorMatch[2] ?? "";
  const actualNumber = Number(value);
  const expectedNumber = Number(expected);
  if (Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
    return compareValues(actualNumber, expectedNumber, operator);
  }
  return compareText(String(value ?? ""), expected, operator);
}

function compareValues(actual: number, expected: number, operator: string): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  if (operator === "<") return actual < expected;
  if (operator === "<=") return actual <= expected;
  if (operator === ">") return actual > expected;
  if (operator === ">=") return actual >= expected;
  if (operator === "<>") return actual !== expected;
  return actual === expected;
}

function compareText(actual: string, expected: string, operator: string): boolean {
  if (operator === "<>") return actual !== expected;
  if (operator === "=") return actual === expected;
  return false;
}

function functionArgs(formula: string): string {
  const open = formula.indexOf("(");
  const close = formula.lastIndexOf(")");
  return open >= 0 && close > open ? formula.slice(open + 1, close) : "";
}

function splitFormulaArgs(source: string): string[] {
  const args: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      current += char;
      if (inString && source[index + 1] === '"') {
        current += source[index + 1];
        index += 1;
      } else {
        inString = !inString;
      }
      continue;
    }
    if (!inString && char === "(") depth += 1;
    if (!inString && char === ")") depth = Math.max(0, depth - 1);
    if (!inString && depth === 0 && char === ",") {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim().length > 0) args.push(current.trim());
  return args;
}

function spreadsheetStringLiteral(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return null;
  return trimmed.slice(1, -1).replace(/""/g, '"');
}

function excelTodaySerial(today: Date): number {
  const utc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((utc - EXCEL_SERIAL_EPOCH_UTC) / DAY_MS);
}

function formatFormulaNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toPrecision(15)).toString();
}
