import type { CSSProperties } from "react";

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  colorToCss,
  fillToCss,
  lineToCss,
  type RecordValue,
} from "../shared/office-preview-utils";

export const WORD_PREVIEW_CONTENT_WIDTH_PX = 720;

export type WordPageLayout = {
  heightPx: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  widthPx: number;
};

export type WordElementBox = {
  hasDecodedSize: boolean;
  height: number;
  marginLeft?: number;
  marginTop?: number;
  rawHeight: number;
  rawWidth: number;
  width: number;
};

export function wordImageStyle(
  element: RecordValue,
  imageSrc: string,
  pageLayout?: WordPageLayout,
): CSSProperties {
  const contentWidth = pageLayout ? wordPageContentWidthPx(pageLayout) : WORD_PREVIEW_CONTENT_WIDTH_PX;
  const box = wordElementBox(element, contentWidth, 280, contentWidth);
  const fullBleed = pageLayout ? wordIsFullBleedElement(element, pageLayout) : false;
  const pageOverlay = pageLayout ? wordIsPageOverlayAnchoredElement(element, pageLayout) : false;
  const topBleed = fullBleed && wordElementY(element) <= 2;

  return {
    aspectRatio: box.hasDecodedSize ? `${box.rawWidth} / ${box.rawHeight}` : undefined,
    backgroundImage: `url("${imageSrc}")`,
    backgroundPosition: wordImageBackgroundPosition(element),
    backgroundRepeat: "no-repeat",
    backgroundSize: wordImageBackgroundSize(element, box, pageLayout),
    ...wordImageLineStyle(element),
    borderRadius: wordImageBorderRadius(element, pageLayout),
    boxShadow: wordImageBoxShadow(element, pageLayout),
    boxSizing: "border-box",
    display: "block",
    height: box.hasDecodedSize ? undefined : box.height,
    left: pageOverlay && pageLayout ? wordPageAnchoredLeft(element, pageLayout, fullBleed ? pageLayout.widthPx : box.width) : undefined,
    marginLeft: pageOverlay
      ? undefined
      : fullBleed
        ? "calc(-1 * var(--word-page-padding-left, 0px))"
        : wordImageFlowMarginLeft(element, box, pageLayout),
    marginTop: pageOverlay ? undefined : topBleed ? "calc(-1 * var(--word-page-padding-top, 0px) - 16px)" : box.marginTop,
    maxHeight: box.hasDecodedSize ? undefined : 360,
    maxWidth: fullBleed ? "none" : "100%",
    position: pageOverlay ? "absolute" : undefined,
    top: pageOverlay && pageLayout ? wordPageAnchoredTop(element, pageLayout, box.height) : undefined,
    width: fullBleed && pageLayout
      ? pageLayout.widthPx
      : box.hasDecodedSize
        ? box.width
        : "100%",
    zIndex: wordImageZIndex(element, pageOverlay),
  };
}

export function wordChartStyle(element: RecordValue, pageLayout?: WordPageLayout): CSSProperties {
  const contentWidth = pageLayout ? wordPageContentWidthPx(pageLayout, 560) : WORD_PREVIEW_CONTENT_WIDTH_PX;
  const box = wordElementBox(element, Math.min(560, contentWidth), 300, contentWidth);
  return {
    display: "block",
    height: box.height,
    margin: "12px 0 18px",
    marginLeft: box.marginLeft,
    marginTop: box.marginTop,
    maxWidth: "100%",
    width: box.width,
  };
}

export function wordTableContainerStyle(element: RecordValue, pageLayout?: WordPageLayout): CSSProperties {
  const contentWidth = pageLayout ? wordPageContentWidthPx(pageLayout) : WORD_PREVIEW_CONTENT_WIDTH_PX;
  const box = wordElementBox(element, contentWidth, 0, contentWidth);
  return {
    margin: "12px 0 18px",
    marginLeft: box.marginLeft,
    marginTop: box.marginTop,
    maxWidth: "100%",
    overflowX: "auto",
    width: box.hasDecodedSize ? box.width : "100%",
  };
}

