"use client";

import type { PointerEvent } from "react";

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  cellText,
  columnIndexFromAddress,
  parseCellRange,
  type RecordValue,
  rowIndexFromAddress,
} from "../shared/office-preview-utils";
import { protocolColorToCss, type SpreadsheetCellVisual } from "./spreadsheet-conditional-visuals";
import { spreadsheetCellKey } from "./spreadsheet-layout";

export type SpreadsheetSparklineVisual = {
  color: string;
  lineWeight: number;
  markers: boolean;
  type: "column" | "line" | "stacked";
  values: number[];
};

export type SpreadsheetValidationVisual = {
  formula: string;
  prompt: string;
  type: "dropdown" | "validation";
};

export type SpreadsheetValidationVisualLookup = {
  get(key: string): SpreadsheetValidationVisual | undefined;
};

type SpreadsheetValidationVisualSpec = SpreadsheetValidationVisual & {
  ranges: NonNullable<ReturnType<typeof parseCellRange>>[];
};

const MAX_VALIDATION_VISUAL_CACHE_SIZE = 5_000;

export function buildSpreadsheetSparklineVisuals(sheet: RecordValue | undefined): Map<string, SpreadsheetSparklineVisual> {
  const visuals = new Map<string, SpreadsheetSparklineVisual>();
  const rows = rowsByIndexForSheet(sheet);
  const groupRoot = asRecord(sheet?.sparklineGroups);
  const groups = (groupRoot ? asArray(groupRoot.groups) : asArray(sheet?.sparklineGroups)).map(asRecord).filter((group): group is RecordValue => group != null);

  for (const group of groups) {
    const sparklines = asArray(group.sparklines)
      .map(asRecord)
      .filter((sparkline): sparkline is RecordValue => sparkline != null);
    for (const sparkline of sparklines) {
      const targetRange = parseCellRange(asString(sparkline.reference));
      if (!targetRange) continue;
      const values = sparklineValues(rows, asString(sparkline.formula) || asString(group.formula));
      if (values.length === 0) continue;
      visuals.set(spreadsheetCellKey(targetRange.startRow, targetRange.startColumn), {
        color: protocolColorToCss(group.seriesColor) ?? "#1f6f8b",
        lineWeight: Math.max(1, asNumber(group.lineWeight, 1.25)),
        markers: group.markers === true,
        type: spreadsheetSparklineType(group.type),
        values,
      });
    }
  }

  return visuals;
}

export function buildSpreadsheetCommentVisuals(root: RecordValue | null, sheet: RecordValue | undefined): Set<string> {
  const sheetName = asString(sheet?.name);
  const comments = new Set<string>();
  for (const item of [...asArray(root?.notes), ...asArray(root?.threads)]) {
    const record = asRecord(item);
    if (!record) continue;
    const target = spreadsheetCommentTarget(record);
    if (!target.address || (target.sheetName && sheetName && target.sheetName !== sheetName)) continue;
    comments.add(spreadsheetCellKey(rowIndexFromAddress(target.address), columnIndexFromAddress(target.address)));
  }
  return comments;
}

export function buildSpreadsheetValidationVisuals(sheet: RecordValue | undefined): SpreadsheetValidationVisualLookup {
  const specs: SpreadsheetValidationVisualSpec[] = [];
  for (const validation of spreadsheetDataValidationItems(sheet)) {
    const ranges = spreadsheetDataValidationReferences(validation)
      .map(parseCellRange)
      .filter((range): range is NonNullable<ReturnType<typeof parseCellRange>> => range != null);
    if (ranges.length === 0) continue;
    const typeCode = asNumber(validation.type, 0);
    const isDropdown = typeCode === 4 && validation.showDropDown !== true;
    specs.push({
      formula: asString(validation.formula1),
      prompt: asString(validation.prompt) || asString(validation.promptTitle),
      ranges,
      type: isDropdown ? "dropdown" : "validation",
    });
  }

  const cache = new Map<string, SpreadsheetValidationVisual | null>();
  return {
    get(key: string) {
      if (cache.has(key)) return cache.get(key) ?? undefined;
      const visual = spreadsheetValidationVisualAt(specs, key);
      if (cache.size >= MAX_VALIDATION_VISUAL_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        if (firstKey != null) cache.delete(firstKey);
      }
      cache.set(key, visual ?? null);
      return visual;
    },
  };
}

