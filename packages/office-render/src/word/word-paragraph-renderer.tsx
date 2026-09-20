"use client";

import type { CSSProperties } from "react";

import {
  asNumber,
  asRecord,
  asString,
  type OfficeTextStyleMaps,
  paragraphStyle,
  type ParagraphView,
  paragraphView,
  type RecordValue,
} from "../shared/office-preview-utils";
import { wordEmptyParagraphStyle, wordParagraphHasVisibleContent } from "./word-paragraph-utils";
import { wordCssFontSize, wordEstimatedLineHeight } from "./word-pagination";
import {
  WordRun,
  wordParagraphHasTab,
  wordParagraphUsesLeaderTab,
  wordSplitParagraphRunsAtLastTab,
} from "./word-run-renderer";

export function WordParagraph({
  fallbackColor,
  paragraph,
  trailingText,
  variant = "body",
}: {
  fallbackColor?: string;
  paragraph: ParagraphView;
  trailingText?: string;
  variant?: "body" | "table";
}) {
  const style = variant === "table" ? wordTableParagraphStyle(paragraph) : wordParagraphStyle(paragraph);
  if (fallbackColor && asRecord(paragraph.style?.fill)?.color == null) {
    style.color = fallbackColor;
  }
  if (!trailingText && !wordParagraphHasVisibleContent(paragraph)) {
    return <p aria-hidden="true" style={wordEmptyParagraphStyle(style)} />;
  }

  if (wordParagraphUsesLeaderTab(paragraph, trailingText)) {
    return <WordTabbedParagraph paragraph={paragraph} style={style} trailingText={trailingText} />;
  }

  const inheritRunFont = wordIsTableOfContentsTitle(paragraph);
  return (
    <p style={style}>
      {paragraph.marker ? (
        <span aria-hidden="true" style={wordParagraphMarkerStyle(paragraph.marker)}>
          {paragraph.marker}
        </span>
      ) : null}
      {paragraph.runs.map((run, index) => (
        <WordRun inheritFont={inheritRunFont} key={run.id || index} run={run} />
      ))}
      {trailingText ? <span style={wordComputedPageNumberStyle}>{trailingText}</span> : null}
    </p>
  );
}

export function WordTabbedParagraph({
  paragraph,
  style,
  trailingText,
}: {
  paragraph: ParagraphView;
  style: CSSProperties;
  trailingText?: string;
}) {
  const { leftRuns, rightRuns } = wordSplitParagraphRunsAtLastTab(paragraph.runs);
  return (
    <p style={{ ...style, alignItems: "baseline", display: "flex", gap: 8, whiteSpace: "nowrap" }}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "clip" }}>
        {paragraph.marker ? (
          <span aria-hidden="true" style={wordParagraphMarkerStyle(paragraph.marker)}>
            {paragraph.marker}
          </span>
        ) : null}
        {leftRuns.map((run, index) => (
          <WordRun key={`${run.id || index}-left-${index}`} run={run} />
        ))}
      </span>
      <span aria-hidden="true" style={wordTabLeaderStyle} />
      <span style={{ flex: "0 0 auto", textAlign: "right" }}>
        {rightRuns.map((run, index) => (
          <WordRun key={`${run.id || index}-right-${index}`} run={run} />
        ))}
        {trailingText ? <span style={wordComputedPageNumberStyle}>{trailingText}</span> : null}
      </span>
    </p>
  );
}

export function wordParagraphView(
  paragraph: unknown,
  styleMaps: OfficeTextStyleMaps,
  numberingMarkers: Map<string, string>,
  referenceMarkers: Map<string, string[]>,
  reviewMarkTypes: Map<string, number>,
): ParagraphView {
  const view = paragraphView(paragraph, styleMaps);
  const marker = numberingMarkers.get(view.id) || asString(view.style?.bulletCharacter);
  const runs = view.runs.map((run) => ({
    ...run,
    referenceMarkers: referenceMarkers.get(run.id) ?? [],
    reviewMarkTypes: (run.reviewMarkIds ?? []).map((id) => reviewMarkTypes.get(id) ?? 0).filter((type) => type > 0),
  }));
  return marker ? { ...view, marker, runs } : { ...view, runs };
}

