import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import sharp from "sharp";

import { extractPptxProto, getReaderVersion } from "../../packages/office/src/index";
import officeWasmConfig from "../../src/app/debug/office-wasm-poc/office-wasm-config";

type RecordValue = Record<string, unknown>;

type DirectCanvasElement =
  | {
      kind: "image";
      crop: DirectImageCrop | null;
      mediaId: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      color: string;
      fontSize: number;
      italic: boolean;
      insetBottom: number;
      insetLeft: number;
      insetRight: number;
      insetTop: number;
      kind: "text";
      lineHeight: number;
      text: string;
      textAlign: "center" | "left" | "right";
      typeface: string;
      underline: boolean;
      verticalAlign: "bottom" | "middle" | "top";
      weight: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      fill: string;
      kind: "shape";
      radius: number;
      shapeKind: DirectShapeKind;
      stroke: string;
      strokeWidth: number;
      x: number;
      y: number;
      width: number;
      height: number;
    };

type DirectCanvasMedia = {
  height: number;
  src: string;
  width: number;
};

type DirectImageCrop = {
  height: number;
  width: number;
  x: number;
  y: number;
};

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

type PresentationRendererHelpers = {
  applyPresentationLayoutInheritance: (slide: RecordValue, layouts: RecordValue[]) => RecordValue;
  getSlideBounds: (slide: RecordValue, layouts?: RecordValue[]) => { height: number; width: number };
  presentationImageSourceRect: (element: RecordValue, naturalSize: { height: number; width: number }) => DirectImageCrop;
  presentationShapeKind: (shape: RecordValue | null, rect: { height: number; left: number; top: number; width: number }) => string;
};

type OfficePreviewHelpers = {
  colorToCss: (value: unknown) => string | undefined;
  elementImageReferenceId: (element: RecordValue) => string;
  fillToCss: (fill: unknown) => string | undefined;
  lineToCss: (line: unknown) => { color?: string; width: number };
  slideBackgroundToCss: (slide: RecordValue) => string;
};

const repoRoot = process.cwd();
const pptxPath = path.resolve(
  repoRoot,
  stringArg("--pptx") ??
    positionalArgs()[0] ??
    path.join(os.homedir(), "Downloads", "agentic_ui_proactive_agent_technical_blueprint.pptx"),
);
const outputPath = path.resolve(
  repoRoot,
  stringArg("--output") ??
    path.join(os.homedir(), ".cursor/projects/Users-phodal-ai-routa-js/canvases/ppt-direct.canvas.tsx"),
);
const mediaWidth = numberArg("--media-width") ?? 1280;
const mediaQuality = numberArg("--media-quality") ?? 70;
const mediaConcurrency = numberArg("--media-concurrency") ?? 4;
const thumbnailWidth = numberArg("--thumbnail-width") ?? 220;
const thumbnailQuality = numberArg("--thumbnail-quality") ?? 50;
const includeThumbnails = !process.argv.includes("--no-thumbnails");

async function main(): Promise<void> {
  if (!existsSync(pptxPath)) {
    throw new Error(`PPTX not found: ${pptxPath}`);
  }

  const protoBytes = await extractPptxProto(new Uint8Array(readFileSync(pptxPath)));
  const presentation = await decodePresentationProto(protoBytes);
  const payload = await buildPayload(presentation);

  mkdirSync(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderCanvasSource(payload), "utf8");
  console.log(JSON.stringify({ mode: "proto-direct", outputPath, pptxPath, slideCount: payload.slides.length }, null, 2));
}

async function decodePresentationProto(protoBytes: Uint8Array): Promise<RecordValue> {
  const modulePath = path.join(
    repoRoot,
    officeWasmConfig.OFFICE_WASM_TMP_ASSET_DIR,
    officeWasmConfig.OFFICE_WASM_READER_MODULES.presentation,
  );
  const imported = await import(pathToFileURL(modulePath).href) as {
    Presentation?: { decode: (bytes: Uint8Array) => RecordValue };
    default?: { Presentation?: { decode: (bytes: Uint8Array) => RecordValue } };
    "module.exports"?: { Presentation?: { decode: (bytes: Uint8Array) => RecordValue } };
  };
  const decoder = imported.Presentation ?? imported.default?.Presentation ?? imported["module.exports"]?.Presentation;
  if (!decoder) {
    throw new Error(`Presentation decoder not found: ${modulePath}`);
  }
  return decoder.decode(protoBytes);
}

