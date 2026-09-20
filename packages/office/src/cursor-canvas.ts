import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadSharp, type SharpFactory } from "./optional-sharp.js";
import { ProtoReader } from "./proto-reader.js";

type RecordValue = Record<string, unknown>;

type DirectCanvasElement =
  | {
      crop: DirectImageCrop | null;
      kind: "image";
      mediaId: string;
      rotation?: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      kind: "text";
      paragraphs: DirectTextParagraph[];
      rotation?: number;
      insetBottom: number;
      insetLeft: number;
      insetRight: number;
      insetTop: number;
      verticalAlign: "bottom" | "middle" | "top";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      fill: string;
      kind: "shape";
      path?: string;
      radius: number;
      rotation?: number;
      shapeKind: DirectShapeKind;
      stroke: string;
      strokeWidth: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      columnWidths: number[];
      kind: "table";
      rotation?: number;
      rows: DirectTableRow[];
      x: number;
      y: number;
      width: number;
      height: number;
    };

type DirectTextParagraph = {
  align: "center" | "left" | "right";
  runs: DirectTextRun[];
};

type DirectTextRun = {
  bold: boolean;
  color: string;
  fontSize: number;
  italic: boolean;
  text: string;
  typeface: string;
  underline: boolean;
};

type DirectTableRow = {
  cells: DirectTableCell[];
  height: number;
};

type DirectTableCell = {
  borderBottom: string;
  borderLeft: string;
  borderRight: string;
  borderTop: string;
  colSpan: number;
  fill: string;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  paragraphs: DirectTextParagraph[];
  rowSpan: number;
  verticalAlign: "bottom" | "middle" | "top";
};

type DirectCanvasMedia = {
  height: number;
  src: string;
  width: number;
};

type DirectCanvasPayload = {
  artifact: {
    generatedBy: string;
    mode: "proto-direct";
    reader: string;
    source: string;
    title: string;
  };
  media: Record<string, DirectCanvasMedia>;
  slides: DirectCanvasSlide[];
};

type PresentationRendererCanvasPayload = {
  artifact: {
    generatedBy: string;
    mode: "presentation-renderer";
    reader: string;
    rendererImport: string;
    source: string;
    title: string;
  };
  layouts: RecordValue[];
  media: Record<string, DirectCanvasMedia>;
  slides: PresentationRendererSlide[];
  theme?: PresentationTheme;
};

type PresentationRendererSlide = RecordValue & {
  heightEmu: number;
  index: number;
  thumbnail?: string | null;
  title: string;
  widthEmu: number;
};

type DirectCanvasSlide = {
  background: string;
  elements: DirectCanvasElement[];
  height: number;
  index: number;
  thumbnail: string | null;
  title: string;
  width: number;
};

type DirectImageCrop = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type DirectShapeKind =
  | "diamond"
  | "ellipse"
  | "line"
  | "rect"
  | "roundRect"
  | "triangle";

type Presentation = {
  images: PresentationImage[];
  layouts: PresentationLayout[];
  masters: PresentationLayout[];
  slides: PresentationSlide[];
  theme?: PresentationTheme;
};

type PresentationTheme = {
  colors: Record<string, string>;
};

type PresentationColor = {
  lastColor?: string;
  transform?: PresentationColorTransform;
  type?: number;
  value?: string;
};

type PresentationColorTransform = {
  alpha?: number;
  luminanceModulation?: number;
  luminanceOffset?: number;
  saturationModulation?: number;
  shade?: number;
  tint?: number;
};

type PresentationCustomGeometryPath = {
  commands: PresentationCustomPathCommand[];
  heightEmu?: number;
  id?: string;
  widthEmu?: number;
};

type PresentationCustomPathCommand = {
  close?: Record<string, never>;
  cubicBezTo?: {
    x: number;
    x1: number;
    x2: number;
    y: number;
    y1: number;
    y2: number;
  };
  lineTo?: PresentationCustomPathPoint;
  moveTo?: PresentationCustomPathPoint;
  quadBezTo?: {
    x: number;
    x1: number;
    y: number;
    y1: number;
  };
};

type PresentationCustomPathPoint = {
  x: number;
  y: number;
};

type PresentationGeometryAdjustment = {
  formula?: string;
  name?: string;
};

type PresentationElement = {
  bbox?: PresentationRect;
  connector?: PresentationConnector;
  fill?: PresentationFill;
  id?: string;
  imageReference?: { id?: string };
  levelsStyles?: PresentationTextLevelStyle[];
  name?: string;
  paragraphs: PresentationParagraph[];
  placeholderIndex?: number;
  placeholderType?: string;
  shape?: {
    adjustmentList?: PresentationGeometryAdjustment[];
    customPaths?: PresentationCustomGeometryPath[];
    fill?: PresentationFill;
    geometry?: number;
    line?: PresentationLine;
  };
  table?: PresentationTable;
  textStyle?: PresentationTextStyle;
  type?: number;
  zIndex?: number;
};

type PresentationTable = {
  columnWidths: number[];
  rows: PresentationTableRow[];
};

type PresentationTableRow = {
  cells: PresentationTableCell[];
  height: number;
};

type PresentationTableCell = {
  anchor?: string;
  anchorCenter?: boolean;
  borders?: PresentationTableCellBorders;
  bottomMargin?: number;
  fill?: PresentationFill;
  gridSpan?: number;
  horizontalMerge?: boolean;
  horizontalOverflow?: string;
  leftMargin?: number;
  paragraphs: PresentationParagraph[];
  rightMargin?: number;
  rowSpan?: number;
  topMargin?: number;
  verticalAlign?: string;
  verticalMerge?: boolean;
};

type PresentationTableCellBorders = {
  bottom?: PresentationLine;
  left?: PresentationLine;
  right?: PresentationLine;
  top?: PresentationLine;
};

type PresentationFill = {
  alphaModFix?: number;
  color?: PresentationColor;
  gradientKind?: number;
  gradientStops?: PresentationGradientStop[];
  gradientAngle?: number;
  gradientScaled?: boolean;
  imageReference?: { id?: string };
  srcRect?: PresentationCropPercent;
  stretchFillRect?: PresentationCropPercent;
  type?: number;
};

type PresentationGradientStop = {
  color?: PresentationColor;
  position?: number;
};

type PresentationImage = {
  contentType: string;
  data: Uint8Array;
  id: string;
};

type PresentationLayout = {
  background?: PresentationBackground;
  bodyLevelStyles?: PresentationTextLevelStyle[];
  elements: PresentationElement[];
  id: string;
  kind?: string;
  masterId?: string;
  name?: string;
  otherLevelStyles?: PresentationTextLevelStyle[];
  titleLevelStyles?: PresentationTextLevelStyle[];
};

type PresentationLine = {
  cap?: number;
  fill?: PresentationFill;
  head?: PresentationLineEnd;
  headEnd?: PresentationLineEnd;
  join?: number;
  style?: number;
  tail?: PresentationLineEnd;
  tailEnd?: PresentationLineEnd;
  widthEmu?: number;
};

type PresentationConnector = {
  end?: string;
  endIndex?: number;
  lineStyle?: PresentationLine;
  start?: string;
  startIndex?: number;
};

type PresentationLineEnd = {
  length?: number;
  type?: number;
  width?: number;
};

type PresentationParagraph = {
  indent?: number;
  marginLeft?: number;
  paragraphStyle?: PresentationParagraphStyle;
  runs: PresentationRun[];
  textStyle?: PresentationParagraphTextStyle;
};

type PresentationParagraphTextStyle = PresentationRunStyle & {
  alignment?: number;
};

type PresentationParagraphStyle = {
  bulletCharacter?: string;
  indent?: number;
  lineSpacing?: number;
  marginLeft?: number;
};

type PresentationRect = {
  heightEmu: number;
  horizontalFlip?: boolean;
  rotation?: number;
  verticalFlip?: boolean;
  widthEmu: number;
  xEmu: number;
  yEmu: number;
};

type PresentationRun = {
  text: string;
  textStyle?: PresentationRunStyle;
};

type PresentationRunStyle = {
  bold?: boolean;
  fill?: PresentationFill;
  fontSize?: number;
  italic?: boolean;
  scheme?: string;
  typeface?: string;
  underline?: string;
};

type PresentationTextLevelStyle = {
  level?: number;
  paragraphStyle?: PresentationParagraphStyle;
  spaceAfter?: number;
  spaceBefore?: number;
  textStyle?: PresentationParagraphTextStyle;
};

type PresentationSlide = {
  background?: PresentationBackground;
  elements: PresentationElement[];
  heightEmu: number;
  index: number;
  useLayoutId?: string;
  widthEmu: number;
};

type PresentationBackground = {
  fill?: PresentationFill;
};

type PresentationTextStyle = {
  anchor?: number;
  autoFit?: { noAutoFit?: Record<string, never>; normalAutoFit?: Record<string, never>; shapeAutoFit?: Record<string, never> };
  bottomInset?: number;
  leftInset?: number;
  rightInset?: number;
  topInset?: number;
  useParagraphSpacing?: boolean;
  wrap?: number;
};

type PresentationCropPercent = {
  b?: number;
  l?: number;
  r?: number;
  t?: number;
};

export type RenderPptxCursorCanvasOptions = {
  includeThumbnails?: boolean;
  mediaQuality?: number;
  mediaWidth?: number;
  readerVersion: string;
  sourceLabel?: string;
  sourcePath?: string;
  title: string;
};

export async function renderPptxCursorCanvasSource(
  protoBytes: Uint8Array,
  options: RenderPptxCursorCanvasOptions,
): Promise<string> {
  const payload = await buildPptxCursorCanvasPayload(protoBytes, options);
  return renderPptxCursorCanvasSourceFromPayload(payload);
}

export async function buildPptxCursorCanvasPayload(
  protoBytes: Uint8Array,
  options: RenderPptxCursorCanvasOptions,
): Promise<PresentationRendererCanvasPayload> {
  const presentation = decodePresentation(protoBytes);
  return buildPresentationPayload(presentation, options);
}

export function renderPptxCursorCanvasSourceFromPayload(
  payload: DirectCanvasPayload | PresentationRendererCanvasPayload,
): string {
  if (isPresentationRendererPayload(payload)) {
    return renderPresentationRendererCanvasSource(payload);
  }
  return renderPresentationCanvasSource(payload);
}