function wordParagraphStyle(paragraph: ParagraphView): CSSProperties {
  const style = paragraphStyle(paragraph);
  const isTitle = paragraph.styleId === "Title";
  const isHeading = /^Heading/i.test(paragraph.styleId);
  const isTocTitle = wordIsTableOfContentsTitle(paragraph);
  const fontSize = wordParagraphFontSize(paragraph, paragraph.style, isTitle, isHeading);
  const hasText = paragraph.runs.some((run) => run.text.trim() !== "");

  return {
    ...style,
    ...(paragraph.styleId === "Heading2" && hasText ? wordHeading2RuleStyle : {}),
    ...(isTocTitle ? wordTableOfContentsTitleStyle : {}),
    fontSize,
    lineHeight: wordParagraphCssLineHeight(paragraph, fontSize),
    ...(wordParagraphHasTab(paragraph) ? wordParagraphTabStopStyle : {}),
  };
}

function wordParagraphFontSize(
  paragraph: ParagraphView,
  style: RecordValue | null,
  isTitle: boolean,
  isHeading: boolean,
): number {
  if (wordIsTableOfContentsTitle(paragraph)) return wordCssFontSize(style?.fontSize, 30);
  return wordCssFontSize(style?.fontSize, isTitle ? 26 : isHeading ? 18 : 14);
}

function wordIsTableOfContentsTitle(paragraph: ParagraphView): boolean {
  const text = paragraph.runs.map((run) => run.text).join("").trim().toLowerCase();
  return text === "table of contents";
}

function wordParagraphCssLineHeight(paragraph: ParagraphView, fontSize: number): CSSProperties["lineHeight"] {
  const exactPoints = asNumber(paragraph.style?.lineSpacing);
  if (exactPoints > 0) return `${wordEstimatedLineHeight(paragraph.style, fontSize)}px`;

  const percent = asNumber(paragraph.style?.lineSpacingPercent);
  if (percent > 0) return Math.max(0.8, Math.min(3, percent / 100_000));

  return 1.35;
}

function wordTableParagraphStyle(paragraph: ParagraphView): CSSProperties {
  const style = wordParagraphStyle(paragraph);
  style.fontSize = Math.min(asNumber(style.fontSize, 10.5), 10.5);
  style.lineHeight = 1.15;
  style.marginBottom = 1;
  style.marginTop = 0;
  return style;
}

const wordHeading2RuleStyle: CSSProperties = {
  borderBottom: "1px solid #3c9faa",
  borderTop: "1px solid #3c9faa",
  marginBottom: 18,
  marginTop: 18,
  paddingBottom: 6,
  paddingTop: 6,
};

const WORD_PARAGRAPH_TAB_SIZE = 4;

const wordTableOfContentsTitleStyle: CSSProperties = {
  fontFamily: '"Bitter", Georgia, "Times New Roman", serif',
  fontWeight: 700,
  marginBottom: 28,
};

const wordParagraphTabStopStyle: CSSProperties = {
  tabSize: WORD_PARAGRAPH_TAB_SIZE,
};

const wordTabLeaderStyle: CSSProperties = {
  borderBottom: "1px dotted currentColor",
  flex: "1 1 auto",
  height: 0,
  marginBottom: "0.25em",
  minWidth: 24,
  opacity: 1,
};

function wordParagraphMarkerStyle(marker: string): CSSProperties {
  const isBullet = /^[•●○▪■o]$/u.test(marker);
  return {
    color: isBullet ? "#4aa6b2" : undefined,
    display: "inline-block",
    fontSize: isBullet ? "1.08em" : undefined,
    fontWeight: isBullet ? 700 : undefined,
    minWidth: isBullet ? "1.9em" : "2.25em",
    paddingRight: "0.35em",
    textAlign: "right",
  };
}

const wordComputedPageNumberStyle: CSSProperties = { marginLeft: 4 };
