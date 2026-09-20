import {
  asArray,
  asNumber,
  asRecord,
  asString,
  cellText,
  columnIndexFromAddress,
  columnLabel,
  parseCellRange,
  type RecordValue,
} from "../shared/office-preview-utils";

type ConditionalFormulaRange = {
  startColumn: number;
  startRow: number;
};

export type ConditionalFormulaContext = {
  columnIndex: number;
  definedNames?: unknown;
  formulas: unknown;
  range: ConditionalFormulaRange;
  rowsBySheet?: ReadonlyMap<string, ReadonlyMap<number, ReadonlyMap<number, RecordValue>>>;
  rowsByIndex: ReadonlyMap<number, ReadonlyMap<number, RecordValue>>;
  rowIndex: number;
  sheetName?: string;
  tables?: unknown;
};

type CellReference = {
  columnAbsolute: boolean;
  columnIndex: number;
  rowAbsolute: boolean;
  rowIndex: number;
  sheetName?: string;
};

type FormulaCellValue = {
  columnIndex: number;
  rowIndex: number;
  value: string;
};

const CELL_REFERENCE_PATTERN = /^(?:'[^']+'|[A-Za-z0-9_ ]+!)?(\$?)([A-Z]{1,3})(\$?)(\d+)$/i;

export function conditionalFormulaMatches(context: ConditionalFormulaContext): boolean {
  const formula = asArray(context.formulas).map(asString).find(Boolean);
  if (!formula) return false;
  return valueToBoolean(evaluateFormulaExpression(stripFormulaPrefix(formula), context));
}

export function conditionalFormulaValue(formula: unknown, context: ConditionalFormulaContext): unknown {
  const expression = asString(formula);
  if (!expression) return "";
  return evaluateFormulaValue(stripFormulaPrefix(expression), context);
}

function evaluateFormulaExpression(expression: string, context: ConditionalFormulaContext): unknown {
  const trimmed = stripOuterParens(expression.trim());
  if (!trimmed) return "";

  const comparison = splitTopLevelComparison(trimmed);
  if (comparison) {
    const left = evaluateFormulaValue(comparison.left, context);
    const right = evaluateFormulaValue(comparison.right, context);
    return compareFormulaValues(left, right, comparison.operator);
  }

  return evaluateFormulaValue(trimmed, context);
}

function evaluateFormulaValue(expression: string, context: ConditionalFormulaContext): unknown {
  const trimmed = stripOuterParens(expression.trim());
  if (!trimmed) return "";

  const stringLiteral = trimmed.match(/^"((?:[^"]|"")*)"$/);
  if (stringLiteral) return stringLiteral[1].replaceAll("\"\"", "\"");

  if (/^(TRUE|FALSE)$/i.test(trimmed)) return /^TRUE$/i.test(trimmed);

  const numericValue = Number(trimmed);
  if (Number.isFinite(numericValue)) return numericValue;

  const cellReference = parseCellReference(trimmed);
  if (cellReference) return cellValueAtReference(cellReference, context);

  const structuredReference = parseStructuredReference(trimmed);
  if (structuredReference) return structuredReferenceValue(structuredReference, context);

  const definedName = definedNameValue(trimmed, context);
  if (definedName != null) return definedName;

  const call = parseFunctionCall(trimmed);
  if (call) return evaluateFormulaFunction(call.name, call.args, context);

  const arithmetic = splitTopLevelArithmetic(trimmed);
  if (arithmetic) {
    return evaluateArithmeticExpression(arithmetic, context);
  }

  if (trimmed.startsWith("-")) {
    const value = Number(evaluateFormulaValue(trimmed.slice(1), context));
    return Number.isFinite(value) ? -value : Number.NaN;
  }

  return trimmed;
}

