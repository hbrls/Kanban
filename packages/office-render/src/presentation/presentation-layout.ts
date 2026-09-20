import {
  asArray,
  asNumber,
  asRecord,
  asString,
  fillToCss,
  lineToCss,
  type RecordValue,
} from "../shared/office-preview-utils";
import type {
  PresentationRect,
  PresentationSize,
} from "./presentation-text-layout";

export type {
  PresentationRect,
  PresentationSize,
} from "./presentation-text-layout";

const DEFAULT_SLIDE_BOUNDS = { width: 12_192_000, height: 6_858_000 };
const EMU_PER_CSS_PIXEL = 9_525;
const FIT_PADDING = 48;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;

export type PresentationFit = PresentationSize & {
  scale: number;
};

export type PresentationElementTarget = {
  element: RecordValue;
  id: string;
  index: number;
  name: string;
  rect: PresentationRect;
};

export type PresentationImageSourceRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type PresentationRenderImages = ReadonlyMap<string, CanvasImageSource>;

export type SlideElementEntry = {
  element: RecordValue;
  index: number;
};

export type PresentationShapeKind =
  | "arc"
  | "bracePair"
  | "bracketPair"
  | "bentArrow"
  | "bentUpArrow"
  | "blockArc"
  | "can"
  | "chevron"
  | "chord"
  | "cloud"
  | "cloudCallout"
  | "corner"
  | "cube"
  | "curvedDownArrow"
  | "curvedLeftArrow"
  | "curvedRightArrow"
  | "curvedUpArrow"
  | "delay"
  | "diamond"
  | "diagStripe"
  | "document"
  | "donut"
  | "ellipse"
  | "extract"
  | "frame"
  | "halfFrame"
  | "heart"
  | "hexagon"
  | "homePlate"
  | "leftBrace"
  | "leftArrow"
  | "leftRightArrowCallout"
  | "leftBracket"
  | "leftRightArrow"
  | "lightningBolt"
  | "line"
  | "mathEqual"
  | "mathPlus"
  | "moon"
  | "octagon"
  | "parallelogram"
  | "pentagon"
  | "pie"
  | "rect"
  | "rightBrace"
  | "rightArrow"
  | "rightBracket"
  | "roundRect"
  | "rtTriangle"
  | "snip1Rect"
  | "snipRect"
  | "star32"
  | "star4"
  | "star5"
  | "star6"
  | "star8"
  | "trapezoid"
  | "triangle"
  | "quadArrowCallout"
  | "teardrop"
  | "uturnArrow"
  | "wedgeEllipseCallout"
  | "wedgeRectCallout"
  | "wedgeRoundRectCallout"
  | "downArrow"
  | "upArrow"
  | "upDownArrow";

export function computePresentationFit(
  viewport: PresentationSize,
  frame: PresentationSize,
  options: { padding?: number; zoom?: number } = {},
): PresentationFit {
  const padding = options.padding ?? FIT_PADDING;
  const zoom = clamp(options.zoom ?? 1, MIN_ZOOM, MAX_ZOOM);
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    frame.width <= 0 ||
    frame.height <= 0
  ) {
    return { height: 0, scale: 0, width: 0 };
  }

  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const fitScale = Math.min(
    availableWidth / frame.width,
    availableHeight / frame.height,
  );
  const scale = Math.max(0.05, fitScale) * zoom;
  return {
    height: frame.height * scale,
    scale,
    width: frame.width * scale,
  };
}

export function applyPresentationLayoutInheritance(
  slide: RecordValue,
  layouts: RecordValue[],
): RecordValue {
  if (layouts.length === 0) return slide;

  const layoutChain = presentationLayoutChain(slide, layouts);
  if (layoutChain.length === 0) return slide;

  const inheritedBackground = [...layoutChain]
    .reverse()
    .map((layout) => asRecord(layout.background))
    .find((background) => background != null);
  const elements = asArray(slide.elements)
    .map(asRecord)
    .filter((element): element is RecordValue => element != null)
    .map((element) =>
      materializeSlidePlaceholderText(
        applyElementLayoutInheritance(element, layoutChain),
        slide,
      ),
    );
  const inheritedElements = layoutChain
    .flatMap(layoutRenderableElements)
    .map((element) =>
      materializeSlidePlaceholderText(
        applyElementLayoutInheritance(element, layoutChain),
        slide,
      ),
    );

  return {
    ...slide,
    ...(slide.background == null && inheritedBackground
      ? { background: inheritedBackground }
      : {}),
    elements: [...inheritedElements, ...elements],
  };
}

