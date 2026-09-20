import { measureRichInlineStats, prepareRichInline, type RichInlineItem } from "@chenglou/pretext/rich-inline";

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  bytesFromUnknown,
  cssFontSize,
  elementImageReferenceId,
  officeFontFamily,
  type OfficeTextStyleMaps,
  paragraphView,
  type ParagraphView,
  type RecordValue,
  type TextRunView,
} from "../shared/office-preview-utils";
import {
  wordElementBox,
  wordIsFullBleedElement,
  wordIsPageOverlayAnchoredElement,
  wordPageContentWidthPx,
  wordPageLayout,
  type WordPageLayout,
} from "./word-layout";
import {
  wordEmptyParagraphEstimatedHeight,
  wordElementsHaveRenderableContent,
  wordParagraphHasVisibleContent,
} from "./word-paragraph-utils";
import { wordSplitOversizedTableElements, wordTableElementEstimatedHeight } from "./word-table-pagination";
import { wordIsPositionedTextBoxElement } from "./word-text-box";

const WORD_HEADING2_RULE_ESTIMATED_EXTRA_PX = 28;
const WORD_PRETEXT_WORD_LAYOUT_COMPENSATION = 1.06;

export type WordPreviewPage = {
  elements: unknown[];
  footerElements: unknown[];
  headerElements: unknown[];
  id: string;
  root: RecordValue | null;
};

export function wordPreviewPages(
  root: RecordValue | null,
  rootElements: unknown[],
  styleMaps: OfficeTextStyleMaps,
): WordPreviewPage[] {
  const sections = asArray(root?.sections)
    .map(asRecord)
    .filter((section): section is RecordValue => section != null);
  const inheritedSectionContent = { footer: [] as unknown[], header: [] as unknown[] };
  const sectionPages = sections.map((section, index) => {
    const headerElements = wordInheritedSectionContentElements(section, "header", inheritedSectionContent);
    const footerElements = wordInheritedSectionContentElements(section, "footer", inheritedSectionContent);
    return {
      elements: asArray(section.elements),
      footerElements,
      headerElements,
      id: asString(section.id) || `section-${index + 1}`,
      root: section,
    };
  })
    .filter((page) => page.elements.length > 0);

  if (sectionPages.some((page) => page.elements.length > 0)) {
    return wordPreviewSectionPages(root, rootElements, sectionPages, styleMaps);
  }

  return wordPaginatePreviewPages([
    {
      elements: wordCollapseTinyDuplicateImages(rootElements, root),
      footerElements: wordSectionContentElements(root, "footer"),
      headerElements: wordSectionContentElements(root, "header"),
      id: "document",
      root,
    },
  ], styleMaps);
}

function wordInheritedSectionContentElements(
  section: RecordValue,
  key: "footer" | "header",
  inheritedContent: { footer: unknown[]; header: unknown[] },
): unknown[] {
  const elements = wordSectionContentElements(section, key);
  if (elements.length === 0) return inheritedContent[key];
  inheritedContent[key] = elements;
  return elements;
}

function wordPreviewSectionPages(
  root: RecordValue | null,
  rootElements: unknown[],
  sectionPages: WordPreviewPage[],
  styleMaps: OfficeTextStyleMaps,
): WordPreviewPage[] {
  if (rootElements.length === 0) {
    return wordPaginatePreviewPages(
      sectionPages.map((page) => ({ ...page, elements: wordCollapseTinyDuplicateImages(page.elements, root) })),
      styleMaps,
    );
  }

  let offset = 0;
  const pages = sectionPages.map((page, index) => {
    const nextOffset = offset + page.elements.length;
    const elements = index === sectionPages.length - 1 ? rootElements.slice(offset) : rootElements.slice(offset, nextOffset);
    offset = nextOffset;
    return { ...page, elements };
  }).filter((page) => page.elements.length > 0);

  return wordPaginatePreviewPages(
    pages.map((page) => ({ ...page, elements: wordCollapseTinyDuplicateImages(page.elements, root) })),
    styleMaps,
  );
}

function wordPaginatePreviewPages(
  pages: WordPreviewPage[],
  styleMaps: OfficeTextStyleMaps,
): WordPreviewPage[] {
  return wordMergePreviewOrphanPages(pages.flatMap((page) => wordPaginatePreviewPage(page, styleMaps)));
}