function spreadsheetValidationVisualAt(specs: SpreadsheetValidationVisualSpec[], key: string): SpreadsheetValidationVisual | undefined {
  const [rowValue, columnValue] = key.split(":");
  const rowIndex = Number(rowValue);
  const columnIndex = Number(columnValue);
  if (!Number.isFinite(rowIndex) || !Number.isFinite(columnIndex)) return undefined;

  for (const spec of specs) {
    if (!spec.ranges.some((range) => cellRangeContains(range, rowIndex, columnIndex))) continue;
    return {
      formula: spec.formula,
      prompt: spec.prompt,
      type: spec.type,
    };
  }

  return undefined;
}

function cellRangeContains(range: NonNullable<ReturnType<typeof parseCellRange>>, rowIndex: number, columnIndex: number): boolean {
  return (
    rowIndex >= range.startRow &&
    rowIndex < range.startRow + range.rowSpan &&
    columnIndex >= range.startColumn &&
    columnIndex < range.startColumn + range.columnSpan
  );
}

export function SpreadsheetCellContent({
  filterActive,
  hasComment,
  onValidationClick,
  onFilterClick,
  sparkline,
  text,
  validation,
  visual,
}: {
  filterActive?: boolean;
  hasComment?: boolean;
  onValidationClick?: (validation: SpreadsheetValidationVisual, event: PointerEvent<HTMLButtonElement>) => void;
  onFilterClick?: (event: PointerEvent<HTMLButtonElement>) => void;
  sparkline?: SpreadsheetSparklineVisual;
  text: string;
  validation?: SpreadsheetValidationVisual;
  visual?: SpreadsheetCellVisual;
}) {
  return (
    <>
      {sparkline ? <SpreadsheetSparkline visual={sparkline} /> : null}
      {hasComment ? <SpreadsheetCommentIndicator /> : null}
      {visual?.dataBar ? (
        <>
          <span
            aria-hidden="true"
            style={{
              background: visual.dataBar.gradient
                ? `linear-gradient(${visual.dataBar.direction === "rightToLeft" ? 270 : 90}deg, ${visual.dataBar.color} 0%, ${visual.dataBar.color} 72%, rgba(255,255,255,0) 100%)`
                : visual.dataBar.color,
              border: visual.dataBar.border ? `1px solid ${visual.dataBar.borderColor ?? visual.dataBar.color}` : undefined,
              bottom: 1,
              left: `${visual.dataBar.startPercent}%`,
              opacity: 0.75,
              position: "absolute",
              top: 1,
              width: `${visual.dataBar.widthPercent}%`,
              zIndex: 0,
            }}
          />
          {visual.dataBar.axisPercent === undefined ? null : (
            <span
              aria-hidden="true"
              style={{
                background: visual.dataBar.axisColor ?? "rgba(31, 41, 55, 0.45)",
                bottom: 1,
                left: `${visual.dataBar.axisPercent}%`,
                position: "absolute",
                top: 1,
                width: 1,
                zIndex: 1,
              }}
            />
          )}
        </>
      ) : null}
      {visual?.iconSet ? <SpreadsheetIconSet visual={visual.iconSet} /> : null}
      {sparkline || visual?.iconSet?.showValue === false || visual?.dataBar?.showValue === false ? null : (
        <span style={{ position: "relative", zIndex: 1 }}>{text}</span>
      )}
      {validation ? <SpreadsheetValidationIndicator onClick={onValidationClick} validation={validation} /> : null}
      {visual?.filter ? (
        <button
          aria-label="Open column filter"
          data-filter-active={filterActive ? "true" : undefined}
          onPointerDown={(event) => {
            if (!onFilterClick) return;
            event.preventDefault();
            event.stopPropagation();
            onFilterClick(event);
          }}
          style={{
            alignItems: "center",
            background: filterActive ? "#dbeafe" : "#ffffff",
            borderColor: filterActive ? "#2563eb" : "#cbd5e1",
            borderRadius: 3,
            borderStyle: "solid",
            borderWidth: 1,
            color: filterActive ? "#1d4ed8" : "#64748b",
            cursor: onFilterClick ? "pointer" : "default",
            display: "inline-flex",
            fontSize: 9,
            height: 14,
            justifyContent: "center",
            lineHeight: 1,
            marginLeft: 6,
            padding: 0,
            position: "relative",
            top: -1,
            verticalAlign: "middle",
            width: 14,
            zIndex: 1,
          }}
        >
          ▾
        </button>
      ) : null}
    </>
  );
}

