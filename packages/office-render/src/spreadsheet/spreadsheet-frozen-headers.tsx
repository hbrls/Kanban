"use client";

import type { CSSProperties } from "react";

import { columnLabel } from "../shared/office-preview-utils";
import {
  SPREADSHEET_COLUMN_HEADER_HEIGHT,
  SPREADSHEET_FONT_FAMILY,
  SPREADSHEET_ROW_HEADER_WIDTH,
  spreadsheetColumnLeft,
  type SpreadsheetLayout,
  spreadsheetRowTop,
  spreadsheetVisibleCellRange,
  type SpreadsheetViewportSize,
} from "./spreadsheet-layout";

type SpreadsheetHeaderRect = {
  height: number;
  left?: number;
  top?: number;
  width: number;
};

export function spreadsheetFrozenColumnHeaderRect(
  layout: SpreadsheetLayout,
  columnIndex: number,
  scrollLeft: number,
): SpreadsheetHeaderRect {
  const frozen = columnIndex < layout.freezePanes.columnCount;
  return {
    height: SPREADSHEET_COLUMN_HEADER_HEIGHT,
    left: spreadsheetColumnLeft(layout, columnIndex) - SPREADSHEET_ROW_HEADER_WIDTH - (frozen ? 0 : scrollLeft),
    width: layout.columnWidths[columnIndex] ?? 0,
  };
}

export function spreadsheetFrozenRowHeaderRect(
  layout: SpreadsheetLayout,
  rowOffset: number,
  scrollTop: number,
): SpreadsheetHeaderRect {
  const frozen = rowOffset < layout.freezePanes.rowCount;
  return {
    height: layout.rowHeights[rowOffset] ?? 0,
    top: spreadsheetRowTop(layout, rowOffset) - SPREADSHEET_COLUMN_HEADER_HEIGHT - (frozen ? 0 : scrollTop),
    width: SPREADSHEET_ROW_HEADER_WIDTH,
  };
}

export function SpreadsheetFrozenHeaders({
  layout,
  scrollLeft,
  scrollTop,
  viewportSize,
}: {
  layout: SpreadsheetLayout;
  scrollLeft: number;
  scrollTop: number;
  viewportSize: SpreadsheetViewportSize;
}) {
  const visibleRange = spreadsheetVisibleCellRange(layout, viewportSize, { left: scrollLeft, top: scrollTop });
  const visibleColumnIndexes = visibleHeaderIndexes(
    visibleRange.startColumnIndex,
    visibleRange.endColumnIndex,
    layout.freezePanes.columnCount,
  );
  const visibleRowOffsets = visibleHeaderIndexes(
    visibleRange.startRowOffset,
    visibleRange.endRowOffset,
    layout.freezePanes.rowCount,
  );

  return (
    <div
      aria-hidden="true"
      style={{
        inset: 0,
        pointerEvents: "none",
        position: "absolute",
        zIndex: 12,
      }}
    >
      <div style={spreadsheetFrozenCornerStyle} />
      <div
        style={{
          height: SPREADSHEET_COLUMN_HEADER_HEIGHT,
          left: SPREADSHEET_ROW_HEADER_WIDTH,
          overflow: "hidden",
          position: "absolute",
          right: 0,
          top: 0,
        }}
      >
        <div
          style={{
            height: SPREADSHEET_COLUMN_HEADER_HEIGHT,
            position: "relative",
            width: Math.max(0, layout.gridWidth - SPREADSHEET_ROW_HEADER_WIDTH),
          }}
        >
          {visibleColumnIndexes.map((columnIndex) => {
            const rect = spreadsheetFrozenColumnHeaderRect(layout, columnIndex, scrollLeft);
            return (
              <div
                key={columnIndex}
                style={{
                  ...spreadsheetFrozenHeaderBaseStyle,
                  height: rect.height,
                  left: rect.left,
                  top: 0,
                  width: rect.width,
                }}
              >
                {columnLabel(columnIndex)}
              </div>
            );
          })}
        </div>
      </div>
      <div
        style={{
          bottom: 0,
          left: 0,
          overflow: "hidden",
          position: "absolute",
          top: SPREADSHEET_COLUMN_HEADER_HEIGHT,
          width: SPREADSHEET_ROW_HEADER_WIDTH,
        }}
      >
        <div
          style={{
            height: Math.max(0, layout.gridHeight - SPREADSHEET_COLUMN_HEADER_HEIGHT),
            position: "relative",
            width: SPREADSHEET_ROW_HEADER_WIDTH,
          }}
        >
          {visibleRowOffsets.map((rowOffset) => {
            const rect = spreadsheetFrozenRowHeaderRect(layout, rowOffset, scrollTop);
            return (
              <div
                key={rowOffset}
                style={{
                  ...spreadsheetFrozenHeaderBaseStyle,
                  height: rect.height,
                  left: 0,
                  top: rect.top,
                  width: rect.width,
                }}
              >
                {rowOffset + 1}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function visibleHeaderIndexes(start: number, end: number, frozenCount: number): number[] {
  const indexes = new Set<number>();
  for (let index = 0; index < frozenCount; index += 1) {
    indexes.add(index);
  }

  for (let index = Math.max(0, start); index <= end; index += 1) {
    indexes.add(index);
  }

  return [...indexes].sort((left, right) => left - right);
}

const spreadsheetFrozenHeaderBaseStyle: CSSProperties = {
  alignItems: "center",
  background: "#f1f3f4",
  borderBottomColor: "#dadce0",
  borderBottomStyle: "solid",
  borderBottomWidth: 1,
  borderRightColor: "#dadce0",
  borderRightStyle: "solid",
  borderRightWidth: 1,
  boxSizing: "border-box",
  color: "#3c4043",
  display: "flex",
  fontFamily: SPREADSHEET_FONT_FAMILY,
  fontSize: 13,
  fontWeight: 500,
  justifyContent: "center",
  overflow: "hidden",
  padding: "0 4px",
  position: "absolute",
};

const spreadsheetFrozenCornerStyle: CSSProperties = {
  ...spreadsheetFrozenHeaderBaseStyle,
  height: SPREADSHEET_COLUMN_HEADER_HEIGHT,
  left: 0,
  top: 0,
  width: SPREADSHEET_ROW_HEADER_WIDTH,
  zIndex: 2,
};
