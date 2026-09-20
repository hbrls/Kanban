import {
  asArray,
  asNumber,
  asRecord,
  asString,
  colorToCss,
  EMPTY_OFFICE_TEXT_STYLE_MAPS,
  officeFontFamily,
  paragraphView,
  type ParagraphView,
  type RecordValue,
  type TextRunView,
} from "../shared/office-preview-utils";

const PRESENTATION_POINT_TO_CSS_PIXEL = 1.333;
const POWERPOINT_DEFAULT_LINE_HEIGHT_FACTOR = 1.18;
const POWERPOINT_TIGHT_FRAME_HEIGHT = 100;
const POWERPOINT_TIGHT_LINE_HEIGHT_FACTOR = 1;
const POWERPOINT_WRAP_WIDTH_FACTOR = 1;

export type PresentationTextOverflow = "clip" | "visible";

export type PresentationSize = {
  height: number;
  width: number;
};

export type PresentationRect = PresentationSize & {
  left: number;
  top: number;
};

type DrawSegment = {
  fontSize: number;
  run: TextRunView;
  text: string;
  width: number;
  x: number;
  y: number;
};

type TextInsets = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

type TextFrameOptions = {
  autoFit: boolean;
  emuScaleX: number;
  maxHeight: number;
  maxWidth: number;
  slideScale: number;
  useParagraphSpacing: boolean;
  wrap: boolean;
};

type TextLayout = {
  height: number;
  segments: DrawSegment[];
};

export function presentationScaledFontSize(fontSize: unknown, slideScale: number, fallbackPx = 14): number {
  const raw = asNumber(fontSize);
  const pointSize = raw <= 0 ? fallbackPx : raw > 200 ? raw / 100 : raw;
  const baseFontSize = clamp(pointSize, 1, 72) * PRESENTATION_POINT_TO_CSS_PIXEL;
  return Math.max(1, baseFontSize * Math.max(0.01, slideScale));
}

export function drawPresentationTextBox({
  canvas,
  context,
  defaultTextFill,
  element,
  rect,
  slideBounds,
  slideScale,
  textOverflow,
}: {
  canvas: PresentationSize;
  context: CanvasRenderingContext2D;
  defaultTextFill?: string;
  element: RecordValue;
  rect: PresentationRect;
  slideBounds: PresentationSize;
  slideScale: number;
  textOverflow: PresentationTextOverflow;
}): void {
  const paragraphs = trimPresentationFrameParagraphs(
    asArray(element.paragraphs).map(presentationParagraphView),
  );
  if (paragraphs.length === 0) return;

  const textStyle = asRecord(element.textStyle);
  const insets = textInsets(textStyle, rect, canvas.width / slideBounds.width, canvas.height / slideBounds.height);
  const maxWidth = Math.max(1, rect.width - insets.left - insets.right);
  const maxHeight = Math.max(1, rect.height - insets.top - insets.bottom);
  const layout = layoutTextFrame(context, paragraphs, {
    autoFit: presentationTextShouldShrinkForAutoFit(textStyle?.autoFit),
    emuScaleX: canvas.width / slideBounds.width,
    maxHeight,
    maxWidth: presentationEffectiveTextMaxWidth(maxWidth, asNumber(textStyle?.wrap, 2) !== 1),
    slideScale,
    useParagraphSpacing: textStyle?.useParagraphSpacing !== false && paragraphs.length > 1,
    wrap: asNumber(textStyle?.wrap, 2) !== 1,
  });
  const verticalOffset = verticalTextOffset(asNumber(textStyle?.anchor), layout.height, maxHeight);

  context.save();
  if (textOverflow === "clip") {
    context.beginPath();
    context.rect(0, 0, rect.width, rect.height);
    context.clip();
  }
  context.textBaseline = "top";

  for (const segment of layout.segments) {
    applyRunFont(context, segment.run, segment.fontSize);
    const segmentX = insets.left + segment.x;
    const segmentY = insets.top + verticalOffset + segment.y;
    const highlight = presentationRunHighlight(segment.run.style?.scheme);
    if (highlight) {
      context.fillStyle = highlight;
      context.fillRect(
        segmentX,
        segmentY,
        segment.width,
        segment.fontSize * 1.18,
      );
    }

    context.fillStyle = presentationRunFill(
      colorToCss(asRecord(segment.run.style?.fill)?.color),
      defaultTextFill,
    );
    context.fillText(segment.text, segmentX, segmentY);
    if (segment.run.style?.underline === true) {
      const underlineY = segmentY + segment.fontSize * 1.08;
      context.beginPath();
      context.moveTo(segmentX, underlineY);
      context.lineTo(segmentX + segment.width, underlineY);
      context.lineWidth = Math.max(1, segment.fontSize / 18);
      context.strokeStyle = context.fillStyle;
      context.stroke();
    }
  }

  context.restore();
}