function wordPaginatePreviewPage(page: WordPreviewPage, styleMaps: OfficeTextStyleMaps): WordPreviewPage[] {
  const layout = wordPageLayout(page.root);
  const capacity = wordPageBodyCapacity(layout, page);
  const tableHeightContext = wordTableHeightContext(styleMaps, layout);
  const elements = wordSplitOversizedTableElements(page.elements, capacity, tableHeightContext);
  if (capacity <= 0 || elements.length <= 1) return [{ ...page, elements }];
  if (wordIsCoverLikeFullBleedPage(page, layout)) return [page];

  const chunks: WordPreviewPage[] = [];
  let current: unknown[] = [];
  let currentHeight = 0;

  for (const [index, element] of elements.entries()) {
    const estimatedHeight = wordElementEstimatedHeight(element, styleMaps, layout);
    const nextElement = elements[index + 1];
    const keepWithNextHeight = wordElementKeepWithNextHeight(element, nextElement, styleMaps, layout);
    const shouldBreak = current.length > 0 &&
      (currentHeight + estimatedHeight > capacity || currentHeight + estimatedHeight + keepWithNextHeight > capacity);
    if (shouldBreak) {
      chunks.push(wordPreviewPageChunk(page, chunks.length, current));
      current = [];
      currentHeight = 0;
    }

    current.push(element);
    currentHeight += estimatedHeight;
  }

  if (current.length > 0) {
    chunks.push(wordPreviewPageChunk(page, chunks.length, current));
  }

  return chunks.length > 0 ? chunks : [page];
}

function wordElementKeepWithNextHeight(
  element: unknown,
  nextElement: unknown,
  styleMaps: OfficeTextStyleMaps,
  layout: WordPageLayout,
): number {
  if (nextElement == null || !wordIsHeading2ParagraphElement(element)) return 0;
  return Math.min(32, wordElementEstimatedHeight(nextElement, styleMaps, layout));
}

function wordIsCoverLikeFullBleedPage(page: WordPreviewPage, pageLayout: WordPageLayout): boolean {
  return page.elements.length <= 12 && page.elements.some((element) => {
    const record = asRecord(element);
    return record != null && elementImageReferenceId(record) !== "" && wordIsFullBleedElement(record, pageLayout);
  });
}

function wordPreviewPageChunk(page: WordPreviewPage, index: number, elements: unknown[]): WordPreviewPage {
  return {
    ...page,
    elements,
    id: `${page.id}-page-${index + 1}`,
  };
}

function wordMergePreviewOrphanPages(pages: WordPreviewPage[]): WordPreviewPage[] {
  const merged: WordPreviewPage[] = [];
  for (const page of pages) {
    const previous = merged.at(-1);
    if (previous && wordCanMergeOrphanPage(previous, page)) {
      merged[merged.length - 1] = {
        ...previous,
        elements: [...previous.elements, ...page.elements],
      };
      continue;
    }

    merged.push(page);
  }
  return merged;
}

function wordCanMergeOrphanPage(previous: WordPreviewPage, page: WordPreviewPage): boolean {
  return wordPreviewPageBaseId(previous.id) === wordPreviewPageBaseId(page.id) &&
    page.elements.length === 1 &&
    wordIsPlainParagraphElement(page.elements[0]) &&
    !wordIsHeadingParagraphElement(page.elements[0]) &&
    wordPlainParagraphTextLength(page.elements[0]) <= WORD_ORPHAN_PARAGRAPH_MAX_TEXT_LENGTH;
}

function wordPreviewPageBaseId(id: string): string {
  return id.replace(/-page-\d+$/u, "");
}

function wordIsPlainParagraphElement(element: unknown): boolean {
  const record = asRecord(element);
  return record != null &&
    asRecord(record.table) == null &&
    asRecord(record.chartReference) == null &&
    elementImageReferenceId(record) === "" &&
    asArray(record.paragraphs).length > 0;
}

function wordIsHeadingParagraphElement(element: unknown): boolean {
  const paragraphs = asArray(asRecord(element)?.paragraphs).map(asRecord);
  return paragraphs.some((paragraph) => /^Heading/i.test(asString(paragraph?.styleId)));
}

function wordIsHeading2ParagraphElement(element: unknown): boolean {
  const paragraphs = asArray(asRecord(element)?.paragraphs).map(asRecord);
  return paragraphs.some((paragraph) => asString(paragraph?.styleId) === "Heading2");
}

function wordPlainParagraphTextLength(element: unknown): number {
  return asArray(asRecord(element)?.paragraphs).reduce<number>((total, paragraph) => {
    const runs = asArray(asRecord(paragraph)?.runs);
    return total + runs.reduce<number>((runTotal, run) => runTotal + asString(asRecord(run)?.text).trim().length, 0);
  }, 0);
}

