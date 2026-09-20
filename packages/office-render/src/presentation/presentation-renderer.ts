import {
  asNumber,
  asRecord,
  asString,
  elementImageReferenceId,
  fillToCss,
  slideBackgroundToCss,
  type RecordValue,
} from "../shared/office-preview-utils";
import {
  drawPresentationChart,
  presentationChartById,
  presentationChartReferenceId,
} from "../shared/office-chart-renderer";
import { shapeFillToPaint } from "./presentation-fill-styles";
import {
  applyPresentationLayoutInheritance,
  emuRectToCanvasRect,
  getSlideBounds,
  presentationCanvasScale,
  presentationElements,
  presentationShapeKind,
  type PresentationRenderImages,
  type SlideElementEntry,
} from "./presentation-layout";
import {
  applyElementShadow,
  applyLineStyle,
  drawLineEnd,
  drawLineEndPath,
  type PresentationLineEndStyle,
  presentationElementLineStyle,
  type PresentationLineStyle,
} from "./presentation-line-styles";
import {
  customGeometryLinePoints,
  customGeometryPath,
  elementPath,
  presetGeometryLinePoints,
} from "./presentation-shape-paths";
import { drawPresentationTable } from "./presentation-table-renderer";
import {
  drawPresentationTextBox,
  presentationScaledFontSize,
  type PresentationRect,
  type PresentationSize,
  type PresentationTextOverflow,
} from "./presentation-text-layout";

export {
  applyPresentationLayoutInheritance,
  collectPresentationTypefaces,
  computePresentationFit,
  emuRectToCanvasRect,
  getPresentationElementTargets,
  getSlideBounds,
  getSlideFrameSize,
  presentationImageSourceRect,
  presentationShapeKind,
  type PresentationElementTarget,
  type PresentationFit,
  type PresentationImageSourceRect,
  type PresentationRenderImages,
} from "./presentation-layout";
export {
  presentationElementLineStyle,
  presentationLineEndStyle,
  presentationLineStyle,
  presentationShadowStyle,
  type PresentationLineEndStyle,
  type PresentationLineStyle,
  type PresentationShadowStyle,
} from "./presentation-line-styles";
export { presentationGradientStops } from "./presentation-fill-styles";
export {
  presentationScaledFontSize,
  type PresentationRect,
  type PresentationSize,
  type PresentationTextOverflow,
};
export {
  presentationChartById,
  presentationChartReferenceId,
} from "../shared/office-chart-renderer";
export { presentationTableGrid } from "./presentation-table-renderer";

export function renderPresentationSlide({
  charts = [],
  context,
  height,
  images,
  layouts = [],
  slide,
  textOverflow = "visible",
  theme,
  width,
}: {
  charts?: RecordValue[];
  context: CanvasRenderingContext2D;
  height: number;
  images: PresentationRenderImages;
  layouts?: RecordValue[];
  slide: RecordValue;
  textOverflow?: PresentationTextOverflow;
  theme?: RecordValue | null;
  width: number;
}): void {
  const effectiveSlide = resolvePresentationThemeColors(
    applyPresentationLayoutInheritance(slide, layouts),
    presentationThemeColorMap(theme),
  );
  const bounds = getSlideBounds(effectiveSlide);
  const elements = presentationElements(effectiveSlide)
    .map((element, index) => ({ element, index }))
    .sort(
      (left, right) =>
        asNumber(left.element.zIndex, left.index) -
        asNumber(right.element.zIndex, right.index),
    );

  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, width, height);
  context.fillStyle = slideBackgroundToCss(effectiveSlide);
  context.fillRect(0, 0, width, height);

  for (const [renderIndex, entry] of elements.entries()) {
    drawElement(context, entry, bounds, { height, width }, images, {
      allElements: elements,
      charts,
      previousElements: elements.slice(0, renderIndex),
      textOverflow,
    });
  }

  context.restore();
}