export function measurePresentationTextBoxHeight({
  canvas,
  context,
  element,
  rect,
  slideBounds,
  slideScale,
}: {
  canvas: PresentationSize;
  context: CanvasRenderingContext2D;
  element: RecordValue;
  rect: PresentationRect;
  slideBounds: PresentationSize;
  slideScale: number;
}): number {
  const paragraphs = trimPresentationFrameParagraphs(
    asArray(element.paragraphs).map(presentationParagraphView),
  );
  if (paragraphs.length === 0) return 0;

  const textStyle = asRecord(element.textStyle);
  const insets = textInsets(textStyle, rect, canvas.width / slideBounds.width, canvas.height / slideBounds.height);
  const maxWidth = Math.max(1, rect.width - insets.left - insets.right);
  const layout = layoutTextFrame(context, paragraphs, {
    autoFit: presentationTextShouldShrinkForAutoFit(textStyle?.autoFit),
    emuScaleX: canvas.width / slideBounds.width,
    maxHeight: Math.max(1, rect.height - insets.top - insets.bottom),
    maxWidth: presentationEffectiveTextMaxWidth(maxWidth, asNumber(textStyle?.wrap, 2) !== 1),
    slideScale,
    useParagraphSpacing: textStyle?.useParagraphSpacing !== false && paragraphs.length > 1,
    wrap: asNumber(textStyle?.wrap, 2) !== 1,
  });

  return insets.top + layout.height + insets.bottom;
}

function presentationRunHighlight(scheme: unknown): string | undefined {
  for (const part of asString(scheme).split(";")) {
    if (
      part.startsWith("__pptxHighlight:") ||
      part.startsWith("__docxHighlight:")
    ) {
      return highlightColorToCss(part.slice(part.indexOf(":") + 1));
    }
  }
  return undefined;
}

function highlightColorToCss(value: string): string | undefined {
  const normalized = value.trim().replace(/^#/u, "");
  if (/^[0-9a-f]{6}$/iu.test(normalized)) return `#${normalized}`;
  switch (normalized.toLowerCase()) {
    case "black":
      return "#000000";
    case "blue":
      return "#0000ff";
    case "cyan":
      return "#00ffff";
    case "green":
      return "#00ff00";
    case "magenta":
      return "#ff00ff";
    case "red":
      return "#ff0000";
    case "white":
      return "#ffffff";
    case "yellow":
      return "#ffff00";
    default:
      return undefined;
  }
}

function presentationRunFill(fill: string | undefined, defaultTextFill: string | undefined): string {
  if (defaultTextFill && (fill == null || isDefaultDarkTextFill(fill))) {
    return defaultTextFill;
  }
  return fill ?? defaultTextFill ?? "#0f172a";
}

function isDefaultDarkTextFill(fill: string): boolean {
  const normalized = fill.toLowerCase().replace(/\s+/gu, "");
  return normalized === "#000000" || normalized === "#0f172a" || normalized === "rgb(0,0,0)" || normalized === "rgba(0,0,0,1)";
}

function presentationParagraphView(paragraph: unknown): ParagraphView {
  const view = paragraphView(paragraph, EMPTY_OFFICE_TEXT_STYLE_MAPS);
  const paragraphTextStyle = asRecord(asRecord(paragraph)?.textStyle);
  if (!paragraphTextStyle) return view;

  const style = {
    ...view.style,
    ...paragraphTextStyle,
  };
  return {
    ...view,
    runs: view.runs.map((run) => ({
      ...run,
      style: mergeDefinedTextStyle(style, run.style),
    })),
    style,
  };
}

export function trimPresentationFrameParagraphs(paragraphs: ParagraphView[]): ParagraphView[] {
  let start = 0;
  let end = paragraphs.length;
  while (start < end && isBlankFrameEdgeParagraph(paragraphs[start]!)) start++;
  while (end > start && isBlankFrameEdgeParagraph(paragraphs[end - 1]!)) end--;
  return paragraphs.slice(start, end);
}

function isBlankFrameEdgeParagraph(paragraph: ParagraphView): boolean {
  if (paragraphBullet(paragraph)) return false;
  return paragraph.runs.every((run) => asString(run.text).trim().length === 0);
}

function mergeDefinedTextStyle(
  base: RecordValue,
  override: RecordValue | null | undefined,
): RecordValue {
  const merged: RecordValue = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  }
  return merged;
}