export function wordTextBoxStyle(element: RecordValue, pageLayout: WordPageLayout): CSSProperties {
  const contentWidth = wordPageContentWidthPx(pageLayout);
  const box = wordElementBox(element, contentWidth, 80, contentWidth);
  return {
    boxSizing: "border-box",
    display: "block",
    height: box.hasDecodedSize ? box.height : undefined,
    left: wordPageAnchoredLeft(element, pageLayout, box.width),
    overflow: "hidden",
    position: "absolute",
    top: wordPageAnchoredTop(element, pageLayout, box.height),
    width: box.width,
    zIndex: wordImageZIndex(element, true) ?? 2,
  };
}

export function wordPositionedShapeStyle(element: RecordValue, pageLayout: WordPageLayout): CSSProperties {
  const contentWidth = wordPageContentWidthPx(pageLayout);
  const box = wordElementBox(element, contentWidth, 80, contentWidth);
  const fullBleed = wordIsFullBleedElement(element, pageLayout);
  const pageOverlay = wordIsPageOverlayAnchoredElement(element, pageLayout);
  const width = fullBleed ? pageLayout.widthPx : box.width;
  const height = fullBleed && box.rawWidth > 0 ? box.rawHeight * (pageLayout.widthPx / box.rawWidth) : box.height;
  const line = lineToCss(element.line);
  const background = wordFillToCss(element.fill);
  return {
    backgroundColor: background,
    borderColor: line.color,
    borderStyle: line.color || asNumber(asRecord(element.line)?.widthEmu) > 0 ? "solid" : undefined,
    borderWidth: line.color || asNumber(asRecord(element.line)?.widthEmu) > 0 ? line.width : undefined,
    boxSizing: "border-box",
    display: "block",
    height: box.hasDecodedSize ? height : undefined,
    left: pageOverlay ? wordPageAnchoredLeft(element, pageLayout, width) : undefined,
    marginLeft: pageOverlay ? undefined : box.marginLeft,
    marginTop: pageOverlay ? undefined : box.marginTop,
    maxWidth: fullBleed ? "none" : "100%",
    position: pageOverlay ? "absolute" : undefined,
    top: pageOverlay ? wordPageAnchoredTop(element, pageLayout, height) : undefined,
    width,
    zIndex: wordImageZIndex(element, pageOverlay),
  };
}

export function wordBodyContentStyle(root: RecordValue | null): CSSProperties {
  const columns = wordSectionColumns(root);
  const style: CSSProperties = {
    boxSizing: "border-box",
    gridRow: 2,
    maxWidth: "100%",
    minHeight: 0,
    minWidth: 0,
    width: "100%",
  };
  if (!columns) return style;
  return {
    ...style,
    columnCount: columns.count,
    columnGap: columns.gapPx,
    columnRuleColor: columns.separator ? "#cbd5e1" : undefined,
    columnRuleStyle: columns.separator ? "solid" : undefined,
    columnRuleWidth: columns.separator ? 1 : undefined,
  };
}

export function wordDocumentPageStyle(root: RecordValue | null): CSSProperties {
  return wordDocumentPageStyleFromLayout(wordPageLayout(root));
}

export function wordDocumentPageStyleFromLayout(pageLayout: WordPageLayout): CSSProperties {
  return {
    height: pageLayout.heightPx > 0 ? Math.max(680, pageLayout.heightPx) : 680,
    paddingBottom: pageLayout.paddingBottom,
    paddingLeft: pageLayout.paddingLeft,
    paddingRight: pageLayout.paddingRight,
    paddingTop: pageLayout.paddingTop,
    width: pageLayout.widthPx > 0 ? pageLayout.widthPx : "100%",
  };
}