function materializeSlidePlaceholderText(element: RecordValue, slide: RecordValue): RecordValue {
  if (normalizedPlaceholderType(element) !== "sldnum") return element;
  if (paragraphsHaveText(asArray(element.paragraphs))) return element;

  const slideIndex = asNumber(slide.index);
  if (slideIndex <= 0) return element;
  return {
    ...element,
    paragraphs: [
      {
        runs: [{ text: String(slideIndex) }],
      },
    ],
  };
}

function paragraphsHaveText(paragraphs: unknown[]): boolean {
  for (const paragraph of paragraphs) {
    const runs = asArray(asRecord(paragraph)?.runs);
    for (const run of runs) {
      if (asString(asRecord(run)?.text).trim()) return true;
    }
  }
  return false;
}

export function getSlideBounds(
  slide: RecordValue,
  layouts: RecordValue[] = [],
): PresentationSize {
  const explicitBounds = explicitSlideBounds(slide);
  if (explicitBounds) return explicitBounds;

  const elements = presentationElements(slide, layouts);
  return elements.reduce<PresentationSize>(
    (acc, element) => {
      const bbox = asRecord(element.bbox);
      return {
        height: Math.max(
          acc.height,
          asNumber(bbox?.yEmu) + Math.max(0, asNumber(bbox?.heightEmu)),
        ),
        width: Math.max(
          acc.width,
          asNumber(bbox?.xEmu) + Math.max(0, asNumber(bbox?.widthEmu)),
        ),
      };
    },
    { ...DEFAULT_SLIDE_BOUNDS },
  );
}

function explicitSlideBounds(slide: RecordValue): PresentationSize | null {
  const width = asNumber(slide.widthEmu);
  const height = asNumber(slide.heightEmu);
  if (width > 0 && height > 0) {
    return { height, width };
  }
  return null;
}

export function getSlideFrameSize(
  slide: RecordValue,
  layouts: RecordValue[] = [],
): PresentationSize {
  const bounds = getSlideBounds(slide, layouts);
  return {
    height: bounds.height / EMU_PER_CSS_PIXEL,
    width: bounds.width / EMU_PER_CSS_PIXEL,
  };
}

export function emuRectToCanvasRect(
  bbox: RecordValue | null,
  bounds: PresentationSize,
  canvas: PresentationSize,
): PresentationRect {
  const scaleX = canvas.width / bounds.width;
  const scaleY = canvas.height / bounds.height;
  return {
    height: asNumber(bbox?.heightEmu) * scaleY,
    left: asNumber(bbox?.xEmu) * scaleX,
    top: asNumber(bbox?.yEmu) * scaleY,
    width: asNumber(bbox?.widthEmu) * scaleX,
  };
}