function isPresentationRendererPayload(
  payload: DirectCanvasPayload | PresentationRendererCanvasPayload,
): payload is PresentationRendererCanvasPayload {
  return payload.artifact.mode === "presentation-renderer";
}

function decodePresentation(bytes: Uint8Array): Presentation {
  const reader = new ProtoReader(bytes);
  const presentation: Presentation = {
    images: [],
    layouts: [],
    masters: [],
    slides: [],
  };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      presentation.slides.push(decodeSlide(reader.bytesField()));
    } else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      presentation.theme = decodeTheme(reader.bytesField());
    } else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      const layout = decodeLayout(reader.bytesField());
      if (layout.kind === "master") {
        presentation.masters.push(layout);
      } else {
        presentation.layouts.push(layout);
      }
    } else if (tag.fieldNumber === 4 && tag.wireType === 2) {
      presentation.images.push(decodeImage(reader.bytesField()));
    } else {
      reader.skip(tag.wireType);
    }
  }
  return presentation;
}

function decodeSlide(bytes: Uint8Array): PresentationSlide {
  const reader = new ProtoReader(bytes);
  const slide: PresentationSlide = {
    elements: [],
    heightEmu: 6_858_000,
    index: 1,
    widthEmu: 12_192_000,
  };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) slide.index = reader.int32();
    else if (tag.fieldNumber === 2) slide.useLayoutId = reader.string();
    else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      slide.elements.push(decodeElement(reader.bytesField()));
    } else if (tag.fieldNumber === 5) slide.widthEmu = reader.int64();
    else if (tag.fieldNumber === 6) slide.heightEmu = reader.int64();
    else if (tag.fieldNumber === 10 && tag.wireType === 2) {
      slide.background = decodeBackground(reader.bytesField());
    } else reader.skip(tag.wireType);
  }
  return slide;
}

function decodeLayout(bytes: Uint8Array): PresentationLayout {
  const reader = new ProtoReader(bytes);
  const layout: PresentationLayout = {
    elements: [],
    id: "",
  };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) layout.id = reader.string();
    else if (tag.fieldNumber === 8) layout.name = reader.string();
    else if (tag.fieldNumber === 9) layout.kind = reader.string();
    else if (tag.fieldNumber === 10 && tag.wireType === 2) {
      layout.background = decodeBackground(reader.bytesField());
    } else if (tag.fieldNumber === 11 && tag.wireType === 2) {
      layout.elements.push(decodeElement(reader.bytesField()));
    } else if (tag.fieldNumber === 12 && tag.wireType === 2) {
      (layout.bodyLevelStyles ??= []).push(decodeTextLevelStyle(reader.bytesField()));
    } else if (tag.fieldNumber === 13 && tag.wireType === 2) {
      (layout.titleLevelStyles ??= []).push(decodeTextLevelStyle(reader.bytesField()));
    } else if (tag.fieldNumber === 14 && tag.wireType === 2) {
      (layout.otherLevelStyles ??= []).push(decodeTextLevelStyle(reader.bytesField()));
    } else if (tag.fieldNumber === 15) layout.masterId = reader.string();
    else reader.skip(tag.wireType);
  }
  return layout;
}

function decodeElement(bytes: Uint8Array): PresentationElement {
  const reader = new ProtoReader(bytes);
  const element: PresentationElement = { paragraphs: [] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      element.bbox = decodeBoundingBox(reader.bytesField());
    } else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      element.imageReference = decodeImageReference(reader.bytesField());
    } else if (tag.fieldNumber === 4 && tag.wireType === 2) {
      element.shape = decodeShape(reader.bytesField());
    } else if (tag.fieldNumber === 6 && tag.wireType === 2) {
      element.paragraphs.push(decodeParagraph(reader.bytesField()));
    } else if (tag.fieldNumber === 10) element.name = reader.string();
    else if (tag.fieldNumber === 11) element.type = reader.int32();
    else if (tag.fieldNumber === 12) element.placeholderIndex = reader.int32();
    else if (tag.fieldNumber === 13) element.placeholderType = reader.string();
    else if (tag.fieldNumber === 14 && tag.wireType === 2) {
      element.textStyle = decodeTextStyle(reader.bytesField());
    } else if (tag.fieldNumber === 16 && tag.wireType === 2) {
      (element.levelsStyles ??= []).push(decodeTextLevelStyle(reader.bytesField()));
    } else if (tag.fieldNumber === 19 && tag.wireType === 2) {
      element.fill = decodeFill(reader.bytesField());
    } else if (tag.fieldNumber === 21 && tag.wireType === 2) {
      element.table = decodeTable(reader.bytesField());
    } else if (tag.fieldNumber === 27) {
      element.id = reader.string();
    } else if (tag.fieldNumber === 28 && tag.wireType === 2) {
      element.connector = decodeConnector(reader.bytesField());
    } else if (tag.fieldNumber === 30 && tag.wireType === 2) {
      element.shape = {
        ...element.shape,
        line: decodeLine(reader.bytesField()),
      };
    } else reader.skip(tag.wireType);
  }
  return element;
}

function decodeBackground(bytes: Uint8Array): PresentationBackground {
  const reader = new ProtoReader(bytes);
  const background: PresentationBackground = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 3 && tag.wireType === 2) {
      background.fill = decodeFill(reader.bytesField());
    } else reader.skip(tag.wireType);
  }
  return background;
}

function decodeBoundingBox(bytes: Uint8Array): PresentationRect {
  const reader = new ProtoReader(bytes);
  const rect: PresentationRect = {
    heightEmu: 0,
    widthEmu: 0,
    xEmu: 0,
    yEmu: 0,
  };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) rect.xEmu = reader.int64();
    else if (tag.fieldNumber === 2) rect.yEmu = reader.int64();
    else if (tag.fieldNumber === 3) rect.widthEmu = reader.int64();
    else if (tag.fieldNumber === 4) rect.heightEmu = reader.int64();
    else if (tag.fieldNumber === 5) rect.rotation = reader.int32();
    else if (tag.fieldNumber === 6) rect.horizontalFlip = reader.bool();
    else if (tag.fieldNumber === 7) rect.verticalFlip = reader.bool();
    else reader.skip(tag.wireType);
  }
  return rect;
}

function decodeColor(bytes: Uint8Array): PresentationColor {
  const reader = new ProtoReader(bytes);
  const color: PresentationColor = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) color.type = reader.int32();
    else if (tag.fieldNumber === 2) color.value = reader.string();
    else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      color.transform = decodeColorTransform(reader.bytesField());
    } else if (tag.fieldNumber === 4) {
      color.lastColor = reader.string();
    } else reader.skip(tag.wireType);
  }
  return color;
}

function decodeColorTransform(bytes: Uint8Array): PresentationColorTransform {
  const reader = new ProtoReader(bytes);
  const transform: PresentationColorTransform = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) transform.tint = reader.int32();
    else if (tag.fieldNumber === 2) transform.shade = reader.int32();
    else if (tag.fieldNumber === 3) transform.luminanceModulation = reader.int32();
    else if (tag.fieldNumber === 4) transform.luminanceOffset = reader.int32();
    else if (tag.fieldNumber === 5) transform.saturationModulation = reader.int32();
    else if (tag.fieldNumber === 6) transform.alpha = reader.int32();
    else reader.skip(tag.wireType);
  }
  return transform;
}

function decodeTable(bytes: Uint8Array): PresentationTable {
  const reader = new ProtoReader(bytes);
  const table: PresentationTable = { columnWidths: [], rows: [] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      table.rows.push(decodeTableRow(reader.bytesField()));
    } else if (tag.fieldNumber === 2) {
      table.columnWidths.push(reader.int32());
    } else reader.skip(tag.wireType);
  }
  return table;
}

function decodeTableRow(bytes: Uint8Array): PresentationTableRow {
  const reader = new ProtoReader(bytes);
  const row: PresentationTableRow = { cells: [], height: 0 };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      row.cells.push(decodeTableCell(reader.bytesField()));
    } else if (tag.fieldNumber === 2) {
      row.height = reader.int32();
    } else reader.skip(tag.wireType);
  }
  return row;
}

function decodeTableCell(bytes: Uint8Array): PresentationTableCell {
  const reader = new ProtoReader(bytes);
  const cell: PresentationTableCell = { paragraphs: [] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 3 && tag.wireType === 2) {
      cell.paragraphs.push(decodeParagraph(reader.bytesField()));
    } else if (tag.fieldNumber === 5 && tag.wireType === 2) {
      cell.fill = decodeFill(reader.bytesField());
    } else if (tag.fieldNumber === 6 && tag.wireType === 2) {
      cell.borders = decodeTableCellBorders(reader.bytesField());
    } else if (tag.fieldNumber === 8) {
      cell.gridSpan = reader.int32();
    } else if (tag.fieldNumber === 9) {
      cell.rowSpan = reader.int32();
    } else if (tag.fieldNumber === 10) {
      cell.horizontalMerge = reader.bool();
    } else if (tag.fieldNumber === 11) {
      cell.verticalMerge = reader.bool();
    } else if (tag.fieldNumber === 12) {
      cell.verticalAlign = reader.string();
    } else if (tag.fieldNumber === 13) {
      cell.leftMargin = reader.int32();
    } else if (tag.fieldNumber === 14) {
      cell.rightMargin = reader.int32();
    } else if (tag.fieldNumber === 15) {
      cell.topMargin = reader.int32();
    } else if (tag.fieldNumber === 16) {
      cell.bottomMargin = reader.int32();
    } else if (tag.fieldNumber === 17) {
      cell.anchor = reader.string();
    } else if (tag.fieldNumber === 18) {
      cell.anchorCenter = reader.bool();
    } else if (tag.fieldNumber === 19) {
      cell.horizontalOverflow = reader.string();
    } else reader.skip(tag.wireType);
  }
  return cell;
}

function decodeTableCellBorders(bytes: Uint8Array): PresentationTableCellBorders {
  const reader = new ProtoReader(bytes);
  const borders: PresentationTableCellBorders = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) borders.top = decodeLine(reader.bytesField());
    else if (tag.fieldNumber === 2 && tag.wireType === 2) borders.right = decodeLine(reader.bytesField());
    else if (tag.fieldNumber === 3 && tag.wireType === 2) borders.bottom = decodeLine(reader.bytesField());
    else if (tag.fieldNumber === 4 && tag.wireType === 2) borders.left = decodeLine(reader.bytesField());
    else reader.skip(tag.wireType);
  }
  return borders;
}