export function wordDocumentPageCssVars(pageLayout: WordPageLayout): CSSProperties {
  return {
    "--word-page-padding-left": `${pageLayout.paddingLeft}px`,
    "--word-page-padding-right": `${pageLayout.paddingRight}px`,
    "--word-page-padding-top": `${pageLayout.paddingTop}px`,
  } as CSSProperties;
}

export function wordPageLayout(root: RecordValue | null): WordPageLayout {
  const page = wordPageSetup(root);
  const widthPx = wordPageUnitToPx(page?.widthEmu ?? root?.widthEmu);
  const heightPx = wordPageUnitToPx(page?.heightEmu ?? root?.heightEmu);
  const margin = asRecord(page?.pageMargin);

  return {
    heightPx,
    paddingBottom: wordPageMarginPx(margin?.bottom, 56),
    paddingLeft: wordPageMarginPx(margin?.left, 64),
    paddingRight: wordPageMarginPx(margin?.right, 64),
    paddingTop: wordPageMarginPx(margin?.top, 56),
    widthPx: widthPx > 0 ? Math.max(480, Math.min(960, widthPx)) : 0,
  };
}

export function wordElementBox(
  element: RecordValue,
  fallbackWidth: number,
  fallbackHeight: number,
  containerWidth = WORD_PREVIEW_CONTENT_WIDTH_PX,
): WordElementBox {
  const box = asRecord(element.bbox);
  const rawWidth = emuToPx(box?.widthEmu);
  const rawHeight = emuToPx(box?.heightEmu);
  const xPx = emuToPx(box?.xEmu);
  const yPx = emuToPx(box?.yEmu);
  const hasDecodedSize = rawWidth > 0 && (rawHeight > 0 || fallbackHeight <= 0);
  const width = hasDecodedSize ? Math.max(24, Math.min(containerWidth, rawWidth)) : fallbackWidth;
  const height = hasDecodedSize && rawHeight > 0 ? Math.max(18, rawHeight * (width / rawWidth)) : fallbackHeight;
  const maxOffset = Math.max(0, containerWidth - width);

  return {
    hasDecodedSize,
    height,
    marginLeft: xPx > 0 ? Math.min(maxOffset, xPx) : undefined,
    marginTop: yPx > 0 ? Math.min(240, yPx) : undefined,
    rawHeight,
    rawWidth,
    width,
  };
}

export function wordIsFullBleedElement(element: RecordValue, pageLayout: WordPageLayout): boolean {
  if (pageLayout.widthPx <= 0) return false;
  const box = asRecord(element.bbox);
  const rawWidth = emuToPx(box?.widthEmu);
  const xPx = emuToPx(box?.xEmu);
  return rawWidth >= pageLayout.widthPx - 2 && Math.abs(xPx) <= 2;
}

export function wordTableRowStyle(row: RecordValue): CSSProperties {
  const height = emuToPx(row.heightEmu ?? row.height);
  return {
    height: height > 0 ? Math.max(12, Math.min(240, height)) : undefined,
  };
}

export function wordTableStyle(hasColumnWidths: boolean): CSSProperties {
  return {
    borderCollapse: "collapse",
    minWidth: "70%",
    tableLayout: hasColumnWidths ? "fixed" : "auto",
    width: "100%",
  };
}

export function wordTableCellStyle(cell: RecordValue, background: string, color: string): CSSProperties {
  return {
    backgroundColor: background,
    backgroundImage: wordTableDiagonalBorders(cell.lines),
    color,
    ...wordTableCellBorders(cell.lines),
    paddingBottom: tableCellPaddingPx(cell.marginBottom, 3),
    paddingLeft: tableCellPaddingPx(cell.marginLeft, 5),
    paddingRight: tableCellPaddingPx(cell.marginRight, 5),
    paddingTop: tableCellPaddingPx(cell.marginTop, 3),
    verticalAlign: wordVerticalAlign(cell.anchor),
  };
}

