import {
  asArray,
  asNumber,
  asRecord,
  asString,
  colorToCss,
  fillToCss,
  type RecordValue,
} from "../shared/office-preview-utils";
import {
  drawPresentationTextBox,
  measurePresentationTextBoxHeight,
  type PresentationRect,
  type PresentationSize,
} from "./presentation-text-layout";

const EMU_PER_CSS_PIXEL = 9_525;
const DEFAULT_TABLE_CELL_HORIZONTAL_MARGIN_EMU = 91_440;
const DEFAULT_DENSE_TABLE_CELL_VERTICAL_MARGIN_EMU = 45_720;
const DEFAULT_SINGLE_COLUMN_TABLE_CELL_VERTICAL_MARGIN_EMU = 91_440;
const TABLE_TEXT_ROW_HEIGHT_FACTOR = 1.12;

type TableLineStyle = {
  color: string;
  dash: number[];
  width: number;
};

export function presentationTableGrid(table: RecordValue, rect: PresentationRect): { columns: number[]; rows: number[] } {
  const rows = asArray(table.rows)
    .map(asRecord)
    .filter((row): row is RecordValue => row != null);
  const maxColumns = Math.max(
    1,
    rows.reduce((max, row) => {
      let count = 0;
      for (const cell of asArray(row.cells).map(asRecord)) {
        if (!cell) continue;
        count += Math.max(1, asNumber(cell.gridSpan, 1));
      }
      return Math.max(max, count);
    }, 0),
  );
  const columnSource = asArray(table.columns ?? table.columnWidths ?? table.gridColumns)
    .map((value) => asNumber(value))
    .filter((value) => value > 0)
    .slice(0, maxColumns);
  const rowSource = rows
    .map((row) => asNumber(row.heightEmu ?? row.height))
    .filter((value) => value > 0);
  return {
    columns: normalizeLengths(columnSource, maxColumns, rect.width),
    rows: normalizeLengths(rowSource, rows.length, rect.height),
  };
}

export function drawPresentationTable(
  context: CanvasRenderingContext2D,
  element: RecordValue,
  table: RecordValue,
  rect: PresentationRect,
  bounds: PresentationSize,
  canvas: PresentationSize,
  slideScale: number,
): void {
  const rows = asArray(table.rows)
    .map(asRecord)
    .filter((row): row is RecordValue => row != null);
  if (rows.length === 0) return;

  const tableFill = fillToCss(asRecord(table.properties)?.fill ?? asRecord(table.tableProperties)?.fill);
  if (tableFill) {
    context.fillStyle = tableFill;
    context.fillRect(0, 0, rect.width, rect.height);
  }

  const grid = presentationTableGrid(table, rect);
  const defaultVerticalMargin = defaultTableCellVerticalMargin(grid.columns.length);
  const rowHeights = expandedPresentationTableRowHeights(
    context,
    element,
    rows,
    grid,
    defaultVerticalMargin,
    bounds,
    canvas,
    slideScale,
  );
  let y = 0;
  for (const [rowIndex, row] of rows.entries()) {
    const rowHeight = rowHeights[rowIndex] ?? 0;
    const cells = asArray(row.cells)
      .map(asRecord)
      .filter((cell): cell is RecordValue => cell != null);
    let x = 0;
    let columnIndex = 0;

    for (const cell of cells) {
      const columnSpan = Math.max(1, asNumber(cell.gridSpan, 1));
      const rowSpan = Math.max(1, asNumber(cell.rowSpan, 1));
      const cellWidth = sumLengths(grid.columns, columnIndex, columnSpan);
      const cellHeight = sumLengths(rowHeights, rowIndex, rowSpan);
      const horizontalMerge = cell.horizontalMerge === true || cell.hMerge === true;
      const verticalMerge = cell.verticalMerge === true || cell.vMerge === true;

      if (!horizontalMerge && !verticalMerge && cellWidth > 0 && cellHeight > 0) {
        drawPresentationTableCellBackground(context, cell, tableFill, x, y, cellWidth, cellHeight);
        drawPresentationTableCellText(context, element, cell, {
          canvas,
          defaultVerticalMargin,
          height: cellHeight,
          left: x,
          slideBounds: bounds,
          slideScale,
          top: y,
          width: cellWidth,
        });
        drawPresentationTableCellBorders(context, cell, x, y, cellWidth, cellHeight, slideScale);
      }

      x += cellWidth;
      columnIndex += columnSpan;
    }

    y += rowHeight;
  }
}