function decodeTheme(bytes: Uint8Array): PresentationTheme {
  const reader = new ProtoReader(bytes);
  const theme: PresentationTheme = { colors: {} };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      decodeColorSchemeInto(reader.bytesField(), theme.colors);
    } else reader.skip(tag.wireType);
  }
  return theme;
}

function decodeColorSchemeInto(bytes: Uint8Array, colors: Record<string, string>): void {
  const reader = new ProtoReader(bytes);
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 2 && tag.wireType === 2) {
      const entry = decodeThemeColorEntry(reader.bytesField());
      if (entry.name && entry.hex) colors[entry.name] = entry.hex;
    } else reader.skip(tag.wireType);
  }
}

function decodeThemeColorEntry(bytes: Uint8Array): { hex?: string; name?: string } {
  const reader = new ProtoReader(bytes);
  const entry: { hex?: string; name?: string } = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) entry.name = reader.string();
    else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      const color = decodeColor(reader.bytesField());
      if (color.type === 1 && color.value) entry.hex = color.value;
    } else reader.skip(tag.wireType);
  }
  return entry;
}

function decodeFill(bytes: Uint8Array): PresentationFill {
  const reader = new ProtoReader(bytes);
  const fill: PresentationFill = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) fill.type = reader.int32();
    else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      fill.color = decodeColor(reader.bytesField());
    } else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      (fill.gradientStops ??= []).push(decodeGradientStop(reader.bytesField()));
    } else if (tag.fieldNumber === 5) {
      fill.gradientKind = reader.int32();
    } else if (tag.fieldNumber === 6) {
      fill.gradientAngle = reader.double();
    } else if (tag.fieldNumber === 7) {
      fill.gradientScaled = reader.bool();
    } else if (tag.fieldNumber === 11 && tag.wireType === 2) {
      fill.imageReference = decodeImageReference(reader.bytesField());
    } else if (tag.fieldNumber === 12) {
      fill.alphaModFix = reader.int32();
    } else if (tag.fieldNumber === 14 && tag.wireType === 2) {
      fill.srcRect = decodeCropPercent(reader.bytesField());
    } else if (tag.fieldNumber === 15 && tag.wireType === 2) {
      reader.bytesField();
      fill.stretchFillRect = {};
    } else reader.skip(tag.wireType);
  }
  return fill;
}

function decodeGradientStop(bytes: Uint8Array): PresentationGradientStop {
  const reader = new ProtoReader(bytes);
  const stop: PresentationGradientStop = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) stop.position = reader.int32();
    else if (tag.fieldNumber === 2 && tag.wireType === 2) stop.color = decodeColor(reader.bytesField());
    else reader.skip(tag.wireType);
  }
  return stop;
}

function decodeCropPercent(bytes: Uint8Array): PresentationCropPercent {
  const reader = new ProtoReader(bytes);
  const crop: PresentationCropPercent = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) crop.l = reader.int32();
    else if (tag.fieldNumber === 2) crop.t = reader.int32();
    else if (tag.fieldNumber === 3) crop.r = reader.int32();
    else if (tag.fieldNumber === 4) crop.b = reader.int32();
    else reader.skip(tag.wireType);
  }
  return crop;
}

function decodeImage(bytes: Uint8Array): PresentationImage {
  const reader = new ProtoReader(bytes);
  const image: PresentationImage = {
    contentType: "application/octet-stream",
    data: new Uint8Array(),
    id: "",
  };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) image.contentType = reader.string();
    else if (tag.fieldNumber === 2) image.data = reader.bytesField();
    else if (tag.fieldNumber === 3) image.id = reader.string();
    else reader.skip(tag.wireType);
  }
  return image;
}

function decodeImageReference(bytes: Uint8Array): { id?: string } {
  const reader = new ProtoReader(bytes);
  const reference: { id?: string } = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) reference.id = reader.string();
    else reader.skip(tag.wireType);
  }
  return reference;
}

function decodeLine(bytes: Uint8Array): PresentationLine {
  const reader = new ProtoReader(bytes);
  const line: PresentationLine = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) line.style = reader.int32();
    else if (tag.fieldNumber === 2) line.widthEmu = reader.int32();
    else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      line.fill = decodeFill(reader.bytesField());
    } else if (tag.fieldNumber === 6) {
      line.cap = reader.int32();
    } else if (tag.fieldNumber === 7) {
      line.join = reader.int32();
    } else if (tag.fieldNumber === 8 && tag.wireType === 2) {
      line.head = decodeLineEnd(reader.bytesField());
      line.headEnd = line.head;
    } else if (tag.fieldNumber === 9 && tag.wireType === 2) {
      line.tail = decodeLineEnd(reader.bytesField());
      line.tailEnd = line.tail;
    } else reader.skip(tag.wireType);
  }
  return line;
}

function decodeConnector(bytes: Uint8Array): PresentationConnector {
  const reader = new ProtoReader(bytes);
  const connector: PresentationConnector = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) connector.start = reader.string();
    else if (tag.fieldNumber === 2) connector.startIndex = reader.int32();
    else if (tag.fieldNumber === 3) connector.end = reader.string();
    else if (tag.fieldNumber === 4) connector.endIndex = reader.int32();
    else if (tag.fieldNumber === 5 && tag.wireType === 2) {
      connector.lineStyle = decodeConnectorLineStyle(reader.bytesField());
    } else reader.skip(tag.wireType);
  }
  return connector;
}

function decodeConnectorLineStyle(bytes: Uint8Array): PresentationLine {
  const reader = new ProtoReader(bytes);
  const line: PresentationLine = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 5) line.cap = reader.int32();
    else if (tag.fieldNumber === 6) line.join = reader.int32();
    else if (tag.fieldNumber === 7 && tag.wireType === 2) {
      line.head = decodeLineEnd(reader.bytesField());
      line.headEnd = line.head;
    } else if (tag.fieldNumber === 8 && tag.wireType === 2) {
      line.tail = decodeLineEnd(reader.bytesField());
      line.tailEnd = line.tail;
    } else reader.skip(tag.wireType);
  }
  return line;
}

function decodeLineEnd(bytes: Uint8Array): PresentationLineEnd {
  const reader = new ProtoReader(bytes);
  const end: PresentationLineEnd = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) end.type = reader.int32();
    else if (tag.fieldNumber === 2) end.width = reader.int32();
    else if (tag.fieldNumber === 3) end.length = reader.int32();
    else reader.skip(tag.wireType);
  }
  return end;
}

function decodeParagraph(bytes: Uint8Array): PresentationParagraph {
  const reader = new ProtoReader(bytes);
  const paragraph: PresentationParagraph = { runs: [] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      paragraph.runs.push(decodeRun(reader.bytesField()));
    } else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      paragraph.textStyle = decodeParagraphTextStyle(reader.bytesField());
    } else if (tag.fieldNumber === 4) {
      paragraph.marginLeft = reader.int32();
    } else if (tag.fieldNumber === 5) {
      paragraph.indent = reader.int32();
    } else if (tag.fieldNumber === 10 && tag.wireType === 2) {
      paragraph.paragraphStyle = decodeParagraphStyle(reader.bytesField());
    } else reader.skip(tag.wireType);
  }
  return paragraph;
}

function decodeParagraphTextStyle(bytes: Uint8Array): PresentationParagraphTextStyle {
  const reader = new ProtoReader(bytes);
  const style: PresentationParagraphTextStyle = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 4) style.bold = reader.bool();
    else if (tag.fieldNumber === 5) style.italic = reader.bool();
    else if (tag.fieldNumber === 6) style.fontSize = reader.int32();
    else if (tag.fieldNumber === 7 && tag.wireType === 2) {
      style.fill = decodeFill(reader.bytesField());
    } else if (tag.fieldNumber === 8) style.alignment = reader.int32();
    else if (tag.fieldNumber === 9) style.underline = reader.string();
    else if (tag.fieldNumber === 17) style.scheme = reader.string();
    else if (tag.fieldNumber === 18) style.typeface = reader.string();
    else reader.skip(tag.wireType);
  }
  return style;
}

function decodeRun(bytes: Uint8Array): PresentationRun {
  const reader = new ProtoReader(bytes);
  const run: PresentationRun = { text: "" };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) run.text = reader.string();
    else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      run.textStyle = decodeRunStyle(reader.bytesField());
    } else reader.skip(tag.wireType);
  }
  return run;
}

function decodeRunStyle(bytes: Uint8Array): PresentationRunStyle {
  const reader = new ProtoReader(bytes);
  const style: PresentationRunStyle = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 4) style.bold = reader.bool();
    else if (tag.fieldNumber === 5) style.italic = reader.bool();
    else if (tag.fieldNumber === 6) style.fontSize = reader.int32();
    else if (tag.fieldNumber === 7 && tag.wireType === 2) {
      style.fill = decodeFill(reader.bytesField());
    } else if (tag.fieldNumber === 9) style.underline = reader.string();
    else if (tag.fieldNumber === 17) style.scheme = reader.string();
    else if (tag.fieldNumber === 18) style.typeface = reader.string();
    else reader.skip(tag.wireType);
  }
  return style;
}

function decodeTextLevelStyle(bytes: Uint8Array): PresentationTextLevelStyle {
  const reader = new ProtoReader(bytes);
  const style: PresentationTextLevelStyle = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 2) style.level = reader.int32();
    else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      style.textStyle = decodeParagraphTextStyle(reader.bytesField());
    } else if (tag.fieldNumber === 4 && tag.wireType === 2) {
      style.paragraphStyle = decodeParagraphStyle(reader.bytesField());
    } else if (tag.fieldNumber === 5) style.spaceBefore = reader.int32();
    else if (tag.fieldNumber === 6) style.spaceAfter = reader.int32();
    else reader.skip(tag.wireType);
  }
  return style;
}

function decodeParagraphStyle(bytes: Uint8Array): PresentationParagraphStyle {
  const reader = new ProtoReader(bytes);
  const style: PresentationParagraphStyle = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) style.bulletCharacter = reader.string();
    else if (tag.fieldNumber === 2) style.marginLeft = reader.int32();
    else if (tag.fieldNumber === 3) style.indent = reader.int32();
    else if (tag.fieldNumber === 4) style.lineSpacing = reader.int32();
    else reader.skip(tag.wireType);
  }
  return style;
}