export function presentationShapeKind(
  shape: RecordValue | null,
  rect: PresentationRect,
): PresentationShapeKind {
  const geometry = asNumber(shape?.geometry);
  if (
    geometry === 1 ||
    geometry === 96 ||
    geometry === 97 ||
    geometry === 98 ||
    geometry === 99 ||
    geometry === 100 ||
    geometry === 101 ||
    geometry === 102 ||
    geometry === 103
  ) {
    return "line";
  }
  if (geometry === 3 || geometry === 23) return "triangle";
  if (geometry === 4) return "rtTriangle";
  if (geometry === 26 || geometry === 28 || geometry === 29) return "roundRect";
  if (geometry === 6 || geometry === 30 || geometry === 133) return "diamond";
  if (geometry === 7 || geometry === 31 || geometry === 134 || geometry === 141)
    return "parallelogram";
  if (geometry === 8 || geometry === 144) return "trapezoid";
  if (geometry === 10 || geometry === 160) return "pentagon";
  if (geometry === 37) return "homePlate";
  if (geometry === 11 || geometry === 39 || geometry === 140) return "hexagon";
  if (geometry === 17) return "star5";
  if (geometry === 18) return "star6";
  if (geometry === 20) return "star8";
  if (geometry === 25) return "star32";
  if (geometry === 215) return "star4";
  if (geometry === 207) return "snip1Rect";
  if (geometry === 32 || geometry === 33) return "snipRect";
  if (geometry === 211) return "octagon";
  if (
    geometry === 35 ||
    geometry === 139 ||
    geometry === 143 ||
    isTransparentOutlineEllipse(shape, rect)
  ) {
    return "ellipse";
  }
  if (geometry === 38) return "chevron";
  if (geometry === 89) return "arc";
  if (geometry === 206) return "chord";
  if (geometry === 40) return "pie";
  if (geometry === 41) return "blockArc";
  if (geometry === 176) return "mathPlus";
  if (geometry === 177) return "mathEqual";
  if (geometry === 44 || geometry === 48) return "rightArrow";
  if (geometry === 45) return "leftArrow";
  if (geometry === 46) return "upArrow";
  if (geometry === 47) return "downArrow";
  if (geometry === 201) return "curvedLeftArrow";
  if (geometry === 202) return "curvedRightArrow";
  if (geometry === 203) return "curvedUpArrow";
  if (geometry === 204) return "curvedDownArrow";
  if (geometry === 205) return "uturnArrow";
  if (geometry === 50) return "bentUpArrow";
  if (geometry === 51) return "leftRightArrow";
  if (geometry === 52) return "upDownArrow";
  if (geometry === 60) return "leftRightArrowCallout";
  if (geometry === 62) return "quadArrowCallout";
  if (geometry === 63) return "bentArrow";
  if (geometry === 74 || geometry === 155) return "can";
  if (geometry === 75) return "lightningBolt";
  if (geometry === 76) return "heart";
  if (geometry === 78) return "moon";
  if (geometry === 42) return "donut";
  if (geometry === 73) return "cube";
  if (geometry === 84) return "frame";
  if (geometry === 210) return "corner";
  if (geometry === 212) return "roundRect";
  if (geometry === 213) return "halfFrame";
  if (geometry === 214) return "snip1Rect";
  if (geometry === 90) return "leftBracket";
  if (geometry === 91) return "rightBracket";
  if (geometry === 92) return "leftBrace";
  if (geometry === 93) return "rightBrace";
  if (geometry === 95 || geometry === 111) return "bracePair";
  if (geometry === 94 || geometry === 112) return "bracketPair";
  if (geometry === 87) return "diagStripe";
  if (geometry === 137 || geometry === 138) return "document";
  if (geometry === 150 || geometry === 151) return "extract";
  if (geometry === 158) return "delay";
  if (geometry === 117) return "wedgeRectCallout";
  if (geometry === 118) return "wedgeRoundRectCallout";
  if (geometry === 119) return "wedgeEllipseCallout";
  if (geometry === 120) return "cloudCallout";
  if (geometry === 208) return "teardrop";
  if (geometry === 209) return "cloud";
  return "rect";
}

export function presentationImageSourceRect(
  element: RecordValue,
  naturalSize: PresentationSize,
): PresentationImageSourceRect {
  const sourceRect = elementImageSourceRect(element);
  if (!sourceRect || naturalSize.width <= 0 || naturalSize.height <= 0) {
    return { height: naturalSize.height, width: naturalSize.width, x: 0, y: 0 };
  }

  const left = cropRatio(sourceRect.left ?? sourceRect.l);
  const top = cropRatio(sourceRect.top ?? sourceRect.t);
  const right = cropRatio(sourceRect.right ?? sourceRect.r);
  const bottom = cropRatio(sourceRect.bottom ?? sourceRect.b);
  const x = naturalSize.width * left;
  const y = naturalSize.height * top;
  const width = naturalSize.width * Math.max(0.01, 1 - left - right);
  const height = naturalSize.height * Math.max(0.01, 1 - top - bottom);
  return { height, width, x, y };
}