function evaluateFormulaFunction(name: string, args: string[], context: ConditionalFormulaContext): unknown {
  const normalizedName = name.toUpperCase();
  if (normalizedName === "AND") {
    return args.every((arg) => valueToBoolean(evaluateFormulaExpression(arg, context)));
  }
  if (normalizedName === "OR") {
    return args.some((arg) => valueToBoolean(evaluateFormulaExpression(arg, context)));
  }
  if (normalizedName === "NOT") {
    return !valueToBoolean(evaluateFormulaExpression(args[0] ?? "", context));
  }
  if (normalizedName === "LT" || normalizedName === "LTE" || normalizedName === "GT" || normalizedName === "GTE") {
    const operator = normalizedName === "LT" ? "<" : normalizedName === "LTE" ? "<=" : normalizedName === "GT" ? ">" : ">=";
    return compareFormulaValues(evaluateFormulaValue(args[0] ?? "", context), evaluateFormulaValue(args[1] ?? "", context), operator);
  }
  if (normalizedName === "ISBLANK") {
    return asString(evaluateFormulaValue(args[0] ?? "", context)).trim().length === 0;
  }
  if (normalizedName === "ISNUMBER") {
    const value = evaluateFormulaValue(args[0] ?? "", context);
    return Number.isFinite(Number(value)) && asString(value).trim().length > 0;
  }
  if (normalizedName === "ISTEXT") {
    const value = evaluateFormulaValue(args[0] ?? "", context);
    return asString(value).trim().length > 0 && !Number.isFinite(Number(value));
  }
  if (normalizedName === "ISERROR") {
    return spreadsheetFormulaErrorMatches(asString(evaluateFormulaValue(args[0] ?? "", context)));
  }
  if (normalizedName === "ISNA") {
    return asString(evaluateFormulaValue(args[0] ?? "", context)).trim().toUpperCase() === "#N/A";
  }
  if (normalizedName === "ISODD") {
    const value = Number(evaluateFormulaValue(args[0] ?? "", context));
    return Number.isFinite(value) && Math.abs(Math.floor(value)) % 2 === 1;
  }
  if (normalizedName === "ISEVEN") {
    const value = Number(evaluateFormulaValue(args[0] ?? "", context));
    return Number.isFinite(value) && Math.abs(Math.floor(value)) % 2 === 0;
  }
  if (normalizedName === "IF") {
    return valueToBoolean(evaluateFormulaExpression(args[0] ?? "", context))
      ? evaluateFormulaExpression(args[1] ?? "", context)
      : evaluateFormulaExpression(args[2] ?? "FALSE", context);
  }
  if (normalizedName === "IFERROR") {
    const value = evaluateFormulaValue(args[0] ?? "", context);
    return spreadsheetFormulaErrorMatches(asString(value)) ? evaluateFormulaValue(args[1] ?? "", context) : value;
  }
  if (normalizedName === "IFNA") {
    const value = evaluateFormulaValue(args[0] ?? "", context);
    return asString(value).trim().toUpperCase() === "#N/A" ? evaluateFormulaValue(args[1] ?? "", context) : value;
  }
  if (normalizedName === "IFS") {
    return ifsFormulaValue(args, context);
  }
  if (normalizedName === "SWITCH") {
    return switchFormulaValue(args, context);
  }
  if (normalizedName === "CHOOSE") {
    return chooseFormulaValue(args, context);
  }
  if (normalizedName === "LEN") {
    return asString(evaluateFormulaValue(args[0] ?? "", context)).length;
  }
  if (normalizedName === "CHAR") {
    const code = Math.trunc(Number(evaluateFormulaValue(args[0] ?? "", context)));
    return Number.isFinite(code) && code >= 1 && code <= 255 ? String.fromCharCode(code) : "#VALUE!";
  }
  if (normalizedName === "TEXTBEFORE" || normalizedName === "TEXTAFTER") {
    return textBeforeAfterFormulaValue(args, context, normalizedName);
  }
  if (normalizedName === "EXACT") {
    return asString(evaluateFormulaValue(args[0] ?? "", context)) === asString(evaluateFormulaValue(args[1] ?? "", context));
  }
  if (normalizedName === "VALUE") {
    return valueFormulaNumber(asString(evaluateFormulaValue(args[0] ?? "", context)));
  }
  if (normalizedName === "LOWER") {
    return asString(evaluateFormulaValue(args[0] ?? "", context)).toLowerCase();
  }
  if (normalizedName === "UPPER") {
    return asString(evaluateFormulaValue(args[0] ?? "", context)).toUpperCase();
  }
  if (normalizedName === "TRIM") {
    return asString(evaluateFormulaValue(args[0] ?? "", context)).trim().replace(/\s+/g, " ");
  }
  if (normalizedName === "LEFT") {
    const value = asString(evaluateFormulaValue(args[0] ?? "", context));
    const count = Math.max(0, Math.floor(Number(evaluateFormulaValue(args[1] ?? "1", context))));
    return value.slice(0, Number.isFinite(count) ? count : 1);
  }
  if (normalizedName === "RIGHT") {
    const value = asString(evaluateFormulaValue(args[0] ?? "", context));
    const count = Math.max(0, Math.floor(Number(evaluateFormulaValue(args[1] ?? "1", context))));
    return value.slice(value.length - (Number.isFinite(count) ? count : 1));
  }
  if (normalizedName === "MID") {
    const value = asString(evaluateFormulaValue(args[0] ?? "", context));
    const start = Math.max(1, Math.floor(Number(evaluateFormulaValue(args[1] ?? "1", context))));
    const count = Math.max(0, Math.floor(Number(evaluateFormulaValue(args[2] ?? "0", context))));
    return value.slice(start - 1, start - 1 + (Number.isFinite(count) ? count : 0));
  }
  if (normalizedName === "SUBSTITUTE") {
    return substituteFormulaText(args, context);
  }
  if (normalizedName === "REPLACE") {
    return replaceFormulaText(args, context);
  }
  if (normalizedName === "CONCAT" || normalizedName === "CONCATENATE") {
    return formulaRawArgs(args, context).map(asString).join("");
  }
  if (normalizedName === "TEXTJOIN") {
    return textJoinFormulaText(args, context);
  }
  if (normalizedName === "TEXT") {
    return textFormulaValue(args, context);
  }
  if (normalizedName === "SEARCH" || normalizedName === "FIND") {
    const needle = asString(evaluateFormulaValue(args[0] ?? "", context));
    const haystack = asString(evaluateFormulaValue(args[1] ?? "", context));
    const start = Math.max(1, Math.floor(Number(evaluateFormulaValue(args[2] ?? "1", context))));
    const index = normalizedName === "SEARCH"
      ? haystack.toLowerCase().indexOf(needle.toLowerCase(), start - 1)
      : haystack.indexOf(needle, start - 1);
    return index >= 0 ? index + 1 : "#VALUE!";
  }
  if (normalizedName === "ABS") {
    const value = Number(evaluateFormulaValue(args[0] ?? "", context));
    return Number.isFinite(value) ? Math.abs(value) : Number.NaN;
  }
  if (normalizedName === "ROUND" || normalizedName === "ROUNDUP" || normalizedName === "ROUNDDOWN") {
    return roundFormulaNumber(
      Number(evaluateFormulaValue(args[0] ?? "", context)),
      Number(evaluateFormulaValue(args[1] ?? "0", context)),
      normalizedName,
    );
  }
  if (normalizedName === "INT") {
    const value = Number(evaluateFormulaValue(args[0] ?? "", context));
    return Number.isFinite(value) ? Math.floor(value) : Number.NaN;
  }
  if (normalizedName === "FLOOR" || normalizedName === "CEILING") {
    return multipleFormulaNumber(
      Number(evaluateFormulaValue(args[0] ?? "", context)),
      Number(evaluateFormulaValue(args[1] ?? "1", context)),
      normalizedName,
    );
  }
  if (normalizedName === "ROW") {
    return args.length > 0 ? resolvedCellReferenceValue(args[0], context, "row") : context.rowIndex;
  }
  if (normalizedName === "COLUMN") {
    return args.length > 0 ? resolvedCellReferenceValue(args[0], context, "column") + 1 : context.columnIndex + 1;
  }
  if (normalizedName === "MOD") {
    const dividend = Number(evaluateFormulaValue(args[0] ?? "", context));
    const divisor = Number(evaluateFormulaValue(args[1] ?? "", context));
    return Number.isFinite(dividend) && Number.isFinite(divisor) && divisor !== 0 ? dividend % divisor : Number.NaN;
  }
  if (normalizedName === "SUM") {
    return formulaNumericArgs(args, context).reduce((sum, value) => sum + value, 0);
  }
  if (normalizedName === "SUBTOTAL") {
    return subtotalFormulaValue(args, context);
  }
  if (normalizedName === "AVERAGE") {
    const values = formulaNumericArgs(args, context);
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
  }
  if (normalizedName === "MIN") {
    const values = formulaNumericArgs(args, context);
    return values.length > 0 ? Math.min(...values) : Number.NaN;
  }
  if (normalizedName === "MAX") {
    const values = formulaNumericArgs(args, context);
    return values.length > 0 ? Math.max(...values) : Number.NaN;
  }
  if (normalizedName === "COUNT") {
    return formulaNumericArgs(args, context).length;
  }
  if (normalizedName === "COUNTA") {
    return formulaRawArgs(args, context).filter((value) => asString(value).trim().length > 0).length;
  }
  if (normalizedName === "COUNTBLANK") {
    return countBlankFormulaValues(args, context);
  }
  if (normalizedName === "MEDIAN") {
    return medianFormulaNumber(formulaNumericArgs(args, context));
  }
  if (normalizedName === "LARGE" || normalizedName === "SMALL") {
    return rankedFormulaNumber(
      formulaNumericArgs([args[0] ?? ""], context),
      Number(evaluateFormulaValue(args[1] ?? "1", context)),
      normalizedName,
    );
  }
  if (normalizedName === "RANK" || normalizedName === "RANK.EQ") {
    return rankFormulaNumber(
      Number(evaluateFormulaValue(args[0] ?? "", context)),
      formulaNumericArgs([args[1] ?? ""], context),
      Number(evaluateFormulaValue(args[2] ?? "0", context)),
    );
  }
  if (normalizedName === "PERCENTILE" || normalizedName === "PERCENTILE.INC") {
    return percentileFormulaNumber(
      formulaNumericArgs([args[0] ?? ""], context),
      Number(evaluateFormulaValue(args[1] ?? "", context)),
    );
  }
  if (normalizedName === "COUNTIF") {
    return countIf(args, context);
  }
  if (normalizedName === "COUNTIFS") {
    return countIfs(args, context);
  }
  if (normalizedName === "SUMIF") {
    return aggregateIf(args, context, "sum");
  }
  if (normalizedName === "SUMIFS") {
    return aggregateIfs(args, context, "sum");
  }
  if (normalizedName === "AVERAGEIF") {
    return aggregateIf(args, context, "average");
  }
  if (normalizedName === "AVERAGEIFS") {
    return aggregateIfs(args, context, "average");
  }
  if (normalizedName === "MINIFS") {
    return aggregateIfs(args, context, "min");
  }
  if (normalizedName === "MAXIFS") {
    return aggregateIfs(args, context, "max");
  }
  if (normalizedName === "INDEX") {
    return indexFormulaValue(args, context);
  }
  if (normalizedName === "MATCH") {
    return matchFormulaValue(args, context);
  }
  if (normalizedName === "VLOOKUP") {
    return vlookupFormulaValue(args, context);
  }
  if (normalizedName === "XLOOKUP") {
    return xlookupFormulaValue(args, context);
  }
  if (normalizedName === "TODAY") {
    return currentExcelSerialDay();
  }
  if (normalizedName === "NOW") {
    return currentExcelSerialNow();
  }
  if (normalizedName === "DATEVALUE") {
    return dateValueFormulaNumber(asString(evaluateFormulaValue(args[0] ?? "", context)));
  }
  if (normalizedName === "TIME") {
    return timeFormulaNumber(
      Number(evaluateFormulaValue(args[0] ?? "0", context)),
      Number(evaluateFormulaValue(args[1] ?? "0", context)),
      Number(evaluateFormulaValue(args[2] ?? "0", context)),
    );
  }
  if (normalizedName === "TIMEVALUE") {
    return timeValueFormulaNumber(asString(evaluateFormulaValue(args[0] ?? "", context)));
  }
  if (normalizedName === "DATE") {
    const year = Number(evaluateFormulaValue(args[0] ?? "", context));
    const month = Number(evaluateFormulaValue(args[1] ?? "", context));
    const day = Number(evaluateFormulaValue(args[2] ?? "", context));
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return excelSerialDay(year, month, day);
    }
    return Number.NaN;
  }
  if (normalizedName === "EDATE") {
    return addExcelSerialMonths(
      Number(evaluateFormulaValue(args[0] ?? "", context)),
      Number(evaluateFormulaValue(args[1] ?? "0", context)),
    );
  }
  if (normalizedName === "EOMONTH") {
    return endOfExcelSerialMonth(
      Number(evaluateFormulaValue(args[0] ?? "", context)),
      Number(evaluateFormulaValue(args[1] ?? "0", context)),
    );
  }
  if (normalizedName === "NETWORKDAYS") {
    return networkDaysFormulaNumber(
      Number(evaluateFormulaValue(args[0] ?? "", context)),
      Number(evaluateFormulaValue(args[1] ?? "", context)),
      formulaNumericArgs([args[2] ?? ""], context),
    );
  }
  if (normalizedName === "WORKDAY") {
    return workdayFormulaNumber(
      Number(evaluateFormulaValue(args[0] ?? "", context)),
      Number(evaluateFormulaValue(args[1] ?? "", context)),
      formulaNumericArgs([args[2] ?? ""], context),
    );
  }
  if (normalizedName === "DATEDIF") {
    return datedifFormulaNumber(
      Number(evaluateFormulaValue(args[0] ?? "", context)),
      Number(evaluateFormulaValue(args[1] ?? "", context)),
      asString(evaluateFormulaValue(args[2] ?? "\"D\"", context)),
    );
  }
  if (normalizedName === "YEAR" || normalizedName === "MONTH" || normalizedName === "DAY" || normalizedName === "WEEKDAY") {
    return excelSerialDatePart(Number(evaluateFormulaValue(args[0] ?? "", context)), normalizedName, Number(evaluateFormulaValue(args[1] ?? "1", context)));
  }

  return "";
}

