"use client";

import { type CSSProperties, type KeyboardEvent, type PointerEvent, type UIEvent, useEffect, useMemo, useRef, useState } from "react";

import { asArray, asRecord, asString, columnLabel, type PreviewLabels, type RecordValue, useOfficeImageSources } from "../shared/office-preview-utils";
import { buildSpreadsheetConditionalVisuals, type SpreadsheetCellVisualLookup } from "./spreadsheet-conditional-visuals";
import {
  buildSpreadsheetCommentVisuals,
  buildSpreadsheetSparklineVisuals,
  buildSpreadsheetValidationVisuals,
  SpreadsheetCellContent,
  type SpreadsheetSparklineVisual,
  type SpreadsheetValidationVisual,
  type SpreadsheetValidationVisualLookup,
  spreadsheetValidationChoices,
} from "./spreadsheet-cell-overlays";
import { spreadsheetCellStyle, spreadsheetEffectiveStyleIndex, spreadsheetShowGridLines } from "./spreadsheet-cell-styles";
import { buildSpreadsheetCanvasCellPaints } from "./spreadsheet-canvas-paints";
import { SpreadsheetCanvasLayer } from "./spreadsheet-canvas-layer";
import { buildSpreadsheetCharts, SpreadsheetChartLayer } from "./spreadsheet-charts";
import { cellAt, defaultSpreadsheetSheetIndex, spreadsheetSheetTabColor } from "./spreadsheet-data-access";
import { SpreadsheetFrozenHeaders } from "./spreadsheet-frozen-headers";
import { spreadsheetSheetWithVolatileFormulaValues } from "./spreadsheet-formula-values";
import {
  applySpreadsheetInteractiveSizeOverride,
  commitSpreadsheetEditor,
  spreadsheetEditorForSelection,
  spreadsheetResizeCursor,
  spreadsheetSelectionDirectionFromKey,
  spreadsheetSelectionKey,
  scrollSpreadsheetSelectionIntoView,
  viewportPointFromPointer,
  visibleFloatingSpecs,
} from "./spreadsheet-interaction";
import {
  buildSpreadsheetLayout,
  SPREADSHEET_COLUMN_HEADER_HEIGHT,
  SPREADSHEET_FONT_FAMILY,
  SPREADSHEET_ROW_HEADER_WIDTH,
  spreadsheetCellKey,
  spreadsheetColumnLeft,
  spreadsheetFrozenBodyHeight,
  spreadsheetFrozenBodyWidth,
  spreadsheetViewportRectSegments,
  type SpreadsheetLayout,
  type SpreadsheetLayoutOverrides,
  type SpreadsheetViewportScroll,
  type SpreadsheetViewportSize,
  spreadsheetRowTop,
} from "./spreadsheet-layout";
import { spreadsheetCellText } from "./spreadsheet-number-format";
import { buildSpreadsheetRenderSnapshot, visibleCellIntersectsRange } from "./spreadsheet-render-snapshot";
import {
  spreadsheetResizeDragFromHit,
  spreadsheetResizeHitAtViewportPoint,
  spreadsheetResizeSizeFromPoint,
  type SpreadsheetResizeDrag,
} from "./spreadsheet-resize";
import {
  spreadsheetFrozenSelectionSegments,
  spreadsheetMoveSelection,
  spreadsheetSelectionFromViewportPoint,
  spreadsheetSelectionWorldRect,
  type SpreadsheetSelection,
} from "./spreadsheet-selection";
import { buildSpreadsheetImages, buildSpreadsheetShapes, SpreadsheetImageLayer, SpreadsheetShapeLayer } from "./spreadsheet-shapes";
import {
  buildSpreadsheetTableFilterTargets,
  mergeSpreadsheetLayoutOverrides,
  spreadsheetTableFilterActiveKeys,
  spreadsheetTableFilterRowHeightOverrides,
  spreadsheetTableFilterSelectionForToggle,
  spreadsheetTableFilterTargetAt,
  spreadsheetTableFilterValues,
  type SpreadsheetTableFilterState,
  type SpreadsheetTableFilterTarget,
  type SpreadsheetTableFilterValue,
} from "./spreadsheet-table-filters";
import { SpreadsheetTableFilterMenu, type SpreadsheetTableFilterMenuAnchor } from "./spreadsheet-table-filter-menu";
import { useSpreadsheetViewportStore } from "./spreadsheet-viewport-store";
import { SpreadsheetFormulaBar, SpreadsheetWorkbookBar } from "./spreadsheet-workbook-chrome";

type SpreadsheetCellEditor = {
  selection: SpreadsheetSelection;
  value: string;
};