export function wordPageContentWidthPx(pageLayout: WordPageLayout, fallback = WORD_PREVIEW_CONTENT_WIDTH_PX): number {
  const contentWidth = pageLayout.widthPx - pageLayout.paddingLeft - pageLayout.paddingRight;
  return contentWidth > 0 ? Math.max(120, contentWidth) : fallback;
}

export function wordFillToCss(fill: unknown): string | undefined {
  const fillRecord = asRecord(fill);
  return fillToCss(fillRecord) ?? colorToCss(fillRecord?.color);
}

export function readableTextColor(background: string): string {
  const rgb = hexCssToRgb(background);
  if (rgb == null) return "#0f172a";
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance < 0.45 ? "#ffffff" : "#0f172a";
}

function wordImageBackgroundSize(
  element: RecordValue,
  box: WordElementBox,
  pageLayout?: WordPageLayout,
): CSSProperties["backgroundSize"] {
  const crop = wordImageCrop(element);
  if (crop) {
    return `${100 / crop.visibleWidthPercent}% ${100 / crop.visibleHeightPercent}%`;
  }

  if (pageLayout && wordIsTopCircularPortraitImage(element, pageLayout, box)) return "cover";
  return "contain";
}

function wordImageBackgroundPosition(element: RecordValue): CSSProperties["backgroundPosition"] {
  const crop = wordImageCrop(element);
  if (!crop) return "center";

  return `${crop.xPercent}% ${crop.yPercent}%`;
}

function wordImageCrop(element: RecordValue): {
  visibleHeightPercent: number;
  visibleWidthPercent: number;
  xPercent: number;
  yPercent: number;
} | null {
  const rect = asRecord(asRecord(element.fill)?.srcRect);
  if (!rect) return null;

  const left = wordCropFraction(rect.l);
  const top = wordCropFraction(rect.t);
  const right = wordCropFraction(rect.r);
  const bottom = wordCropFraction(rect.b);
  if (left === 0 && top === 0 && right === 0 && bottom === 0) return null;

  const visibleWidthPercent = Math.max(0.01, 1 - left - right);
  const visibleHeightPercent = Math.max(0.01, 1 - top - bottom);
  return {
    visibleHeightPercent,
    visibleWidthPercent,
    xPercent: left + right > 0 ? (left / (left + right)) * 100 : 50,
    yPercent: top + bottom > 0 ? (top / (top + bottom)) * 100 : 50,
  };
}

function wordCropFraction(value: unknown): number {
  const percentage = asNumber(value);
  if (!Number.isFinite(percentage) || percentage <= 0) return 0;
  return Math.min(0.99, percentage / 100_000);
}

function wordImageBorderRadius(element: RecordValue, pageLayout?: WordPageLayout): CSSProperties["borderRadius"] {
  if (!pageLayout) return undefined;
  return wordIsTopCircularPortraitImage(element, pageLayout) ? "50%" : undefined;
}

function wordImageBoxShadow(element: RecordValue, pageLayout?: WordPageLayout): CSSProperties["boxShadow"] {
  const protocolShadow = wordImageProtocolShadow(element);
  const portraitShadow = pageLayout && wordIsTopCircularPortraitImage(element, pageLayout)
    ? "inset 0 0 0 3px #ffffff, 0 0 0 2px rgba(71, 85, 105, 0.75)"
    : undefined;
  return [portraitShadow, protocolShadow].filter(Boolean).join(", ") || undefined;
}

function wordImageLineStyle(element: RecordValue): Pick<CSSProperties, "borderColor" | "borderStyle" | "borderWidth"> {
  const line = asRecord(element.line);
  if (!line) return {};

  const border = lineToCss(line);
  if (!border.color && asNumber(line.widthEmu) <= 0) return {};
  return {
    borderColor: border.color ?? "#0f172a",
    borderStyle: "solid",
    borderWidth: border.width,
  };
}