function compareFormulaValues(left: unknown, right: unknown, operator: string): boolean {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  const leftValue = numeric ? leftNumber : asString(left);
  const rightValue = numeric ? rightNumber : asString(right);

  if (operator === "=") return leftValue === rightValue;
  if (operator === "<>") return leftValue !== rightValue;
  if (operator === ">") return leftValue > rightValue;
  if (operator === ">=") return leftValue >= rightValue;
  if (operator === "<") return leftValue < rightValue;
  if (operator === "<=") return leftValue <= rightValue;
  return false;
}

function ifsFormulaValue(args: string[], context: ConditionalFormulaContext): unknown {
  for (let index = 0; index < args.length - 1; index += 2) {
    if (valueToBoolean(evaluateFormulaExpression(args[index] ?? "", context))) {
      return evaluateFormulaExpression(args[index + 1] ?? "", context);
    }
  }
  return "";
}

function switchFormulaValue(args: string[], context: ConditionalFormulaContext): unknown {
  const target = evaluateFormulaValue(args[0] ?? "", context);
  const hasDefault = args.length > 2 && (args.length - 1) % 2 === 1;
  const pairEnd = hasDefault ? args.length - 1 : args.length;
  for (let index = 1; index < pairEnd - 1; index += 2) {
    if (formulaLookupValuesEqual(evaluateFormulaValue(args[index] ?? "", context), target)) {
      return evaluateFormulaExpression(args[index + 1] ?? "", context);
    }
  }
  return hasDefault ? evaluateFormulaExpression(args[args.length - 1] ?? "", context) : "";
}

function chooseFormulaValue(args: string[], context: ConditionalFormulaContext): unknown {
  const index = Math.trunc(Number(evaluateFormulaValue(args[0] ?? "", context)));
  if (!Number.isFinite(index) || index < 1 || index >= args.length) return "";
  return evaluateFormulaExpression(args[index] ?? "", context);
}

function textBeforeAfterFormulaValue(args: string[], context: ConditionalFormulaContext, mode: "TEXTAFTER" | "TEXTBEFORE"): string {
  const text = asString(evaluateFormulaValue(args[0] ?? "", context));
  const delimiter = asString(evaluateFormulaValue(args[1] ?? "", context));
  const instance = Math.trunc(Number(evaluateFormulaValue(args[2] ?? "1", context)));
  const ifNotFound = args[5] != null ? asString(evaluateFormulaValue(args[5], context)) : "#N/A";
  if (!delimiter || !Number.isFinite(instance) || instance === 0) return "#VALUE!";

  const indexes: number[] = [];
  let searchFrom = 0;
  while (searchFrom <= text.length) {
    const index = text.indexOf(delimiter, searchFrom);
    if (index < 0) break;
    indexes.push(index);
    searchFrom = index + delimiter.length;
  }

  const delimiterIndex = instance > 0 ? indexes[instance - 1] : indexes[indexes.length + instance];
  if (delimiterIndex == null) return ifNotFound;
  return mode === "TEXTBEFORE" ? text.slice(0, delimiterIndex) : text.slice(delimiterIndex + delimiter.length);
}

function valueFormulaNumber(value: string): number {
  const trimmed = value.trim();
  const percent = trimmed.endsWith("%");
  const parsed = Number(trimmed.replace(/%$/, "").replaceAll(",", ""));
  if (!Number.isFinite(parsed)) return Number.NaN;
  return percent ? parsed / 100 : parsed;
}

function substituteFormulaText(args: string[], context: ConditionalFormulaContext): string {
  const value = asString(evaluateFormulaValue(args[0] ?? "", context));
  const target = asString(evaluateFormulaValue(args[1] ?? "", context));
  const replacement = asString(evaluateFormulaValue(args[2] ?? "", context));
  if (!target) return value;
  const instanceValue = args.length > 3 ? evaluateFormulaValue(args[3] ?? "", context) : "";
  const instance = Number(instanceValue);
  if (asString(instanceValue).trim().length === 0 || !Number.isFinite(instance)) return value.split(target).join(replacement);

  let seen = 0;
  return value.replaceAll(target, (match) => {
    seen += 1;
    return seen === Math.trunc(instance) ? replacement : match;
  });
}

function replaceFormulaText(args: string[], context: ConditionalFormulaContext): string {
  const value = asString(evaluateFormulaValue(args[0] ?? "", context));
  const start = Math.max(1, Math.trunc(Number(evaluateFormulaValue(args[1] ?? "1", context))));
  const count = Math.max(0, Math.trunc(Number(evaluateFormulaValue(args[2] ?? "0", context))));
  const replacement = asString(evaluateFormulaValue(args[3] ?? "", context));
  return `${value.slice(0, start - 1)}${replacement}${value.slice(start - 1 + count)}`;
}

function textJoinFormulaText(args: string[], context: ConditionalFormulaContext): string {
  const delimiter = asString(evaluateFormulaValue(args[0] ?? "", context));
  const ignoreEmpty = valueToBoolean(evaluateFormulaValue(args[1] ?? "FALSE", context));
  const values = formulaRawArgs(args.slice(2), context).map(asString);
  return (ignoreEmpty ? values.filter((value) => value.length > 0) : values).join(delimiter);
}