const WORD_ORPHAN_PARAGRAPH_MAX_TEXT_LENGTH = 420;

function wordCollapseTinyDuplicateImages(elements: unknown[], root: RecordValue | null): unknown[] {
  const tinyImageIds = wordTinyImageIds(root);

  const collapsedElements: unknown[] = [];
  let previousImageBoxKey = "";
  for (const element of elements) {
    const record = asRecord(element);
    if (!record) { previousImageBoxKey = ""; collapsedElements.push(element); continue; }

    const imageId = elementImageReferenceId(record);
    if (!imageId) { previousImageBoxKey = ""; collapsedElements.push(element); continue; }

    const boxKey = wordImageBoxKey(record);
    const isTinyDuplicate = tinyImageIds.has(imageId) && boxKey !== "" && boxKey === previousImageBoxKey;
    previousImageBoxKey = boxKey;
    if (!isTinyDuplicate) collapsedElements.push(element);
  }

  return wordOrderFigureCaptionImages(collapsedElements);
}

function wordOrderFigureCaptionImages(elements: unknown[]): unknown[] {
  const orderedElements: unknown[] = [];
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];
    const nextElement = elements[index + 1];
    const followingElement = elements[index + 2];
    const record = asRecord(element);
    const nextRecord = asRecord(nextElement);
    const followingRecord = asRecord(followingElement);
    if (
      record != null &&
      nextRecord != null &&
      followingRecord != null &&
      wordIsFigureCaptionElement(record) &&
      wordIsPositionedShapeElement(nextRecord) &&
      elementImageReferenceId(followingRecord)
    ) {
      orderedElements.push(nextElement, followingElement, element);
      index += 2;
      continue;
    }

    if (record != null && nextRecord != null && wordIsFigureCaptionElement(record) && elementImageReferenceId(nextRecord)) {
      orderedElements.push(nextElement, element);
      index++;
      continue;
    }

    orderedElements.push(element);
  }
  return orderedElements;
}

function wordIsFigureCaptionElement(element: RecordValue): boolean {
  const text = asArray(element.paragraphs)
    .map((paragraph) => {
      const record = asRecord(paragraph);
      return asArray(record?.runs).map((run) => asString(asRecord(run)?.text)).join("");
    })
    .join("")
    .trim();
  return /^Figure[-\s]/i.test(text);
}

function wordTinyImageIds(root: RecordValue | null): Set<string> {
  const ids = new Set<string>();
  for (const image of asArray(root?.images).map(asRecord)) {
    const id = asString(image?.id);
    const bytes = bytesFromUnknown(image?.data ?? image?.bytes);
    if (id && bytes != null && bytes.byteLength > 0 && bytes.byteLength <= 100) {
      ids.add(id);
    }
  }
  return ids;
}

function wordImageBoxKey(element: RecordValue): string {
  const box = asRecord(element.bbox);
  const x = Math.round(asNumber(box?.xEmu));
  const y = Math.round(asNumber(box?.yEmu));
  const width = Math.round(asNumber(box?.widthEmu));
  const height = Math.round(asNumber(box?.heightEmu));
  return width > 0 && height > 0 ? `${x}:${y}:${width}:${height}` : "";
}

function wordPageBodyCapacity(layout: WordPageLayout, page: WordPreviewPage): number {
  if (layout.heightPx <= 0) return 0;
  const headerReserve = wordElementsHaveRenderableContent(page.headerElements) ? 16 : 0;
  const footerReserve = wordElementsHaveRenderableContent(page.footerElements) ? 12 : 0;
  return Math.max(180, layout.heightPx - layout.paddingTop - layout.paddingBottom - headerReserve - footerReserve);
}

function wordElementEstimatedHeight(
  element: unknown,
  styleMaps: OfficeTextStyleMaps,
  pageLayout: WordPageLayout,
): number {
  const record = asRecord(element);
  if (!record) return 0;

  if (elementImageReferenceId(record)) {
    if (wordIsPageOverlayAnchoredElement(record, pageLayout)) return 0;
    return wordEstimatedBoxHeight(record, pageLayout, 280);
  }

  if (asRecord(record.chartReference)) {
    return wordEstimatedBoxHeight(record, pageLayout, 300) + 18;
  }

  const table = asRecord(record.table);
  if (table) {
    return wordTableElementEstimatedHeight(table, wordTableHeightContext(styleMaps, pageLayout));
  }

  if (wordIsPositionedShapeElement(record)) {
    if (wordIsPageOverlayAnchoredElement(record, pageLayout)) return 0;
    return wordEstimatedBoxHeight(record, pageLayout, 80);
  }

  const paragraphs = asArray(record.paragraphs);
  if (paragraphs.length === 0) return 0;
  if (wordIsPositionedTextBoxElement(record)) return 0;
  return paragraphs.reduce<number>(
    (total, paragraph) => total + wordParagraphEstimatedHeight(paragraph, styleMaps, pageLayout),
    0,
  );
}