async function buildPayload(presentation: RecordValue): Promise<DirectCanvasPayload> {
  const renderer = await loadPresentationRendererHelpers();
  const preview = await loadOfficePreviewHelpers();
  const mediaIndex = await buildMediaIndex(asRecords(presentation.images));
  const layouts = asRecords(presentation.layouts);
  const baseSlides = asRecords(presentation.slides).map((slide, index) => buildSlide(slide, index, layouts, mediaIndex, renderer, preview));
  const slides = includeThumbnails
    ? await mapWithConcurrency(baseSlides, Math.max(1, mediaConcurrency), async (slide) => ({
        ...slide,
        thumbnail: await renderSlideThumbnailDataUrl(slide, mediaIndex.media),
      }))
    : baseSlides;

  return {
    artifact: {
      generatedBy: "scripts/office-wasm-reader/export-pptx-direct-cursor-canvas.ts",
      mode: "proto-direct",
      reader: await getReaderVersion(),
      source: pptxPath,
      title: path.basename(pptxPath),
    },
    media: Object.fromEntries(mediaIndex.media),
    slides,
  };
}

async function loadPresentationRendererHelpers(): Promise<PresentationRendererHelpers> {
  const imported = await import("../../packages/office-render/src/presentation/presentation-renderer");
  const namespace = moduleNamespace(imported) as Partial<PresentationRendererHelpers>;
  if (
    typeof namespace.applyPresentationLayoutInheritance !== "function" ||
    typeof namespace.getSlideBounds !== "function" ||
    typeof namespace.presentationImageSourceRect !== "function" ||
    typeof namespace.presentationShapeKind !== "function"
  ) {
    throw new Error("Presentation renderer helpers are unavailable.");
  }
  return namespace as PresentationRendererHelpers;
}

async function loadOfficePreviewHelpers(): Promise<OfficePreviewHelpers> {
  const imported = await import("../../packages/office-render/src/shared/office-preview-utils");
  const namespace = moduleNamespace(imported) as Partial<OfficePreviewHelpers>;
  if (
    typeof namespace.colorToCss !== "function" ||
    typeof namespace.elementImageReferenceId !== "function" ||
    typeof namespace.fillToCss !== "function" ||
    typeof namespace.lineToCss !== "function" ||
    typeof namespace.slideBackgroundToCss !== "function"
  ) {
    throw new Error("Office preview helpers are unavailable.");
  }
  return namespace as OfficePreviewHelpers;
}

function moduleNamespace(imported: unknown): Record<string, unknown> {
  const record = imported as Record<string, unknown>;
  return asRecord(record.default) ?? asRecord(record["module.exports"]) ?? record;
}

type MediaIndex = {
  byImageId: Map<string, string>;
  media: Map<string, DirectCanvasMedia>;
};

async function buildMediaIndex(images: RecordValue[]): Promise<MediaIndex> {
  const entries = await mapWithConcurrency(images, Math.max(1, mediaConcurrency), async (image) => {
    const id = asString(image.id);
    const bytes = bytesFromUnknown(image.data);
    if (!id || bytes.length === 0) return null;

    const mediaId = sha256(bytes);
    const compressed = await sharp(bytes)
      .resize({ fit: "inside", width: mediaWidth, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ mozjpeg: true, quality: clampQuality(mediaQuality) })
      .toBuffer();
    const metadata = await sharp(compressed).metadata();
    return {
      id,
      media: {
        height: metadata.height ?? 1,
        src: `data:image/jpeg;base64,${compressed.toString("base64")}`,
        width: metadata.width ?? 1,
      },
      mediaId,
    };
  });

  const byImageId = new Map<string, string>();
  const media = new Map<string, DirectCanvasMedia>();
  for (const entry of entries) {
    if (!entry) continue;
    byImageId.set(entry.id, entry.mediaId);
    if (!media.has(entry.mediaId)) {
      media.set(entry.mediaId, entry.media);
    }
  }
  return { byImageId, media };
}

function buildSlide(
  slide: RecordValue,
  index: number,
  layouts: RecordValue[],
  mediaIndex: MediaIndex,
  renderer: PresentationRendererHelpers,
  preview: OfficePreviewHelpers,
): DirectCanvasSlide {
  const effectiveSlide = renderer.applyPresentationLayoutInheritance(slide, layouts);
  const bounds = renderer.getSlideBounds(effectiveSlide);
  const elements = slideElements(effectiveSlide)
    .flatMap((element) => directElements(element, mediaIndex, renderer, preview))
    .filter((element): element is DirectCanvasElement => element != null);

  return {
    background: preview.slideBackgroundToCss(effectiveSlide),
    elements,
    height: bounds.height,
    index: asNumber(slide.index, index + 1),
    thumbnail: null,
    title: firstText(elements) || `Slide ${index + 1}`,
    width: bounds.width,
  };
}