function textFormulaValue(args: string[], context: ConditionalFormulaContext): string {
  const value = Number(evaluateFormulaValue(args[0] ?? "", context));
  const format = asString(evaluateFormulaValue(args[1] ?? "\"General\"", context));
  if (!Number.isFinite(value)) return "";
  const normalizedFormat = format.toLowerCase();
  if (/[yd]/.test(normalizedFormat)) return formatExcelSerialDate(value, format);
  if (/[hs]/.test(normalizedFormat)) return formatExcelSerialTime(value, format);
  if (format.includes("%")) return `${formatNumberWithDecimals(value * 100, format)}%`;
  return formatNumberWithDecimals(value, format);
}

function evaluateArithmeticExpression(
  expression: { left: string; operator: string; right: string },
  context: ConditionalFormulaContext,
): number {
  const left = Number(evaluateFormulaValue(expression.left, context));
  const right = Number(evaluateFormulaValue(expression.right, context));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.NaN;
  if (expression.operator === "+") return left + right;
  if (expression.operator === "-") return left - right;
  if (expression.operator === "*") return left * right;
  if (expression.operator === "/") return right !== 0 ? left / right : Number.NaN;
  if (expression.operator === "^") return left ** right;
  return Number.NaN;
}

function roundFormulaNumber(value: number, digits: number, mode: string): number {
  if (!Number.isFinite(value) || !Number.isFinite(digits)) return Number.NaN;
  const multiplier = 10 ** Math.trunc(digits);
  if (!Number.isFinite(multiplier) || multiplier === 0) return Number.NaN;
  const scaled = value * multiplier;
  if (mode === "ROUNDUP") return Math.sign(scaled) * Math.ceil(Math.abs(scaled)) / multiplier;
  if (mode === "ROUNDDOWN") return Math.sign(scaled) * Math.floor(Math.abs(scaled)) / multiplier;
  return Math.round(scaled) / multiplier;
}

function multipleFormulaNumber(value: number, significance: number, mode: string): number {
  if (!Number.isFinite(value) || !Number.isFinite(significance) || significance === 0) return Number.NaN;
  const divisor = Math.abs(significance);
  return mode === "CEILING" ? Math.ceil(value / divisor) * divisor : Math.floor(value / divisor) * divisor;
}

function cellValueAtReference(reference: CellReference, context: ConditionalFormulaContext): string {
  const rowIndex = reference.rowAbsolute
    ? reference.rowIndex
    : context.rowIndex + reference.rowIndex - context.range.startRow;
  const columnIndex = reference.columnAbsolute
    ? reference.columnIndex
    : context.columnIndex + reference.columnIndex - context.range.startColumn;
  const cell = rowsBySheetName(context, reference.sheetName).get(rowIndex)?.get(columnIndex) ?? null;
  return cellText(cell);
}

