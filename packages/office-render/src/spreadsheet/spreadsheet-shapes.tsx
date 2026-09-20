"use client";

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  imageReferenceId,
  type RecordValue,
} from "../shared/office-preview-utils";
import { protocolColorToCss } from "./spreadsheet-conditional-visuals";
import {
  SPREADSHEET_FONT_FAMILY,
  spreadsheetColumnLeft,
  spreadsheetDrawingBounds,
  spreadsheetEmuToPx,
  type SpreadsheetLayout,
  spreadsheetRowTop,
} from "./spreadsheet-layout";

type SpreadsheetShapeSpec = {
  boxShadow?: string;
  fill: string;
  geometry: number | string;
  height: number;
  id: string;
  left: number;
  line: string;
  lineWidth: number;
  text: string;
  top: number;
  width: number;
  zIndex: number;
};

type SpreadsheetImageSpec = {
  height: number;
  id: string;
  left: number;
  src: string;
  top: number;
  width: number;
  zIndex: number;
};

export function buildSpreadsheetShapes({
  activeSheet,
  layout,
  shapes,
  slicerCaches = [],
}: {
  activeSheet: RecordValue | undefined;
  layout: SpreadsheetLayout;
  shapes: RecordValue[];
  slicerCaches?: RecordValue[];
}): SpreadsheetShapeSpec[] {
  return [
    ...buildSheetDrawingShapes(activeSheet, layout),
    ...buildSheetSlicerShapes(activeSheet, layout, slicerCaches),
    ...buildRootSpreadsheetShapes(activeSheet, layout, shapes),
  ];
}

export function buildSpreadsheetImages({
  activeSheet,
  imageSources,
  layout,
}: {
  activeSheet: RecordValue | undefined;
  imageSources: ReadonlyMap<string, string>;
  layout: SpreadsheetLayout;
}): SpreadsheetImageSpec[] {
  return asArray(activeSheet?.drawings)
    .map(asRecord)
    .filter((drawing): drawing is RecordValue => drawing != null)
    .map((drawing, index) => imageFromSheetDrawing(drawing, imageSources, layout, index))
    .filter((image): image is SpreadsheetImageSpec => image != null);
}

function buildSheetDrawingShapes(
  activeSheet: RecordValue | undefined,
  layout: SpreadsheetLayout,
): SpreadsheetShapeSpec[] {
  return asArray(activeSheet?.drawings)
    .map(asRecord)
    .filter((drawing): drawing is RecordValue => drawing != null)
    .map((drawing, index) => shapeFromSheetDrawing(drawing, layout, index))
    .filter((shape): shape is SpreadsheetShapeSpec => shape != null);
}

function buildSheetSlicerShapes(
  activeSheet: RecordValue | undefined,
  layout: SpreadsheetLayout,
  slicerCaches: RecordValue[],
): SpreadsheetShapeSpec[] {
  const existingKeys = new Set(
    asArray(activeSheet?.drawings)
      .map(asRecord)
      .map((drawing) => asRecord(drawing?.shape))
      .filter((shape): shape is RecordValue => shape != null)
      .flatMap((shape) => [asString(shape.id), asString(shape.name), asString(shape.text)])
      .filter(Boolean),
  );

  return asArray(activeSheet?.slicers)
    .map(asRecord)
    .filter((slicer): slicer is RecordValue => slicer != null)
    .filter((slicer) => {
      const name = asString(slicer.name);
      const caption = asString(slicer.caption);
      return !existingKeys.has(name) && !existingKeys.has(caption);
    })
    .map((slicer, index) => slicerShapeFromRecord(slicer, layout, index, slicerCaches));
}

function slicerShapeFromRecord(
  slicer: RecordValue,
  layout: SpreadsheetLayout,
  index: number,
  slicerCaches: RecordValue[],
): SpreadsheetShapeSpec {
  const bounds = spreadsheetDrawingBounds(layout, slicer);
  const caption = asString(slicer.caption) || asString(slicer.name) || "Slicer";
  const cache = slicerCacheForRecord(slicer, slicerCaches);
  const items = cache ? slicerCacheItemLabels(cache).slice(0, 8) : [];
  const text = items.length > 0 ? [caption, ...items].join("\n") : caption;

  return {
    fill: "#ffffff",
    geometry: "roundRect",
    height: bounds.height,
    id: asString(slicer.name) || `slicer-${index}`,
    left: bounds.left,
    line: "#94a3b8",
    lineWidth: 1,
    text,
    top: bounds.top,
    width: bounds.width,
    zIndex: 5_000 + index,
  };
}

function slicerCacheForRecord(slicer: RecordValue, slicerCaches: RecordValue[]): RecordValue | null {
  const cacheKey = asString(slicer.cache) || asString(slicer.cacheName) || asString(slicer.name);
  const cacheId = asNumber(slicer.cacheId, Number.NaN);
  return slicerCaches.find((cache) => {
    const names = [
      asString(cache.name),
      asString(cache.caption),
      asString(cache.sourceName),
      asString(cache.cache),
      asString(cache.cacheName),
    ];
    if (cacheKey && names.includes(cacheKey)) return true;
    return Number.isFinite(cacheId) && asNumber(cache.id, Number.NaN) === cacheId;
  }) ?? null;
}