function wordEstimatedBoxHeight(element: RecordValue, pageLayout: WordPageLayout, fallbackHeight: number): number {
  const contentWidth = wordPageContentWidthPx(pageLayout);
  const box = wordElementBox(element, contentWidth, fallbackHeight, contentWidth);
  const fullBleed = wordIsFullBleedElement(element, pageLayout);
  const height = fullBleed && box.rawWidth > 0 ? box.rawHeight * (pageLayout.widthPx / box.rawWidth) : box.height;
  return Math.max(18, Math.min(900, height + (box.marginTop ?? 0) + 16));
}

function wordParagraphEstimatedHeight(
  paragraph: unknown,
  styleMaps: OfficeTextStyleMaps,
  pageLayout: WordPageLayout,
): number {
  const view = paragraphView(paragraph, styleMaps);
  const style = view.style;
  if (!wordParagraphHasVisibleContent(view)) {
    return wordEmptyParagraphEstimatedHeight(style);
  }

  const textLength = Math.max(1, view.runs.reduce((total, run) => total + run.text.length, 0));
  const isTitle = view.styleId === "Title";
  const isHeading = /^Heading/i.test(view.styleId);
  const isTableOfContents = view.runs.map((run) => run.text).join("").trim().toLowerCase() === "table of contents";
  const fontSize = isTableOfContents
    ? wordCssFontSize(style?.fontSize, 30)
    : wordCssFontSize(style?.fontSize, isTitle ? 26 : isHeading ? 18 : 14);
  const lineHeight = wordEstimatedLineHeight(style, fontSize);
  const contentWidth = Math.max(120, pageLayout.widthPx - pageLayout.paddingLeft - pageLayout.paddingRight);
  const averageCharWidth = Math.max(4, fontSize * 0.5);
  const charsPerLine = Math.max(8, Math.floor(contentWidth / averageCharWidth));
  const explicitLines = view.runs.reduce((count, run) => count + run.text.split("\n").length - 1, 0);
  const lines = Math.max(1, Math.ceil(textLength / charsPerLine) + explicitLines);
  const before = Math.min(32, asNumber(style?.spaceBefore) / 20);
  const after = Math.min(28, asNumber(style?.spaceAfter) / 20);
  const headingRuleReserve = view.styleId === "Heading2" ? WORD_HEADING2_RULE_ESTIMATED_EXTRA_PX : 0;
  const measuredTextHeight = wordMeasuredParagraphTextHeight(view, contentWidth, lineHeight);
  return Math.max(8, before + (measuredTextHeight ?? lines * lineHeight) + after + headingRuleReserve);
}

function wordTableHeightContext(styleMaps: OfficeTextStyleMaps, pageLayout: WordPageLayout) {
  return {
    contentWidth: Math.max(120, pageLayout.widthPx - pageLayout.paddingLeft - pageLayout.paddingRight),
    paragraphHeight: (paragraph: unknown) => wordParagraphEstimatedHeight(paragraph, styleMaps, pageLayout),
    tableParagraphHeight: (paragraph: unknown, contentWidth: number) =>
      wordTableParagraphEstimatedHeight(paragraph, styleMaps, contentWidth),
  };
}

function wordTableParagraphEstimatedHeight(
  paragraph: unknown,
  styleMaps: OfficeTextStyleMaps,
  contentWidth: number,
): number {
  const view = paragraphView(paragraph, styleMaps);
  const style = view.style;
  if (!wordParagraphHasVisibleContent(view)) return wordEmptyParagraphEstimatedHeight(style);

  const textLength = Math.max(1, view.runs.reduce((total, run) => total + run.text.length, 0));
  const fontSize = Math.min(wordCssFontSize(style?.fontSize, 10.5), 10.5);
  const lineHeight = fontSize * 1.15;
  const averageCharWidth = Math.max(4, fontSize * 0.48);
  const charsPerLine = Math.max(8, Math.floor(contentWidth / averageCharWidth));
  const explicitLines = view.runs.reduce((count, run) => count + run.text.split("\n").length - 1, 0);
  const lines = Math.max(1, Math.ceil(textLength / charsPerLine) + explicitLines);
  const measuredTextHeight = wordMeasuredParagraphTextHeight(view, contentWidth, lineHeight, fontSize);
  return Math.max(20, (measuredTextHeight ?? lines * lineHeight) + 1);
}

