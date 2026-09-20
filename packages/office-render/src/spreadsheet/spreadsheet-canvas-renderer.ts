import type {
  SpreadsheetCanvasCellCommand,
  SpreadsheetCanvasCommands,
  SpreadsheetCanvasHeaderCommand,
} from "./spreadsheet-canvas-commands";
import {
  SPREADSHEET_COLUMN_HEADER_HEIGHT,
  SPREADSHEET_ROW_HEADER_WIDTH,
  type SpreadsheetViewportRect,
  type SpreadsheetViewportScroll,
  type SpreadsheetViewportSize,
} from "./spreadsheet-layout";

export type SpreadsheetCanvasBitmapSize = {
  cssHeight: number;
  cssWidth: number;
  pixelHeight: number;
  pixelRatio: number;
  pixelWidth: number;
};

export type SpreadsheetCanvasDrawRect = SpreadsheetViewportRect & {
  borderBottom?: SpreadsheetCanvasDrawBorder;
  borderRight?: SpreadsheetCanvasDrawBorder;
  color?: string;
  fill?: string;
  fontFamily?: string;
  fontSize?: number;
  fontStyle?: string;
  fontWeight?: number | string;
  paddingLeft?: number;
  stroke?: string;
  text?: string;
  textAlign?: "center" | "left" | "right";
  verticalAlign?: "bottom" | "middle" | "top";
};

export type SpreadsheetCanvasDrawBorder = {
  color?: string;
  width?: number;
};

export type SpreadsheetCanvasRenderPlan = {
  bitmap: SpreadsheetCanvasBitmapSize;
  cells: SpreadsheetCanvasDrawRect[];
  columnHeaders: SpreadsheetCanvasDrawRect[];
  corner: SpreadsheetCanvasDrawRect;
  rowHeaders: SpreadsheetCanvasDrawRect[];
};

export function spreadsheetCanvasBitmapSize(
  viewportSize: SpreadsheetViewportSize,
  pixelRatio: number,
): SpreadsheetCanvasBitmapSize {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const cssWidth = Math.max(0, Math.round(viewportSize.width));
  const cssHeight = Math.max(0, Math.round(viewportSize.height));
  return {
    cssHeight,
    cssWidth,
    pixelHeight: Math.max(1, Math.round(cssHeight * ratio)),
    pixelRatio: ratio,
    pixelWidth: Math.max(1, Math.round(cssWidth * ratio)),
  };
}

export function buildSpreadsheetCanvasRenderPlan({
  commands,
  pixelRatio,
  scroll,
  viewportSize,
}: {
  commands: SpreadsheetCanvasCommands;
  pixelRatio: number;
  scroll: SpreadsheetViewportScroll;
  viewportSize: SpreadsheetViewportSize;
}): SpreadsheetCanvasRenderPlan {
  return {
    bitmap: spreadsheetCanvasBitmapSize(viewportSize, pixelRatio),
    cells: commands.cells.map((cell) => spreadsheetCanvasCellRect(cell, scroll)),
    columnHeaders: commands.headers
      .filter((header) => header.type === "column")
      .map((header) => spreadsheetCanvasHeaderRect(header, scroll)),
    corner: {
      fill: "#f1f3f4",
      height: SPREADSHEET_COLUMN_HEADER_HEIGHT,
      left: 0,
      stroke: "#dadce0",
      text: "",
      top: 0,
      width: SPREADSHEET_ROW_HEADER_WIDTH,
    },
    rowHeaders: commands.headers
      .filter((header) => header.type === "row")
      .map((header) => spreadsheetCanvasHeaderRect(header, scroll)),
  };
}

export function drawSpreadsheetCanvasRenderPlan(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  plan: SpreadsheetCanvasRenderPlan,
) {
  const { bitmap } = plan;
  context.setTransform(bitmap.pixelRatio, 0, 0, bitmap.pixelRatio, 0, 0);
  context.clearRect(0, 0, bitmap.cssWidth, bitmap.cssHeight);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, bitmap.cssWidth, bitmap.cssHeight);

  for (const cell of plan.cells) {
    drawSpreadsheetCanvasRect(context, cell);
  }
  for (const header of plan.columnHeaders) {
    drawSpreadsheetCanvasRect(context, header);
  }
  for (const header of plan.rowHeaders) {
    drawSpreadsheetCanvasRect(context, header);
  }
  drawSpreadsheetCanvasRect(context, plan.corner);
}