function slicerCacheItemLabels(cache: RecordValue): string[] {
  return asArray(cache.items)
    .map(asRecord)
    .filter((item): item is RecordValue => item != null)
    .map((item) => {
      const label = asString(item.value) || asString(item.caption) || asString(item.name) || asString(item.x);
      if (!label) return "";
      const inactive = item.selected === false || item.disabled === true || item.noData === true;
      return `${inactive ? "- " : "* "}${label}`;
    })
    .filter(Boolean);
}

function shapeFromSheetDrawing(
  drawing: RecordValue,
  layout: SpreadsheetLayout,
  index: number,
): SpreadsheetShapeSpec | null {
  const shapeElement = asRecord(drawing.shape);
  if (!shapeElement) return null;

  const shape = asRecord(shapeElement.shape) ?? shapeElement;
  const line = asRecord(shape.line);
  const bounds = spreadsheetDrawingBounds(layout, drawing);
  const boxShadow = spreadsheetShapeBoxShadow(shapeElement);

  return {
    ...(boxShadow ? { boxShadow } : {}),
    fill: nestedProtocolColor(shape.fill) ?? "#ffffff",
    geometry: asNumber(shape.geometry, 0),
    height: bounds.height,
    id: asString(shapeElement.id) || asString(shapeElement.name) || `sheet-shape-${index}`,
    left: bounds.left,
    line: nestedProtocolColor(line?.fill) ?? "#cbd5e1",
    lineWidth: Math.max(1, Math.min(4, spreadsheetEmuToPx(line?.widthEmu))),
    text: asString(shapeElement.text),
    top: bounds.top,
    width: bounds.width,
    zIndex: index,
  };
}

function imageFromSheetDrawing(
  drawing: RecordValue,
  imageSources: ReadonlyMap<string, string>,
  layout: SpreadsheetLayout,
  zIndex: number,
): SpreadsheetImageSpec | null {
  const imageId = imageReferenceId(drawing.imageReference);
  const src = imageId ? imageSources.get(imageId) : undefined;
  if (!imageId || !src) return null;

  const bounds = spreadsheetDrawingBounds(layout, drawing);
  return {
    height: bounds.height,
    id: imageId,
    left: bounds.left,
    src,
    top: bounds.top,
    width: bounds.width,
    zIndex,
  };
}

function buildRootSpreadsheetShapes(
  activeSheet: RecordValue | undefined,
  layout: SpreadsheetLayout,
  shapes: RecordValue[],
): SpreadsheetShapeSpec[] {
  const sheetName = asString(activeSheet?.name);
  return shapes
    .filter((shape) => asString(shape.sheetName) === sheetName)
    .map((shape, index) => {
      const fromCol = asNumber(shape.fromCol, 0);
      const fromRow = asNumber(shape.fromRow, 0);
      const left = spreadsheetColumnLeft(layout, fromCol) + spreadsheetEmuToPx(shape.fromColOffsetEmu);
      const top = spreadsheetRowTop(layout, fromRow) + spreadsheetEmuToPx(shape.fromRowOffsetEmu);
      const width = Math.max(24, spreadsheetEmuToPx(shape.widthEmu));
      const height = Math.max(24, spreadsheetEmuToPx(shape.heightEmu));

      return {
        fill: protocolColorToCss(shape.fillColor) ?? "#ffffff",
        geometry: asString(shape.geometry),
        height,
        id: asString(shape.id) || `shape-${index}`,
        left,
        line: protocolColorToCss(shape.lineColor) ?? "#cbd5e1",
        lineWidth: 1,
        text: asString(shape.text),
        top,
        width,
        zIndex: 10_000 + index,
      };
    });
}

function nestedProtocolColor(value: unknown): string | undefined {
  const record = asRecord(value);
  return protocolColorToCss(record?.color ?? value);
}

function shapeBorderRadius(geometry: number | string): number | string {
  if (geometry === 26 || geometry === "roundRect") return 18;
  if (geometry === 35 || geometry === "ellipse") return "999px";
  return 0;
}

function isRightTriangleGeometry(geometry: number | string): boolean {
  return geometry === 4 || geometry === "rtTriangle";
}

export function SpreadsheetShapeLayer({ shapes }: { shapes: SpreadsheetShapeSpec[] }) {
  if (shapes.length === 0) return null;

  return (
    <div aria-hidden="true" style={{ inset: 0, pointerEvents: "none", position: "absolute" }}>
      {shapes.map((shape) => (
        <SpreadsheetShapeView key={shape.id} shape={shape} />
      ))}
    </div>
  );
}