function wordMeasuredParagraphTextHeight(
  paragraph: ParagraphView,
  contentWidth: number,
  lineHeight: number,
  fallbackFontSize?: number,
): number | null {
  if (contentWidth <= 0 || lineHeight <= 0) return null;
  if (!wordCanUsePretextMeasurement()) return null;
  if (paragraph.runs.some((run) => run.text.includes("\n"))) return null;

  const items = wordParagraphMeasurementItems(paragraph, fallbackFontSize);
  if (items.length === 0) return null;

  try {
    const prepared = prepareRichInline(items);
    const { lineCount } = measureRichInlineStats(prepared, contentWidth);
    return Math.max(1, lineCount) * lineHeight * WORD_PRETEXT_WORD_LAYOUT_COMPENSATION;
  } catch {
    return null;
  }
}

function wordCanUsePretextMeasurement(): boolean {
  return typeof OffscreenCanvas === "function";
}

function wordParagraphMeasurementItems(paragraph: ParagraphView, fallbackFontSize?: number): RichInlineItem[] {
  const items: RichInlineItem[] = [];
  for (const run of paragraph.runs) {
    if (run.text.length === 0) continue;
    items.push({
      font: wordRunMeasurementFont(run, paragraph, fallbackFontSize),
      text: run.text,
    });
  }
  return items;
}

function wordRunMeasurementFont(run: TextRunView, paragraph: ParagraphView, fallbackFontSize?: number): string {
  const paragraphIsTitle = paragraph.styleId === "Title";
  const paragraphIsHeading = /^Heading/i.test(paragraph.styleId);
  const fontSize = run.style?.fontSize != null
    ? wordCssFontSize(run.style.fontSize, fallbackFontSize ?? 14)
    : fallbackFontSize ?? wordCssFontSize(paragraph.style?.fontSize, paragraphIsTitle ? 26 : paragraphIsHeading ? 18 : 14);
  const fontStyle = run.style?.italic === true
    ? "italic"
    : paragraph.style?.italic === true
      ? "italic"
      : "normal";
  const fontWeight = run.style?.bold === true || paragraph.style?.bold === true || paragraphIsTitle || paragraphIsHeading
    ? 700
    : 400;
  const typeface = asString(run.style?.typeface) || asString(paragraph.style?.typeface);
  return `${fontStyle} ${fontWeight} ${fontSize}px ${officeFontFamily(typeface)}`;
}

export function wordEstimatedLineHeight(style: RecordValue | null, fontSize: number): number {
  const exactPoints = asNumber(style?.lineSpacing);
  if (exactPoints > 0) return Math.max(10, Math.min(128, (exactPoints / 100) * (4 / 3)));

  const percent = asNumber(style?.lineSpacingPercent);
  if (percent > 0) return fontSize * Math.max(0.8, Math.min(3, percent / 100_000));

  return fontSize * 1.35;
}

export function wordCssFontSize(value: unknown, fallbackPx: number): number {
  const raw = asNumber(value);
  if (raw > 200) return Math.max(8, Math.min(72, (raw / 100) * (4 / 3)));
  return cssFontSize(value, fallbackPx);
}

export function wordSectionContentElements(root: RecordValue | null, key: "footer" | "header"): unknown[] {
  const directContent = asRecord(root?.[key]);
  const directElements = asArray(directContent?.elements);
  if (directElements.length > 0) return directElements;

  for (const section of asArray(root?.sections).map(asRecord)) {
    const content = asRecord(section?.[key]);
    const elements = asArray(content?.elements);
    if (elements.length > 0) return elements;
  }
  return [];
}

export function wordIsPositionedShapeElement(element: RecordValue): boolean {
  const bbox = asRecord(element.bbox);
  return asNumber(bbox?.widthEmu) > 0 &&
    asNumber(bbox?.heightEmu) > 0 &&
    asArray(element.paragraphs).length === 0 &&
    !elementImageReferenceId(element) &&
    asRecord(element.chartReference) == null &&
    asRecord(element.table) == null &&
    (asRecord(element.fill) != null || asRecord(element.line) != null);
}