function layoutTextFrame(context: CanvasRenderingContext2D, paragraphs: ParagraphView[], options: TextFrameOptions): TextLayout {
  const layout = layoutTextRuns(context, paragraphs, options, 1);
  if (layout.height <= options.maxHeight || !shouldShrinkTextFrame(paragraphs, options)) {
    return layout;
  }

  let fontScale = 1;
  for (const nextScale of [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65]) {
    const nextLayout = layoutTextRuns(context, paragraphs, options, nextScale);
    fontScale = nextScale;
    if (nextLayout.height <= options.maxHeight) {
      return nextLayout;
    }
  }

  return layoutTextRuns(context, paragraphs, options, fontScale);
}

function layoutTextRuns(
  context: CanvasRenderingContext2D,
  paragraphs: ParagraphView[],
  options: TextFrameOptions,
  fontScale: number,
): TextLayout {
  const segments: DrawSegment[] = [];
  const { emuScaleX, maxWidth, slideScale, wrap } = options;
  const lineHeightFactor = presentationLineHeightFactor(options.maxHeight);
  let y = 0;
  let line: DrawSegment[] = [];
  let lineAlignment = 1;
  let lineHeight = 0;
  let lineSpacing = 1;
  let lineWidth = 0;
  let activeAlignment = 1;
  let activeLineSpacing = 1;
  let activeParagraphStartX = 0;
  let inheritedEmptyLineHeight = presentationScaledFontSize(null, slideScale);
  let paragraphStartX = 0;

  function resetLine(): void {
    line = [];
    lineAlignment = activeAlignment;
    lineHeight = 0;
    lineSpacing = activeLineSpacing;
    lineWidth = 0;
    paragraphStartX = activeParagraphStartX;
  }

  function flushLine(includeEmptyLine = false): void {
    if (line.length === 0) {
      if (includeEmptyLine) {
        y += lineHeight * lineSpacing;
      }
      resetLine();
      return;
    }

    const availableWidth = Math.max(1, maxWidth - paragraphStartX);
    const offsetX = paragraphStartX + lineAlignmentOffset(lineAlignment, lineWidth, availableWidth);
    for (const segment of line) {
      segments.push({ ...segment, x: segment.x + offsetX, y });
    }
    y += lineHeight * lineSpacing;
    resetLine();
  }

  function setParagraphOptions(paragraph: ParagraphView): void {
    activeAlignment = paragraphAlignment(paragraph);
    activeLineSpacing = paragraphLineSpacing(paragraph);
    activeParagraphStartX = paragraphStartOffset(paragraph, emuScaleX);
    if (line.length === 0 && lineWidth === 0) {
      lineAlignment = activeAlignment;
      lineSpacing = activeLineSpacing;
      paragraphStartX = activeParagraphStartX;
    }
  }

  function pushTextSegment(run: TextRunView, text: string, width: number, fontSize: number): void {
    if (line.length === 0 && lineWidth === 0) {
      lineAlignment = activeAlignment;
      lineSpacing = activeLineSpacing;
      paragraphStartX = activeParagraphStartX;
    }

    const nextLineHeight = fontSize * lineHeightFactor;
    line.push({
      fontSize,
      run,
      text,
      width,
      x: lineWidth,
      y: 0,
    });
    lineWidth += width;
    lineHeight = Math.max(lineHeight, nextLineHeight);
    inheritedEmptyLineHeight = lineHeight;
  }

  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    setParagraphOptions(paragraph);
    y += presentationParagraphSpacingPx(paragraph.style?.spaceBefore, slideScale, false);
    const bullet = paragraphBullet(paragraph);
    if (bullet) {
      const bulletRun = paragraph.runs[0] ?? { id: `${paragraph.id}-bullet`, style: paragraph.style, text: bullet };
      const bulletFontSize = runFontSize(bulletRun, slideScale, fontScale);
      applyRunFont(context, bulletRun, bulletFontSize);
      pushTextSegment(bulletRun, `${bullet} `, context.measureText(`${bullet} `).width, bulletFontSize);
    }

    if (paragraph.runs.length === 0) {
      lineHeight = Math.max(lineHeight, inheritedEmptyLineHeight);
      flushLine(true);
      y += presentationParagraphSpacingPx(
        paragraph.style?.spaceAfter,
        slideScale,
        options.useParagraphSpacing && paragraphIndex < paragraphs.length - 1,
      );
      continue;
    }

    for (const run of paragraph.runs) {
      const fontSize = runFontSize(run, slideScale, fontScale);
      applyRunFont(context, run, fontSize);
      lineHeight = Math.max(lineHeight, fontSize * lineHeightFactor);

      const tokens = textTokens(run.text);
      for (const token of tokens) {
        if (token === "\n") {
          flushLine(true);
          continue;
        }

        const tokenWidth = context.measureText(token).width;
        const availableWidth = Math.max(1, maxWidth - paragraphStartX);
        if (wrap && lineWidth > 0 && lineWidth + tokenWidth > availableWidth) {
          flushLine();
        }

        if (!wrap || tokenWidth <= availableWidth || token.trim() === "" || (lineWidth === 0 && Array.from(token).length <= 4)) {
          pushTextSegment(run, token, tokenWidth, fontSize);
          continue;
        }

        for (const char of wrapCharacters(token)) {
          const charWidth = context.measureText(char).width;
          if (lineWidth > 0 && lineWidth + charWidth > availableWidth) {
            flushLine();
          }
          pushTextSegment(run, char, charWidth, fontSize);
        }
      }
    }

    flushLine();
    y += presentationParagraphSpacingPx(
      paragraph.style?.spaceAfter,
      slideScale,
      options.useParagraphSpacing && paragraphIndex < paragraphs.length - 1,
    );
  }

  return { height: y, segments };
}