function slideElements(slide: RecordValue): RecordValue[] {
  return asRecords(slide.elements)
    .filter((element) => {
      const placeholderType = asString(element.placeholderType).toLowerCase();
      return placeholderType !== "sldnum" && placeholderType !== "dt";
    })
    .sort((left, right) => asNumber(left.zIndex, 0) - asNumber(right.zIndex, 0));
}

function directElements(
  element: RecordValue,
  mediaIndex: MediaIndex,
  renderer: PresentationRendererHelpers,
  preview: OfficePreviewHelpers,
): DirectCanvasElement[] {
  const bbox = asRecord(element.bbox);
  if (!bbox) return [];
  const rect = {
    height: asNumber(bbox.heightEmu, 0),
    width: asNumber(bbox.widthEmu, 0),
    x: asNumber(bbox.xEmu, 0),
    y: asNumber(bbox.yEmu, 0),
  };
  if (rect.width <= 0 && rect.height <= 0) return [];

  const imageId = preview.elementImageReferenceId(element);
  const mediaId = imageId ? mediaIndex.byImageId.get(imageId) : null;
  const elements: DirectCanvasElement[] = [];
  if (mediaId) {
    const media = mediaIndex.media.get(mediaId);
    elements.push({
      crop: media ? renderer.presentationImageSourceRect(element, media) : null,
      kind: "image",
      mediaId,
      ...rect,
    });
  }

  const shape = asRecord(element.shape);
  const fill = preview.fillToCss(shape?.fill) ?? preview.fillToCss(element.fill) ?? "transparent";
  const line = preview.lineToCss(shape?.line ?? element.line);
  const shapeKind = normalizeShapeKind(renderer.presentationShapeKind(shape, {
    height: rect.height,
    left: rect.x,
    top: rect.y,
    width: rect.width,
  }));
  if (!mediaId && (fill !== "transparent" || line.color || shapeKind === "line")) {
    elements.push({
      fill,
      kind: "shape",
      radius: shapeKind === "roundRect" ? Math.min(rect.width, rect.height) * 0.12 : 0,
      shapeKind,
      stroke: line.color ?? "none",
      strokeWidth: line.color ? line.width * 9_525 : 0,
      ...rect,
    });
  }

  const rawText = textFromElement(element);
  if (rawText && rect.width > 0 && rect.height > 0) {
    const style = firstRunStyle(element);
    const textStyle = asRecord(element.textStyle) ?? {};
    const fontSize = fontSizeFromStyle(style);
    const insetLeft = asNumber(textStyle.leftInset, 0);
    const insetRight = asNumber(textStyle.rightInset, 0);
    elements.push({
      color: preview.fillToCss(style.fill) ?? "#0f172a",
      fontSize,
      italic: asBoolean(style.italic),
      insetBottom: asNumber(textStyle.bottomInset, 0),
      insetLeft,
      insetRight,
      insetTop: asNumber(textStyle.topInset, 0),
      kind: "text",
      lineHeight: fontSize * 1.18,
      text: wrapTextForSvg(rawText, fontSize, Math.max(fontSize * 1.2, rect.width - insetLeft - insetRight)),
      textAlign: paragraphTextAlign(element),
      typeface: asString(style.typeface),
      underline: asString(style.underline).toLowerCase() === "sng" || asBoolean(style.underline),
      verticalAlign: verticalTextAlign(textStyle),
      weight: asBoolean(style.bold) ? 700 : 500,
      ...rect,
    });
  }

  return elements;
}