function SpreadsheetShapeView({ shape }: { shape: SpreadsheetShapeSpec }) {
  if (isRightTriangleGeometry(shape.geometry)) {
    return <SpreadsheetRightTriangleShape shape={shape} />;
  }

  return (
    <div
      data-office-shape={shape.id}
      style={{
        alignItems: "center",
        background: shape.fill,
        borderColor: shape.line,
        borderRadius: shapeBorderRadius(shape.geometry),
        borderStyle: "solid",
        borderWidth: shape.lineWidth,
        boxShadow: shape.boxShadow,
        color: "#0f172a",
        display: "flex",
        fontFamily: SPREADSHEET_FONT_FAMILY,
        fontSize: 13,
        height: shape.height,
        justifyContent: "center",
        left: shape.left,
        lineHeight: 1.35,
        overflow: "hidden",
        padding: 12,
        position: "absolute",
        textAlign: "center",
        top: shape.top,
        whiteSpace: "pre-wrap",
        width: shape.width,
        zIndex: shape.zIndex,
      }}
    >
      {shape.text}
    </div>
  );
}

function SpreadsheetRightTriangleShape({ shape }: { shape: SpreadsheetShapeSpec }) {
  const halfStroke = Math.max(0.5, shape.lineWidth / 2);
  const points = [
    `${halfStroke},${halfStroke}`,
    `${halfStroke},${Math.max(halfStroke, shape.height - halfStroke)}`,
    `${Math.max(halfStroke, shape.width - halfStroke)},${Math.max(halfStroke, shape.height - halfStroke)}`,
  ].join(" ");

  return (
    <svg
      data-office-shape={shape.id}
      height={shape.height}
      style={{
        boxShadow: shape.boxShadow,
        height: shape.height,
        left: shape.left,
        overflow: "visible",
        position: "absolute",
        top: shape.top,
        width: shape.width,
        zIndex: shape.zIndex,
      }}
      viewBox={`0 0 ${shape.width} ${shape.height}`}
      width={shape.width}
    >
      <polygon
        fill={shape.fill}
        points={points}
        stroke={shape.line}
        strokeLinejoin="round"
        strokeWidth={shape.lineWidth}
        vectorEffect="non-scaling-stroke"
      />
      {shape.text ? (
        <foreignObject height={shape.height} width={shape.width} x={0} y={0}>
          <div
            style={{
              alignItems: "center",
              color: "#0f172a",
              display: "flex",
              fontFamily: SPREADSHEET_FONT_FAMILY,
              fontSize: 13,
              height: "100%",
              justifyContent: "center",
              lineHeight: 1.35,
              padding: 12,
              textAlign: "center",
              whiteSpace: "pre-wrap",
              width: "100%",
            }}
          >
            {shape.text}
          </div>
        </foreignObject>
      ) : null}
    </svg>
  );
}

function spreadsheetShapeBoxShadow(element: RecordValue): string | undefined {
  for (const effect of asArray(element.effects)) {
    const shadow = asRecord(asRecord(effect)?.shadow);
    const color = protocolColorToCss(shadow?.color);
    if (!shadow || !color || cssColorAlpha(color) <= 0) {
      continue;
    }

    const distance = spreadsheetEmuToPx(shadow.distance);
    const direction = (asNumber(shadow.direction) / 60_000 / 180) * Math.PI;
    const offsetX = Math.cos(direction) * distance;
    const offsetY = Math.sin(direction) * distance;
    const blur = Math.max(0, spreadsheetEmuToPx(shadow.blurRadius));
    return `${formatCssPx(offsetX)} ${formatCssPx(offsetY)} ${formatCssPx(blur)} ${color}`;
  }

  return undefined;
}

function formatCssPx(value: number): string {
  const rounded = Math.abs(value) < 0.01 ? 0 : Math.round(value * 100) / 100;
  return `${rounded}px`;
}

function cssColorAlpha(value: string): number {
  const channels = parseCssColorChannels(value);
  if (!channels || channels[3] == null) return 1;
  const alpha = Number(channels[3]);
  return Number.isFinite(alpha) ? alpha : 1;
}

function parseCssColorChannels(value: string): string[] | null {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open < 0 || close <= open) return null;
  const functionName = value.slice(0, open).trim().toLowerCase();
  if (functionName !== "rgb" && functionName !== "rgba") return null;
  const channels = value
    .slice(open + 1, close)
    .split(",")
    .map((channel) => channel.trim());
  return channels.length >= 3 ? channels : null;
}

export function SpreadsheetImageLayer({ images }: { images: SpreadsheetImageSpec[] }) {
  if (images.length === 0) return null;

  return (
    <div aria-hidden="true" style={{ inset: 0, pointerEvents: "none", position: "absolute" }}>
      {images.map((image) => (
        <div
          data-office-image={image.id}
          key={image.id}
          style={{
            backgroundImage: `url("${image.src}")`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "100% 100%",
            display: "block",
            height: image.height,
            left: image.left,
            position: "absolute",
            top: image.top,
            width: image.width,
            zIndex: image.zIndex,
          }}
        />
      ))}
    </div>
  );
}