function shouldShrinkTextFrame(paragraphs: ParagraphView[], options: TextFrameOptions): boolean {
  return options.autoFit || paragraphs.some((paragraph) => presentationTextShouldShrinkForAutoFit(paragraph.style?.autoFit));
}

export function presentationTextShouldShrinkForAutoFit(autoFit: unknown): boolean {
  const record = asRecord(autoFit);
  if (record == null) return false;
  if (
    asRecord(record.normalAutoFit) != null ||
    asRecord(record.normAutoFit) != null ||
    asRecord(record.normAutofit) != null ||
    asRecord(record.normalAutofit) != null
  ) {
    return true;
  }
  if (
    asRecord(record.noAutoFit) != null ||
    asRecord(record.noAutofit) != null ||
    asRecord(record.shapeAutoFit) != null ||
    asRecord(record.shapeAutofit) != null ||
    asRecord(record.spAutoFit) != null ||
    asRecord(record.spAutofit) != null
  ) {
    return false;
  }
  return false;
}

function textInsets(
  textStyle: RecordValue | null,
  rect: PresentationRect,
  scaleX: number,
  scaleY: number,
): TextInsets {
  const defaultX = Math.max(2, Math.min(12, rect.height * 0.04));
  const defaultY = Math.max(2, Math.min(12, rect.height * 0.035));
  return {
    bottom: insetPx(textStyle?.bottomInset, scaleY, defaultY, rect.height * 0.45),
    left: insetPx(textStyle?.leftInset, scaleX, defaultX, rect.width * 0.45),
    right: insetPx(textStyle?.rightInset, scaleX, defaultX, rect.width * 0.45),
    top: insetPx(textStyle?.topInset, scaleY, defaultY, rect.height * 0.45),
  };
}

function insetPx(value: unknown, scale: number, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value <= 0) return 0;
  return clamp(value * scale, 0, max);
}

function verticalTextOffset(anchor: number, contentHeight: number, maxHeight: number): number {
  if (contentHeight >= maxHeight) return 0;
  if (anchor === 2 || anchor === 4 || anchor === 5) return (maxHeight - contentHeight) / 2;
  if (anchor === 3) return maxHeight - contentHeight;
  return 0;
}