function formulaNumericArgs(args: string[], context: ConditionalFormulaContext): number[] {
  const values: number[] = [];
  for (const arg of args) {
    const rangeValues = formulaArgumentCanExpandRange(arg, context) ? formulaRangeValues(arg, context) : null;
    if (rangeValues) {
      values.push(...rangeValues.map(Number).filter(Number.isFinite));
      continue;
    }

    const value = Number(evaluateFormulaValue(arg, context));
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

function formulaRawArgs(args: string[], context: ConditionalFormulaContext): unknown[] {
  const values: unknown[] = [];
  for (const arg of args) {
    const rangeValues = formulaArgumentCanExpandRange(arg, context) ? formulaRangeValues(arg, context) : null;
    if (rangeValues) {
      values.push(...rangeValues);
      continue;
    }

    values.push(evaluateFormulaValue(arg, context));
  }
  return values;
}

function subtotalFormulaValue(args: string[], context: ConditionalFormulaContext): number {
  const functionNumber = Math.trunc(Number(evaluateFormulaValue(args[0] ?? "", context)));
  const values = formulaNumericArgs(args.slice(1), context);
  if (functionNumber === 1 || functionNumber === 101) {
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
  }
  if (functionNumber === 2 || functionNumber === 102) return values.length;
  if (functionNumber === 4 || functionNumber === 104) return values.length > 0 ? Math.max(...values) : Number.NaN;
  if (functionNumber === 5 || functionNumber === 105) return values.length > 0 ? Math.min(...values) : Number.NaN;
  if (functionNumber === 9 || functionNumber === 109) return values.reduce((sum, value) => sum + value, 0);
  if (functionNumber === 3 || functionNumber === 103) {
    return formulaRawArgs(args.slice(1), context).filter((value) => asString(value).trim().length > 0).length;
  }
  return Number.NaN;
}

function formulaArgumentCanExpandRange(expression: string, context: ConditionalFormulaContext): boolean {
  return formulaRangeTarget(expression, context).includes(":");
}

function formulaRangeValues(expression: string, context: ConditionalFormulaContext): string[] | null {
  const cells = formulaRangeCells(expression, context);
  return cells ? cells.map((cell) => cell.value) : null;
}

function formulaRangeCells(expression: string, context: ConditionalFormulaContext): FormulaCellValue[] | null {
  const target = formulaRangeTarget(expression, context);
  if (!/[A-Z]+\$?\d/i.test(target) && !target.includes(":")) return null;
  const { reference, sheetName } = splitFormulaSheetReference(target);
  const range = parseCellRange(reference);
  if (!range) return null;

  const cells: FormulaCellValue[] = [];
  for (const [rowIndex, row] of rowsBySheetName(context, sheetName)) {
    if (rowIndex < range.startRow || rowIndex >= range.startRow + range.rowSpan) continue;
    for (const [columnIndex, cell] of row) {
      if (columnIndex < range.startColumn || columnIndex >= range.startColumn + range.columnSpan) continue;
      cells.push({ columnIndex, rowIndex, value: cellText(cell) });
    }
  }
  return cells;
}

function formulaRangeTarget(expression: string, context: ConditionalFormulaContext): string {
  const target = definedNameTarget(stripFormulaPrefix(expression), context) ?? stripFormulaPrefix(expression);
  return offsetFormulaRangeTarget(target, context) ?? target;
}

function countIf(args: string[], context: ConditionalFormulaContext): number {
  const cells = formulaRangeCells(args[0] ?? "", context);
  if (!cells) return 0;
  const criterion = formulaCriteria(args[1] ?? "", context);
  return cells.filter((cell) => formulaCriteriaMatches(cell.value, criterion)).length;
}

function countIfs(args: string[], context: ConditionalFormulaContext): number {
  if (args.length < 2 || args.length % 2 !== 0) return 0;
  const firstRange = formulaRange(args[0] ?? "", context);
  const firstCells = firstRange ? formulaRangeCells(args[0] ?? "", context) : null;
  if (!firstRange || !firstCells) return 0;

  const criteria: FormulaCriteriaRange[] = [];
  for (let index = 0; index < args.length; index += 2) {
    const criteriaRange = formulaCriteriaRange(args[index] ?? "", args[index + 1] ?? "", context);
    if (!criteriaRange) return 0;
    criteria.push(criteriaRange);
  }

  return firstCells.filter((cell) => {
    const rowOffset = cell.rowIndex - firstRange.startRow;
    const columnOffset = cell.columnIndex - firstRange.startColumn;
    return criteria.every((item) => formulaCriteriaRangeMatches(item, rowOffset, columnOffset));
  }).length;
}

function countBlankFormulaValues(args: string[], context: ConditionalFormulaContext): number {
  let count = 0;
  for (const arg of args) {
    const range = formulaRange(arg, context);
    const cells = formulaRangeCells(arg, context);
    if (range && cells) {
      const area = range.rowSpan * range.columnSpan;
      const explicitBlankCount = cells.filter((cell) => cell.value.trim().length === 0).length;
      count += area <= 100_000 ? area - cells.filter((cell) => cell.value.trim().length > 0).length : explicitBlankCount;
      continue;
    }

    if (asString(evaluateFormulaValue(arg, context)).trim().length === 0) count += 1;
  }
  return count;
}

function medianFormulaNumber(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rankedFormulaNumber(values: number[], rank: number, mode: string): number {
  const position = Math.trunc(rank) - 1;
  if (values.length === 0 || !Number.isFinite(position) || position < 0 || position >= values.length) return Number.NaN;
  const sorted = [...values].sort((left, right) => mode === "SMALL" ? left - right : right - left);
  return sorted[position];
}

function rankFormulaNumber(value: number, values: number[], order: number): number {
  if (!Number.isFinite(value) || values.length === 0) return Number.NaN;
  const ascending = Number.isFinite(order) && order !== 0;
  return 1 + values.filter((candidate) => ascending ? candidate < value : candidate > value).length;
}

function percentileFormulaNumber(values: number[], percentile: number): number {
  if (values.length === 0 || !Number.isFinite(percentile) || percentile < 0 || percentile > 1) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

type FormulaCriteriaRange = {
  cellsByOffset: Map<string, string>;
  criterion: { operator: string; value: unknown };
  range: NonNullable<ReturnType<typeof parseCellRange>>;
};

function aggregateIf(args: string[], context: ConditionalFormulaContext, kind: "average" | "sum"): number {
  const criteriaRange = formulaCriteriaRange(args[0] ?? "", args[1] ?? "", context);
  if (!criteriaRange) return kind === "sum" ? 0 : Number.NaN;

  const sumRange = formulaRange(args[2] ?? "", context) ?? criteriaRange.range;
  const sumCells = formulaRangeCells(args[2] ?? args[0] ?? "", context);
  if (!sumCells) return kind === "sum" ? 0 : Number.NaN;
  const sumByOffset = cellsByOffset(sumCells, sumRange);
  const values = numericValuesMatchingCriteria(criteriaRange, sumByOffset);
  return aggregateNumericValues(values, kind);
}

function aggregateIfs(args: string[], context: ConditionalFormulaContext, kind: "average" | "max" | "min" | "sum"): number {
  if (args.length < 3 || args.length % 2 !== 1) return aggregateEmptyResult(kind);
  const sumRange = formulaRange(args[0] ?? "", context);
  const sumCells = formulaRangeCells(args[0] ?? "", context);
  if (!sumRange || !sumCells) return aggregateEmptyResult(kind);
  const sumByOffset = cellsByOffset(sumCells, sumRange);

  const criteria: FormulaCriteriaRange[] = [];
  for (let index = 1; index < args.length; index += 2) {
    const criteriaRange = formulaCriteriaRange(args[index] ?? "", args[index + 1] ?? "", context);
    if (!criteriaRange) return aggregateEmptyResult(kind);
    criteria.push(criteriaRange);
  }

  const values: number[] = [];
  for (const [key, rawValue] of sumByOffset) {
    const [rowOffsetText, columnOffsetText] = key.split(":");
    const rowOffset = Number(rowOffsetText);
    const columnOffset = Number(columnOffsetText);
    if (!Number.isFinite(rowOffset) || !Number.isFinite(columnOffset)) continue;
    if (!criteria.every((item) => formulaCriteriaRangeMatches(item, rowOffset, columnOffset))) continue;
    const value = Number(rawValue);
    if (Number.isFinite(value)) values.push(value);
  }
  return aggregateNumericValues(values, kind);
}

function numericValuesMatchingCriteria(criteriaRange: FormulaCriteriaRange, valuesByOffset: ReadonlyMap<string, string>): number[] {
  const values: number[] = [];
  for (const [key, candidate] of criteriaRange.cellsByOffset) {
    if (!formulaCriteriaMatches(candidate, criteriaRange.criterion)) continue;
    const value = Number(valuesByOffset.get(key) ?? "");
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

function aggregateNumericValues(values: number[], kind: "average" | "max" | "min" | "sum"): number {
  if (kind === "max") return values.length > 0 ? Math.max(...values) : Number.NaN;
  if (kind === "min") return values.length > 0 ? Math.min(...values) : Number.NaN;
  if (kind === "average") return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
  return values.reduce((sum, value) => sum + value, 0);
}

function aggregateEmptyResult(kind: "average" | "max" | "min" | "sum"): number {
  return kind === "sum" ? 0 : Number.NaN;
}

function formulaCriteriaRange(rangeExpression: string, criterionExpression: string, context: ConditionalFormulaContext): FormulaCriteriaRange | null {
  const range = formulaRange(rangeExpression, context);
  const cells = formulaRangeCells(rangeExpression, context);
  if (!range || !cells) return null;
  return {
    cellsByOffset: cellsByOffset(cells, range),
    criterion: formulaCriteria(criterionExpression, context),
    range,
  };
}

function formulaCriteriaRangeMatches(criteriaRange: FormulaCriteriaRange, rowOffset: number, columnOffset: number): boolean {
  const value = criteriaRange.cellsByOffset.get(`${rowOffset}:${columnOffset}`) ?? "";
  return formulaCriteriaMatches(value, criteriaRange.criterion);
}

function formulaRange(expression: string, context: ConditionalFormulaContext): ReturnType<typeof parseCellRange> {
  return parseCellRange(formulaRangeTarget(expression, context));
}

function offsetFormulaRangeTarget(expression: string, context: ConditionalFormulaContext): string | null {
  const call = parseFunctionCall(stripFormulaPrefix(expression));
  if (!call || call.name.toUpperCase() !== "OFFSET") return null;
  const rawBaseTarget = definedNameTarget(stripFormulaPrefix(call.args[0] ?? ""), context) ?? stripFormulaPrefix(call.args[0] ?? "");
  const baseTarget = offsetFormulaRangeTarget(rawBaseTarget, context) ?? rawBaseTarget;
  const { reference, sheetName } = splitFormulaSheetReference(baseTarget);
  const baseRange = parseCellRange(reference);
  if (!baseRange) return null;

  const rowOffset = Math.trunc(Number(evaluateFormulaValue(call.args[1] ?? "0", context)));
  const columnOffset = Math.trunc(Number(evaluateFormulaValue(call.args[2] ?? "0", context)));
  const rowSpan = Math.max(1, Math.trunc(Number(evaluateFormulaValue(call.args[3] ?? String(baseRange.rowSpan), context))));
  const columnSpan = Math.max(1, Math.trunc(Number(evaluateFormulaValue(call.args[4] ?? String(baseRange.columnSpan), context))));
  if (![rowOffset, columnOffset, rowSpan, columnSpan].every(Number.isFinite)) return null;

  const startColumn = Math.max(0, baseRange.startColumn + columnOffset);
  const startRow = Math.max(1, baseRange.startRow + rowOffset);
  const endColumn = startColumn + columnSpan - 1;
  const endRow = startRow + rowSpan - 1;
  const referenceText = `${columnLabel(startColumn)}${startRow}:${columnLabel(endColumn)}${endRow}`;
  return sheetName ? `${sheetName}!${referenceText}` : referenceText;
}

function indexFormulaValue(args: string[], context: ConditionalFormulaContext): string {
  const range = formulaRange(args[0] ?? "", context);
  const cells = formulaRangeCells(args[0] ?? "", context);
  if (!range || !cells) return "";
  const rowOffset = Math.max(0, Math.trunc(Number(evaluateFormulaValue(args[1] ?? "1", context))) - 1);
  const columnOffset = Math.max(0, Math.trunc(Number(evaluateFormulaValue(args[2] ?? "1", context))) - 1);
  return cellsByOffset(cells, range).get(`${rowOffset}:${columnOffset}`) ?? "";
}

function matchFormulaValue(args: string[], context: ConditionalFormulaContext): number {
  const cells = formulaRangeCells(args[1] ?? "", context);
  if (!cells) return Number.NaN;
  const lookupValue = evaluateFormulaValue(args[0] ?? "", context);
  const matchType = Number(evaluateFormulaValue(args[2] ?? "1", context));
  return matchLookupPosition(lookupValue, cells.map((cell) => cell.value), Number.isFinite(matchType) ? Math.trunc(matchType) : 1);
}

function vlookupFormulaValue(args: string[], context: ConditionalFormulaContext): string {
  const range = formulaRange(args[1] ?? "", context);
  const cells = formulaRangeCells(args[1] ?? "", context);
  if (!range || !cells) return "";
  const columnOffset = Math.trunc(Number(evaluateFormulaValue(args[2] ?? "1", context))) - 1;
  if (!Number.isFinite(columnOffset) || columnOffset < 0 || columnOffset >= range.columnSpan) return "";
  const lookupValue = evaluateFormulaValue(args[0] ?? "", context);
  const exact = !valueToBoolean(evaluateFormulaValue(args[3] ?? "TRUE", context));
  const byOffset = cellsByOffset(cells, range);
  const firstColumn = cells
    .filter((cell) => cell.columnIndex === range.startColumn)
    .sort((left, right) => left.rowIndex - right.rowIndex);
  const rowPosition = exact
    ? firstColumn.findIndex((cell) => formulaLookupValuesEqual(cell.value, lookupValue))
    : matchLookupPosition(lookupValue, firstColumn.map((cell) => cell.value), 1) - 1;
  return rowPosition >= 0 ? byOffset.get(`${rowPosition}:${columnOffset}`) ?? "" : "";
}

function xlookupFormulaValue(args: string[], context: ConditionalFormulaContext): string {
  const lookupCells = formulaRangeCells(args[1] ?? "", context);
  const returnRange = formulaRange(args[2] ?? "", context);
  const returnCells = formulaRangeCells(args[2] ?? "", context);
  if (!lookupCells || !returnRange || !returnCells) return asString(evaluateFormulaValue(args[3] ?? "", context));
  const lookupValue = evaluateFormulaValue(args[0] ?? "", context);
  const matchIndex = lookupCells.findIndex((cell) => formulaLookupValuesEqual(cell.value, lookupValue));
  if (matchIndex < 0) return asString(evaluateFormulaValue(args[3] ?? "", context));
  return returnCells[matchIndex]?.value ?? cellsByOffset(returnCells, returnRange).get(`${matchIndex}:0`) ?? "";
}

function matchLookupPosition(lookupValue: unknown, values: string[], matchType: number): number {
  if (matchType === 0) {
    const index = values.findIndex((value) => formulaLookupValuesEqual(value, lookupValue));
    return index >= 0 ? index + 1 : Number.NaN;
  }

  let matchedIndex = -1;
  for (let index = 0; index < values.length; index += 1) {
    const comparison = formulaLookupCompare(values[index], lookupValue);
    if (matchType < 0 ? comparison >= 0 : comparison <= 0) matchedIndex = index;
  }
  return matchedIndex >= 0 ? matchedIndex + 1 : Number.NaN;
}

function formulaLookupValuesEqual(left: unknown, right: unknown): boolean {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
  return asString(left).trim().toLowerCase() === asString(right).trim().toLowerCase();
}

function formulaLookupCompare(left: unknown, right: unknown): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return asString(left).trim().toLowerCase().localeCompare(asString(right).trim().toLowerCase());
}

function cellsByOffset(cells: FormulaCellValue[], range: NonNullable<ReturnType<typeof parseCellRange>>): Map<string, string> {
  const map = new Map<string, string>();
  for (const cell of cells) {
    map.set(`${cell.rowIndex - range.startRow}:${cell.columnIndex - range.startColumn}`, cell.value);
  }
  return map;
}

function formulaCriteria(expression: string, context: ConditionalFormulaContext): { operator: string; value: unknown } {
  const value = evaluateFormulaValue(expression, context);
  const text = asString(value);
  const match = text.match(/^(>=|<=|<>|=|>|<)(.*)$/);
  if (!match) return { operator: "=", value };
  return {
    operator: match[1],
    value: match[2],
  };
}

function formulaCriteriaMatches(value: string, criterion: { operator: string; value: unknown }): boolean {
  const rawExpected = asString(criterion.value);
  const actualNumber = Number(value);
  const expectedNumber = Number(rawExpected);
  const numeric = Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) && rawExpected.trim().length > 0;
  const actual = numeric ? actualNumber : value.toLowerCase();
  const expected = numeric ? expectedNumber : rawExpected.toLowerCase();

  if (!numeric && /[*?]/.test(rawExpected)) {
    const wildcard = new RegExp(`^${escapeRegExp(rawExpected).replaceAll("\\*", ".*").replaceAll("\\?", ".")}$`, "i");
    return criterion.operator === "<>" ? !wildcard.test(value) : wildcard.test(value);
  }

  if (criterion.operator === "=") return actual === expected;
  if (criterion.operator === "<>") return actual !== expected;
  if (criterion.operator === ">") return actual > expected;
  if (criterion.operator === ">=") return actual >= expected;
  if (criterion.operator === "<") return actual < expected;
  if (criterion.operator === "<=") return actual <= expected;
  return false;
}

function spreadsheetFormulaErrorMatches(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return normalized === "#DIV/0!" ||
    normalized === "#N/A" ||
    normalized === "#NAME?" ||
    normalized === "#NULL!" ||
    normalized === "#NUM!" ||
    normalized === "#REF!" ||
    normalized === "#VALUE!" ||
    normalized === "#SPILL!" ||
    normalized === "#CALC!" ||
    normalized === "#FIELD!" ||
    normalized === "#GETTING_DATA";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolvedCellReferenceValue(
  expression: string,
  context: ConditionalFormulaContext,
  axis: "column" | "row",
): number {
  const reference = parseCellReference(expression);
  if (!reference) return axis === "row" ? context.rowIndex : context.columnIndex;
  if (axis === "row") {
    return reference.rowAbsolute ? reference.rowIndex : context.rowIndex + reference.rowIndex - context.range.startRow;
  }
  return reference.columnAbsolute ? reference.columnIndex : context.columnIndex + reference.columnIndex - context.range.startColumn;
}

function parseCellReference(value: string): CellReference | null {
  const { reference, sheetName } = splitFormulaSheetReference(value);
  const match = reference.match(CELL_REFERENCE_PATTERN);
  if (!match) return null;
  return {
    columnAbsolute: match[1] === "$",
    columnIndex: columnIndexFromAddress(match[2]),
    rowAbsolute: match[3] === "$",
    rowIndex: Math.max(1, Number.parseInt(match[4] ?? "1", 10)),
    ...(sheetName ? { sheetName } : {}),
  };
}

function rowsBySheetName(
  context: ConditionalFormulaContext,
  sheetName: string | undefined,
): ReadonlyMap<number, ReadonlyMap<number, RecordValue>> {
  const normalizedName = asString(sheetName || context.sheetName).toLowerCase();
  if (normalizedName && context.rowsBySheet) {
    for (const [candidateName, rows] of context.rowsBySheet) {
      if (candidateName.toLowerCase() === normalizedName) return rows;
    }
  }
  return context.rowsByIndex;
}

function splitFormulaSheetReference(value: string): { reference: string; sheetName?: string } {
  const trimmed = stripFormulaPrefix(value).trim();
  const separator = trimmed.lastIndexOf("!");
  if (separator < 0) return { reference: trimmed };
  return {
    reference: trimmed.slice(separator + 1).trim(),
    sheetName: trimmed.slice(0, separator).replace(/^'|'$/g, "").trim(),
  };
}

function parseStructuredReference(value: string): { columnName: string; tableName: string } | null {
  const currentRowMatch = value.match(/^(?:(.+))?\[@([^\]]+)\]$/);
  if (currentRowMatch) {
    return {
      columnName: cleanStructuredReferenceName(currentRowMatch[2]),
      tableName: cleanStructuredReferenceName(currentRowMatch[1]),
    };
  }

  const thisRowMatch = value.match(/^(?:(.+))?\[\[#This Row\],\[([^\]]+)\]\]$/i);
  if (thisRowMatch) {
    return {
      columnName: cleanStructuredReferenceName(thisRowMatch[2]),
      tableName: cleanStructuredReferenceName(thisRowMatch[1]),
    };
  }

  const columnMatch = value.match(/^(.+)\[([^\]#@][^\]]*)\]$/);
  if (!columnMatch) return null;
  return {
    columnName: cleanStructuredReferenceName(columnMatch[2]),
    tableName: cleanStructuredReferenceName(columnMatch[1]),
  };
}

function structuredReferenceValue(
  reference: { columnName: string; tableName: string },
  context: ConditionalFormulaContext,
): string {
  const table = structuredReferenceTable(reference.tableName, context);
  if (!table || !reference.columnName) return "";

  const tableRange = parseCellRange(asString(table.reference) || asString(table.ref));
  if (!tableRange) return "";

  const headerRowCount = Math.max(0, asNumber(table.headerRowCount, 1));
  const totalsRowCount = Math.max(0, asNumber(table.totalsRowCount, table.totalsRowShown === true ? 1 : 0));
  const dataStartRow = tableRange.startRow + headerRowCount;
  const dataEndRow = tableRange.startRow + tableRange.rowSpan - totalsRowCount - 1;
  if (context.rowIndex < dataStartRow || context.rowIndex > dataEndRow) return "";

  const columnIndex = structuredReferenceColumnIndex(table, tableRange, reference.columnName, context);
  if (columnIndex == null) return "";
  return cellText(context.rowsByIndex.get(context.rowIndex)?.get(columnIndex) ?? null);
}

function structuredReferenceTable(tableName: string, context: ConditionalFormulaContext): RecordValue | null {
  const normalizedName = tableName.toLowerCase();
  for (const candidate of asArray(context.tables).map(asRecord).filter((table): table is RecordValue => table != null)) {
    const tableRange = parseCellRange(asString(candidate.reference) || asString(candidate.ref));
    if (!tableRange) continue;
    const candidateNames = [asString(candidate.name), asString(candidate.displayName)].map((name) => name.toLowerCase());
    const nameMatches = normalizedName.length > 0 && candidateNames.includes(normalizedName);
    const rowMatches = context.rowIndex >= tableRange.startRow && context.rowIndex < tableRange.startRow + tableRange.rowSpan;
    const columnMatches = context.columnIndex >= tableRange.startColumn &&
      context.columnIndex < tableRange.startColumn + tableRange.columnSpan;
    if (nameMatches || (!normalizedName && rowMatches && columnMatches)) return candidate;
  }
  return null;
}

function structuredReferenceColumnIndex(
  table: RecordValue,
  tableRange: NonNullable<ReturnType<typeof parseCellRange>>,
  columnName: string,
  context: ConditionalFormulaContext,
): number | null {
  const normalizedName = columnName.toLowerCase();
  const columnRecords = asArray(table.columns).map(asRecord).filter((column): column is RecordValue => column != null);
  const recordIndex = columnRecords.findIndex((column) => asString(column.name).toLowerCase() === normalizedName);
  if (recordIndex >= 0) return tableRange.startColumn + recordIndex;

  const headerCells = context.rowsByIndex.get(tableRange.startRow);
  for (let offset = 0; offset < tableRange.columnSpan; offset += 1) {
    const columnIndex = tableRange.startColumn + offset;
    if (cellText(headerCells?.get(columnIndex) ?? null).toLowerCase() === normalizedName) return columnIndex;
  }

  return null;
}

function definedNameValue(name: string, context: ConditionalFormulaContext): string | null {
  if (!/^[A-Z_][A-Z0-9_.]*$/i.test(name)) return null;
  const target = definedNameTarget(name, context);
  if (!target) return "";

  const range = /[A-Z]+\$?\d/i.test(target) ? parseCellRange(target) : null;
  if (range) {
    return cellText(context.rowsByIndex.get(range.startRow)?.get(range.startColumn) ?? null);
  }

  return target;
}

function definedNameTarget(name: string, context: ConditionalFormulaContext): string | null {
  const normalizedName = name.toLowerCase();
  const records = definedNameRecords(context.definedNames);
  const record = records.find((item) => asString(item.name).toLowerCase() === normalizedName);
  if (!record) return null;
  const target = asString(record.text) || asString(record.formula) || asString(record.value) || asString(record.reference);
  return target ? stripFormulaPrefix(target) : "";
}

function definedNameRecords(definedNames: unknown): RecordValue[] {
  const wrapper = asRecord(definedNames);
  return [
    ...asArray(definedNames),
    ...asArray(wrapper?.items),
    ...asArray(wrapper?.definedNames),
  ].map(asRecord).filter((item): item is RecordValue => item != null);
}

function cleanStructuredReferenceName(value: unknown): string {
  return asString(value).trim().replace(/^'|'$/g, "");
}

const DAY_MS = 86_400_000;
const EXCEL_SERIAL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function currentExcelSerialDay(): number {
  const now = new Date();
  return Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - EXCEL_SERIAL_EPOCH_UTC) / DAY_MS);
}

function currentExcelSerialNow(): number {
  const now = new Date();
  return (now.getTime() - EXCEL_SERIAL_EPOCH_UTC) / DAY_MS;
}

function excelSerialDay(year: number, month: number, day: number): number {
  return Math.floor((Date.UTC(year, month - 1, day) - EXCEL_SERIAL_EPOCH_UTC) / DAY_MS);
}

function excelSerialUtcDate(value: number): Date | null {
  if (!Number.isFinite(value)) return null;
  return new Date(EXCEL_SERIAL_EPOCH_UTC + Math.floor(value) * DAY_MS);
}

function excelSerialDatePart(value: number, part: string, weekdayReturnType: number): number {
  const date = excelSerialUtcDate(value);
  if (!date) return Number.NaN;
  if (part === "YEAR") return date.getUTCFullYear();
  if (part === "MONTH") return date.getUTCMonth() + 1;
  if (part === "DAY") return date.getUTCDate();
  const weekday = date.getUTCDay();
  if (weekdayReturnType === 2) return weekday === 0 ? 7 : weekday;
  if (weekdayReturnType === 3) return weekday === 0 ? 6 : weekday - 1;
  return weekday + 1;
}

function dateValueFormulaNumber(value: string): number {
  const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return Number.NaN;
  return excelSerialDay(Number(match[1]), Number(match[2]), Number(match[3]));
}

function timeFormulaNumber(hours: number, minutes: number, seconds: number): number {
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return Number.NaN;
  return (Math.trunc(hours) * 3600 + Math.trunc(minutes) * 60 + Math.trunc(seconds)) / 86_400;
}

function timeValueFormulaNumber(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return Number.NaN;
  return timeFormulaNumber(Number(match[1]), Number(match[2]), Number(match[3] ?? "0"));
}

function formatExcelSerialDate(value: number, format: string): string {
  const date = excelSerialUtcDate(value);
  if (!date) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const longMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return format.replace(/yyyy|yy|mmmm|mmm|mm|m|dd|d/gi, (token) => {
    if (/^yyyy$/i.test(token)) return String(date.getUTCFullYear()).padStart(4, "0");
    if (/^yy$/i.test(token)) return String(date.getUTCFullYear()).slice(-2);
    if (/^mmmm$/i.test(token)) return longMonths[date.getUTCMonth()] ?? "";
    if (/^mmm$/i.test(token)) return months[date.getUTCMonth()] ?? "";
    if (/^mm$/i.test(token)) return String(date.getUTCMonth() + 1).padStart(2, "0");
    if (/^m$/i.test(token)) return String(date.getUTCMonth() + 1);
    if (/^dd$/i.test(token)) return String(date.getUTCDate()).padStart(2, "0");
    return String(date.getUTCDate());
  });
}

function formatExcelSerialTime(value: number, format: string): string {
  const secondsInDay = modulo(Math.round((value - Math.floor(value)) * 86_400), 86_400);
  const hours = Math.floor(secondsInDay / 3600);
  const minutes = Math.floor((secondsInDay % 3600) / 60);
  const seconds = secondsInDay % 60;
  return format.replace(/hh|h|mm|m|ss|s/gi, (token) => {
    if (/^hh$/i.test(token)) return String(hours).padStart(2, "0");
    if (/^h$/i.test(token)) return String(hours);
    if (/^mm$/i.test(token)) return String(minutes).padStart(2, "0");
    if (/^m$/i.test(token)) return String(minutes);
    if (/^ss$/i.test(token)) return String(seconds).padStart(2, "0");
    return String(seconds);
  });
}

function formatNumberWithDecimals(value: number, format: string): string {
  const decimals = format.match(/\.([0#]+)/)?.[1].length ?? 0;
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}

function addExcelSerialMonths(value: number, months: number): number {
  const date = excelSerialUtcDate(value);
  if (!date || !Number.isFinite(months)) return Number.NaN;
  const targetMonthIndex = date.getUTCMonth() + Math.trunc(months);
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = modulo(targetMonthIndex, 12) + 1;
  const targetDay = Math.min(date.getUTCDate(), daysInUtcMonth(targetYear, targetMonth));
  return excelSerialDay(targetYear, targetMonth, targetDay);
}

function endOfExcelSerialMonth(value: number, months: number): number {
  const date = excelSerialUtcDate(value);
  if (!date || !Number.isFinite(months)) return Number.NaN;
  const targetMonthIndex = date.getUTCMonth() + Math.trunc(months);
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = modulo(targetMonthIndex, 12) + 1;
  return excelSerialDay(targetYear, targetMonth, daysInUtcMonth(targetYear, targetMonth));
}

function networkDaysFormulaNumber(startValue: number, endValue: number, holidays: number[]): number {
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return Number.NaN;
  const start = Math.floor(startValue);
  const end = Math.floor(endValue);
  const direction = start <= end ? 1 : -1;
  const holidaySet = new Set(holidays.map(Math.floor));
  let count = 0;
  for (let serial = start; direction > 0 ? serial <= end : serial >= end; serial += direction) {
    if (isExcelWorkingDay(serial, holidaySet)) count += direction;
  }
  return count;
}

function workdayFormulaNumber(startValue: number, daysValue: number, holidays: number[]): number {
  if (!Number.isFinite(startValue) || !Number.isFinite(daysValue)) return Number.NaN;
  const direction = daysValue < 0 ? -1 : 1;
  let remaining = Math.abs(Math.trunc(daysValue));
  let serial = Math.floor(startValue);
  const holidaySet = new Set(holidays.map(Math.floor));
  while (remaining > 0) {
    serial += direction;
    if (isExcelWorkingDay(serial, holidaySet)) remaining -= 1;
  }
  return serial;
}

function datedifFormulaNumber(startValue: number, endValue: number, unit: string): number {
  const start = excelSerialUtcDate(startValue);
  const end = excelSerialUtcDate(endValue);
  if (!start || !end || endValue < startValue) return Number.NaN;
  const normalizedUnit = unit.trim().toUpperCase();
  if (normalizedUnit === "D") return Math.floor(endValue) - Math.floor(startValue);

  const years = end.getUTCFullYear() - start.getUTCFullYear();
  const monthDelta = years * 12 + end.getUTCMonth() - start.getUTCMonth() - (end.getUTCDate() < start.getUTCDate() ? 1 : 0);
  if (normalizedUnit === "M") return Math.max(0, monthDelta);
  if (normalizedUnit === "Y") return Math.max(0, Math.floor(monthDelta / 12));
  return Number.NaN;
}

function isExcelWorkingDay(serial: number, holidays: ReadonlySet<number>): boolean {
  const weekday = excelSerialDatePart(serial, "WEEKDAY", 2);
  return weekday >= 1 && weekday <= 5 && !holidays.has(serial);
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function parseFunctionCall(value: string): { args: string[]; name: string } | null {
  const nameMatch = value.match(/^([A-Z][A-Z0-9.]*)\(/i);
  if (!nameMatch || !value.endsWith(")")) return null;
  const argsText = value.slice(nameMatch[0].length, -1);
  return {
    args: splitTopLevelArgs(argsText),
    name: nameMatch[1],
  };
}

function splitTopLevelComparison(value: string): { left: string; operator: string; right: string } | null {
  for (const operator of [">=", "<=", "<>", "=", ">", "<"]) {
    const index = findTopLevelOperator(value, operator);
    if (index < 0) continue;
    return {
      left: value.slice(0, index),
      operator,
      right: value.slice(index + operator.length),
    };
  }
  return null;
}

function splitTopLevelArithmetic(value: string): { left: string; operator: string; right: string } | null {
  return splitTopLevelArithmeticOperators(value, ["+", "-"]) ??
    splitTopLevelArithmeticOperators(value, ["*", "/"]) ??
    splitTopLevelArithmeticOperators(value, ["^"]);
}

function splitTopLevelArithmeticOperators(value: string, operators: string[]): { left: string; operator: string; right: string } | null {
  let depth = 0;
  let quoted = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === ")") depth += 1;
    if (char === "(") depth = Math.max(0, depth - 1);
    if (depth !== 0 || !operators.includes(char)) continue;
    const left = value.slice(0, index).trim();
    const right = value.slice(index + 1).trim();
    if (!left || !right || isUnaryArithmeticOperator(value, index)) continue;
    return { left, operator: char, right };
  }
  return null;
}

function isUnaryArithmeticOperator(value: string, index: number): boolean {
  const operator = value[index];
  if (operator !== "+" && operator !== "-") return false;
  const previous = value.slice(0, index).trimEnd().at(-1);
  return previous == null || previous === "(" || previous === "," || previous === "+" || previous === "-" || previous === "*" || previous === "/" || previous === "^";
}

function findTopLevelOperator(value: string, operator: string): number {
  let depth = 0;
  let quoted = false;
  for (let index = 0; index <= value.length - operator.length; index += 1) {
    const char = value[index];
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && value.slice(index, index + operator.length) === operator) return index;
  }
  return -1;
}

function splitTopLevelArgs(value: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\"") quoted = !quoted;
    if (quoted) continue;
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char !== "," || depth !== 0) continue;
    args.push(value.slice(start, index).trim());
    start = index + 1;
  }
  const last = value.slice(start).trim();
  return last.length > 0 ? [...args, last] : args;
}

function stripFormulaPrefix(value: string): string {
  return value.trim().replace(/^=/, "");
}

function stripOuterParens(value: string): string {
  let current = value;
  while (current.startsWith("(") && current.endsWith(")") && enclosesWholeExpression(current)) {
    current = current.slice(1, -1).trim();
  }
  return current;
}

function enclosesWholeExpression(value: string): boolean {
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\"") quoted = !quoted;
    if (quoted) continue;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0 && index < value.length - 1) return false;
  }
  return depth === 0;
}

function valueToBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const text = asString(value).trim();
  if (text.length === 0) return false;
  const numericValue = Number(text);
  return Number.isFinite(numericValue) ? numericValue !== 0 : /^TRUE$/i.test(text);
}