function wordImageProtocolShadow(element: RecordValue): string | undefined {
  for (const effect of asArray(element.effects)) {
    const shadow = asRecord(asRecord(effect)?.shadow);
    const color = colorToCss(shadow?.color);
    if (!shadow || !color) continue;

    const distance = emuToPx(shadow.distance);
    const direction = (asNumber(shadow.direction) / 60_000 / 180) * Math.PI;
    return `${formatCssPx(Math.cos(direction) * distance)} ${formatCssPx(Math.sin(direction) * distance)} ${formatCssPx(emuToPx(shadow.blurRadius))} ${color}`;
  }

  return undefined;
}

function wordImageZIndex(element: RecordValue, pageOverlay: boolean): CSSProperties["zIndex"] {
  if (!pageOverlay) return undefined;

  const decoded = asNumber(element.zIndex, 0);
  if (decoded < 0) return -1;
  if (decoded > 0) return Math.min(1000, 2 + decoded);
  return 2;
}

function wordImageFlowMarginLeft(
  element: RecordValue,
  box: WordElementBox,
  pageLayout?: WordPageLayout,
): number | undefined {
  if (!pageLayout || box.marginLeft == null) return box.marginLeft;
  if (!wordIsPageMarginAlignedTopImage(element, pageLayout)) return box.marginLeft;
  return Math.max(0, box.marginLeft - pageLayout.paddingLeft);
}

function wordIsPageFooterAnchoredElement(element: RecordValue, pageLayout: WordPageLayout): boolean {
  if (pageLayout.heightPx <= 0 || pageLayout.widthPx <= 0 || wordIsFullBleedElement(element, pageLayout)) {
    return false;
  }

  const box = asRecord(element.bbox);
  const rawWidth = emuToPx(box?.widthEmu);
  const rawHeight = emuToPx(box?.heightEmu);
  const yPx = emuToPx(box?.yEmu);
  const footerBandTop = Math.max(pageLayout.heightPx * 0.72, pageLayout.heightPx - pageLayout.paddingBottom - 180);
  return rawWidth > 0 && rawHeight > 0 && yPx >= footerBandTop && yPx + rawHeight <= pageLayout.heightPx + 4;
}

export function wordIsPageOverlayAnchoredElement(element: RecordValue, pageLayout: WordPageLayout): boolean {
  if (wordIsPageFooterAnchoredElement(element, pageLayout)) return true;
  if (wordIsTopPageAnchoredSmallImage(element, pageLayout)) return true;
  if (wordIsTopGroupedPictureChildElement(element, pageLayout)) return true;
  if (!wordIsFullBleedElement(element, pageLayout)) return false;
  const yPx = wordElementY(element);
  return yPx > 2 && yPx < pageLayout.heightPx;
}

function wordIsTopPageAnchoredSmallImage(element: RecordValue, pageLayout: WordPageLayout): boolean {
  if (wordIsFullBleedElement(element, pageLayout)) return false;
  const box = asRecord(element.bbox);
  const rawWidth = emuToPx(box?.widthEmu);
  const rawHeight = emuToPx(box?.heightEmu);
  const xPx = emuToPx(box?.xEmu);
  const yPx = emuToPx(box?.yEmu);
  return rawWidth > 0 &&
    rawHeight > 0 &&
    rawWidth <= pageLayout.widthPx * 0.28 &&
    rawHeight <= pageLayout.heightPx * 0.12 &&
    xPx >= pageLayout.paddingLeft * 0.75 &&
    yPx >= pageLayout.paddingTop * 0.8 &&
    yPx <= pageLayout.heightPx * 0.2;
}

function wordIsTopGroupedPictureChildElement(element: RecordValue, pageLayout: WordPageLayout): boolean {
  if (wordIsFullBleedElement(element, pageLayout)) return false;
  const box = asRecord(element.bbox);
  const rawWidth = emuToPx(box?.widthEmu);
  const rawHeight = emuToPx(box?.heightEmu);
  const xPx = emuToPx(box?.xEmu);
  const yPx = emuToPx(box?.yEmu);
  return rawWidth > 0 &&
    rawHeight > 0 &&
    rawWidth <= pageLayout.widthPx * 0.4 &&
    rawHeight >= pageLayout.heightPx * 0.18 &&
    rawHeight <= pageLayout.heightPx * 0.32 &&
    xPx >= pageLayout.paddingLeft &&
    xPx + rawWidth <= pageLayout.widthPx - pageLayout.paddingRight &&
    yPx >= 0 &&
    yPx <= pageLayout.heightPx * 0.08;
}