function paragraphAlignment(paragraph: ParagraphView): number {
  const alignment = asNumber(paragraph.style?.alignment);
  return alignment > 0 ? alignment : 1;
}

function paragraphLineSpacing(paragraph: ParagraphView): number {
  const percent = asNumber(paragraph.style?.lineSpacingPercent);
  if (percent > 0) return clamp(percent / 100_000, 0.6, 3);
  const raw = asNumber(paragraph.style?.lineSpacing);
  if (raw > 10_000) return clamp(raw / 100_000, 0.6, 3);
  if (raw > 0) return clamp(raw, 0.6, 3);
  return 1;
}

function presentationLineHeightFactor(maxHeight: number): number {
  return maxHeight <= POWERPOINT_TIGHT_FRAME_HEIGHT
    ? POWERPOINT_TIGHT_LINE_HEIGHT_FACTOR
    : POWERPOINT_DEFAULT_LINE_HEIGHT_FACTOR;
}

function paragraphStartOffset(paragraph: ParagraphView, emuScaleX: number): number {
  const marginLeft = asNumber(paragraph.style?.marginLeft);
  const indent = asNumber(paragraph.style?.indent);
  return Math.max(0, (marginLeft + indent) * emuScaleX);
}

function paragraphBullet(paragraph: ParagraphView): string {
  const bullet = asString(paragraph.style?.bulletCharacter);
  return bullet.trim();
}

export function presentationEffectiveTextMaxWidth(maxWidth: number, wrap: boolean): number {
  if (!wrap) return maxWidth;
  return Math.max(1, maxWidth * POWERPOINT_WRAP_WIDTH_FACTOR);
}

export function presentationParagraphSpacingPx(
  value: unknown,
  slideScale: number,
  useDefaultParagraphSpacing = false,
): number {
  const raw = asNumber(value);
  if (raw <= 0) {
    return useDefaultParagraphSpacing ? Math.max(0, raw) * Math.max(0.01, slideScale) : 0;
  }
  return Math.min(24, raw / 20) * Math.max(0.01, slideScale);
}

function lineAlignmentOffset(alignment: number, lineWidth: number, maxWidth: number): number {
  if (alignment === 2) return Math.max(0, (maxWidth - lineWidth) / 2);
  if (alignment === 3) return Math.max(0, maxWidth - lineWidth);
  return 0;
}

function textTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const part of text.split(/(\n|\s+)/u)) {
    if (!part) continue;
    if (part === "\n") {
      tokens.push(part);
      continue;
    }
    if (/^\s+$/u.test(part)) {
      tokens.push(part);
      continue;
    }
    tokens.push(part);
  }
  return tokens;
}

function wrapCharacters(text: string): string[] {
  const chunks: string[] = [];
  for (const char of Array.from(text)) {
    if (isClosingPunctuation(char) && chunks.length > 0) {
      chunks[chunks.length - 1] += char;
      continue;
    }
    chunks.push(char);
  }
  return chunks;
}

function isClosingPunctuation(char: string): boolean {
  return /^[,.;:!?，。！？；：、）】》」』”’)]$/u.test(char);
}

function applyRunFont(context: CanvasRenderingContext2D, run: TextRunView, fontSize: number): void {
  const fontStyle = run.style?.italic === true ? "italic" : "normal";
  const fontWeight = run.style?.bold === true ? "700" : "400";
  configureCanvasTextQuality(context);
  context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${officeFontFamily(asString(run.style?.typeface))}`;
}

function configureCanvasTextQuality(context: CanvasRenderingContext2D): void {
  const qualityContext = context as CanvasRenderingContext2D & {
    fontKerning?: CanvasFontKerning;
    letterSpacing?: string;
    textRendering?: "auto" | "geometricPrecision" | "optimizeLegibility" | "optimizeSpeed";
    wordSpacing?: string;
  };
  qualityContext.fontKerning = "normal";
  qualityContext.letterSpacing = "0px";
  qualityContext.textRendering = "optimizeLegibility";
  qualityContext.wordSpacing = "0px";
}

function runFontSize(run: TextRunView, slideScale: number, fontScale = 1): number {
  return presentationScaledFontSize(run.style?.fontSize, slideScale) * fontScale;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