function decodeShape(bytes: Uint8Array): NonNullable<PresentationElement["shape"]> {
  const reader = new ProtoReader(bytes);
  const shape: NonNullable<PresentationElement["shape"]> = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) shape.geometry = reader.int32();
    else if (tag.fieldNumber === 5 && tag.wireType === 2) {
      shape.fill = decodeFill(reader.bytesField());
    } else if (tag.fieldNumber === 6 && tag.wireType === 2) {
      shape.line = decodeLine(reader.bytesField());
    } else if (tag.fieldNumber === 7 && tag.wireType === 2) {
      (shape.adjustmentList ??= []).push(decodeGeometryAdjustment(reader.bytesField()));
    } else if (tag.fieldNumber === 9 && tag.wireType === 2) {
      (shape.customPaths ??= []).push(decodeCustomGeometryPath(reader.bytesField()));
    } else reader.skip(tag.wireType);
  }
  return shape;
}

function decodeGeometryAdjustment(bytes: Uint8Array): PresentationGeometryAdjustment {
  const reader = new ProtoReader(bytes);
  const adjustment: PresentationGeometryAdjustment = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) adjustment.name = reader.string();
    else if (tag.fieldNumber === 2) adjustment.formula = reader.string();
    else reader.skip(tag.wireType);
  }
  return adjustment;
}

function decodeCustomGeometryPath(bytes: Uint8Array): PresentationCustomGeometryPath {
  const reader = new ProtoReader(bytes);
  const path: PresentationCustomGeometryPath = { commands: [] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) path.widthEmu = Number(reader.int64());
    else if (tag.fieldNumber === 2) path.heightEmu = Number(reader.int64());
    else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      path.commands.push(decodeCustomPathCommand(reader.bytesField()));
    } else if (tag.fieldNumber === 4) path.id = reader.string();
    else reader.skip(tag.wireType);
  }
  return path;
}

function decodeCustomPathCommand(bytes: Uint8Array): PresentationCustomPathCommand {
  const reader = new ProtoReader(bytes);
  const command: PresentationCustomPathCommand = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      command.moveTo = decodeCustomPathPoint(reader.bytesField());
    } else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      command.lineTo = decodeCustomPathPoint(reader.bytesField());
    } else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      reader.bytesField();
      command.close = {};
    } else if (tag.fieldNumber === 4 && tag.wireType === 2) {
      command.quadBezTo = decodeCustomPathQuadraticBezier(reader.bytesField());
    } else if (tag.fieldNumber === 5 && tag.wireType === 2) {
      command.cubicBezTo = decodeCustomPathCubicBezier(reader.bytesField());
    } else {
      reader.skip(tag.wireType);
    }
  }
  return command;
}

function decodeCustomPathPoint(bytes: Uint8Array): PresentationCustomPathPoint {
  const reader = new ProtoReader(bytes);
  const point: PresentationCustomPathPoint = { x: 0, y: 0 };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) point.x = Number(reader.int64());
    else if (tag.fieldNumber === 2) point.y = Number(reader.int64());
    else reader.skip(tag.wireType);
  }
  return point;
}

function decodeCustomPathQuadraticBezier(
  bytes: Uint8Array,
): NonNullable<PresentationCustomPathCommand["quadBezTo"]> {
  const reader = new ProtoReader(bytes);
  const curve = { x: 0, x1: 0, y: 0, y1: 0 };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) curve.x1 = Number(reader.int64());
    else if (tag.fieldNumber === 2) curve.y1 = Number(reader.int64());
    else if (tag.fieldNumber === 3) curve.x = Number(reader.int64());
    else if (tag.fieldNumber === 4) curve.y = Number(reader.int64());
    else reader.skip(tag.wireType);
  }
  return curve;
}

function decodeCustomPathCubicBezier(
  bytes: Uint8Array,
): NonNullable<PresentationCustomPathCommand["cubicBezTo"]> {
  const reader = new ProtoReader(bytes);
  const curve = { x: 0, x1: 0, x2: 0, y: 0, y1: 0, y2: 0 };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) curve.x1 = Number(reader.int64());
    else if (tag.fieldNumber === 2) curve.y1 = Number(reader.int64());
    else if (tag.fieldNumber === 3) curve.x2 = Number(reader.int64());
    else if (tag.fieldNumber === 4) curve.y2 = Number(reader.int64());
    else if (tag.fieldNumber === 5) curve.x = Number(reader.int64());
    else if (tag.fieldNumber === 6) curve.y = Number(reader.int64());
    else reader.skip(tag.wireType);
  }
  return curve;
}

function decodeTextStyle(bytes: Uint8Array): PresentationTextStyle {
  const reader = new ProtoReader(bytes);
  const style: PresentationTextStyle = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) style.anchor = reader.int32();
    else if (tag.fieldNumber === 10) style.bottomInset = reader.int32();
    else if (tag.fieldNumber === 11) style.leftInset = reader.int32();
    else if (tag.fieldNumber === 12) style.rightInset = reader.int32();
    else if (tag.fieldNumber === 13) style.topInset = reader.int32();
    else if (tag.fieldNumber === 14) style.useParagraphSpacing = reader.bool();
    else if (tag.fieldNumber === 20) style.wrap = reader.int32();
    else if (tag.fieldNumber === 21 && tag.wireType === 2) {
      style.autoFit = decodeTextAutoFit(reader.bytesField());
    }
    else reader.skip(tag.wireType);
  }
  return style;
}

function decodeTextAutoFit(bytes: Uint8Array): NonNullable<PresentationTextStyle["autoFit"]> {
  const reader = new ProtoReader(bytes);
  const autoFit: NonNullable<PresentationTextStyle["autoFit"]> = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      reader.bytesField();
      autoFit.noAutoFit = {};
    } else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      reader.bytesField();
      autoFit.normalAutoFit = {};
    } else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      reader.bytesField();
      autoFit.shapeAutoFit = {};
    } else {
      reader.skip(tag.wireType);
    }
  }
  return autoFit;
}

async function buildPresentationPayload(
  presentation: Presentation,
  options: RenderPptxCursorCanvasOptions,
): Promise<PresentationRendererCanvasPayload> {
  const sharp = await loadSharp();
  const mediaIndex = await buildMediaIndex(presentation.images, sharp, options);
  const layouts = rendererLayouts(presentation);
  const thumbnails = options.includeThumbnails
    ? await Promise.all(
        presentation.slides.map((slide, index) =>
          renderSlideThumbnailDataUrl(
            buildSlide(
              slide,
              index,
              presentation.layouts,
              presentation.masters,
              mediaIndex,
              presentation.theme,
            ),
            mediaIndex.media,
            sharp,
          ),
        ),
      )
    : [];
  const slides = presentation.slides.map((slide, index) =>
    rendererSlide(slide, index, layouts, thumbnails[index] ?? null),
  );
  return {
    artifact: {
      generatedBy: "@autodev/office",
      mode: "presentation-renderer",
      reader: options.readerVersion,
      rendererImport: "inline:@autodev/office-render/presentation-cursor-runtime",
      source: sourceLabel(options),
      title: options.title,
    },
    layouts,
    media: Object.fromEntries(mediaByImageId(mediaIndex)),
    slides,
    theme: presentation.theme,
  };
}

function rendererLayouts(presentation: Presentation): RecordValue[] {
  return [
    ...presentation.masters.map((layout) => rendererLayout(layout)),
    ...presentation.layouts.map((layout) => rendererLayout(layout)),
  ];
}

function rendererLayout(layout: PresentationLayout): RecordValue {
  return compactRecord({
    background: layout.background,
    bodyLevelStyles: layout.bodyLevelStyles,
    elements: layout.elements,
    id: layout.id,
    kind: layout.kind,
    name: layout.name,
    otherLevelStyles: layout.otherLevelStyles,
    parentLayoutId: layout.masterId,
    titleLevelStyles: layout.titleLevelStyles,
  });
}

function rendererSlide(
  slide: PresentationSlide,
  index: number,
  layouts: RecordValue[],
  thumbnail: string | null,
): PresentationRendererSlide {
  return compactRecord({
    background: slide.background,
    elements: slide.elements,
    heightEmu: slide.heightEmu,
    index: slide.index || index + 1,
    thumbnail,
    title: firstPresentationText(slide, layouts) || `Slide ${index + 1}`,
    useLayoutId: slide.useLayoutId,
    widthEmu: slide.widthEmu,
  }) as PresentationRendererSlide;
}

