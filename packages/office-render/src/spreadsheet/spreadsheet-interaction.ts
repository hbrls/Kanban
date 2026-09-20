import { asString, type RecordValue } from "../shared/office-preview-utils";
import { cellAt } from "./spreadsheet-data-access";
import {
  SPREADSHEET_COLUMN_HEADER_HEIGHT,
  SPREADSHEET_ROW_HEADER_WIDTH,
  type SpreadsheetLayout,
  type SpreadsheetLayoutOverrides,
  type SpreadsheetViewportScroll,
  type SpreadsheetViewportSize,
} from "./spreadsheet-layout";
import { spreadsheetCellText } from "./spreadsheet-number-format";
import { type SpreadsheetResizeAxis } from "./spreadsheet-resize";
import {
  spreadsheetSelectionWorldRect,
  type SpreadsheetSelection,
  type SpreadsheetSelectionDirection,
} from "./spreadsheet-selection";

type SpreadsheetPointerEventLike = {
  clientX: number;
  clientY: number;
  currentTarget: {
    getBoundingClientRect(): {
      left: number;
      top: number;
    };
  };
};

type SpreadsheetCellEditor = {
  selection: SpreadsheetSelection;
  value: string;
};

type SpreadsheetCellEdits = Record<string, string | undefined>;

type SpreadsheetStateSetter<T> = (value: T | ((current: T) => T)) => void;

type SpreadsheetFloatingSpec = { height: number; left: number; top: number; width: number };

export function viewportPointFromPointer(event: SpreadsheetPointerEventLike) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

export function spreadsheetSelectionKey(selection: SpreadsheetSelection): string {
  return `${selection.rowIndex}:${selection.columnIndex}`;
}

export function spreadsheetEditorForSelection(
  activeSheet: RecordValue | undefined,
  styles: RecordValue | null,
  cellEdits: SpreadsheetCellEdits,
  selection: SpreadsheetSelection,
): SpreadsheetCellEditor {
  const sheetName = asString(activeSheet?.name);
  const cell = cellAt(activeSheet, selection.rowIndex, selection.columnIndex);
  const key = spreadsheetSelectionKey(selection);
  return {
    selection,
    value: cellEdits[key] ?? spreadsheetCellText(cell, styles, sheetName),
  };
}

export function commitSpreadsheetEditor(
  editor: SpreadsheetCellEditor,
  setCellEdits: SpreadsheetStateSetter<SpreadsheetCellEdits>,
  setEditor: SpreadsheetStateSetter<SpreadsheetCellEditor | null>,
) {
  const key = spreadsheetSelectionKey(editor.selection);
  setCellEdits((current) => ({
    ...current,
    [key]: editor.value,
  }));
  setEditor(null);
}

export function spreadsheetSelectionDirectionFromKey(
  key: string,
  shiftKey = false,
): SpreadsheetSelectionDirection | null {
  if (key === "ArrowDown" || key === "Enter") return "down";
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight" || key === "Tab") return shiftKey ? "left" : "right";
  if (key === "ArrowUp") return "up";
  return null;
}

export function scrollSpreadsheetSelectionIntoView(
  viewport: HTMLDivElement,
  layout: SpreadsheetLayout,
  selection: SpreadsheetSelection,
) {
  const rect = spreadsheetSelectionWorldRect(layout, selection);
  const margin = 16;
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  if (rect.left < viewport.scrollLeft + SPREADSHEET_ROW_HEADER_WIDTH) {
    viewport.scrollLeft = Math.max(0, rect.left - SPREADSHEET_ROW_HEADER_WIDTH - margin);
  } else if (right > viewport.scrollLeft + viewport.clientWidth) {
    viewport.scrollLeft = Math.max(0, right - viewport.clientWidth + margin);
  }

  if (rect.top < viewport.scrollTop + SPREADSHEET_COLUMN_HEADER_HEIGHT) {
    viewport.scrollTop = Math.max(0, rect.top - SPREADSHEET_COLUMN_HEADER_HEIGHT - margin);
  } else if (bottom > viewport.scrollTop + viewport.clientHeight) {
    viewport.scrollTop = Math.max(0, bottom - viewport.clientHeight + margin);
  }
}

export function spreadsheetResizeCursor(axis: SpreadsheetResizeAxis): string {
  return axis === "column" ? "col-resize" : "row-resize";
}

export function applySpreadsheetInteractiveSizeOverride(
  current: SpreadsheetLayoutOverrides,
  axis: SpreadsheetResizeAxis,
  index: number,
  size: number,
): SpreadsheetLayoutOverrides {
  const bucket = axis === "column" ? "columnWidths" : "rowHeights";
  if (current[bucket]?.[index] === size) return current;
  return {
    ...current,
    [bucket]: {
      ...current[bucket],
      [index]: size,
    },
  };
}

export function visibleFloatingSpecs<T extends SpreadsheetFloatingSpec>(
  specs: T[],
  viewportSize: SpreadsheetViewportSize,
  viewportScroll: SpreadsheetViewportScroll,
): T[] {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) return specs;
  const overscan = 240;
  const viewportLeft = viewportScroll.left - overscan;
  const viewportTop = viewportScroll.top - overscan;
  const viewportRight = viewportScroll.left + viewportSize.width + overscan;
  const viewportBottom = viewportScroll.top + viewportSize.height + overscan;
  return specs.filter((spec) => {
    const rectRight = spec.left + spec.width;
    const rectBottom = spec.top + spec.height;
    return rectRight >= viewportLeft &&
      spec.left <= viewportRight &&
      rectBottom >= viewportTop &&
      spec.top <= viewportBottom;
  });
}