function rowsByIndexForSheet(sheet: RecordValue | undefined): Map<number, Map<number, RecordValue>> {
  const rowMap = new Map<number, Map<number, RecordValue>>();
  const rows = asArray(sheet?.rows)
    .map(asRecord)
    .filter((row): row is RecordValue => row != null);
  for (const row of rows) {
    const rowIndex = asNumber(row.index, 1);
    const cells = new Map<number, RecordValue>();
    for (const cell of asArray(row.cells)) {
      const cellRecord = asRecord(cell);
      if (!cellRecord) continue;
      cells.set(columnIndexFromAddress(asString(cellRecord.address)), cellRecord);
    }
    rowMap.set(rowIndex, cells);
  }
  return rowMap;
}

function sparklineValues(rows: Map<number, Map<number, RecordValue>>, reference: string): number[] {
  const range = parseCellRange(reference);
  if (!range) return [];
  const values: number[] = [];
  for (let rowIndex = range.startRow; rowIndex < range.startRow + range.rowSpan; rowIndex += 1) {
    const row = rows.get(rowIndex);
    if (!row) continue;
    for (let columnIndex = range.startColumn; columnIndex < range.startColumn + range.columnSpan; columnIndex += 1) {
      const text = cellText(row.get(columnIndex)).trim();
      if (text.length === 0) continue;
      const value = Number(text);
      if (Number.isFinite(value)) values.push(value);
    }
  }
  return values;
}

function spreadsheetSparklineType(value: unknown): SpreadsheetSparklineVisual["type"] {
  const raw = asNumber(value, 1);
  if (raw === 2) return "column";
  if (raw === 3) return "stacked";
  return "line";
}

function spreadsheetCommentTarget(record: RecordValue): {
  address: string;
  sheetName: string;
} {
  const target = asRecord(record.target);
  const cell = asRecord(target?.cell) ?? asRecord(target?.cellTarget) ?? asRecord(record.cell);
  return {
    address: asString(record.address) || asString(record.reference) || asString(target?.address) || asString(cell?.address),
    sheetName: asString(record.sheetName) || asString(target?.sheetName) || asString(cell?.sheetName),
  };
}

function spreadsheetDataValidationItems(sheet: RecordValue | undefined): RecordValue[] {
  const dataValidations = asRecord(sheet?.dataValidations);
  const rawItems = dataValidations ? asArray(dataValidations.items) : asArray(sheet?.dataValidations);
  return rawItems.map(asRecord).filter((validation): validation is RecordValue => validation != null);
}

function spreadsheetDataValidationReferences(validation: RecordValue): string[] {
  const ranges = asArray(validation.ranges);
  if (ranges.length > 0) {
    return ranges
      .map((range) => {
        if (typeof range === "string") return range;
        const record = asRecord(range);
        if (!record) return "";
        const startAddress = asString(record.startAddress);
        const endAddress = asString(record.endAddress);
        return startAddress && endAddress && startAddress !== endAddress ? `${startAddress}:${endAddress}` : startAddress;
      })
      .filter(Boolean);
  }
  return asString(validation.range || validation.reference || validation.sqref)
    .split(/\s+/)
    .filter(Boolean);
}

function SpreadsheetValidationIndicator({
  onClick,
  validation,
}: {
  onClick?: (validation: SpreadsheetValidationVisual, event: PointerEvent<HTMLButtonElement>) => void;
  validation: SpreadsheetValidationVisual;
}) {
  const style = {
    alignItems: "center",
    background: validation.type === "dropdown" ? "#f8fafc" : "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 3,
    borderStyle: "solid",
    borderWidth: 1,
    bottom: 4,
    color: "#475569",
    display: "inline-flex",
    fontSize: 9,
    height: 14,
    justifyContent: "center",
    lineHeight: 1,
    padding: 0,
    position: "absolute",
    right: 4,
    width: 14,
    zIndex: 2,
  } as const;
  if (validation.type === "dropdown" && onClick) {
    return (
      <button
        aria-label="Open data validation list"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick(validation, event);
        }}
        style={{ ...style, cursor: "pointer" }}
        title={validation.prompt || validation.formula}
        type="button"
      >
        ▾
      </button>
    );
  }

  return (
    <span aria-hidden="true" style={style} title={validation.prompt || validation.formula}>
      {validation.type === "dropdown" ? "▾" : "!"}
    </span>
  );
}