function wordIsPageMarginAlignedTopImage(element: RecordValue, pageLayout: WordPageLayout): boolean {
  if (wordIsFullBleedElement(element, pageLayout)) return false;
  const box = asRecord(element.bbox);
  const rawWidth = emuToPx(box?.widthEmu);
  const rawHeight = emuToPx(box?.heightEmu);
  const xPx = emuToPx(box?.xEmu);
  const yPx = emuToPx(box?.yEmu);
  return rawWidth > 0 &&
    rawHeight > 0 &&
    rawWidth <= pageLayout.widthPx * 0.35 &&
    rawHeight <= pageLayout.heightPx * 0.16 &&
    xPx >= pageLayout.paddingLeft * 0.75 &&
    xPx <= pageLayout.paddingLeft * 1.3 &&
    yPx <= pageLayout.heightPx * 0.32;
}

function wordIsTopCircularPortraitImage(
  element: RecordValue,
  pageLayout: WordPageLayout,
  elementBox?: WordElementBox,
): boolean {
  if (!wordIsPageMarginAlignedTopImage(element, pageLayout)) return false;
  const box = elementBox ?? wordElementBox(element, wordPageContentWidthPx(pageLayout), 280, wordPageContentWidthPx(pageLayout));
  const aspectRatio = box.rawWidth > 0 && box.rawHeight > 0 ? box.rawWidth / box.rawHeight : box.width / box.height;
  return box.width >= 72 &&
    box.width <= 180 &&
    box.height >= 72 &&
    box.height <= 180 &&
    aspectRatio >= 0.85 &&
    aspectRatio <= 1.15;
}

function wordPageAnchoredLeft(element: RecordValue, pageLayout: WordPageLayout, width: number): number {
  const xPx = emuToPx(asRecord(element.bbox)?.xEmu);
  if (wordIsFullBleedElement(element, pageLayout)) return 0;
  const maxLeft = pageLayout.widthPx - width;
  return Math.max(0, Math.min(maxLeft, xPx));
}

function wordPageAnchoredTop(element: RecordValue, pageLayout: WordPageLayout, height: number): number {
  const yPx = emuToPx(asRecord(element.bbox)?.yEmu);
  if (wordIsFullBleedElement(element, pageLayout) && yPx <= pageLayout.paddingTop) return 0;
  const maxTop = pageLayout.heightPx - height;
  return Math.max(0, Math.min(maxTop, yPx));
}

function wordElementY(element: RecordValue): number {
  return emuToPx(asRecord(element.bbox)?.yEmu);
}

function wordTableDiagonalBorders(lines: unknown): CSSProperties["backgroundImage"] {
  const lineRecord = asRecord(lines);
  if (lineRecord == null) return undefined;

  const gradients = [
    wordTableDiagonalBorder(lineRecord.diagonalDown ?? lineRecord.topLeftToBottomRight, "to bottom right"),
    wordTableDiagonalBorder(lineRecord.diagonalUp ?? lineRecord.topRightToBottomLeft, "to top right"),
  ].filter(Boolean);
  return gradients.length > 0 ? gradients.join(", ") : undefined;
}

function wordTableDiagonalBorder(line: unknown, direction: "to bottom right" | "to top right"): string | undefined {
  const lineRecord = asRecord(line);
  if (lineRecord == null) return undefined;

  const border = lineToCss(lineRecord);
  const color = border.color ?? "#cbd5e1";
  const halfWidth = Math.max(0.5, Math.min(3, border.width / 2));
  return `linear-gradient(${direction}, transparent calc(50% - ${halfWidth}px), ${color} calc(50% - ${halfWidth}px), ${color} calc(50% + ${halfWidth}px), transparent calc(50% + ${halfWidth}px))`;
}