function expandedPresentationTableRowHeights(
  context: CanvasRenderingContext2D,
  element: RecordValue,
  rows: RecordValue[],
  grid: { columns: number[]; rows: number[] },
  defaultVerticalMargin: number,
  bounds: PresentationSize,
  canvas: PresentationSize,
  slideScale: number,
): number[] {
  const nextRows = [...grid.rows];

  for (const [rowIndex, row] of rows.entries()) {
    const cells = asArray(row.cells)
      .map(asRecord)
      .filter((cell): cell is RecordValue => cell != null);
    let columnIndex = 0;

    for (const cell of cells) {
      const columnSpan = Math.max(1, asNumber(cell.gridSpan, 1));
      const rowSpan = Math.max(1, asNumber(cell.rowSpan, 1));
      const cellWidth = sumLengths(grid.columns, columnIndex, columnSpan);
      const currentHeight = sumLengths(nextRows, rowIndex, rowSpan);
      const paragraphs = tableCellParagraphs(cell);

      if (paragraphs.length > 0 && rowSpan === 1 && cellWidth > 0 && currentHeight > 0) {
        const textHeight = measurePresentationTextBoxHeight({
          canvas,
          context,
          element: tableCellTextElement(element, cell, paragraphs, defaultVerticalMargin),
          rect: {
            height: currentHeight,
            left: 0,
            top: 0,
            width: cellWidth,
          },
          slideBounds: bounds,
          slideScale,
        });
        nextRows[rowIndex] = Math.max(nextRows[rowIndex] ?? 0, textHeight * TABLE_TEXT_ROW_HEIGHT_FACTOR);
      }

      columnIndex += columnSpan;
    }
  }

  return nextRows;
}

function drawPresentationTableCellBackground(
  context: CanvasRenderingContext2D,
  cell: RecordValue,
  tableFill: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const fill =
    fillToCss(cell.fill) ??
    fillToCss(asRecord(cell.properties)?.fill) ??
    fillToCss(asRecord(cell.tableCellProperties)?.fill) ??
    tableFill;
  if (!fill) return;

  context.fillStyle = fill;
  context.fillRect(x, y, width, height);
}

function drawPresentationTableCellText(
  context: CanvasRenderingContext2D,
  element: RecordValue,
  cell: RecordValue,
  options: {
    canvas: PresentationSize;
    defaultVerticalMargin: number;
    height: number;
    left: number;
    slideBounds: PresentationSize;
    slideScale: number;
    top: number;
    width: number;
  },
): void {
  const paragraphs = tableCellParagraphs(cell);
  if (paragraphs.length === 0) return;

  context.save();
  context.translate(options.left, options.top);
  drawPresentationTextBox({
    canvas: options.canvas,
    context,
    element: tableCellTextElement(element, cell, paragraphs, options.defaultVerticalMargin),
    rect: {
      height: options.height,
      left: 0,
      top: 0,
      width: options.width,
    },
    slideBounds: options.slideBounds,
    slideScale: options.slideScale,
    textOverflow: "clip",
  });
  context.restore();
}

function tableCellTextElement(
  element: RecordValue,
  cell: RecordValue,
  paragraphs: unknown[],
  defaultVerticalMargin: number,
): RecordValue {
  return {
    ...element,
    paragraphs,
    textStyle: {
      ...(asRecord(element.textStyle) ?? {}),
      ...(asRecord(cell.textStyle) ?? {}),
      anchor: tableCellAnchor(asString(cell.anchor), asNumber(asRecord(cell.textStyle)?.anchor)),
      ...definedInset("bottomInset", cell.bottomMargin, defaultVerticalMargin),
      ...definedInset("leftInset", cell.leftMargin, DEFAULT_TABLE_CELL_HORIZONTAL_MARGIN_EMU),
      ...definedInset("rightInset", cell.rightMargin, DEFAULT_TABLE_CELL_HORIZONTAL_MARGIN_EMU),
      ...definedInset("topInset", cell.topMargin, defaultVerticalMargin),
    },
  };
}

function defaultTableCellVerticalMargin(columnCount: number): number {
  return columnCount <= 1
    ? DEFAULT_SINGLE_COLUMN_TABLE_CELL_VERTICAL_MARGIN_EMU
    : DEFAULT_DENSE_TABLE_CELL_VERTICAL_MARGIN_EMU;
}