function compactRecord<T extends Record<string, unknown>>(record: T): RecordValue {
  const result: RecordValue = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function mediaByImageId(mediaIndex: MediaIndex): Map<string, DirectCanvasMedia> {
  const media = new Map<string, DirectCanvasMedia>();
  for (const [imageId, mediaId] of mediaIndex.byImageId) {
    const entry = mediaIndex.media.get(mediaId);
    if (entry) media.set(imageId, entry);
  }
  return media;
}

function firstPresentationText(
  slide: PresentationSlide,
  layouts: RecordValue[],
): string {
  const layout = layouts.find((item) => item.id === slide.useLayoutId);
  const layoutElements =
    (layout?.elements as PresentationElement[] | undefined) ?? [];
  const elements = [...layoutElements, ...slide.elements];
  for (const element of elements) {
    for (const paragraph of element.paragraphs) {
      const text = paragraph.runs.map((run) => run.text).join("").trim();
      if (text) return text;
    }
  }
  return "";
}

function officeRenderPresentationRuntimeInline(): string {
  const explicit = process.env.AUTODEV_OFFICE_RENDER_CURSOR_RUNTIME_INLINE;
  const runtimePath =
    explicit ??
    fileURLToPath(
      new URL(
        "../../office-render/dist/presentation-cursor-runtime.inline.global.js",
        import.meta.url,
      ),
    );

  try {
    return readFileSync(runtimePath, "utf8");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown runtime read failure";
    throw new Error(
      `Missing @autodev/office-render Cursor runtime at ${runtimePath}. ` +
        "Run `npm --prefix packages/office-render run build` before generating a PPTX Cursor Canvas. " +
        message,
      { cause: error },
    );
  }
}

type MediaIndex = {
  byImageId: Map<string, string>;
  media: Map<string, DirectCanvasMedia>;
};

async function buildMediaIndex(
  images: PresentationImage[],
  sharp: SharpFactory | null,
  options: RenderPptxCursorCanvasOptions,
): Promise<MediaIndex> {
  const byImageId = new Map<string, string>();
  const media = new Map<string, DirectCanvasMedia>();
  for (const image of images) {
    if (!image.id || image.data.length === 0) continue;
    const mediaId = sha256(image.data);
    const encoded = await encodeMediaImage(image, sharp, options);
    const size = imageSize(encoded.bytes);
    byImageId.set(image.id, mediaId);
    if (!media.has(mediaId)) {
      media.set(mediaId, {
        height: size.height,
        src: `data:${encoded.contentType};base64,${Buffer.from(encoded.bytes).toString("base64")}`,
        width: size.width,
      });
    }
  }
  return { byImageId, media };
}

async function encodeMediaImage(
  image: PresentationImage,
  sharp: SharpFactory | null,
  options: RenderPptxCursorCanvasOptions,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (shouldPreserveOriginalMedia(image, options)) {
    return { bytes: image.data, contentType: image.contentType };
  }
  if (!sharp) {
    return { bytes: image.data, contentType: image.contentType };
  }
  const metadata = await sharp(image.data).metadata();
  const resized = sharp(image.data).resize({
    fit: "inside",
    width: options.mediaWidth ?? 1280,
    withoutEnlargement: true,
  });
  if (metadata.hasAlpha === true) {
    const buffer = await resized.png({ compressionLevel: 9 }).toBuffer();
    return { bytes: new Uint8Array(buffer), contentType: "image/png" };
  }

  const buffer = await resized
    .flatten({ background: "#ffffff" })
    .jpeg({ mozjpeg: true, quality: clampQuality(options.mediaQuality ?? 70) })
    .toBuffer();
  return { bytes: new Uint8Array(buffer), contentType: "image/jpeg" };
}

function shouldPreserveOriginalMedia(
  image: PresentationImage,
  options: RenderPptxCursorCanvasOptions,
): boolean {
  if (options.mediaWidth != null || options.mediaQuality != null) return false;
  return isBrowserImageContentType(image.contentType);
}

function isBrowserImageContentType(contentType: string): boolean {
  return /^(image\/(?:png|jpe?g|gif|webp|svg\+xml))$/iu.test(contentType);
}

function buildSlide(
  slide: PresentationSlide,
  index: number,
  layouts: PresentationLayout[],
  masters: PresentationLayout[],
  mediaIndex: MediaIndex,
  theme?: PresentationTheme,
): DirectCanvasSlide {
  const layout = layouts.find((item) => item.id === slide.useLayoutId);
  const master = layout?.masterId
    ? masters.find((item) => item.id === layout.masterId)
    : undefined;
  const elements = slideElements(slide, layout, master)
    .flatMap((element) => directElements(element, mediaIndex, theme))
    .filter((element): element is DirectCanvasElement => element != null);
  return {
    background: slideBackgroundToCss(slide, layout, master, theme),
    elements,
    height: slide.heightEmu,
    index: slide.index || index + 1,
    thumbnail: null,
    title: firstText(elements) || `Slide ${index + 1}`,
    width: slide.widthEmu,
  };
}

function slideElements(
  slide: PresentationSlide,
  layout?: PresentationLayout,
  master?: PresentationLayout,
): PresentationElement[] {
  const isRendered = (element: PresentationElement) => {
    const placeholderType = (element.placeholderType ?? "").toLowerCase();
    return placeholderType !== "sldnum" && placeholderType !== "dt";
  };
  const slideEls = slide.elements.filter(isRendered);
  const layoutEls = (layout?.elements ?? []).filter(isRendered);
  const masterEls = (master?.elements ?? []).filter(isRendered);

  const slideTypes = collectPlaceholderTypes(slideEls);
  const layoutTypes = collectPlaceholderTypes(layoutEls);

  const filteredMaster = masterEls.filter((element) => {
    const type = normalizedPlaceholderType(element);
    if (!type) return true;
    return !layoutTypes.has(type) && !slideTypes.has(type);
  });
  const filteredLayout = layoutEls.filter((element) => {
    const type = normalizedPlaceholderType(element);
    if (!type) return true;
    return !slideTypes.has(type);
  });

  const sortByZ = (left: PresentationElement, right: PresentationElement) =>
    (left.zIndex ?? 0) - (right.zIndex ?? 0);
  return [
    ...filteredMaster.sort(sortByZ),
    ...filteredLayout.sort(sortByZ),
    ...slideEls.sort(sortByZ),
  ];
}

function collectPlaceholderTypes(elements: PresentationElement[]): Set<string> {
  const types = new Set<string>();
  for (const element of elements) {
    const type = normalizedPlaceholderType(element);
    if (type) types.add(type);
  }
  return types;
}

function normalizedPlaceholderType(element: PresentationElement): string {
  const type = (element.placeholderType ?? "").replace(/[^a-z0-9]/giu, "").toLowerCase();
  return type === "ctrtitle" ? "title" : type;
}

function directElements(
  element: PresentationElement,
  mediaIndex: MediaIndex,
  theme?: PresentationTheme,
): DirectCanvasElement[] {
  const bbox = element.bbox;
  if (!bbox) return [];
  const rect = {
    height: bbox.heightEmu,
    rotation: bbox.rotation,
    width: bbox.widthEmu,
    x: bbox.xEmu,
    y: bbox.yEmu,
  };
  if (rect.width <= 0 && rect.height <= 0) return [];

  if (element.table) {
    const tableEl = buildDirectTable(element.table, rect, theme);
    return tableEl ? [tableEl] : [];
  }

  const imageId = element.imageReference?.id ?? element.fill?.imageReference?.id;
  const mediaId = imageId ? mediaIndex.byImageId.get(imageId) : null;
  const elements: DirectCanvasElement[] = [];
  if (mediaId) {
    const media = mediaIndex.media.get(mediaId);
    elements.push({
      crop: media ? imageSourceRect(element, media) : null,
      kind: "image",
      mediaId,
      ...rect,
    });
  }

  const shapeKind = normalizeShapeKind(element.shape?.geometry);
  const shapePath = customGeometrySvgPath(element.shape, rect);
  const fill = fillToCss(element.shape?.fill ?? element.fill, theme) ?? "transparent";
  const line = lineToCss(element.shape?.line, theme);
  if (!mediaId && (fill !== "transparent" || line.color || shapeKind === "line" || shapePath)) {
    elements.push({
      fill,
      kind: "shape",
      path: shapePath,
      radius: shapeKind === "roundRect" ? Math.min(rect.width, rect.height) * 0.12 : 0,
      shapeKind,
      stroke: line.color ?? "none",
      strokeWidth: line.color ? line.width : 0,
      ...rect,
    });
  }

  const paragraphs = buildTextParagraphs(element, theme);
  if (paragraphs.length > 0 && rect.width > 0 && rect.height > 0) {
    const textStyle = element.textStyle ?? {};
    elements.push({
      kind: "text",
      paragraphs,
      insetBottom: textStyle.bottomInset ?? 0,
      insetLeft: textStyle.leftInset ?? 0,
      insetRight: textStyle.rightInset ?? 0,
      insetTop: textStyle.topInset ?? 0,
      verticalAlign: verticalTextAlign(textStyle),
      ...rect,
    });
  }

  return elements;
}

function buildTextParagraphs(
  element: PresentationElement,
  theme?: PresentationTheme,
): DirectTextParagraph[] {
  const paragraphs: DirectTextParagraph[] = [];
  for (const paragraph of element.paragraphs) {
    const runs: DirectTextRun[] = [];
    for (const run of paragraph.runs) {
      if (!run.text) continue;
      runs.push(buildTextRun(run, theme));
    }
    if (runs.length === 0) continue;
    paragraphs.push({
      align: paragraphAlign(paragraph.textStyle?.alignment),
      runs,
    });
  }
  return paragraphs;
}

function buildTextRun(run: PresentationRun, theme?: PresentationTheme): DirectTextRun {
  const style = run.textStyle ?? {};
  return {
    bold: style.bold === true,
    color: fillToCss(style.fill, theme) ?? "#0f172a",
    fontSize: fontSizeFromStyle(style),
    italic: style.italic === true,
    text: run.text,
    typeface: style.typeface ?? "",
    underline: style.underline === "sng" || style.underline === "single",
  };
}

function buildDirectTable(
  table: PresentationTable,
  rect: { height: number; width: number; x: number; y: number },
  theme?: PresentationTheme,
): DirectCanvasElement | null {
  const rows: DirectTableRow[] = table.rows.map((row) => ({
    height: row.height,
    cells: row.cells.map((cell) => ({
      borderBottom: borderLineCss(cell.borders?.bottom, theme),
      borderLeft: borderLineCss(cell.borders?.left, theme),
      borderRight: borderLineCss(cell.borders?.right, theme),
      borderTop: borderLineCss(cell.borders?.top, theme),
      colSpan: cell.gridSpan ?? 1,
      fill: fillToCss(cell.fill, theme) ?? "transparent",
      marginBottom: cell.bottomMargin ?? 45_720,
      marginLeft: cell.leftMargin ?? 91_440,
      marginRight: cell.rightMargin ?? 91_440,
      marginTop: cell.topMargin ?? 45_720,
      paragraphs: buildCellParagraphs(cell.paragraphs, theme),
      rowSpan: cell.rowSpan ?? 1,
      verticalAlign: cellVerticalAlign(cell.anchor ?? cell.verticalAlign),
    })),
  }));
  return { columnWidths: table.columnWidths, kind: "table", rows, ...rect };
}

function buildCellParagraphs(
  paragraphs: PresentationParagraph[],
  theme?: PresentationTheme,
): DirectTextParagraph[] {
  const result: DirectTextParagraph[] = [];
  for (const paragraph of paragraphs) {
    const runs: DirectTextRun[] = [];
    for (const run of paragraph.runs) {
      if (!run.text) continue;
      runs.push(buildTextRun(run, theme));
    }
    if (runs.length === 0) continue;
    result.push({ align: paragraphAlign(paragraph.textStyle?.alignment), runs });
  }
  return result;
}

function borderLineCss(line?: PresentationLine, theme?: PresentationTheme): string {
  if (!line) return "none";
  const color = fillToCss(line.fill, theme) ?? "#94a3b8";
  const widthPx = Math.max(1, Math.round((line.widthEmu ?? 9_525) / 9_525));
  return `${widthPx}px solid ${color}`;
}

function cellVerticalAlign(value?: string): "bottom" | "middle" | "top" {
  if (!value) return "top";
  const v = value.toLowerCase();
  if (v === "b" || v === "bottom") return "bottom";
  if (v === "ctr" || v === "center" || v === "middle") return "middle";
  return "top";
}

function paragraphAlign(alignment?: number): "center" | "left" | "right" {
  if (alignment === 2) return "center";
  if (alignment === 3) return "right";
  return "left";
}

function verticalTextAlign(
  textStyle: PresentationTextStyle,
): "bottom" | "middle" | "top" {
  if (textStyle.anchor === 2) return "middle";
  if (textStyle.anchor === 3) return "bottom";
  return "top";
}

function fontSizeFromStyle(style: PresentationRunStyle): number {
  const pointSize = (style.fontSize ?? 1800) / 100;
  return Math.max(8, Math.min(96, pointSize)) * 12_700;
}

function fillToCss(fill?: PresentationFill, theme?: PresentationTheme): string | undefined {
  const color = fill?.color;
  if (!color?.value) return undefined;
  if (color.transform?.alpha === 0) return "transparent";
  if (color.type === 1 || /^[0-9a-f]{6}$/iu.test(color.value)) {
    return `#${color.value}`;
  }
  if (color.type === 2 && theme) {
    const hex = resolveSchemeColor(color.value, theme);
    if (hex) return hex;
  }
  return undefined;
}

function resolveSchemeColor(name: string, theme: PresentationTheme): string | undefined {
  const normalized = name.toLowerCase();
  const direct = theme.colors[normalized];
  if (direct) return `#${direct}`;
  // PowerPoint canonical aliases used in scheme color references
  const aliases: Record<string, string> = {
    bg1: "lt1",
    bg2: "lt2",
    dk1: "dk1",
    dk2: "dk2",
    folhlink: "folHlink",
    hlink: "hlink",
    lt1: "lt1",
    lt2: "lt2",
    phclr: "lt1",
    tx1: "dk1",
    tx2: "dk2",
  };
  const canonical = aliases[normalized];
  if (canonical) {
    const aliased = theme.colors[canonical] ?? theme.colors[canonical.toLowerCase()];
    if (aliased) return `#${aliased}`;
  }
  return undefined;
}

function lineToCss(line?: PresentationLine, theme?: PresentationTheme): { color?: string; width: number } {
  return {
    color: fillToCss(line?.fill, theme),
    width: Math.max(1, line?.widthEmu ?? 9_525),
  };
}

function slideBackgroundToCss(
  slide: PresentationSlide,
  layout?: PresentationLayout,
  master?: PresentationLayout,
  theme?: PresentationTheme,
): string {
  return (
    fillToCss(slide.background?.fill, theme) ??
    fillToCss(layout?.background?.fill, theme) ??
    fillToCss(master?.background?.fill, theme) ??
    "#ffffff"
  );
}

function imageSourceRect(
  element: PresentationElement,
  naturalSize: { height: number; width: number },
): DirectImageCrop {
  const srcRect = element.fill?.srcRect;
  if (!srcRect) {
    return { height: naturalSize.height, width: naturalSize.width, x: 0, y: 0 };
  }
  const left = (srcRect.l ?? 0) / 100_000;
  const top = (srcRect.t ?? 0) / 100_000;
  const right = (srcRect.r ?? 0) / 100_000;
  const bottom = (srcRect.b ?? 0) / 100_000;
  const x = naturalSize.width * left;
  const y = naturalSize.height * top;
  return {
    height: naturalSize.height * Math.max(0.01, 1 - top - bottom),
    width: naturalSize.width * Math.max(0.01, 1 - left - right),
    x,
    y,
  };
}

function normalizeShapeKind(geometry?: number): DirectShapeKind {
  if (geometry === 35) return "ellipse";
  if (
    geometry === 1 ||
    geometry === 96 ||
    geometry === 97 ||
    geometry === 98 ||
    geometry === 99 ||
    geometry === 100 ||
    geometry === 101 ||
    geometry === 102 ||
    geometry === 103 ||
    geometry === 95
  ) {
    return "line";
  }
  if (geometry === 26 || geometry === 28 || geometry === 29) return "roundRect";
  if (geometry === 3 || geometry === 4 || geometry === 23) return "triangle";
  if (geometry === 6 || geometry === 30 || geometry === 133) return "diamond";
  return "rect";
}

function customGeometrySvgPath(
  shape: PresentationElement["shape"],
  rect: { height: number; width: number },
): string | undefined {
  const paths = shape?.customPaths ?? [];
  const commands: string[] = [];
  for (const path of paths) {
    const width = path.widthEmu || rect.width || 1;
    const height = path.heightEmu || rect.height || 1;
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    for (const command of path.commands) {
      if (command.moveTo) {
        commands.push(`M ${command.moveTo.x * scaleX} ${command.moveTo.y * scaleY}`);
      } else if (command.lineTo) {
        commands.push(`L ${command.lineTo.x * scaleX} ${command.lineTo.y * scaleY}`);
      } else if (command.quadBezTo) {
        commands.push(
          `Q ${command.quadBezTo.x1 * scaleX} ${command.quadBezTo.y1 * scaleY} ${command.quadBezTo.x * scaleX} ${command.quadBezTo.y * scaleY}`,
        );
      } else if (command.cubicBezTo) {
        commands.push(
          `C ${command.cubicBezTo.x1 * scaleX} ${command.cubicBezTo.y1 * scaleY} ${command.cubicBezTo.x2 * scaleX} ${command.cubicBezTo.y2 * scaleY} ${command.cubicBezTo.x * scaleX} ${command.cubicBezTo.y * scaleY}`,
        );
      } else if (command.close) {
        commands.push("Z");
      }
    }
  }
  return commands.length > 0 ? commands.join(" ") : undefined;
}

async function renderSlideThumbnailDataUrl(
  slide: DirectCanvasSlide,
  media: Map<string, DirectCanvasMedia>,
  sharp: SharpFactory | null,
): Promise<string | null> {
  const svg = renderSlideThumbnailSvg(slide, media);
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  if (!sharp) return svgDataUrl;
  try {
    const buffer = await sharp(Buffer.from(svg))
      .jpeg({ mozjpeg: true, quality: 50 })
      .toBuffer();
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return svgDataUrl;
  }
}

function renderSlideThumbnailSvg(
  slide: DirectCanvasSlide,
  media: Map<string, DirectCanvasMedia>,
): string {
  const width = 220;
  const height = Math.max(1, Math.round((width * slide.height) / Math.max(1, slide.width)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${slide.width} ${slide.height}">
<rect x="0" y="0" width="${slide.width}" height="${slide.height}" fill="${escapeXml(slide.background || "#ffffff")}"/>
${slide.elements.map((element) => renderSlideThumbnailElement(element, media)).join("\n")}
</svg>`;
}

function renderSlideThumbnailElement(
  element: DirectCanvasElement,
  media: Map<string, DirectCanvasMedia>,
): string {
  const wrap = (content: string) => wrapSlideThumbnailTransform(element, content);
  if (element.kind === "image") {
    const image = media.get(element.mediaId);
    if (!image) return "";
    const crop = element.crop ?? { height: image.height, width: image.width, x: 0, y: 0 };
    return wrap(`<svg x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}" preserveAspectRatio="none">
<image href="${escapeXml(image.src)}" x="0" y="0" width="${image.width}" height="${image.height}" preserveAspectRatio="none"/>
</svg>`);
  }
  if (element.kind === "shape") {
    const shapeProps = `fill="${escapeXml(element.fill)}" stroke="${escapeXml(element.stroke)}" stroke-width="${element.strokeWidth}"`;
    if (element.path) {
      return wrap(`<path d="${escapeXml(element.path)}" transform="translate(${element.x} ${element.y})" ${shapeProps}/>`);
    }
    if (element.shapeKind === "ellipse") {
      return wrap(`<ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}" ${shapeProps}/>`);
    }
    if (element.shapeKind === "line") {
      return wrap(`<line x1="${element.x}" y1="${element.y}" x2="${element.x + element.width}" y2="${element.y + element.height}" stroke="${escapeXml(element.stroke)}" stroke-width="${element.strokeWidth || 9_525}"/>`);
    }
    if (element.shapeKind === "triangle") {
      return wrap(`<polygon points="${element.x + element.width / 2},${element.y} ${element.x + element.width},${element.y + element.height} ${element.x},${element.y + element.height}" ${shapeProps}/>`);
    }
    if (element.shapeKind === "diamond") {
      return wrap(`<polygon points="${element.x + element.width / 2},${element.y} ${element.x + element.width},${element.y + element.height / 2} ${element.x + element.width / 2},${element.y + element.height} ${element.x},${element.y + element.height / 2}" ${shapeProps}/>`);
    }
    return wrap(`<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${element.radius}" ry="${element.radius}" ${shapeProps}/>`);
  }
  if (element.kind === "table") {
    return wrap(renderSlideThumbnailTable(element));
  }
  return wrap(renderSlideThumbnailText(element));
}