function resolvePresentationThemeColors<T>(value: T, themeColors: ReadonlyMap<string, string>): T {
  if (themeColors.size === 0 || value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => resolvePresentationThemeColors(item, themeColors)) as T;
  }
  if (typeof value !== "object") return value;

  const record = value as RecordValue;
  const next: RecordValue = {};
  for (const [key, item] of Object.entries(record)) {
    next[key] = resolvePresentationThemeColors(item, themeColors);
  }

  const scheme = asString(next.scheme);
  if (scheme) {
    next.scheme = resolvePresentationSchemeMetadata(scheme, themeColors);
  }

  const schemeName = asString(next.value).toLowerCase();
  if (asNumber(next.type) === 2 && schemeName && next.lastColor == null) {
    const resolved = themeColors.get(schemeName) ?? themeColors.get(presentationSchemeColorAlias(schemeName));
    if (resolved) next.lastColor = resolved;
  }

  return next as T;
}

function resolvePresentationSchemeMetadata(scheme: string, themeColors: ReadonlyMap<string, string>): string {
  return scheme
    .split(";")
    .map((part) => resolvePresentationHighlightMetadata(part, themeColors))
    .join(";");
}

function resolvePresentationHighlightMetadata(part: string, themeColors: ReadonlyMap<string, string>): string {
  const pptxPrefix = "__pptxHighlight:";
  const docxPrefix = "__docxHighlight:";
  const prefix = part.startsWith(pptxPrefix) ? pptxPrefix : part.startsWith(docxPrefix) ? docxPrefix : "";
  if (!prefix) return part;

  const color = part.slice(prefix.length).trim();
  const resolved = themeColors.get(color.toLowerCase()) ?? themeColors.get(presentationSchemeColorAlias(color.toLowerCase()));
  return resolved ? `${prefix}${resolved}` : part;
}

function presentationThemeColorMap(theme: RecordValue | null | undefined): Map<string, string> {
  const colors = new Map<string, string>();
  collectThemeColors(theme, colors);
  return colors;
}

function collectThemeColors(value: unknown, colors: Map<string, string>): void {
  const record = asRecord(value);
  if (record == null) return;

  const directColors = asRecord(record.colors);
  if (directColors) {
    for (const [name, color] of Object.entries(directColors)) {
      addThemeColor(colors, name, color);
    }
  }

  const name = asString(record.name).toLowerCase();
  const color = asRecord(record.color);
  if (name && color) {
    const hex = asString(color.value) || asString(color.lastColor);
    addThemeColor(colors, name, hex);
  }

  for (const item of Object.values(record)) {
    if (Array.isArray(item)) {
      for (const child of item) collectThemeColors(child, colors);
    } else if (typeof item === "object" && item != null) {
      collectThemeColors(item, colors);
    }
  }
}