export function spreadsheetValidationChoices(
  validation: SpreadsheetValidationVisual,
  activeSheet?: RecordValue,
  sheets: RecordValue[] = [],
): string[] {
  const formula = validation.formula.trim();
  if (!formula) return [];
  if (!formula.startsWith('"') || !formula.endsWith('"')) return spreadsheetValidationReferenceChoices(formula, activeSheet, sheets);
  return formula
    .slice(1, -1)
    .replaceAll('""', '"')
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function spreadsheetValidationReferenceChoices(formula: string, activeSheet: RecordValue | undefined, sheets: RecordValue[]): string[] {
  const normalized = formula.replace(/^=/, "").trim();
  const sheetSeparator = normalized.lastIndexOf("!");
  const rawSheetName = sheetSeparator >= 0 ? normalized.slice(0, sheetSeparator).replace(/^'|'$/g, "") : "";
  const reference = sheetSeparator >= 0 ? normalized.slice(sheetSeparator + 1) : normalized;
  const range = parseCellRange(reference);
  if (!range) return [];

  const targetSheet = rawSheetName ? sheets.find((sheet) => asString(sheet.name) === rawSheetName) : activeSheet;
  if (!targetSheet) return [];
  const rows = rowsByIndexForSheet(targetSheet);
  const choices: string[] = [];
  for (let rowIndex = range.startRow; rowIndex < range.startRow + range.rowSpan && choices.length < 200; rowIndex += 1) {
    const row = rows.get(rowIndex);
    if (!row) continue;
    for (let columnIndex = range.startColumn; columnIndex < range.startColumn + range.columnSpan && choices.length < 200; columnIndex += 1) {
      const value = cellText(row.get(columnIndex)).trim();
      if (value) choices.push(value);
    }
  }
  return choices;
}

function SpreadsheetCommentIndicator() {
  return (
    <span
      aria-hidden="true"
      style={{
        borderLeftColor: "transparent",
        borderLeftStyle: "solid",
        borderLeftWidth: 8,
        borderTopColor: "#f97316",
        borderTopStyle: "solid",
        borderTopWidth: 8,
        height: 0,
        position: "absolute",
        right: 0,
        top: 0,
        width: 0,
        zIndex: 3,
      }}
    />
  );
}

function SpreadsheetSparkline({ visual }: { visual: SpreadsheetSparklineVisual }) {
  const width = 100;
  const height = 28;
  const values = visual.values;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = Math.max(1, max - min);
  const xForIndex = (index: number) => 4 + (index / Math.max(1, values.length - 1)) * (width - 8);
  const yForValue = (value: number) => height - 4 - ((value - min) / span) * (height - 8);
  const points = values.map((value, index) => `${xForIndex(index)},${yForValue(value)}`).join(" ");

  return (
    <svg
      aria-hidden="true"
      preserveAspectRatio="none"
      style={{
        inset: "3px 5px",
        pointerEvents: "none",
        position: "absolute",
        zIndex: 1,
      }}
      viewBox={`0 0 ${width} ${height}`}
    >
      {visual.type === "line" ? (
        <>
          <polyline fill="none" points={points} stroke={visual.color} strokeLinejoin="round" strokeWidth={visual.lineWeight} />
          {visual.markers ? values.map((value, index) => <circle cx={xForIndex(index)} cy={yForValue(value)} fill={visual.color} key={index} r="1.8" />) : null}
        </>
      ) : (
        values.map((value, index) => {
          const barWidth = Math.max(2, ((width - 8) / Math.max(1, values.length)) * 0.55);
          const x = xForIndex(index) - barWidth / 2;
          const zeroY = yForValue(0);
          const valueY = yForValue(visual.type === "stacked" ? Math.abs(value) : value);
          return <rect fill={visual.color} height={Math.max(1, Math.abs(zeroY - valueY))} key={index} width={barWidth} x={x} y={Math.min(zeroY, valueY)} />;
        })
      )}
    </svg>
  );
}

function SpreadsheetIconSet({ visual }: { visual: NonNullable<SpreadsheetCellVisual["iconSet"]> }) {
  const shape = spreadsheetIconSetShape(visual);
  if (shape === "arrow") {
    const rotation = spreadsheetIconSetArrowRotation(visual);
    return (
      <svg
        aria-hidden="true"
        data-testid="spreadsheet-icon-set"
        viewBox="0 0 18 18"
        style={{
          display: "inline-block",
          height: 16,
          marginRight: visual.showValue ? 5 : 0,
          position: "relative",
          top: 1,
          width: 18,
          zIndex: 1,
        }}
      >
        <path d="M9 2 L15 8 H11 V16 H7 V8 H3 Z" fill={visual.color} transform={`rotate(${rotation} 9 9)`} />
      </svg>
    );
  }

  if (shape === "quarter") {
    return (
      <svg
        aria-hidden="true"
        data-testid="spreadsheet-icon-set"
        viewBox="0 0 18 18"
        style={{
          display: "inline-block",
          height: 16,
          marginRight: visual.showValue ? 5 : 0,
          position: "relative",
          top: 1,
          width: 18,
          zIndex: 1,
        }}
      >
        <circle cx="9" cy="9" fill="#f8fafc" r="6.5" stroke="#94a3b8" strokeWidth="1.5" />
        <path d={spreadsheetIconSetQuarterPath(visual)} fill={visual.color} />
      </svg>
    );
  }

  if (shape === "traffic") {
    return (
      <svg
        aria-hidden="true"
        data-testid="spreadsheet-icon-set"
        viewBox="0 0 18 18"
        style={{
          display: "inline-block",
          height: 16,
          marginRight: visual.showValue ? 5 : 0,
          position: "relative",
          top: 1,
          width: 18,
          zIndex: 1,
        }}
      >
        <circle cx="9" cy="9" fill={visual.color} r="6.5" stroke="rgba(15, 23, 42, 0.28)" strokeWidth="1" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      data-testid="spreadsheet-icon-set"
      viewBox="0 0 18 18"
      style={{
        display: "inline-block",
        height: 16,
        marginRight: visual.showValue ? 5 : 0,
        position: "relative",
        top: 2,
        width: 18,
        zIndex: 1,
      }}
    >
      {Array.from({ length: 5 }, (_, index) => {
        const height = 3 + index * 2;
        const active = index < visual.level;
        return (
          <rect
            fill={active ? visual.color : "#c7cdd4"}
            height={height}
            key={index}
            opacity={active ? 1 : 0.55}
            rx="0.6"
            stroke={active ? "rgba(15, 23, 42, 0.22)" : "#9ca3af"}
            strokeWidth="0.45"
            width="2.2"
            x={3 + index * 2.4}
            y={15 - height}
          />
        );
      })}
    </svg>
  );
}

export function spreadsheetIconSetShape(visual: NonNullable<SpreadsheetCellVisual["iconSet"]>): "arrow" | "quarter" | "rating" | "traffic" {
  const iconSet = visual.iconSet.toLowerCase();
  if (iconSet.includes("rating")) {
    return "rating";
  }

  if (iconSet.includes("quarter")) {
    return "quarter";
  }

  if (iconSet.includes("arrow")) {
    return "arrow";
  }

  if (iconSet.includes("traffic") || iconSet.includes("symbol") || iconSet.includes("sign")) {
    return "traffic";
  }

  return "rating";
}

function spreadsheetIconSetArrowRotation(visual: NonNullable<SpreadsheetCellVisual["iconSet"]>): number {
  const zeroBasedLevel = Math.max(0, Math.min(visual.levelCount - 1, visual.level - 1));
  const rotations = visual.levelCount >= 5 ? [180, 135, 90, 45, 0] : [180, 90, 0];
  return rotations[Math.min(rotations.length - 1, zeroBasedLevel)] ?? 90;
}

function spreadsheetIconSetQuarterPath(visual: NonNullable<SpreadsheetCellVisual["iconSet"]>): string {
  const zeroBasedLevel = Math.max(0, Math.min(4, visual.level - 1));
  if (zeroBasedLevel <= 0) return "";
  if (zeroBasedLevel === 1) return "M9 9 L9 2.5 A6.5 6.5 0 0 1 15.5 9 Z";
  if (zeroBasedLevel === 2) return "M9 9 L9 2.5 A6.5 6.5 0 0 1 9 15.5 Z";
  if (zeroBasedLevel === 3) return "M9 9 L9 2.5 A6.5 6.5 0 1 1 2.5 9 Z";
  return "M9 2.5 A6.5 6.5 0 1 1 9 15.5 A6.5 6.5 0 1 1 9 2.5 Z";
}