function wrapSlideThumbnailTransform(
  element: DirectCanvasElement,
  content: string,
): string {
  if (!content) return "";
  const rotation = element.rotation ? element.rotation / 60_000 : 0;
  if (rotation === 0) return content;
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  return `<g transform="rotate(${rotation} ${cx} ${cy})">${content}</g>`;
}

function renderSlideThumbnailText(
  element: Extract<DirectCanvasElement, { kind: "text" }>,
): string {
  if (element.paragraphs.length === 0) return "";
  const baseFontSize = element.paragraphs[0]?.runs[0]?.fontSize ?? 18 * 12_700;
  let body = "";
  for (let pi = 0; pi < element.paragraphs.length; pi++) {
    const paragraph = element.paragraphs[pi];
    const lineFontSize = paragraph.runs[0]?.fontSize ?? baseFontSize;
    const lineHeight = lineFontSize * 1.18;
    const anchor =
      paragraph.align === "center"
        ? "middle"
        : paragraph.align === "right"
          ? "end"
          : "start";
    const x =
      paragraph.align === "center"
        ? element.x + element.width / 2
        : paragraph.align === "right"
          ? element.x + element.width
          : element.x;
    for (let ri = 0; ri < paragraph.runs.length; ri++) {
      const run = paragraph.runs[ri];
      const lineStart = ri === 0;
      const docStart = lineStart && pi === 0;
      const xAttr = lineStart ? ` x="${x}" text-anchor="${anchor}"` : "";
      const dy = docStart ? 0 : lineStart ? lineHeight : 0;
      const decoration = run.underline ? ` text-decoration="underline"` : "";
      body += `<tspan${xAttr} dy="${dy}" fill="${escapeXml(run.color)}" font-size="${run.fontSize}" font-weight="${run.bold ? 700 : 500}" font-style="${run.italic ? "italic" : "normal"}"${decoration}>${escapeXml(run.text)}</tspan>`;
    }
  }
  return `<text font-family="-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif" y="${element.y + baseFontSize}">${body}</text>`;
}