function tableCellParagraphs(cell: RecordValue): unknown[] {
  const paragraphs = asArray(cell.paragraphs);
  if (paragraphs.length > 0) return paragraphs;

  const text = asString(cell.text);
  if (!text) return [];
  return text.split(/\n/u).map((line) => ({
    runs: [{ text: line }],
  }));
}

function tableCellAnchor(anchor: string, fallback: number): number {
  const normalized = anchor.toLowerCase();
  if (normalized === "ctr" || normalized === "center" || normalized === "middle") return 2;
  if (normalized === "b" || normalized === "bottom") return 3;
  return fallback;
}

function definedInset(key: string, value: unknown, fallback: number): RecordValue {
  const raw = asNumber(value, Number.NaN);
  if (!Number.isFinite(raw)) return { [key]: fallback };
  return { [key]: Math.max(0, raw) };
}

function drawPresentationTableCellBorders(
  context: CanvasRenderingContext2D,
  cell: RecordValue,
  x: number,
  y: number,
  width: number,
  height: number,
  slideScale: number,
): void {
  const borders = asRecord(cell.borders ?? cell.lines);
  const defaultLine = { color: "rgba(148, 163, 184, 0.35)", dash: [], width: Math.max(0.5, slideScale) };
  const top = tableCellBorderLine(borders, ["top", "topBorder", "topLine"], slideScale) ?? defaultLine;
  const right = tableCellBorderLine(borders, ["right", "rightBorder", "rightLine"], slideScale) ?? defaultLine;
  const bottom = tableCellBorderLine(borders, ["bottom", "bottomBorder", "bottomLine"], slideScale) ?? defaultLine;
  const left = tableCellBorderLine(borders, ["left", "leftBorder", "leftLine"], slideScale) ?? defaultLine;

  drawBorderSegment(context, top, x, y, x + width, y);
  drawBorderSegment(context, right, x + width, y, x + width, y + height);
  drawBorderSegment(context, bottom, x, y + height, x + width, y + height);
  drawBorderSegment(context, left, x, y, x, y + height);
}

function tableCellBorderLine(borders: RecordValue | null, keys: string[], slideScale: number): TableLineStyle | null {
  for (const key of keys) {
    const line = asRecord(borders?.[key]);
    if (!line) continue;
    const style = tableLineStyle(line, slideScale);
    if (style.color) {
      return { color: style.color, dash: style.dash, width: style.width };
    }
  }
  return null;
}

function tableLineStyle(line: RecordValue, slideScale: number): Omit<TableLineStyle, "color"> & { color?: string } {
  const fill = asRecord(line.fill);
  const rawWidthEmu = asNumber(line.widthEmu);
  const width = rawWidthEmu > 0 ? rawWidthEmu / EMU_PER_CSS_PIXEL : 1;
  const scaledWidth = Math.max(0.5, width * Math.max(0.01, slideScale));
  return {
    color: colorToCss(fill?.color),
    dash: tableLineDash(asNumber(line.style), scaledWidth),
    width: scaledWidth,
  };
}

function tableLineDash(style: number, width: number): number[] {
  const unit = Math.max(1, width);
  if (style === 2) return [unit * 4, unit * 2];
  if (style === 3) return [unit, unit * 2];
  if (style === 4) return [unit * 8, unit * 3];
  if (style === 5) return [unit * 8, unit * 3, unit, unit * 3];
  if (style === 6) return [unit * 8, unit * 3, unit, unit * 3, unit, unit * 3];
  return [];
}

function drawBorderSegment(
  context: CanvasRenderingContext2D,
  line: TableLineStyle,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  context.save();
  context.strokeStyle = line.color;
  context.lineWidth = line.width;
  context.setLineDash(line.dash);
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.restore();
}

function normalizeLengths(source: number[], count: number, total: number): number[] {
  if (count <= 0) return [];
  const values = source.slice(0, count).filter((value) => value > 0);
  const sum = values.reduce((acc, value) => acc + value, 0);
  if (values.length === count && sum > 0) {
    return values.map((value) => (value / sum) * total);
  }
  return Array.from({ length: count }, () => total / count);
}

function sumLengths(lengths: number[], start: number, count: number): number {
  let total = 0;
  for (let index = start; index < start + count; index++) {
    total += lengths[index] ?? 0;
  }
  return total;
}