function wordTableCellBorders(lines: unknown): CSSProperties {
  const lineRecord = asRecord(lines);
  if (lineRecord == null || Object.keys(lineRecord).length === 0) {
    return {
      borderColor: "#cbd5e1",
      borderStyle: "solid",
      borderWidth: 1,
    };
  }

  return {
    borderWidth: 0,
    ...wordTableBorderSide("Top", lineRecord.top),
    ...wordTableBorderSide("Right", lineRecord.right),
    ...wordTableBorderSide("Bottom", lineRecord.bottom),
    ...wordTableBorderSide("Left", lineRecord.left),
  };
}

function wordTableBorderSide(side: "Top" | "Right" | "Bottom" | "Left", line: unknown): CSSProperties {
  const lineRecord = asRecord(line);
  if (lineRecord == null) return {};

  const border = lineToCss(lineRecord);
  const css: Record<string, string | number> = {};
  css[`border${side}Color`] = border.color ?? "#cbd5e1";
  css[`border${side}Style`] = wordTableBorderStyle(lineRecord.style);
  css[`border${side}Width`] = border.width;
  return css as CSSProperties;
}

function wordTableBorderStyle(style: unknown): string {
  switch (asNumber(style)) {
    case 2:
      return "dashed";
    case 3:
      return "dotted";
    case 4:
    case 5:
      return "dashed";
    default:
      return "solid";
  }
}

function tableCellPaddingPx(value: unknown, fallback: number): number {
  const emu = asNumber(value);
  if (emu <= 0) return fallback;
  return Math.max(2, Math.min(28, emuToPx(emu)));
}

function wordVerticalAlign(anchor: unknown): CSSProperties["verticalAlign"] {
  switch (asString(anchor)) {
    case "center":
      return "middle";
    case "bottom":
      return "bottom";
    default:
      return "top";
  }
}

function wordSectionColumns(root: RecordValue | null): { count: number; gapPx?: number; separator: boolean } | null {
  const sections = asRecord(root?.columns) ? [root] : asArray(root?.sections).map(asRecord);
  for (const section of sections) {
    const columns = asRecord(section?.columns);
    const count = Math.floor(asNumber(columns?.count));
    if (count > 1) {
      const spaceTwips = asNumber(columns?.space);
      return {
        count,
        gapPx: spaceTwips > 0 ? Math.max(8, Math.min(96, spaceTwips / 15)) : undefined,
        separator: columns?.separator === true || columns?.hasSeparatorLine === true,
      };
    }
  }
  return null;
}

function wordPageSetup(root: RecordValue | null): RecordValue | null {
  const directPageSetup = asRecord(root?.pageSetup);
  if (directPageSetup) return directPageSetup;

  for (const section of asArray(root?.sections).map(asRecord)) {
    const pageSetup = asRecord(section?.pageSetup);
    if (pageSetup) return pageSetup;
  }
  return null;
}

function wordPageUnitToPx(value: unknown): number {
  const raw = asNumber(value);
  if (raw <= 0) return 0;
  return raw > 100_000 ? raw / 9_525 : raw / 15;
}

function wordPageMarginPx(value: unknown, fallback: number): number {
  const px = wordPageUnitToPx(value);
  if (px <= 0) return fallback;
  return Math.max(24, Math.min(120, px));
}

function emuToPx(value: unknown): number {
  return asNumber(value) / 9_525;
}

function formatCssPx(value: number): string {
  const rounded = Math.abs(value) < 0.01 ? 0 : Math.round(value * 100) / 100;
  return `${rounded}px`;
}

function hexCssToRgb(value: string): [number, number, number] | null {
  const match = value.match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1];
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}