function renderSlideThumbnailTable(
  element: Extract<DirectCanvasElement, { kind: "table" }>,
): string {
  let out = `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="white" stroke="#cbd5e1" stroke-width="4750"/>`;
  let rowY = element.y;
  for (const row of element.rows) {
    let colX = element.x;
    const rowHeight = row.height || (element.height / element.rows.length);
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = row.cells[ci];
      const colWidth = element.columnWidths[ci] ?? (element.width / (row.cells.length || 1));
      if (cell.fill !== "transparent") {
        out += `<rect x="${colX}" y="${rowY}" width="${colWidth}" height="${rowHeight}" fill="${escapeXml(cell.fill)}" stroke="#cbd5e1" stroke-width="2375"/>`;
      } else {
        out += `<rect x="${colX}" y="${rowY}" width="${colWidth}" height="${rowHeight}" fill="none" stroke="#cbd5e1" stroke-width="2375"/>`;
      }
      if (cell.paragraphs.length > 0) {
        const run = cell.paragraphs[0]?.runs[0];
        if (run) {
          const fs = run.fontSize * 0.7;
          out += `<text x="${colX + 9_525}" y="${rowY + fs}" font-size="${fs}" fill="${escapeXml(run.color)}" font-family="-apple-system, sans-serif">${escapeXml(run.text.slice(0, 30))}</text>`;
        }
      }
      colX += colWidth;
    }
    rowY += rowHeight;
  }
  return out;
}