function addThemeColor(colors: Map<string, string>, name: string, color: unknown): void {
  const normalizedName = name.toLowerCase();
  const normalizedColor = asString(color).replace(/^#/u, "");
  if (!normalizedName || !/^[0-9a-f]{6}$/iu.test(normalizedColor)) return;
  colors.set(normalizedName, normalizedColor);
}

function presentationSchemeColorAlias(name: string): string {
  const aliases: Record<string, string> = {
    bg1: "lt1",
    bg2: "lt2",
    phclr: "lt1",
    tx1: "dk1",
    tx2: "dk2",
  };
  return aliases[name] ?? name;
}

function drawElement(
  context: CanvasRenderingContext2D,
  { element }: SlideElementEntry,
  bounds: PresentationSize,
  canvas: PresentationSize,
  images: PresentationRenderImages,
  options: {
    allElements: SlideElementEntry[];
    charts: RecordValue[];
    previousElements: SlideElementEntry[];
    textOverflow: PresentationTextOverflow;
  },
): void {
  const bbox = asRecord(element.bbox);
  const rect = emuRectToCanvasRect(bbox, bounds, canvas);
  if (rect.width <= 0 && rect.height <= 0) return;

  const slideScale = presentationCanvasScale(bounds, canvas);
  const shape = asRecord(element.shape);
  const line = presentationElementLineStyle(element, slideScale);
  const isLine = rect.height === 0 && line.color != null;
  const rotation = asNumber(bbox?.rotation) / 60_000;
  const horizontalFlip = bbox?.horizontalFlip === true;
  const verticalFlip = bbox?.verticalFlip === true;

  context.save();
  context.translate(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (rotation !== 0) context.rotate((rotation * Math.PI) / 180);
  if (horizontalFlip || verticalFlip)
    context.scale(horizontalFlip ? -1 : 1, verticalFlip ? -1 : 1);
  context.translate(-rect.width / 2, -rect.height / 2);
  applyElementShadow(context, element, slideScale);

  const shapeKind = presentationShapeKind(shape, rect);
  const presetLinePoints = presetGeometryLinePoints(shape, rect);
  if (isLine || shapeKind === "line" || presetLinePoints) {
    const connectorPoints = anchoredConnectorLinePoints(
      element,
      rect,
      bounds,
      canvas,
      options.allElements,
    );
    if (connectorPoints) {
      context.restore();
      context.save();
      drawLinePoints(context, connectorPoints, line);
      context.restore();
      return;
    }

    if (presetLinePoints) {
      drawLinePoints(context, presetLinePoints, line);
      context.restore();
      return;
    }

    drawLine(context, rect.width, rect.height, asNumber(shape?.geometry), line);
    context.restore();
    return;
  }

  const path = customGeometryPath(shape, rect) ?? elementPath(shapeKind, rect, shape);
  const fill = shapeFillToPaint(context, shape, element, line.color, rect);
  if (fill) {
    context.fillStyle = fill;
    context.fill(path);
  }

  const imageId = elementImageReferenceId(element);
  const image = imageId ? images.get(imageId) : undefined;
  if (image) {
    context.save();
    context.clip(path);
    drawElementImage(context, image, element, rect);
    context.restore();
  }

  if (line.color) {
    applyLineStyle(context, line);
    context.stroke(path);
    context.setLineDash([]);
    const customPoints = customGeometryLinePoints(shape, rect);
    if (customPoints) {
      drawConnectorLineEnd(context, customPoints, line.headEnd, line.color, true);
      drawConnectorLineEnd(context, customPoints, line.tailEnd, line.color, false);
    }
  }

  const table = asRecord(element.table);
  if (table) {
    drawPresentationTable(
      context,
      element,
      table,
      rect,
      bounds,
      canvas,
      slideScale,
    );
    context.restore();
    return;
  }

  const chart = presentationChartById(
    options.charts,
    presentationChartReferenceId(element.chartReference),
  );
  if (chart) {
    drawPresentationChart(context, chart, rect, slideScale);
    context.restore();
    return;
  }

  drawPresentationTextBox({
    canvas,
    context,
    defaultTextFill: overlayTextDefaultFill(element, options.previousElements),
    element,
    rect,
    slideBounds: bounds,
    slideScale,
    textOverflow: options.textOverflow,
  });
  context.restore();
}

function overlayTextDefaultFill(
  element: RecordValue,
  previousElements: SlideElementEntry[],
): string | undefined {
  const paragraphs = Array.isArray(element.paragraphs) ? element.paragraphs : [];
  if (paragraphs.length === 0) return undefined;
  const bbox = asRecord(element.bbox);
  const centerX = asNumber(bbox?.xEmu) + asNumber(bbox?.widthEmu) / 2;
  const centerY = asNumber(bbox?.yEmu) + asNumber(bbox?.heightEmu) / 2;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return undefined;

  for (let index = previousElements.length - 1; index >= 0; index -= 1) {
    const candidate = previousElements[index]?.element;
    if (!candidate || candidate === element) continue;
    const candidateBbox = asRecord(candidate.bbox);
    if (!pointInsideBbox(centerX, centerY, candidateBbox)) continue;
    const candidateShape = asRecord(candidate.shape);
    const fill = fillToCss(candidateShape?.fill ?? candidate.fill);
    const luminance = cssColorRelativeLuminance(fill);
    if (luminance != null && luminance < 0.32) return "#ffffff";
  }

  return undefined;
}

function pointInsideBbox(x: number, y: number, bbox: RecordValue | null): boolean {
  const left = asNumber(bbox?.xEmu);
  const top = asNumber(bbox?.yEmu);
  const width = asNumber(bbox?.widthEmu);
  const height = asNumber(bbox?.heightEmu);
  return x >= left && x <= left + width && y >= top && y <= top + height;
}

function cssColorRelativeLuminance(color: string | undefined): number | null {
  if (!color) return null;
  const hex = /^#?([0-9a-f]{6})$/iu.exec(color)?.[1];
  if (hex) {
    return relativeLuminance(
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    );
  }

  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)$/u.exec(color);
  if (!rgba) return null;
  const alpha = rgba[4] == null ? 1 : Number(rgba[4]);
  if (Number.isFinite(alpha) && alpha < 0.5) return null;
  return relativeLuminance(Number(rgba[1]), Number(rgba[2]), Number(rgba[3]));
}

function relativeLuminance(red: number, green: number, blue: number): number {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function drawLine(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  geometry: number,
  line: PresentationLineStyle,
): void {
  if (!line.color) return;
  const points = connectorLinePoints(width, height, geometry);
  drawLinePoints(context, points, line);
}

function drawLinePoints(
  context: CanvasRenderingContext2D,
  points: LinePoint[],
  line: PresentationLineStyle,
): void {
  if (!line.color || points.length === 0) return;
  applyLineStyle(context, line);
  context.beginPath();
  context.moveTo(points[0]?.x ?? 0, points[0]?.y ?? 0);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.stroke();
  context.setLineDash([]);
  drawConnectorLineEnd(context, points, line.headEnd, line.color, true);
  drawConnectorLineEnd(context, points, line.tailEnd, line.color, false);
}

type LinePoint = { x: number; y: number };

function anchoredConnectorLinePoints(
  element: RecordValue,
  rect: PresentationRect,
  bounds: PresentationSize,
  canvas: PresentationSize,
  elements: SlideElementEntry[],
): LinePoint[] | null {
  const connector = asRecord(element.connector);
  if (!connector) return null;

  const shape = asRecord(element.shape);
  const localPoints = connectorLinePoints(
    rect.width,
    rect.height,
    asNumber(shape?.geometry),
  );
  const points = localPoints.map((point) =>
    transformElementPoint(point, asRecord(element.bbox), bounds, canvas),
  );
  if (points.length < 2) return null;

  const byId = elementTargetMap(elements);
  const startId = asString(connector.start);
  const endId = asString(connector.end);
  const startTarget = startId ? byId.get(startId) : undefined;
  const endTarget = endId ? byId.get(endId) : undefined;
  if (!startTarget && !endTarget) return null;

  if (startTarget) {
    points[0] = connectionPointForElement(
      startTarget,
      asNumber(connector.startIndex, Number.NaN),
      points.at(-1),
      bounds,
      canvas,
    );
  }
  if (endTarget) {
    points[points.length - 1] = connectionPointForElement(
      endTarget,
      asNumber(connector.endIndex, Number.NaN),
      points[0],
      bounds,
      canvas,
    );
  }

  return points;
}

function elementTargetMap(elements: SlideElementEntry[]): Map<string, RecordValue> {
  const targets = new Map<string, RecordValue>();
  for (const { element } of elements) {
    for (const id of elementTargetIds(element)) {
      if (id && !targets.has(id)) targets.set(id, element);
    }
  }
  return targets;
}

function elementTargetIds(element: RecordValue): string[] {
  const ids = [asString(element.id)];
  const name = asString(element.name);
  const embeddedId = /(?:^|;)(\d+)(?:;|$)/u.exec(name)?.[1];
  if (embeddedId) ids.push(embeddedId);
  return ids.filter(Boolean);
}

function connectionPointForElement(
  element: RecordValue,
  index: number,
  toward: LinePoint | undefined,
  bounds: PresentationSize,
  canvas: PresentationSize,
): LinePoint {
  const bbox = asRecord(element.bbox);
  const targetRect = emuRectToCanvasRect(bbox, bounds, canvas);
  const side = Number.isFinite(index)
    ? connectionSideFromIndex(index)
    : nearestConnectionSide(targetRect, toward);
  return transformElementPoint(
    connectionPointOnRect(targetRect, side),
    bbox,
    bounds,
    canvas,
  );
}

type ConnectionSide = "bottom" | "left" | "right" | "top";

function connectionSideFromIndex(index: number): ConnectionSide {
  const normalized = ((Math.trunc(index) % 4) + 4) % 4;
  if (normalized === 1) return "left";
  if (normalized === 2) return "bottom";
  if (normalized === 3) return "right";
  return "top";
}

function nearestConnectionSide(
  rect: PresentationRect,
  toward: LinePoint | undefined,
): ConnectionSide {
  if (!toward) return "top";
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = toward.x - centerX;
  const dy = toward.y - centerY;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

function connectionPointOnRect(
  rect: PresentationRect,
  side: ConnectionSide,
): LinePoint {
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  if (side === "left") return { x: 0, y: centerY };
  if (side === "right") return { x: rect.width, y: centerY };
  if (side === "bottom") return { x: centerX, y: rect.height };
  return { x: centerX, y: 0 };
}

function transformElementPoint(
  point: LinePoint,
  bbox: RecordValue | null,
  bounds: PresentationSize,
  canvas: PresentationSize,
): LinePoint {
  const rect = emuRectToCanvasRect(bbox, bounds, canvas);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  let x = rect.left + point.x;
  let y = rect.top + point.y;
  if (bbox?.horizontalFlip === true) x = centerX - (x - centerX);
  if (bbox?.verticalFlip === true) y = centerY - (y - centerY);

  const rotation = asNumber(bbox?.rotation) / 60_000;
  if (rotation === 0) return { x, y };

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = x - centerX;
  const dy = y - centerY;
  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

function connectorLinePoints(width: number, height: number, geometry: number): LinePoint[] {
  if (geometry === 97) {
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
    ];
  }

  if (geometry === 98) {
    const midX = width / 2;
    return [
      { x: 0, y: 0 },
      { x: midX, y: 0 },
      { x: midX, y: height },
      { x: width, y: height },
    ];
  }

  if (geometry === 99) {
    const midX1 = width / 3;
    const midX2 = (width * 2) / 3;
    return [
      { x: 0, y: 0 },
      { x: midX1, y: 0 },
      { x: midX1, y: height },
      { x: midX2, y: height },
      { x: midX2, y: 0 },
      { x: width, y: 0 },
    ];
  }

  if (geometry === 100) {
    const midX1 = width / 3;
    const midX2 = (width * 2) / 3;
    return [
      { x: 0, y: 0 },
      { x: midX1, y: 0 },
      { x: midX1, y: height / 2 },
      { x: midX2, y: height / 2 },
      { x: midX2, y: height },
      { x: width, y: height },
    ];
  }

  if (geometry === 101) {
    return quadraticConnectorPoints(
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
    );
  }

  if (geometry === 102) {
    return cubicConnectorPoints(
      { x: 0, y: 0 },
      { x: width * 0.5, y: 0 },
      { x: width, y: height * 0.5 },
      { x: width, y: height },
    );
  }

  if (geometry === 103) {
    return cubicConnectorPoints(
      { x: 0, y: 0 },
      { x: width * 0.35, y: 0 },
      { x: width * 0.65, y: height },
      { x: width, y: height },
    );
  }

  return [
    { x: 0, y: 0 },
    { x: width, y: height },
  ];
}

function quadraticConnectorPoints(from: LinePoint, control: LinePoint, to: LinePoint): LinePoint[] {
  const points: LinePoint[] = [];
  for (let step = 0; step <= 12; step++) {
    const t = step / 12;
    const inverse = 1 - t;
    points.push({
      x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
      y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
    });
  }
  return points;
}

function cubicConnectorPoints(from: LinePoint, control1: LinePoint, control2: LinePoint, to: LinePoint): LinePoint[] {
  const points: LinePoint[] = [];
  for (let step = 0; step <= 12; step++) {
    const t = step / 12;
    const inverse = 1 - t;
    points.push({
      x:
        inverse * inverse * inverse * from.x +
        3 * inverse * inverse * t * control1.x +
        3 * inverse * t * t * control2.x +
        t * t * t * to.x,
      y:
        inverse * inverse * inverse * from.y +
        3 * inverse * inverse * t * control1.y +
        3 * inverse * t * t * control2.y +
        t * t * t * to.y,
    });
  }
  return points;
}

function drawConnectorLineEnd(
  context: CanvasRenderingContext2D,
  points: LinePoint[],
  end: PresentationLineEndStyle | null,
  color: string,
  atStart: boolean,
): void {
  if (!end) return;
  const segment = atStart ? firstNonZeroSegment(points) : lastNonZeroSegment(points);
  if (!segment) {
    drawLineEnd(context, points.at(-1)?.x ?? 0, points.at(-1)?.y ?? 0, end, color, atStart);
    return;
  }

  drawLineEndOnSegment(context, segment.from, segment.to, end, color, atStart);
}

function firstNonZeroSegment(points: LinePoint[]): { from: LinePoint; to: LinePoint } | null {
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1]!;
    const to = points[index]!;
    if (from.x !== to.x || from.y !== to.y) return { from, to };
  }
  return null;
}

function lastNonZeroSegment(points: LinePoint[]): { from: LinePoint; to: LinePoint } | null {
  for (let index = points.length - 1; index > 0; index--) {
    const from = points[index - 1]!;
    const to = points[index]!;
    if (from.x !== to.x || from.y !== to.y) return { from, to };
  }
  return null;
}

function drawLineEndOnSegment(
  context: CanvasRenderingContext2D,
  from: LinePoint,
  to: LinePoint,
  end: PresentationLineEndStyle,
  color: string,
  atStart: boolean,
): void {
  const tip = atStart ? from : to;
  const away = atStart ? to : from;
  const angle = Math.atan2(tip.y - away.y, tip.x - away.x);

  context.save();
  context.translate(tip.x, tip.y);
  context.rotate(angle);
  context.fillStyle = color;
  context.strokeStyle = color;
  drawLineEndPath(context, end);
  context.restore();
}

function drawElementImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  element: RecordValue,
  rect: PresentationRect,
): void {
  const alpha = elementImageAlphaModFix(element);
  if (alpha != null) {
    context.globalAlpha *= alpha;
  }
  const naturalSize = imageNaturalSize(image);
  const sourceRect = elementImageSourceRect(element);
  if (!sourceRect || naturalSize.width <= 0 || naturalSize.height <= 0) {
    context.drawImage(image, 0, 0, rect.width, rect.height);
    return;
  }

  const left = cropRatio(sourceRect.left ?? sourceRect.l);
  const top = cropRatio(sourceRect.top ?? sourceRect.t);
  const right = cropRatio(sourceRect.right ?? sourceRect.r);
  const bottom = cropRatio(sourceRect.bottom ?? sourceRect.b);
  const sourceWidth = naturalSize.width * Math.max(0.01, 1 - left - right);
  const sourceHeight = naturalSize.height * Math.max(0.01, 1 - top - bottom);
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    context.drawImage(image, 0, 0, rect.width, rect.height);
    return;
  }

  context.drawImage(
    image,
    naturalSize.width * left,
    naturalSize.height * top,
    sourceWidth,
    sourceHeight,
    0,
    0,
    rect.width,
    rect.height,
  );
}