export function collectPresentationTypefaces(
  slides: RecordValue[],
  layouts: RecordValue[] = [],
): string[] {
  const typefaces = new Set<string>();
  for (const slide of slides) {
    for (const element of presentationElements(slide, layouts)) {
      for (const paragraph of asArray(element.paragraphs)) {
        const paragraphRecord = asRecord(paragraph);
        const paragraphStyle = asRecord(paragraphRecord?.textStyle);
        const paragraphTypeface = asString(paragraphStyle?.typeface);
        if (paragraphTypeface) typefaces.add(paragraphTypeface);

        for (const run of asArray(paragraphRecord?.runs)) {
          const runStyle = asRecord(asRecord(run)?.textStyle);
          const runTypeface = asString(runStyle?.typeface);
          if (runTypeface) typefaces.add(runTypeface);
        }
      }
    }
  }
  return Array.from(typefaces);
}

export function getPresentationElementTargets(
  slide: RecordValue,
  canvas: PresentationSize,
  layouts: RecordValue[] = [],
): PresentationElementTarget[] {
  const effectiveSlide = applyPresentationLayoutInheritance(slide, layouts);
  const bounds = getSlideBounds(effectiveSlide);
  return presentationElements(effectiveSlide)
    .map((element, index) => {
      const rect = emuRectToCanvasRect(asRecord(element.bbox), bounds, canvas);
      return {
        element,
        id: asString(element.id) || `element-${index}`,
        index,
        name:
          asString(element.name) || asString(element.id) || String(index + 1),
        rect,
      };
    })
    .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    .sort(
      (left, right) =>
        asNumber(left.element.zIndex, left.index) -
        asNumber(right.element.zIndex, right.index),
    );
}

export function presentationElements(
  slide: RecordValue,
  layouts: RecordValue[] = [],
): RecordValue[] {
  const effectiveSlide =
    layouts.length > 0
      ? applyPresentationLayoutInheritance(slide, layouts)
      : slide;
  const elements: RecordValue[] = [];

  function visit(value: unknown): void {
    const record = asRecord(value);
    if (record == null) return;
    elements.push(record);
    for (const child of asArray(record.children)) {
      visit(child);
    }
  }

  for (const element of asArray(effectiveSlide.elements)) {
    visit(element);
  }

  return elements;
}

export function presentationCanvasScale(
  bounds: PresentationSize,
  canvas: PresentationSize,
): number {
  const frameWidth = bounds.width / EMU_PER_CSS_PIXEL;
  const frameHeight = bounds.height / EMU_PER_CSS_PIXEL;
  if (frameWidth <= 0 || frameHeight <= 0) return 1;
  return Math.min(canvas.width / frameWidth, canvas.height / frameHeight);
}

function presentationLayoutChain(
  slide: RecordValue,
  layouts: RecordValue[],
): RecordValue[] {
  const byId = new Map<string, RecordValue>();
  for (const layout of layouts) {
    const id = asString(layout.id);
    if (id) byId.set(id, layout);
  }
  const chain: RecordValue[] = [];
  const visited = new Set<string>();

  function addLayout(layoutId: string): void {
    if (!layoutId || visited.has(layoutId)) return;
    const layout = byId.get(layoutId);
    if (!layout) return;

    visited.add(layoutId);
    addLayout(asString(layout.parentLayoutId));
    chain.push(layout);
  }

  addLayout(asString(slide.useLayoutId));
  return chain;
}