type SpreadsheetCellEdits = Record<string, string | undefined>;
type SpreadsheetFilterMenuState = {
  anchor: SpreadsheetTableFilterMenuAnchor;
  target: SpreadsheetTableFilterTarget;
};
type SpreadsheetValidationMenuState = {
  anchor: SpreadsheetTableFilterMenuAnchor;
  options: string[];
  selectionKey: string;
};

export function SpreadsheetPreview({ labels, proto }: { labels: PreviewLabels; proto: unknown }) {
  const root = useMemo(() => asRecord(proto), [proto]);
  const sheets = useMemo(
    () =>
      asArray(root?.sheets)
        .map(asRecord)
        .filter((sheet): sheet is RecordValue => sheet != null),
    [root],
  );
  const styles = useMemo(() => asRecord(root?.styles), [root]);
  const charts = useMemo(
    () =>
      asArray(root?.charts)
        .map(asRecord)
        .filter((chart): chart is RecordValue => chart != null),
    [root],
  );
  const shapes = useMemo(
    () =>
      asArray(root?.shapes)
        .map(asRecord)
        .filter((shape): shape is RecordValue => shape != null),
    [root],
  );
  const slicerCaches = useMemo(
    () =>
      asArray(root?.slicerCaches)
        .map(asRecord)
        .filter((cache): cache is RecordValue => cache != null),
    [root],
  );
  const definedNames = useMemo(() => root?.definedNames, [root]);
  const theme = useMemo(() => asRecord(root?.theme), [root]);
  const imageSources = useOfficeImageSources(root);
  const [activeSheetIndex, setActiveSheetIndex] = useState(() => defaultSpreadsheetSheetIndex(sheets));
  const [sizeOverrides, setSizeOverrides] = useState<SpreadsheetLayoutOverrides>({});
  const [resizeCursor, setResizeCursor] = useState<string | undefined>();
  const [resizeDrag, setResizeDrag] = useState<SpreadsheetResizeDrag | null>(null);
  const [cellEdits, setCellEdits] = useState<SpreadsheetCellEdits>({});
  const [editor, setEditor] = useState<SpreadsheetCellEditor | null>(null);
  const [filterMenu, setFilterMenu] = useState<SpreadsheetFilterMenuState | null>(null);
  const [validationMenu, setValidationMenu] = useState<SpreadsheetValidationMenuState | null>(null);
  const [tableFilterState, setTableFilterState] = useState<SpreadsheetTableFilterState>({});
  const [selection, setSelection] = useState<SpreadsheetSelection | null>(null);
  const viewportShellRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { state: viewportState, store: viewportStore } = useSpreadsheetViewportStore();
  const viewportScroll = viewportState.scroll;
  const viewportSize = viewportState.size;
  const activeSheetSource = sheets[Math.min(activeSheetIndex, Math.max(0, sheets.length - 1))];
  const sourceName = asString(root?.sourceName);
  const activeSheet = useMemo(
    () => spreadsheetSheetWithVolatileFormulaValues(activeSheetSource, sheets, new Date(), sourceName),
    [activeSheetSource, sheets, sourceName],
  );
  const tableFilterTargets = useMemo(() => buildSpreadsheetTableFilterTargets(activeSheet), [activeSheet]);
  const filterRowHeightOverrides = useMemo(() => spreadsheetTableFilterRowHeightOverrides(activeSheet, tableFilterState), [activeSheet, tableFilterState]);
  const effectiveSizeOverrides = useMemo(
    () =>
      mergeSpreadsheetLayoutOverrides(sizeOverrides, {
        rowHeights: filterRowHeightOverrides,
      }),
    [filterRowHeightOverrides, sizeOverrides],
  );
  const activeFilterKeys = useMemo(() => spreadsheetTableFilterActiveKeys(tableFilterTargets, tableFilterState), [tableFilterState, tableFilterTargets]);
  const layout = useMemo(() => buildSpreadsheetLayout(activeSheet, effectiveSizeOverrides), [activeSheet, effectiveSizeOverrides]);
  const chartSpecs = useMemo(
    () =>
      buildSpreadsheetCharts({
        activeSheet,
        charts,
        layout,
        sheets,
      }),
    [activeSheet, charts, layout, sheets],
  );
  const shapeSpecs = useMemo(
    () =>
      buildSpreadsheetShapes({
        activeSheet,
        layout,
        shapes,
        slicerCaches,
      }),
    [activeSheet, layout, shapes, slicerCaches],
  );
  const imageSpecs = useMemo(
    () =>
      buildSpreadsheetImages({
        activeSheet,
        imageSources,
        layout,
      }),
    [activeSheet, imageSources, layout],
  );
  const visibleChartSpecs = useMemo(() => visibleFloatingSpecs(chartSpecs, viewportSize, viewportScroll), [chartSpecs, viewportScroll, viewportSize]);
  const visibleShapeSpecs = useMemo(() => visibleFloatingSpecs(shapeSpecs, viewportSize, viewportScroll), [shapeSpecs, viewportScroll, viewportSize]);
  const visibleImageSpecs = useMemo(() => visibleFloatingSpecs(imageSpecs, viewportSize, viewportScroll), [imageSpecs, viewportScroll, viewportSize]);
  const cellVisuals = useMemo(() => buildSpreadsheetConditionalVisuals(activeSheet, theme, definedNames), [activeSheet, definedNames, theme]);
  const sparklineVisuals = useMemo(() => buildSpreadsheetSparklineVisuals(activeSheet), [activeSheet]);
  const commentVisuals = useMemo(() => buildSpreadsheetCommentVisuals(root, activeSheet), [activeSheet, root]);
  const validationVisuals = useMemo(() => buildSpreadsheetValidationVisuals(activeSheet), [activeSheet]);
  const canvasCellPaints = useMemo(
    () =>
      buildSpreadsheetCanvasCellPaints({
        cellEdits,
        layout,
        project: {
          cellStyle: (cell, rowRecord, columnIndex, key) => {
            const styleIndex = spreadsheetEffectiveStyleIndex(cell, rowRecord, layout, columnIndex);
            return spreadsheetCellStyle(cell, styles, cellVisuals.get(key), asString(activeSheet?.name), styleIndex);
          },
          cellText: (cell, rowRecord, columnIndex) => {
            const styleIndex = spreadsheetEffectiveStyleIndex(cell, rowRecord, layout, columnIndex);
            return spreadsheetCellText(cell, styles, asString(activeSheet?.name), styleIndex);
          },
        },
        visibleRange: buildSpreadsheetRenderSnapshot({
          layout,
          scroll: viewportScroll,
          viewportSize,
        }).visibleRange,
      }),
    [activeSheet, cellEdits, cellVisuals, layout, styles, viewportScroll, viewportSize],
  );

  useEffect(() => () => viewportStore.destroy(), [viewportStore]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    viewportStore.reset();
  }, [activeSheetIndex, viewportStore]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const updateViewportSize = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      viewportStore.schedule({
        scroll: { left: viewport.scrollLeft, top: viewport.scrollTop },
        size: { height, width },
      });
    };

    updateViewportSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportSize);
      return () => window.removeEventListener("resize", updateViewportSize);
    }

    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [activeSheetIndex, viewportStore]);

  const handleSheetSelect = (index: number) => {
    viewportStore.reset();
    setSizeOverrides({});
    setResizeDrag(null);
    setResizeCursor(undefined);
    setCellEdits({});
    setEditor(null);
    setFilterMenu(null);
    setValidationMenu(null);
    setTableFilterState({});
    setSelection(null);
    setActiveSheetIndex(index);
  };

  const handleViewportPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    viewport.focus();
    const point = viewportPointFromPointer(event);
    const scroll = { left: viewport.scrollLeft, top: viewport.scrollTop };
    const resizeHit = spreadsheetResizeHitAtViewportPoint(layout, point, scroll);
    if (resizeHit) {
      event.preventDefault();
      setEditor(null);
      setFilterMenu(null);
      setValidationMenu(null);
      viewport.setPointerCapture(event.pointerId);
      setResizeDrag(spreadsheetResizeDragFromHit(layout, resizeHit, point, scroll));
      return;
    }

    if (editor) commitSpreadsheetEditor(editor, setCellEdits, setEditor);
    setFilterMenu(null);
    setValidationMenu(null);
    setSelection(spreadsheetSelectionFromViewportPoint(layout, point, scroll));
  };

  const handleViewportDoubleClick = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    const selectionFromPoint = spreadsheetSelectionFromViewportPoint(layout, viewportPointFromPointer(event), {
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    });
    if (!selectionFromPoint) return;
    event.preventDefault();
    setSelection(selectionFromPoint);
    setEditor(spreadsheetEditorForSelection(activeSheet, styles, cellEdits, selectionFromPoint));
  };

  const handleViewportPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    const point = viewportPointFromPointer(event);
    const scroll = { left: viewport.scrollLeft, top: viewport.scrollTop };
    if (resizeDrag) {
      event.preventDefault();
      const size = spreadsheetResizeSizeFromPoint(layout, resizeDrag, point, scroll);
      setSizeOverrides((current) => applySpreadsheetInteractiveSizeOverride(current, resizeDrag.axis, resizeDrag.index, size));
      return;
    }

    const resizeHit = spreadsheetResizeHitAtViewportPoint(layout, point, scroll);
    const nextCursor = resizeHit ? spreadsheetResizeCursor(resizeHit.axis) : undefined;
    setResizeCursor((current) => (current === nextCursor ? current : nextCursor));
  };

  const handleViewportPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!resizeDrag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizeDrag(null);
  };

  const handleViewportScroll = (event: UIEvent<HTMLDivElement>) => {
    const { clientHeight, clientWidth, scrollLeft, scrollTop } = event.currentTarget;
    viewportStore.schedule({
      scroll: { left: scrollLeft, top: scrollTop },
      size: { height: clientHeight, width: clientWidth },
    });
    setFilterMenu(null);
    setValidationMenu(null);
  };

  const handleViewportKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "F2") {
      event.preventDefault();
      const targetSelection = selection ?? {
        columnIndex: 0,
        rowIndex: 1,
        rowOffset: 0,
      };
      setSelection(targetSelection);
      setEditor(spreadsheetEditorForSelection(activeSheet, styles, cellEdits, targetSelection));
      return;
    }

    const direction = spreadsheetSelectionDirectionFromKey(event.key, event.shiftKey);
    if (!direction) return;
    event.preventDefault();
    const nextSelection = spreadsheetMoveSelection(layout, selection, direction);
    setSelection(nextSelection);
    const viewport = viewportRef.current;
    if (viewport) scrollSpreadsheetSelectionIntoView(viewport, layout, nextSelection);
  };

  const handleFilterClick = (target: SpreadsheetTableFilterTarget, event: PointerEvent<HTMLButtonElement>) => {
    const hostBounds = viewportShellRef.current?.getBoundingClientRect();
    const buttonBounds = event.currentTarget.getBoundingClientRect();
    if (!hostBounds) return;
    setEditor(null);
    setValidationMenu(null);
    setFilterMenu({
      anchor: {
        height: buttonBounds.height,
        left: buttonBounds.left - hostBounds.left,
        top: buttonBounds.top - hostBounds.top,
        width: buttonBounds.width,
      },
      target,
    });
  };

  const handleValidationClick = (selectionKey: string, validation: SpreadsheetValidationVisual, event: PointerEvent<HTMLButtonElement>) => {
    const options = spreadsheetValidationChoices(validation, activeSheet, sheets);
    const hostBounds = viewportShellRef.current?.getBoundingClientRect();
    const buttonBounds = event.currentTarget.getBoundingClientRect();
    if (!hostBounds || options.length === 0) return;
    setEditor(null);
    setFilterMenu(null);
    setValidationMenu({
      anchor: {
        height: buttonBounds.height,
        left: buttonBounds.left - hostBounds.left,
        top: buttonBounds.top - hostBounds.top,
        width: buttonBounds.width,
      },
      options,
      selectionKey,
    });
  };

  const handleFilterToggle = (target: SpreadsheetTableFilterTarget, value: string, values: SpreadsheetTableFilterValue[]) => {
    const allValues = values.map((item) => item.value);
    setTableFilterState((current) => {
      const nextSelection = spreadsheetTableFilterSelectionForToggle(current[target.id], allValues, value);
      const next = { ...current };
      if (nextSelection == null) delete next[target.id];
      else next[target.id] = nextSelection;
      return next;
    });
  };

  const handleFilterClear = (target: SpreadsheetTableFilterTarget) => {
    setTableFilterState((current) => {
      if (current[target.id] == null) return current;
      const next = { ...current };
      delete next[target.id];
      return next;
    });
  };

  if (sheets.length === 0) {
    return <p style={{ color: "#64748b" }}>{labels.noSheets}</p>;
  }

  const formulaRow = selection?.rowIndex ?? 1;
  const formulaColumn = selection?.columnIndex ?? 0;
  const formulaCell = cellAt(activeSheet, formulaRow, formulaColumn);
  const formulaSheetName = asString(activeSheet?.name);
  const formulaValue = selection
    ? (cellEdits[spreadsheetSelectionKey(selection)] ?? spreadsheetCellText(formulaCell, styles, formulaSheetName))
    : spreadsheetCellText(formulaCell, styles, formulaSheetName);
  const formulaAddress = asString(formulaCell?.address) || `${columnLabel(formulaColumn)}${formulaRow}`;

  return (
    <div
      data-testid="spreadsheet-preview"
      style={{
        background: "#ffffff",
        borderColor: "#d7dde5",
        borderRadius: 8,
        borderStyle: "solid",
        borderWidth: 1,
        boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)",
        display: "grid",
        fontFamily: SPREADSHEET_FONT_FAMILY,
        gridTemplateRows: "auto auto minmax(0, 1fr) auto",
        maxHeight: "calc(100vh - 150px)",
        minHeight: 620,
        overflow: "hidden",
      }}
    >
      <SpreadsheetWorkbookBar title={asString(root?.sourceName) || asString(root?.title) || asString(activeSheet?.name)} />
      <SpreadsheetFormulaBar address={formulaAddress} value={formulaValue} />
      <div ref={viewportShellRef} style={{ minHeight: 0, overflow: "hidden", position: "relative" }}>
        <SpreadsheetCanvasLayer cellPaints={canvasCellPaints} layout={layout} scroll={viewportScroll} viewportSize={viewportSize} />
        <div
          onDoubleClick={handleViewportDoubleClick}
          onKeyDown={handleViewportKeyDown}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerCancel={handleViewportPointerUp}
          onPointerUp={handleViewportPointerUp}
          onScroll={handleViewportScroll}
          ref={viewportRef}
          style={{
            cursor: resizeDrag ? spreadsheetResizeCursor(resizeDrag.axis) : resizeCursor,
            height: "100%",
            overflow: "auto",
            position: "relative",
            zIndex: 1,
          }}
          tabIndex={0}
        >
          <div
            style={{
              height: layout.gridHeight,
              minWidth: layout.gridWidth,
              position: "relative",
              width: layout.gridWidth,
            }}
          >
            <SpreadsheetGrid
              activeSheet={activeSheet}
              cellEdits={cellEdits}
              cellVisuals={cellVisuals}
              commentVisuals={commentVisuals}
              layout={layout}
              activeFilterKeys={activeFilterKeys}
              onFilterClick={handleFilterClick}
              onValidationClick={handleValidationClick}
              scroll={viewportScroll}
              selection={selection}
              sparklineVisuals={sparklineVisuals}
              styles={styles}
              tableFilterTargets={tableFilterTargets}
              validationVisuals={validationVisuals}
              viewportSize={viewportSize}
            />
            <SpreadsheetImageLayer images={visibleImageSpecs} />
            <SpreadsheetShapeLayer shapes={visibleShapeSpecs} />
            <SpreadsheetChartLayer charts={visibleChartSpecs} />
            <SpreadsheetSelectionLayer layout={layout} selection={selection} />
            <SpreadsheetCellEditorLayer
              editor={editor}
              layout={layout}
              onCancel={() => setEditor(null)}
              onCommit={(nextEditor) => commitSpreadsheetEditor(nextEditor, setCellEdits, setEditor)}
              onValueChange={(value) => setEditor((current) => (current ? { ...current, value } : current))}
            />
          </div>
        </div>
        <SpreadsheetFrozenBodyLayer
          activeSheet={activeSheet}
          cellEdits={cellEdits}
          cellVisuals={cellVisuals}
          commentVisuals={commentVisuals}
          layout={layout}
          scroll={viewportScroll}
          selection={selection}
          sparklineVisuals={sparklineVisuals}
          styles={styles}
          validationVisuals={validationVisuals}
          viewportSize={viewportSize}
        />
        <SpreadsheetFrozenHeaders layout={layout} scrollLeft={viewportScroll.left} scrollTop={viewportScroll.top} viewportSize={viewportSize} />
        <SpreadsheetFrozenSelectionLayer layout={layout} scroll={viewportScroll} selection={selection} />
        {filterMenu ? (
          <SpreadsheetTableFilterMenu
            anchor={filterMenu.anchor}
            onClear={() => handleFilterClear(filterMenu.target)}
            onClose={() => setFilterMenu(null)}
            onToggle={(value, values) => handleFilterToggle(filterMenu.target, value, values)}
            selectedValues={tableFilterState[filterMenu.target.id]}
            target={filterMenu.target}
            values={spreadsheetTableFilterValues(activeSheet, filterMenu.target)}
          />
        ) : null}
        {validationMenu ? (
          <SpreadsheetValidationMenu
            anchor={validationMenu.anchor}
            onClose={() => setValidationMenu(null)}
            onSelect={(value) => {
              setCellEdits((current) => ({
                ...current,
                [validationMenu.selectionKey]: value,
              }));
              setValidationMenu(null);
            }}
            options={validationMenu.options}
          />
        ) : null}
      </div>
      <div
        style={{
          background: "#f6f7f9",
          borderTopColor: "#d7dde5",
          borderTopStyle: "solid",
          borderTopWidth: 1,
          display: "flex",
          gap: 4,
          overflowX: "auto",
          padding: "0 10px",
        }}
      >
        {sheets.map((sheet, index) => {
          const tabColor = spreadsheetSheetTabColor(sheet);
          const active = index === activeSheetIndex;
          return (
            <button
              key={`${asString(sheet.sheetId)}-${index}`}
              onClick={() => handleSheetSelect(index)}
              style={{
                background: active ? "#ffffff" : "transparent",
                borderBottomColor: active ? (tabColor ?? "#111827") : "transparent",
                borderBottomStyle: "solid",
                borderBottomWidth: 3,
                borderLeftWidth: 0,
                borderRightWidth: 0,
                borderTopColor: !active && tabColor ? tabColor : "transparent",
                borderTopStyle: "solid",
                borderTopWidth: 3,
                color: active ? "#111827" : "#5f6368",
                cursor: "pointer",
                flex: "0 0 auto",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                minHeight: 44,
                padding: "0 16px",
              }}
              type="button"
            >
              {asString(sheet.name) || `${labels.sheet} ${index + 1}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpreadsheetSelectionLayer({ layout, selection }: { layout: SpreadsheetLayout; selection: SpreadsheetSelection | null }) {
  if (!selection) return null;
  const rect = spreadsheetSelectionWorldRect(layout, selection);
  if (rect.width <= 0 || rect.height <= 0) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        ...spreadsheetSelectionStyle,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      }}
    />
  );
}

function SpreadsheetFrozenSelectionLayer({
  layout,
  scroll,
  selection,
}: {
  layout: SpreadsheetLayout;
  scroll: SpreadsheetViewportScroll;
  selection: SpreadsheetSelection | null;
}) {
  if (!selection) return null;
  const segments = spreadsheetFrozenSelectionSegments(layout, selection, scroll);
  if (segments.length === 0) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        position: "absolute",
        zIndex: 13,
      }}
    >
      {segments.map((segment, index) => (
        <div
          key={`${selection.rowIndex}:${selection.columnIndex}:${index}`}
          style={{
            ...spreadsheetSelectionStyle,
            height: segment.height,
            left: segment.left,
            top: segment.top,
            width: segment.width,
          }}
        />
      ))}
    </div>
  );
}

function SpreadsheetCellEditorLayer({
  editor,
  layout,
  onCancel,
  onCommit,
  onValueChange,
}: {
  editor: SpreadsheetCellEditor | null;
  layout: SpreadsheetLayout;
  onCancel: () => void;
  onCommit: (editor: SpreadsheetCellEditor) => void;
  onValueChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editor]);

  if (!editor) return null;
  const rect = spreadsheetSelectionWorldRect(layout, editor.selection);
  if (rect.width <= 0 || rect.height <= 0) return null;
  return (
    <input
      aria-label="Cell editor"
      onChange={(event) => onValueChange(event.currentTarget.value)}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onCommit(editor);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      ref={inputRef}
      style={{
        background: "#ffffff",
        borderColor: "#0f9d58",
        borderStyle: "solid",
        borderWidth: 2,
        boxShadow: "0 8px 18px rgba(15, 23, 42, 0.18)",
        boxSizing: "border-box",
        color: "#0f172a",
        fontFamily: SPREADSHEET_FONT_FAMILY,
        fontSize: 13,
        height: Math.max(24, rect.height),
        left: rect.left,
        outline: "none",
        padding: "3px 7px",
        position: "absolute",
        top: rect.top,
        width: Math.max(80, rect.width),
        zIndex: 40_000,
      }}
      value={editor.value}
    />
  );
}

function SpreadsheetValidationMenu({
  anchor,
  onClose,
  onSelect,
  options,
}: {
  anchor: SpreadsheetTableFilterMenuAnchor;
  onClose: () => void;
  onSelect: (value: string) => void;
  options: string[];
}) {
  return (
    <div
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        background: "#ffffff",
        borderColor: "#cbd5e1",
        borderRadius: 4,
        borderStyle: "solid",
        borderWidth: 1,
        boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
        left: anchor.left,
        maxHeight: 180,
        minWidth: Math.max(140, anchor.width),
        overflowY: "auto",
        padding: "3px 0",
        position: "absolute",
        top: anchor.top + anchor.height + 2,
        zIndex: 40_010,
      }}
    >
      {options.map((option) => (
        <button
          key={option}
          onClick={() => {
            onSelect(option);
            onClose();
          }}
          style={{
            background: "transparent",
            borderWidth: 0,
            color: "#111827",
            cursor: "pointer",
            display: "block",
            fontFamily: SPREADSHEET_FONT_FAMILY,
            fontSize: 13,
            lineHeight: 1.35,
            padding: "5px 10px",
            textAlign: "left",
            width: "100%",
          }}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function SpreadsheetFrozenBodyLayer({
  activeSheet,
  cellEdits,
  cellVisuals,
  commentVisuals,
  layout,
  scroll,
  selection,
  sparklineVisuals,
  styles,
  validationVisuals,
  viewportSize,
}: {
  activeSheet: RecordValue | undefined;
  cellEdits: SpreadsheetCellEdits;
  cellVisuals: SpreadsheetCellVisualLookup;
  commentVisuals: Set<string>;
  layout: SpreadsheetLayout;
  scroll: SpreadsheetViewportScroll;
  selection: SpreadsheetSelection | null;
  sparklineVisuals: Map<string, SpreadsheetSparklineVisual>;
  styles: RecordValue | null;
  validationVisuals: SpreadsheetValidationVisualLookup;
  viewportSize: SpreadsheetViewportSize;
}) {
  if (layout.freezePanes.columnCount === 0 && layout.freezePanes.rowCount === 0) {
    return null;
  }

  const sheetName = asString(activeSheet?.name);
  const selectedCellKey = selection ? spreadsheetSelectionKey(selection) : "";
  const frozenWidth = spreadsheetFrozenBodyWidth(layout);
  const frozenHeight = spreadsheetFrozenBodyHeight(layout);
  if (frozenWidth <= 0 && frozenHeight <= 0) return null;
  const showGridLines = spreadsheetShowGridLines(activeSheet);
  const { visibleColumnIndexes, visibleRange, visibleRowOffsets } = buildSpreadsheetRenderSnapshot({
    layout,
    scroll,
    viewportSize,
  });

  return (
    <div
      aria-hidden="true"
      style={{
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        position: "absolute",
        zIndex: 11,
      }}
    >
      {visibleRowOffsets.map((rowOffset) => {
        const rowIndex = rowOffset + 1;
        const row = layout.rowsByIndex.get(rowIndex);
        const rowRecord = layout.rowRecordsByIndex.get(rowIndex);
        const top = spreadsheetRowTop(layout, rowOffset);
        return visibleColumnIndexes.map((columnIndex) => {
          const cellKey = spreadsheetCellKey(rowIndex, columnIndex);
          if (layout.coveredCells.has(cellKey)) return null;
          if (!visibleCellIntersectsRange(layout, rowOffset, columnIndex, visibleRange)) return null;
          const cell = row?.get(columnIndex) ?? null;
          const merge = layout.mergeByStart.get(cellKey);
          const left = spreadsheetColumnLeft(layout, columnIndex);
          const width = spreadsheetColumnLeft(layout, columnIndex + (merge?.columnSpan ?? 1)) - left;
          const cellHeight = spreadsheetRowTop(layout, rowOffset + (merge?.rowSpan ?? 1)) - top;
          const rects = spreadsheetViewportRectSegments(layout, { height: cellHeight, left, top, width }, scroll);
          if (rects.length === 0) return null;

          const visual = cellVisuals.get(cellKey);
          const hasComment = commentVisuals.has(cellKey);
          const sparkline = sparklineVisuals.get(cellKey);
          const validation = cellKey === selectedCellKey ? validationVisuals.get(cellKey) : undefined;
          const styleIndex = spreadsheetEffectiveStyleIndex(cell, rowRecord, layout, columnIndex);
          const text = cellEdits[cellKey] ?? spreadsheetCellText(cell, styles, sheetName, styleIndex);
          return rects.map((rect, segmentIndex) => (
            <div
              data-frozen-cell-address={asString(cell?.address) || `${columnLabel(columnIndex)}${rowIndex}`}
              key={`${rowIndex}:${columnIndex}:${segmentIndex}`}
              style={{
                ...spreadsheetCellStyle(cell, styles, visual, sheetName, styleIndex, showGridLines),
                height: rect.height,
                left: rect.left,
                overflow: "hidden",
                position: "absolute",
                top: rect.top,
                width: rect.width,
              }}
            >
              <SpreadsheetCellContent hasComment={hasComment} sparkline={sparkline} text={text} validation={validation} visual={visual} />
            </div>
          ));
        });
      })}
    </div>
  );
}

function SpreadsheetGrid({
  activeFilterKeys,
  activeSheet,
  cellEdits,
  cellVisuals,
  commentVisuals,
  layout,
  onFilterClick,
  onValidationClick,
  scroll,
  selection,
  sparklineVisuals,
  styles,
  tableFilterTargets,
  validationVisuals,
  viewportSize,
}: {
  activeFilterKeys: Set<string>;
  activeSheet: RecordValue | undefined;
  cellEdits: SpreadsheetCellEdits;
  cellVisuals: SpreadsheetCellVisualLookup;
  commentVisuals: Set<string>;
  layout: SpreadsheetLayout;
  onFilterClick: (target: SpreadsheetTableFilterTarget, event: PointerEvent<HTMLButtonElement>) => void;
  onValidationClick: (selectionKey: string, validation: SpreadsheetValidationVisual, event: PointerEvent<HTMLButtonElement>) => void;
  scroll: SpreadsheetViewportScroll;
  selection: SpreadsheetSelection | null;
  sparklineVisuals: Map<string, SpreadsheetSparklineVisual>;
  styles: RecordValue | null;
  tableFilterTargets: SpreadsheetTableFilterTarget[];
  validationVisuals: SpreadsheetValidationVisualLookup;
  viewportSize: SpreadsheetViewportSize;
}) {
  const sheetName = asString(activeSheet?.name);
  const selectedCellKey = selection ? spreadsheetSelectionKey(selection) : "";
  const showGridLines = spreadsheetShowGridLines(activeSheet);
  const renderSnapshot = useMemo(() => buildSpreadsheetRenderSnapshot({ layout, scroll, viewportSize }), [layout, scroll, viewportSize]);
  const { visibleColumnIndexes, visibleRange, visibleRowOffsets } = renderSnapshot;

  return (
    <div
      role="grid"
      style={{
        fontFamily: SPREADSHEET_FONT_FAMILY,
        fontSize: 13,
        height: layout.gridHeight,
        position: "absolute",
        width: layout.gridWidth,
      }}
    >
      <div style={spreadsheetCornerStyle} />
      {visibleColumnIndexes.map((columnIndex) => (
        <div
          key={columnIndex}
          role="columnheader"
          style={{
            ...spreadsheetColumnHeaderStyle,
            left: spreadsheetColumnLeft(layout, columnIndex),
            width: layout.columnWidths[columnIndex],
          }}
        >
          {columnLabel(columnIndex)}
        </div>
      ))}
      {visibleRowOffsets.map((rowOffset) => {
        const rowIndex = rowOffset + 1;
        const row = layout.rowsByIndex.get(rowIndex);
        const rowRecord = layout.rowRecordsByIndex.get(rowIndex);
        const top = spreadsheetRowTop(layout, rowOffset);
        const height = layout.rowHeights[rowOffset];
        return (
          <div key={rowIndex} role="row">
            <div
              role="rowheader"
              style={{
                ...spreadsheetRowHeaderStyle,
                height,
                top,
              }}
            >
              {rowIndex}
            </div>
            {visibleColumnIndexes.map((columnIndex) => {
              const cellKey = spreadsheetCellKey(rowIndex, columnIndex);
              if (layout.coveredCells.has(cellKey)) return null;
              if (!visibleCellIntersectsRange(layout, rowOffset, columnIndex, visibleRange)) return null;
              const cell = row?.get(columnIndex) ?? null;
              const merge = layout.mergeByStart.get(cellKey);
              const left = spreadsheetColumnLeft(layout, columnIndex);
              const width = spreadsheetColumnLeft(layout, columnIndex + (merge?.columnSpan ?? 1)) - left;
              const cellHeight = spreadsheetRowTop(layout, rowOffset + (merge?.rowSpan ?? 1)) - top;
              const visual = cellVisuals.get(cellKey);
              const hasComment = commentVisuals.has(cellKey);
              const sparkline = sparklineVisuals.get(cellKey);
              const validation = cellKey === selectedCellKey ? validationVisuals.get(cellKey) : undefined;
              const styleIndex = spreadsheetEffectiveStyleIndex(cell, rowRecord, layout, columnIndex);
              const text = cellEdits[cellKey] ?? spreadsheetCellText(cell, styles, sheetName, styleIndex);
              const filterTarget = visual?.filter ? spreadsheetTableFilterTargetAt(tableFilterTargets, rowIndex, columnIndex) : null;
              return (
                <div
                  data-cell-address={asString(cell?.address) || `${columnLabel(columnIndex)}${rowIndex}`}
                  key={columnIndex}
                  role="gridcell"
                  style={{
                    ...spreadsheetCellStyle(cell, styles, visual, sheetName, styleIndex, showGridLines),
                    height: cellHeight,
                    left,
                    position: "absolute",
                    top,
                    width,
                  }}
                >
                  <SpreadsheetCellContent
                    filterActive={activeFilterKeys.has(cellKey)}
                    hasComment={hasComment}
                    onFilterClick={filterTarget ? (event) => onFilterClick(filterTarget, event) : undefined}
                    onValidationClick={validation ? (targetValidation, event) => onValidationClick(cellKey, targetValidation, event) : undefined}
                    sparkline={sparkline}
                    text={text}
                    validation={validation}
                    visual={visual}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const spreadsheetHeaderBaseStyle: CSSProperties = {
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
  zIndex: 2,
};

const spreadsheetSelectionStyle: CSSProperties = {
  borderColor: "#0f9d58",
  borderStyle: "solid",
  borderWidth: 2,
  boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.8)",
  boxSizing: "border-box",
  pointerEvents: "none",
  position: "absolute",
  zIndex: 30_000,
};

const spreadsheetCornerStyle: CSSProperties = {
  ...spreadsheetHeaderBaseStyle,
  height: SPREADSHEET_COLUMN_HEADER_HEIGHT,
  left: 0,
  top: 0,
  width: SPREADSHEET_ROW_HEADER_WIDTH,
  zIndex: 4,
};

const spreadsheetColumnHeaderStyle: CSSProperties = {
  ...spreadsheetHeaderBaseStyle,
  height: SPREADSHEET_COLUMN_HEADER_HEIGHT,
  top: 0,
};

const spreadsheetRowHeaderStyle: CSSProperties = {
  ...spreadsheetHeaderBaseStyle,
  left: 0,
  width: SPREADSHEET_ROW_HEADER_WIDTH,
  zIndex: 3,
};