function renderPresentationCanvasSource(payload: DirectCanvasPayload): string {
  return `import { Button, Pill, Row, Stack, Text, useCanvasState, useHostTheme } from "cursor/canvas";

type DirectTextRun = { bold: boolean; color: string; fontSize: number; italic: boolean; text: string; typeface: string; underline: boolean };
type DirectTextParagraph = { align: "center" | "left" | "right"; runs: DirectTextRun[] };
type DirectTableCell = { borderBottom: string; borderLeft: string; borderRight: string; borderTop: string; colSpan: number; fill: string; marginBottom: number; marginLeft: number; marginRight: number; marginTop: number; paragraphs: DirectTextParagraph[]; rowSpan: number; verticalAlign: "bottom" | "middle" | "top" };
type DirectTableRow = { cells: DirectTableCell[]; height: number };

type DirectCanvasElement =
  | { crop: DirectImageCrop | null; kind: "image"; mediaId: string; x: number; y: number; width: number; height: number }
  | { kind: "text"; paragraphs: DirectTextParagraph[]; insetBottom: number; insetLeft: number; insetRight: number; insetTop: number; verticalAlign: "bottom" | "middle" | "top"; x: number; y: number; width: number; height: number }
  | { fill: string; kind: "shape"; path?: string; radius: number; shapeKind: DirectShapeKind; stroke: string; strokeWidth: number; x: number; y: number; width: number; height: number }
  | { columnWidths: number[]; kind: "table"; rows: DirectTableRow[]; x: number; y: number; width: number; height: number };

type DirectCanvasMedia = { height: number; src: string; width: number };
type DirectImageCrop = { height: number; width: number; x: number; y: number };
type DirectShapeKind = "diamond" | "ellipse" | "line" | "rect" | "roundRect" | "triangle";

type DirectCanvasSlide = {
  background: string;
  elements: DirectCanvasElement[];
  height: number;
  index: number;
  thumbnail: string | null;
  title: string;
  width: number;
};

const payload = JSON.parse(${JSON.stringify(JSON.stringify(payload))}) as {
  artifact: { generatedBy: string; mode: "proto-direct"; reader: string; source: string; title: string };
  media: Record<string, DirectCanvasMedia>;
  slides: DirectCanvasSlide[];
};
const { artifact, media, slides } = payload;

export default function OfficePptCanvas() {
  const theme = useHostTheme();
  const [selectedIndex, setSelectedIndex] = useCanvasState("selected-slide-index", slides[0]?.index ?? 1);
  const [isPlaying, setIsPlaying] = useCanvasState("slideshow-open", false);
  const selectedPosition = Math.max(0, slides.findIndex((slide) => slide.index === selectedIndex));
  const selectedSlide = slides[selectedPosition] ?? slides[0];
  const goPrevious = () => setSelectedIndex(slides[Math.max(0, selectedPosition - 1)]?.index ?? selectedSlide.index);
  const goNext = () => setSelectedIndex(slides[Math.min(slides.length - 1, selectedPosition + 1)]?.index ?? selectedSlide.index);

  return (
    <div style={{
      background: "#ffffff",
      border: \`1px solid \${theme.stroke.secondary}\`,
      borderRadius: 8,
      color: theme.text.primary,
      display: "grid",
      gridTemplateRows: "52px minmax(0, 1fr)",
      height: "calc(100vh - 16px)",
      minHeight: 520,
      overflow: "hidden",
    }}>
      <header style={{
        alignItems: "center",
        borderBottom: \`1px solid \${theme.stroke.secondary}\`,
        display: "grid",
        gap: 12,
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 520px) minmax(0, 1fr)",
        padding: "0 16px",
      }}>
        <Row gap={8} align="center" style={{ minWidth: 0 }}>
          <Pill active size="sm" tone="info">office wasm</Pill>
          <Text as="span" size="small" tone="secondary" truncate>{artifact.reader}</Text>
        </Row>
        <Text as="span" size="small" weight="semibold" truncate style={{ textAlign: "center" }}>{artifact.title}</Text>
        <Row gap={8} align="center" justify="end">
          <Text as="span" size="small" tone="secondary">{slides.length} slides</Text>
          <Button onClick={() => setIsPlaying(true)} variant="primary">Play</Button>
        </Row>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "clamp(156px, 13vw, 252px) minmax(0, 1fr)", minHeight: 0 }}>
        <aside style={{ background: "rgba(255,255,255,0.86)", borderRight: \`1px solid \${theme.stroke.secondary}\`, minHeight: 0, overflow: "auto", padding: "12px 14px 48px 8px", scrollbarColor: "#cbd5e1 transparent" }}>
          <Stack gap={12}>
            {slides.map((slide) => {
              const active = slide.index === selectedSlide.index;
              return (
                <button
                  aria-current={active ? "true" : undefined}
                  aria-label={\`Slide \${slide.index}: \${slide.title}\`}
                  key={slide.index}
                  onClick={() => setSelectedIndex(slide.index)}
                  style={{
                    alignItems: "flex-start",
                    background: "transparent",
                    border: 0,
                    borderRadius: 7,
                    color: theme.text.primary,
                    cursor: "pointer",
                    display: "flex",
                    gap: 8,
                    padding: "6px 8px 6px 0",
                    textAlign: "left",
                    width: "100%",
                  }}
                  title={slide.title}
                  type="button"
                >
                  <span style={{
                    color: theme.text.secondary,
                    flex: "0 0 22px",
                    fontSize: 13,
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 500,
                    lineHeight: 1,
                    paddingTop: 4,
                    textAlign: "right",
                  }}>{slide.index}</span>
                  <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                    <SlideSurface active={active} mode="thumbnail" slide={slide} />
                  </span>
                </button>
              );
            })}
          </Stack>
        </aside>
        <main style={{ background: "#f8fafc", minHeight: 0, overflow: "auto", padding: "16px 24px 20px" }}>
          <div style={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "100%", minWidth: 0 }}>
            <SlideSurface mode="stage" slide={selectedSlide} />
          </div>
        </main>
      </div>
      {isPlaying ? (
        <div aria-label="Play slideshow" aria-modal="true" role="dialog" style={{
          alignItems: "center",
          background: "#000000",
          display: "flex",
          inset: 0,
          justifyContent: "center",
          padding: 20,
          position: "fixed",
          zIndex: 1000,
        }}>
          <div style={{ position: "absolute", right: 20, top: 18, zIndex: 2 }}>
            <Row gap={8} align="center">
              <span style={{ background: "rgba(15, 23, 42, 0.86)", border: "1px solid rgba(148, 163, 184, 0.34)", borderRadius: 999, color: "#cbd5e1", fontSize: 13, fontWeight: 600, padding: "8px 12px" }}>Slide {selectedSlide.index} / {slides.length}</span>
              <button aria-label="Close slideshow" onClick={() => setIsPlaying(false)} style={chromeButtonStyle} type="button">x</button>
            </Row>
          </div>
          <button aria-label="Next slide" onClick={goNext} style={{ background: "transparent", border: 0, cursor: "pointer", maxHeight: "100%", maxWidth: "100%", padding: 0 }} type="button">
            <div style={{ width: \`min(92vw, calc(92vh * \${selectedSlide.width} / \${selectedSlide.height}))\` }}>
              <SlideSurface mode="slideshow" slide={selectedSlide} />
            </div>
          </button>
          <button aria-label="Previous slide" onClick={goPrevious} style={{ ...navButtonStyle, left: 18 }} type="button">{"<"}</button>
          <button aria-label="Next slide" onClick={goNext} style={{ ...navButtonStyle, right: 18 }} type="button">{">"}</button>
        </div>
      ) : null}
    </div>
  );
}

function SlideSurface({ active = false, mode = "stage", slide }: { active?: boolean; mode?: "slideshow" | "stage" | "thumbnail"; slide: DirectCanvasSlide }) {
  const width =
    mode === "thumbnail"
      ? "100%"
      : mode === "slideshow"
        ? "100%"
        : \`min(100%, calc((100vh - 124px) * \${slide.width} / \${slide.height}))\`;
  const border =
    mode === "thumbnail"
      ? active
        ? "2px solid #60a5fa"
        : "0 solid transparent"
      : "1px solid #cbd5e1";
  const boxShadow =
    mode === "thumbnail"
      ? active
        ? "0 8px 22px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(255,255,255,0.92)"
        : "0 8px 22px rgba(15, 23, 42, 0.12)"
      : mode === "stage"
        ? "0 18px 40px rgba(15, 23, 42, 0.14)"
        : "none";
  return (
    <div
      role="img"
      aria-label={\`Slide \${slide.index}\`}
      style={{
      aspectRatio: \`\${slide.width} / \${slide.height}\`,
      background: "#ffffff",
      border,
      borderRadius: mode === "thumbnail" ? 4 : 7,
      boxShadow,
      boxSizing: "border-box",
      containerType: "inline-size",
      overflow: "hidden",
      position: "relative",
      width,
    }}>
      <svg
        aria-hidden="true"
        viewBox={\`0 0 \${slide.width} \${slide.height}\`}
        style={{ display: "block", height: "100%", inset: 0, position: "absolute", width: "100%" }}
      >
        <rect x={0} y={0} width={slide.width} height={slide.height} fill={slide.background || "#ffffff"} />
      </svg>
      {slide.elements.map((element, index) => element.kind === "text" ? (
        <SlideTextElement element={element} key={index} slide={slide} />
      ) : element.kind === "table" ? (
        <SlideTableElement element={element} key={index} slide={slide} />
      ) : (
        <svg
          aria-hidden="true"
          key={index}
          viewBox={\`0 0 \${slide.width} \${slide.height}\`}
          style={{ display: "block", height: "100%", inset: 0, pointerEvents: "none", position: "absolute", width: "100%" }}
        >
          <SlideElement element={element} />
        </svg>
      ))}
    </div>
  );
}

function SlideElement({ element }: { element: DirectCanvasElement }) {
  if (element.kind === "image") {
    const image = media[element.mediaId];
    if (!image) return null;
    const crop = element.crop ?? { height: image.height, width: image.width, x: 0, y: 0 };
    return (
      <svg x={element.x} y={element.y} width={element.width} height={element.height} viewBox={\`\${crop.x} \${crop.y} \${crop.width} \${crop.height}\`} preserveAspectRatio="none">
        <image href={image.src} preserveAspectRatio="none" x={0} y={0} width={image.width} height={image.height} />
      </svg>
    );
  }
  if (element.kind === "shape") {
    const shapeProps = { fill: element.fill, stroke: element.stroke, strokeWidth: element.strokeWidth };
    if (element.path) {
      return <path d={element.path} transform={\`translate(\${element.x} \${element.y})\`} {...shapeProps} />;
    }
    if (element.shapeKind === "ellipse") {
      return <ellipse cx={element.x + element.width / 2} cy={element.y + element.height / 2} rx={element.width / 2} ry={element.height / 2} {...shapeProps} />;
    }
    if (element.shapeKind === "line") {
      return <line x1={element.x} y1={element.y} x2={element.x + element.width} y2={element.y + element.height} stroke={element.stroke} strokeWidth={element.strokeWidth || 9_525} />;
    }
    if (element.shapeKind === "triangle") {
      return <polygon points={\`\${element.x + element.width / 2},\${element.y} \${element.x + element.width},\${element.y + element.height} \${element.x},\${element.y + element.height}\`} {...shapeProps} />;
    }
    if (element.shapeKind === "diamond") {
      return <polygon points={\`\${element.x + element.width / 2},\${element.y} \${element.x + element.width},\${element.y + element.height / 2} \${element.x + element.width / 2},\${element.y + element.height} \${element.x},\${element.y + element.height / 2}\`} {...shapeProps} />;
    }
    return <rect x={element.x} y={element.y} width={element.width} height={element.height} rx={element.radius} ry={element.radius} {...shapeProps} />;
  }
  return null;
}

function SlideTextElement({ element, slide }: { element: Extract<DirectCanvasElement, { kind: "text" }>; slide: DirectCanvasSlide }) {
  const justifyContent = element.verticalAlign === "middle" ? "center" : element.verticalAlign === "bottom" ? "flex-end" : "flex-start";
  return (
    <div
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        height: \`\${(element.height / slide.height) * 100}%\`,
        justifyContent,
        left: \`\${(element.x / slide.width) * 100}%\`,
        overflow: "hidden",
        paddingBottom: \`\${(element.insetBottom / slide.height) * 100}%\`,
        paddingLeft: \`\${(element.insetLeft / slide.width) * 100}%\`,
        paddingRight: \`\${(element.insetRight / slide.width) * 100}%\`,
        paddingTop: \`\${(element.insetTop / slide.height) * 100}%\`,
        position: "absolute",
        top: \`\${(element.y / slide.height) * 100}%\`,
        width: \`\${(element.width / slide.width) * 100}%\`,
      }}
    >
      {element.paragraphs.map((paragraph, paragraphIndex) => (
        <p
          key={paragraphIndex}
          style={{
            lineHeight: 1.18,
            margin: 0,
            textAlign: paragraph.align,
            whiteSpace: "pre-wrap",
          }}
        >
          {paragraph.runs.map((run, runIndex) => (
            <span
              key={runIndex}
              style={{
                color: run.color,
                fontFamily: fontStack(run.typeface),
                fontSize: \`\${(run.fontSize / slide.width) * 100}cqw\`,
                fontStyle: run.italic ? "italic" : "normal",
                fontWeight: run.bold ? 700 : 500,
                textDecoration: run.underline ? "underline" : "none",
              }}
            >
              {run.text}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

function SlideTableElement({ element, slide }: { element: Extract<DirectCanvasElement, { kind: "table" }>; slide: DirectCanvasSlide }) {
  return (
    <div
      style={{
        boxSizing: "border-box",
        height: \`\${(element.height / slide.height) * 100}%\`,
        left: \`\${(element.x / slide.width) * 100}%\`,
        overflow: "hidden",
        position: "absolute",
        top: \`\${(element.y / slide.height) * 100}%\`,
        width: \`\${(element.width / slide.width) * 100}%\`,
      }}
    >
      <table style={{ borderCollapse: "collapse", height: "100%", tableLayout: "fixed", width: "100%" }}>
        <colgroup>
          {element.columnWidths.map((w, ci) => (
            <col key={ci} style={{ width: \`\${(w / element.width) * 100}%\` }} />
          ))}
        </colgroup>
        <tbody>
          {element.rows.map((row, ri) => (
            <tr key={ri} style={{ height: \`\${(row.height / element.height) * 100}%\` }}>
              {row.cells.map((cell, ci) => (
                <td
                  key={ci}
                  colSpan={cell.colSpan}
                  rowSpan={cell.rowSpan}
                  style={{
                    background: cell.fill,
                    borderBottom: cell.borderBottom,
                    borderLeft: cell.borderLeft,
                    borderRight: cell.borderRight,
                    borderTop: cell.borderTop,
                    boxSizing: "border-box",
                    overflow: "hidden",
                    padding: \`\${(cell.marginTop / slide.height) * 100}% \${(cell.marginRight / slide.width) * 100}% \${(cell.marginBottom / slide.height) * 100}% \${(cell.marginLeft / slide.width) * 100}%\`,
                    verticalAlign: cell.verticalAlign,
                  }}
                >
                  {cell.paragraphs.map((paragraph, pi) => (
                    <p key={pi} style={{ lineHeight: 1.18, margin: 0, textAlign: paragraph.align, whiteSpace: "pre-wrap" }}>
                      {paragraph.runs.map((run, ri2) => (
                        <span key={ri2} style={{ color: run.color, fontFamily: fontStack(run.typeface), fontSize: \`\${(run.fontSize / slide.width) * 100}cqw\`, fontStyle: run.italic ? "italic" : "normal", fontWeight: run.bold ? 700 : 500, textDecoration: run.underline ? "underline" : "none" }}>
                          {run.text}
                        </span>
                      ))}
                    </p>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fontStack(typeface: string) {
  const fallback = "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif";
  return typeface ? \`\${JSON.stringify(typeface)}, \${fallback}\` : fallback;
}

const chromeButtonStyle = {
  background: "rgba(15, 23, 42, 0.86)",
  border: "1px solid rgba(148, 163, 184, 0.34)",
  borderRadius: 6,
  color: "#f8fafc",
  cursor: "pointer",
  font: "600 13px/1 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  height: 34,
  width: 34,
};

const navButtonStyle = {
  background: "rgba(15, 23, 42, 0.62)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 999,
  color: "#f8fafc",
  cursor: "pointer",
  font: "500 34px/1 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  height: 46,
  position: "absolute" as const,
  top: "50%",
  transform: "translateY(-50%)",
  width: 46,
  zIndex: 2,
};
`;
}

function renderPresentationRendererCanvasSource(
  payload: PresentationRendererCanvasPayload,
): string {
  const runtimeSource = officeRenderPresentationRuntimeInline();
  return `import React from "react";

globalThis.React = React;

${runtimeSource}

const { PresentationCursorCanvas } = OfficePresentationCursorRuntime;

const payload = JSON.parse(${JSON.stringify(JSON.stringify(payload))});

export default function OfficePptCanvas() {
  return <PresentationCursorCanvas payload={payload} />;
}
`;
}

function firstText(elements: DirectCanvasElement[]): string {
  for (const element of elements) {
    if (element.kind === "text") {
      for (const paragraph of element.paragraphs) {
        const text = paragraph.runs.map((run) => run.text).join("").trim();
        if (text) return text;
      }
    } else if (element.kind === "table") {
      for (const row of element.rows) {
        for (const cell of row.cells) {
          for (const paragraph of cell.paragraphs) {
            const text = paragraph.runs.map((run) => run.text).join("").trim();
            if (text) return text;
          }
        }
      }
    }
  }
  return "";
}

function imageSize(bytes: Uint8Array): { height: number; width: number } {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return {
      height: readUint32BE(bytes, 20),
      width: readUint32BE(bytes, 16),
    };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: (bytes[offset + 5] << 8) + bytes[offset + 6],
          width: (bytes[offset + 7] << 8) + bytes[offset + 8],
        };
      }
      offset += 2 + length;
    }
  }
  return { height: 1, width: 1 };
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function clampQuality(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function sourceLabel(options: RenderPptxCursorCanvasOptions): string {
  return options.sourceLabel ?? basename(options.sourcePath) ?? options.title;
}

function basename(value?: string): string | undefined {
  const parts = value?.split(/[\\/]+/u).filter(Boolean);
  return parts?.[parts.length - 1];
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

export type { DirectCanvasPayload, RecordValue };