function spreadsheetCanvasCellRect(
  cell: SpreadsheetCanvasCellCommand,
  scroll: SpreadsheetViewportScroll,
): SpreadsheetCanvasDrawRect {
  return {
    borderBottom: cell.borderBottom,
    borderRight: cell.borderRight,
    fill: cell.fill ?? "#ffffff",
    color: cell.color,
    fontFamily: cell.fontFamily,
    fontSize: cell.fontSize,
    fontStyle: cell.fontStyle,
    fontWeight: cell.fontWeight,
    height: cell.height,
    left: cell.left - scroll.left,
    paddingLeft: cell.paddingLeft,
    stroke: "#e2e8f0",
    text: undefined,
    textAlign: cell.textAlign,
    top: cell.top - scroll.top,
    verticalAlign: cell.verticalAlign,
    width: cell.width,
  };
}

function spreadsheetCanvasHeaderRect(
  header: SpreadsheetCanvasHeaderCommand,
  scroll: SpreadsheetViewportScroll,
): SpreadsheetCanvasDrawRect {
  return {
    fill: "#f1f3f4",
    height: header.height,
    left: header.type === "column" ? header.left - scroll.left : 0,
    stroke: "#dadce0",
    text: undefined,
    top: header.type === "row" ? header.top - scroll.top : 0,
    width: header.width,
  };
}

function drawSpreadsheetCanvasRect(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  rect: SpreadsheetCanvasDrawRect,
) {
  if (rect.width <= 0 || rect.height <= 0) return;
  context.fillStyle = rect.fill ?? "#ffffff";
  context.fillRect(rect.left, rect.top, rect.width, rect.height);
  drawSpreadsheetCanvasBorders(context, rect);
  if (!rect.text) return;
  context.fillStyle = rect.color ?? "#3c4043";
  context.font = spreadsheetCanvasFont(rect);
  const textAlign = rect.textAlign ?? "left";
  context.textAlign = textAlign;
  context.textBaseline = "middle";
  context.save();
  context.beginPath();
  context.rect(rect.left + 3, rect.top + 1, Math.max(0, rect.width - 6), Math.max(0, rect.height - 2));
  context.clip();
  context.fillText(rect.text, spreadsheetCanvasTextX(rect, textAlign), spreadsheetCanvasTextY(rect));
  context.restore();
}

function drawSpreadsheetCanvasBorders(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  rect: SpreadsheetCanvasDrawRect,
) {
  if (!rect.borderBottom && !rect.borderRight) {
    context.strokeStyle = rect.stroke ?? "#e2e8f0";
    context.lineWidth = 1;
    context.strokeRect(rect.left + 0.5, rect.top + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
    return;
  }
  drawSpreadsheetCanvasLine(context, {
    border: rect.borderRight,
    fallbackColor: rect.stroke,
    x1: rect.left + rect.width - 0.5,
    x2: rect.left + rect.width - 0.5,
    y1: rect.top,
    y2: rect.top + rect.height,
  });
  drawSpreadsheetCanvasLine(context, {
    border: rect.borderBottom,
    fallbackColor: rect.stroke,
    x1: rect.left,
    x2: rect.left + rect.width,
    y1: rect.top + rect.height - 0.5,
    y2: rect.top + rect.height - 0.5,
  });
}

function drawSpreadsheetCanvasLine(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  {
    border,
    fallbackColor,
    x1,
    x2,
    y1,
    y2,
  }: {
    border?: SpreadsheetCanvasDrawBorder;
    fallbackColor?: string;
    x1: number;
    x2: number;
    y1: number;
    y2: number;
  },
) {
  const color = border?.color ?? fallbackColor ?? "#e2e8f0";
  if (color === "transparent") return;
  context.strokeStyle = color;
  context.lineWidth = Math.max(1, border?.width ?? 1);
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

export function spreadsheetCanvasFont(rect: SpreadsheetCanvasDrawRect): string {
  const weight = rect.fontWeight ?? 500;
  const style = rect.fontStyle === "italic" ? "italic " : "";
  const size = Math.max(8, Math.min(32, rect.fontSize ?? 13));
  return `${style}${weight} ${size}px ${rect.fontFamily || "Aptos, Calibri, Arial, Helvetica, sans-serif"}`;
}

function spreadsheetCanvasTextX(
  rect: SpreadsheetCanvasDrawRect,
  textAlign: CanvasTextAlign,
): number {
  if (textAlign === "right") return rect.left + Math.max(0, rect.width - 8);
  if (textAlign === "center") return rect.left + rect.width / 2;
  return rect.left + (rect.paddingLeft ?? 8);
}

function spreadsheetCanvasTextY(rect: SpreadsheetCanvasDrawRect): number {
  if (rect.verticalAlign === "top") return rect.top + 8;
  if (rect.verticalAlign === "bottom") return rect.top + Math.max(8, rect.height - 8);
  return rect.top + rect.height / 2;
}