function applyElementLayoutInheritance(
  element: RecordValue,
  layoutChain: RecordValue[],
): RecordValue {
  const placeholderMatches = layoutChain
    .map((layout) => findMatchingPlaceholderElement(layout, element))
    .filter((match): match is RecordValue => match != null);
  const placeholderDefaults = placeholderMatches
    .reduce<RecordValue | null>(
      (acc, match) => mergeRecordDefaults(acc, match),
      null,
    );
  const mergedElement = mergeRecordDefaults(placeholderDefaults, element);
  const inheritedLevelStyles = presentationLevelStylesForElement(
    element,
    layoutChain,
  );
  const paragraphs = mergeParagraphLevelStyles(
    asArray(mergedElement.paragraphs),
    inheritedLevelStyles,
  );
  const children = asArray(mergedElement.children)
    .map(asRecord)
    .filter((child): child is RecordValue => child != null)
    .map((child) => applyElementLayoutInheritance(child, layoutChain));

  return {
    ...mergedElement,
    ...(paragraphs.length > 0 ? { paragraphs } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
}

function findMatchingPlaceholderElement(
  layout: RecordValue,
  element: RecordValue,
): RecordValue | null {
  const candidates = flattenedLayoutElements(layout);
  let best: { score: number; value: RecordValue } | null = null;
  for (const candidate of candidates) {
    const score = placeholderMatchScore(candidate, element);
    if (score > (best?.score ?? 0)) {
      best = { score, value: candidate };
    }
  }
  return best?.value ?? null;
}

function flattenedLayoutElements(layout: RecordValue): RecordValue[] {
  const elements: RecordValue[] = [];
  function visit(value: unknown): void {
    const record = asRecord(value);
    if (!record) return;
    elements.push(record);
    for (const child of asArray(record.children)) {
      visit(child);
    }
  }
  for (const element of asArray(layout.elements)) {
    visit(element);
  }
  return elements;
}

function layoutRenderableElements(layout: RecordValue): RecordValue[] {
  const elements: RecordValue[] = [];

  function visit(value: unknown): void {
    const record = asRecord(value);
    if (!record) return;
    if (!isPlaceholderElement(record)) {
      elements.push(record);
    }
    for (const child of asArray(record.children)) {
      visit(child);
    }
  }

  for (const element of asArray(layout.elements)) {
    visit(element);
  }
  return elements;
}

function isPlaceholderElement(element: RecordValue): boolean {
  return (
    normalizedPlaceholderType(element) !== "" ||
    asNumber(element.placeholderIndex, -1) >= 0
  );
}

function placeholderMatchScore(
  candidate: RecordValue,
  element: RecordValue,
): number {
  const candidateType = normalizedPlaceholderType(candidate);
  const elementType = normalizedPlaceholderType(element);
  const candidateIndex = asNumber(candidate.placeholderIndex, -1);
  const elementIndex = asNumber(element.placeholderIndex, -1);
  if (!candidateType && candidateIndex < 0) return 0;
  if (
    candidateIndex >= 0 &&
    elementIndex >= 0 &&
    candidateIndex === elementIndex &&
    candidateType === elementType
  )
    return 4;
  if (candidateIndex > 0 && elementIndex > 0 && candidateIndex === elementIndex)
    return 3;
  if (candidateType && elementType && candidateType === elementType) return 2;
  if (!elementType && candidateIndex > 0 && candidateIndex === elementIndex)
    return 1;
  return 0;
}

function presentationLevelStylesForElement(
  element: RecordValue,
  layoutChain: RecordValue[],
): RecordValue[] {
  const styleField = placeholderLevelStyleField(
    normalizedPlaceholderType(element),
  );
  const byLevel = new Map<number, RecordValue>();
  for (const layout of layoutChain) {
    for (const style of asArray(layout[styleField]).map(asRecord)) {
      if (!style) continue;
      const level = asNumber(style.level, 1);
      byLevel.set(
        level,
        mergeRecordDefaults(byLevel.get(level) ?? null, style),
      );
    }

    const placeholder = findMatchingPlaceholderElement(layout, element);
    for (const style of placeholderLevelStyles(placeholder).map(asRecord)) {
      if (!style) continue;
      const level = asNumber(style.level, 1);
      byLevel.set(
        level,
        mergeRecordDefaults(byLevel.get(level) ?? null, style),
      );
    }
  }
  return Array.from(byLevel.values());
}

function placeholderLevelStyles(
  placeholder: RecordValue | null,
): unknown[] {
  return asArray(placeholder?.levelsStyles).length > 0
    ? asArray(placeholder?.levelsStyles)
    : asArray(placeholder?.levelStyles);
}

function placeholderLevelStyleField(
  placeholderType: string,
): "bodyLevelStyles" | "otherLevelStyles" | "titleLevelStyles" {
  if (placeholderType === "title" || placeholderType === "ctrtitle")
    return "titleLevelStyles";
  if (
    placeholderType === "body" ||
    placeholderType === "subtitle" ||
    placeholderType === "obj"
  )
    return "bodyLevelStyles";
  return "otherLevelStyles";
}

function mergeParagraphLevelStyles(
  paragraphs: unknown[],
  levelStyles: RecordValue[],
): RecordValue[] {
  if (paragraphs.length === 0) return [];
  const byLevel = new Map(
    levelStyles.map((style) => [asNumber(style.level, 1), style]),
  );
  return paragraphs
    .map(asRecord)
    .filter((paragraph): paragraph is RecordValue => paragraph != null)
    .map((paragraph) => {
      const level = asNumber(
        paragraph.level,
        asNumber(asRecord(paragraph.textStyle)?.level, 1),
      );
      const style = byLevel.get(level) ?? byLevel.get(1);
      if (!style) return paragraph;

      const textStyle = mergeRecordDefaults(
        asRecord(style.textStyle),
        asRecord(paragraph.textStyle),
      );
      const paragraphStyle = mergeRecordDefaults(
        asRecord(style.paragraphStyle),
        asRecord(paragraph.paragraphStyle),
      );
      const paragraphDefaults = copyMissingParagraphStyleFields(
        style,
        paragraph,
      );
      return {
        ...mergeRecordDefaults(paragraphDefaults, paragraph),
        ...(Object.keys(textStyle).length > 0 ? { textStyle } : {}),
        ...(Object.keys(paragraphStyle).length > 0 ? { paragraphStyle } : {}),
      };
    });
}

function copyMissingParagraphStyleFields(
  style: RecordValue,
  paragraph: RecordValue,
): RecordValue {
  const copied: RecordValue = {};
  for (const key of ["spaceBefore", "spaceAfter"] as const) {
    if (paragraph[key] === undefined && style[key] !== undefined) {
      copied[key] = style[key];
    }
  }

  const paragraphStyle = asRecord(style.paragraphStyle);
  for (const key of [
    "bulletCharacter",
    "indent",
    "lineSpacing",
    "marginLeft",
  ] as const) {
    if (
      paragraph[key] === undefined &&
      paragraphStyle &&
      paragraphStyle[key] !== undefined
    ) {
      copied[key] = paragraphStyle[key];
    }
  }
  return copied;
}

function normalizedPlaceholderType(element: RecordValue): string {
  const type = asString(element.placeholderType)
    .replace(/[^a-z0-9]/giu, "")
    .toLowerCase();
  return type === "ctrtitle" ? "title" : type;
}

function mergeRecordDefaults(
  base: RecordValue | null,
  override: RecordValue | null,
): RecordValue {
  if (!base && !override) return {};
  if (!base) return { ...(override ?? {}) };
  if (!override) return { ...base };

  const result: RecordValue = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }

    if (value === null) {
      result[key] = value;
      continue;
    }

    const baseValue = result[key];
    const baseRecord = asRecord(baseValue);
    const overrideRecord = asRecord(value);
    if (
      baseRecord &&
      overrideRecord &&
      !Array.isArray(baseValue) &&
      !Array.isArray(value) &&
      key !== "fill" &&
      key !== "line"
    ) {
      result[key] = mergeRecordDefaults(baseRecord, overrideRecord);
    } else {
      result[key] = value;
    }
  }
  return result;
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

function cropRatio(value: unknown): number {
  const raw = asNumber(value);
  if (raw <= 0) return 0;
  if (raw > 1) return clamp(raw / 100_000, 0, 0.99);
  return clamp(raw, 0, 0.99);
}

function isTransparentOutlineEllipse(
  shape: RecordValue | null,
  rect: PresentationRect,
): boolean {
  const fill = fillToCss(shape?.fill);
  const line = lineToCss(shape?.line);
  if (!fill || !line.color) return false;
  const isNearSquare =
    Math.abs(rect.width - rect.height) <=
    Math.max(2, Math.min(rect.width, rect.height) * 0.03);
  return (
    isNearSquare &&
    colorAlphaFromCss(fill) === 0 &&
    sameBaseColor(fill, line.color)
  );
}

function sameBaseColor(left: string, right: string): boolean {
  return cssRgbKey(left) === cssRgbKey(right);
}

function cssRgbKey(value: string): string {
  const hex = value.match(/^#?([0-9a-f]{6})$/i);
  if (hex) return hex[1].toLowerCase();
  const rgba = parseCssColorChannels(value);
  if (!rgba) return value.toLowerCase();
  return rgba
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("");
}

function colorAlphaFromCss(value: string): number {
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