function textFromElement(element: RecordValue): string {
  return asArray(element.paragraphs)
    .map((paragraph) =>
      asArray(asRecord(paragraph)?.runs)
        .map((run) => asString(asRecord(run)?.text))
        .join("")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

function firstRunStyle(element: RecordValue): RecordValue {
  for (const paragraph of asArray(element.paragraphs)) {
    for (const run of asArray(asRecord(paragraph)?.runs)) {
      const style = asRecord(asRecord(run)?.textStyle);
      if (style) return style;
    }
  }
  return {};
}

function paragraphTextAlign(element: RecordValue): "center" | "left" | "right" {
  const paragraph = asRecord(asArray(element.paragraphs)[0]);
  const alignment = asNumber(asRecord(paragraph?.textStyle)?.alignment, 0);
  if (alignment === 2) return "center";
  if (alignment === 3) return "right";
  return "left";
}

function verticalTextAlign(textStyle: RecordValue): "bottom" | "middle" | "top" {
  const anchor = asNumber(textStyle.anchor, 1);
  if (anchor === 2) return "middle";
  if (anchor === 3) return "bottom";
  return "top";
}

function fontSizeFromStyle(style: RecordValue): number {
  const pointSize = asNumber(style.fontSize, 1800) / 100;
  return Math.max(8, Math.min(96, pointSize)) * 12_700;
}

function normalizeShapeKind(kind: string): DirectShapeKind {
  if (kind === "diamond" || kind === "ellipse" || kind === "line" || kind === "roundRect" || kind === "triangle") {
    return kind;
  }
  return "rect";
}

function wrapTextForSvg(text: string, fontSize: number, maxWidth: number): string {
  const maxLineWidth = Math.max(fontSize * 1.2, maxWidth * 0.94);
  const lines: string[] = [];
  for (const sourceLine of text.split(/\n/u)) {
    const tokens = textWrapTokens(sourceLine);
    let line = "";
    let lineWidth = 0;
    for (const token of tokens) {
      const tokenWidth = estimatedTextWidth(token, fontSize);
      if (line && lineWidth + tokenWidth > maxLineWidth) {
        lines.push(line.trimEnd());
        line = token.trimStart();
        lineWidth = estimatedTextWidth(line, fontSize);
        continue;
      }
      line += token;
      lineWidth += tokenWidth;
    }
    lines.push(line.trimEnd());
  }
  return lines.join("\n").trim();
}

function textWrapTokens(text: string): string[] {
  const tokens: string[] = [];
  let latin = "";
  for (const char of text) {
    if (/[\w\s.,:;!?()[\]{}'"“”‘’·/@#%&+\-=|<>]/u.test(char)) {
      latin += char;
      continue;
    }
    if (latin) {
      tokens.push(latin);
      latin = "";
    }
    tokens.push(char);
  }
  if (latin) tokens.push(latin);
  return tokens;
}

function estimatedTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    if (/\s/u.test(char)) {
      width += fontSize * 0.32;
    } else if (char.charCodeAt(0) <= 0x7f) {
      width += fontSize * 0.55;
    } else {
      width += fontSize * 0.95;
    }
  }
  return width;
}

async function renderSlideThumbnailDataUrl(slide: DirectCanvasSlide, media: Map<string, DirectCanvasMedia>): Promise<string> {
  const svg = renderSlideThumbnailSvg(slide, media);
  const thumbnail = await sharp(Buffer.from(svg))
    .jpeg({ mozjpeg: true, quality: clampQuality(thumbnailQuality) })
    .toBuffer();
  return `data:image/jpeg;base64,${thumbnail.toString("base64")}`;
}

function renderSlideThumbnailSvg(slide: DirectCanvasSlide, media: Map<string, DirectCanvasMedia>): string {
  const width = Math.max(80, Math.round(thumbnailWidth));
  const height = Math.max(1, Math.round((width * slide.height) / Math.max(1, slide.width)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${slide.width} ${slide.height}">
<rect x="0" y="0" width="${slide.width}" height="${slide.height}" fill="${escapeXml(slide.background || "#ffffff")}"/>
${slide.elements.map((element) => renderSlideThumbnailElement(element, media)).join("\n")}
</svg>`;
}

function renderSlideThumbnailElement(element: DirectCanvasElement, media: Map<string, DirectCanvasMedia>): string {
  if (element.kind === "image") {
    const image = media.get(element.mediaId);
    if (!image) return "";
    const crop = element.crop ?? { height: image.height, width: image.width, x: 0, y: 0 };
    return `<svg x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}" preserveAspectRatio="none">
<image href="${escapeXml(image.src)}" x="0" y="0" width="${image.width}" height="${image.height}" preserveAspectRatio="none"/>
</svg>`;
  }

  if (element.kind === "shape") {
    const shapeProps = `fill="${escapeXml(element.fill)}" stroke="${escapeXml(element.stroke)}" stroke-width="${element.strokeWidth}"`;
    if (element.shapeKind === "ellipse") {
      return `<ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${element.width / 2}" ry="${element.height / 2}" ${shapeProps}/>`;
    }
    if (element.shapeKind === "line") {
      return `<line x1="${element.x}" y1="${element.y}" x2="${element.x + element.width}" y2="${element.y + element.height}" stroke="${escapeXml(element.stroke)}" stroke-width="${element.strokeWidth || 9_525}"/>`;
    }
    if (element.shapeKind === "triangle") {
      return `<polygon points="${element.x + element.width / 2},${element.y} ${element.x + element.width},${element.y + element.height} ${element.x},${element.y + element.height}" ${shapeProps}/>`;
    }
    if (element.shapeKind === "diamond") {
      return `<polygon points="${element.x + element.width / 2},${element.y} ${element.x + element.width},${element.y + element.height / 2} ${element.x + element.width / 2},${element.y + element.height} ${element.x},${element.y + element.height / 2}" ${shapeProps}/>`;
    }
    return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${element.radius}" ry="${element.radius}" ${shapeProps}/>`;
  }

  const lines = element.text.split(/\n/u);
  const anchor = element.textAlign === "center" ? "middle" : element.textAlign === "right" ? "end" : "start";
  const textX = element.textAlign === "center" ? element.x + element.width / 2 : element.textAlign === "right" ? element.x + element.width : element.x;
  const lineHeight = element.fontSize * 1.18;
  const tspans = lines
    .map((line, index) => `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text fill="${escapeXml(element.color)}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif" font-size="${element.fontSize}" font-weight="${element.weight}" text-anchor="${anchor}" x="${textX}" y="${element.y + element.fontSize}">${tspans}</text>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

function renderCanvasSource(payload: DirectCanvasPayload): string {
  return `import { Button, Pill, Row, Stack, Text, useCanvasState, useHostTheme } from "cursor/canvas";

type DirectCanvasElement =
  | { crop: DirectImageCrop | null; kind: "image"; mediaId: string; x: number; y: number; width: number; height: number }
  | { color: string; fontSize: number; italic: boolean; insetBottom: number; insetLeft: number; insetRight: number; insetTop: number; kind: "text"; lineHeight: number; text: string; textAlign: "center" | "left" | "right"; typeface: string; underline: boolean; verticalAlign: "bottom" | "middle" | "top"; weight: number; x: number; y: number; width: number; height: number }
  | { fill: string; kind: "shape"; radius: number; shapeKind: DirectShapeKind; stroke: string; strokeWidth: number; x: number; y: number; width: number; height: number };

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

export default function DirectPptCanvas() {
  const theme = useHostTheme();
  const [selectedIndex, setSelectedIndex] = useCanvasState("selected-slide-index", slides[0]?.index ?? 1);
  const [isPlaying, setIsPlaying] = useCanvasState("slideshow-open", false);
  const selectedPosition = Math.max(0, slides.findIndex((slide) => slide.index === selectedIndex));
  const selectedSlide = slides[selectedPosition] ?? slides[0];
  const goPrevious = () => setSelectedIndex(slides[Math.max(0, selectedPosition - 1)]?.index ?? selectedSlide.index);
  const goNext = () => setSelectedIndex(slides[Math.min(slides.length - 1, selectedPosition + 1)]?.index ?? selectedSlide.index);

  return (
    <div style={{
      background: theme.bg.editor,
      border: \`1px solid \${theme.stroke.secondary}\`,
      borderRadius: 8,
      color: theme.text.primary,
      display: "grid",
      gridTemplateRows: "52px minmax(0, 1fr)",
      height: "min(820px, calc(100vh - 40px))",
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
          <Pill active size="sm" tone="info">proto direct</Pill>
          <Text as="span" size="small" tone="secondary" truncate>{artifact.reader}</Text>
        </Row>
        <Text as="span" size="small" weight="semibold" truncate style={{ textAlign: "center" }}>{artifact.title}</Text>
        <Row gap={8} align="center" justify="end">
          <Text as="span" size="small" tone="secondary">{slides.length} slides</Text>
          <Button onClick={() => setIsPlaying(true)} variant="primary">Play</Button>
        </Row>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "clamp(156px, 13vw, 252px) minmax(0, 1fr)", minHeight: 0 }}>
        <aside style={{ borderRight: \`1px solid \${theme.stroke.secondary}\`, minHeight: 0, overflow: "auto", padding: "12px 14px 48px 8px" }}>
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
                    background: active ? theme.fill.secondary : "transparent",
                    border: \`1px solid \${active ? theme.accent.primary : "transparent"}\`,
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
                    {slide.thumbnail ? (
                      <img alt="" draggable={false} src={slide.thumbnail} style={{
                        aspectRatio: \`\${slide.width} / \${slide.height}\`,
                        background: "#ffffff",
                        borderRadius: 4,
                        boxShadow: active ? \`0 0 0 1px \${theme.accent.primary}\` : "0 8px 22px rgba(15, 23, 42, 0.12)",
                        display: "block",
                        objectFit: "fill",
                        userSelect: "none",
                        width: "100%",
                      }} />
                    ) : (
                      <span style={{
                        aspectRatio: \`\${slide.width} / \${slide.height}\`,
                        background: "#ffffff",
                        borderRadius: 4,
                        display: "block",
                        width: "100%",
                      }} />
                    )}
                  </span>
                </button>
              );
            })}
          </Stack>
        </aside>
        <main style={{ background: theme.fill.primary, minHeight: 0, overflow: "auto", padding: "16px 24px 20px" }}>
          <div style={{ margin: "0 auto", maxWidth: 960 }}>
            <SlideSurface slide={selectedSlide} />
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
            <div style={{ width: "min(92vw, calc(92vh * 16 / 9))" }}>
              <SlideSurface slide={selectedSlide} />
            </div>
          </button>
          <button aria-label="Previous slide" onClick={goPrevious} style={{ ...navButtonStyle, left: 18 }} type="button">{"<"}</button>
          <button aria-label="Next slide" onClick={goNext} style={{ ...navButtonStyle, right: 18 }} type="button">{">"}</button>
        </div>
      ) : null}
    </div>
  );
}

function SlideSurface({ slide }: { slide: DirectCanvasSlide }) {
  return (
    <div
      role="img"
      aria-label={\`Slide \${slide.index}\`}
      style={{
      aspectRatio: \`\${slide.width} / \${slide.height}\`,
      background: "#ffffff",
      border: "1px solid rgba(148, 163, 184, 0.44)",
      borderRadius: 8,
      containerType: "inline-size",
      overflow: "hidden",
      position: "relative",
      width: "100%",
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
        color: element.color,
        display: "flex",
        flexDirection: "column",
        fontFamily: fontStack(element.typeface),
        fontSize: \`\${(element.fontSize / slide.width) * 100}cqw\`,
        fontStyle: element.italic ? "italic" : "normal",
        fontWeight: element.weight,
        height: \`\${(element.height / slide.height) * 100}%\`,
        justifyContent,
        left: \`\${(element.x / slide.width) * 100}%\`,
        lineHeight: element.lineHeight / element.fontSize,
        overflow: "hidden",
        paddingBottom: \`\${(element.insetBottom / slide.height) * 100}%\`,
        paddingLeft: \`\${(element.insetLeft / slide.width) * 100}%\`,
        paddingRight: \`\${(element.insetRight / slide.width) * 100}%\`,
        paddingTop: \`\${(element.insetTop / slide.height) * 100}%\`,
        position: "absolute",
        textAlign: element.textAlign,
        textDecoration: element.underline ? "underline" : "none",
        top: \`\${(element.y / slide.height) * 100}%\`,
        whiteSpace: "pre-wrap",
        width: \`\${(element.width / slide.width) * 100}%\`,
      }}
    >
      {element.text}
    </div>
  );
}

function fontStack(typeface: string) {
  const fallback = "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif";
  return typeface ? \`\${JSON.stringify(typeface).slice(1, -1)}, \${fallback}\` : fallback;
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

function firstText(elements: DirectCanvasElement[]): string {
  return elements.find((element) => element.kind === "text")?.text.split(/\n/u)[0]?.trim() ?? "";
}

function bytesFromUnknown(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value && typeof value === "object") {
    return new Uint8Array(Object.values(value as Record<string, number>));
  }
  return new Uint8Array();
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecords(value: unknown): RecordValue[] {
  return asArray(value).map(asRecord).filter((record): record is RecordValue => record != null);
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" ? value as RecordValue : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function clampQuality(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function numberArg(name: string): number | null {
  const value = stringArg(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function positionalArgs(): string[] {
  const args = process.argv.slice(2);
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (
      arg === "--media-concurrency" ||
      arg === "--media-quality" ||
      arg === "--media-width" ||
      arg === "--output" ||
      arg === "--pptx" ||
      arg === "--thumbnail-quality" ||
      arg === "--thumbnail-width"
    ) {
      index++;
      continue;
    }
    if (!arg?.startsWith("--")) values.push(arg);
  }
  return values;
}

void main();