function imageNaturalSize(image: CanvasImageSource): PresentationSize {
  const record = image as unknown as Record<string, unknown>;
  return {
    height: asNumber(
      record.naturalHeight,
      asNumber(record.videoHeight, asNumber(record.height)),
    ),
    width: asNumber(
      record.naturalWidth,
      asNumber(record.videoWidth, asNumber(record.width)),
    ),
  };
}

function elementImageSourceRect(element: RecordValue): RecordValue | null {
  const shapeFill = asRecord(asRecord(element.shape)?.fill);
  const fill = asRecord(element.fill) ?? shapeFill;
  return (
    asRecord(fill?.sourceRect) ??
    asRecord(fill?.sourceRectangle) ??
    asRecord(fill?.srcRect) ??
    asRecord(fill?.stretchFillRect) ??
    asRecord(element.imageMask)
  );
}

function elementImageAlphaModFix(element: RecordValue): number | null {
  const shapeFill = asRecord(asRecord(element.shape)?.fill);
  const fill = asRecord(element.fill) ?? shapeFill;
  const raw = asNumber(fill?.alphaModFix, Number.NaN);
  if (!Number.isFinite(raw)) return null;
  return clamp(raw / 100_000, 0, 1);
}

function cropRatio(value: unknown): number {
  const raw = asNumber(value);
  if (raw <= 0) return 0;
  if (raw > 1) return clamp(raw / 100_000, 0, 0.99);
  return clamp(raw, 0, 0.99);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
