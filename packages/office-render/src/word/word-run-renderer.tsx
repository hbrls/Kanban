"use client";

import type { CSSProperties } from "react";

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  type ParagraphView,
  type RecordValue,
  type TextRunView,
  textRunStyle,
} from "../shared/office-preview-utils";
import { wordCssFontSize } from "./word-pagination";

function wordHyperlinkHref(hyperlink: unknown): string {
  const record = asRecord(hyperlink);
  const uri = asString(record?.uri);
  const action = asString(record?.action);
  return uri || action;
}

export function WordRun({ inheritFont = false, run }: { inheritFont?: boolean; run: TextRunView }) {
  const href = wordHyperlinkHref(run.hyperlink);
  const style = wordRunStyle(run, href !== "", inheritFont);
  const text = href ? (
    <a
      href={href}
      rel={run.hyperlink?.isExternal === true ? "noreferrer" : undefined}
      style={style}
      target={run.hyperlink?.isExternal === true ? "_blank" : undefined}
    >
      {run.text}
    </a>
  ) : (
    <span style={style}>{run.text}</span>
  );

  const markers = run.referenceMarkers ?? [];
  if (markers.length === 0) return text;

  return (
    <>
      {text}
      {markers.map((marker) => (
        <sup key={`${run.id}-${marker}`} style={wordReferenceMarkerStyle}>
          {marker}
        </sup>
      ))}
    </>
  );
}

export function wordParagraphHasTab(paragraph: ParagraphView): boolean {
  return paragraph.runs.some((run) => run.text.includes("\t"));
}

export function wordParagraphUsesLeaderTab(paragraph: ParagraphView, trailingText?: string): boolean {
  if (!wordParagraphHasTab(paragraph)) return false;
  if (trailingText) return true;
  const { rightRuns } = wordSplitParagraphRunsAtLastTab(paragraph.runs);
  const rightText = rightRuns.map((run) => run.text).join("").trim();
  return /^\d+$/.test(rightText);
}

export function wordSplitParagraphRunsAtLastTab(runs: TextRunView[]): { leftRuns: TextRunView[]; rightRuns: TextRunView[] } {
  const leftRuns: TextRunView[] = [];
  const rightRuns: TextRunView[] = [];
  let foundTab = false;

  for (let index = runs.length - 1; index >= 0; index--) {
    const run = runs[index];
    const tabIndex = run.text.lastIndexOf("\t");
    if (!foundTab && tabIndex >= 0) {
      const before = run.text.slice(0, tabIndex);
      const after = run.text.slice(tabIndex + 1);
      if (after) rightRuns.unshift({ ...run, id: `${run.id}-tab-right`, text: after });
      if (before) leftRuns.unshift({ ...run, id: `${run.id}-tab-left`, text: before });
      foundTab = true;
      continue;
    }

    if (foundTab) {
      leftRuns.unshift(run);
    } else {
      rightRuns.unshift(run);
    }
  }

  return { leftRuns, rightRuns };
}

function wordRunStyle(run: TextRunView, hyperlink: boolean, inheritFont = false): CSSProperties {
  const style: CSSProperties = {
    ...textRunStyle(run),
    ...wordReviewMarkStyle(run.reviewMarkTypes ?? []),
  };
  if (run.style?.fontSize != null) {
    style.fontSize = wordCssFontSize(run.style.fontSize, 14);
  }
  if (inheritFont) {
    delete style.fontFamily;
    delete style.fontSize;
    delete style.fontWeight;
  }

  if (!hyperlink || wordHyperlinkHref(run.hyperlink).startsWith("#")) return style;
  return {
    ...style,
    color: style.color ?? "#2563eb",
    textDecoration: style.textDecoration ?? "underline",
  };
}

function wordReviewMarkStyle(types: number[]): CSSProperties {
  if (types.includes(2)) return { color: "#b91c1c", textDecoration: "line-through" };
  if (types.includes(1)) return { backgroundColor: "#dcfce7", textDecoration: "underline", textDecorationColor: "#16a34a" };
  return {};
}

export function wordReviewMarkTypes(root: RecordValue | null): Map<string, number> {
  const reviewMarkTypes = new Map<string, number>();
  for (const reviewMark of asArray(root?.reviewMarks).map(asRecord)) {
    const id = asString(reviewMark?.id);
    const type = asNumber(reviewMark?.type);
    if (id && type > 0) reviewMarkTypes.set(id, type);
  }
  return reviewMarkTypes;
}

export function wordReferenceMarkers(root: RecordValue | null): Map<string, string[]> {
  const markers = new Map<string, string[]>();
  for (const [index, footnote] of asArray(root?.footnotes).map(asRecord).entries()) {
    if (!footnote) continue;
    for (const runId of asArray(footnote.referenceRunIds).map(asString).filter(Boolean)) {
      addReferenceMarker(markers, runId, String(index + 1));
    }
  }

  const commentOrder = new Map<string, number>();
  for (const [index, comment] of asArray(root?.comments).map(asRecord).entries()) {
    const id = asString(comment?.id);
    if (id) commentOrder.set(id, index + 1);
  }

  for (const reference of asArray(root?.commentReferences).map(asRecord)) {
    const commentId = asString(reference?.commentId);
    const markerIndex = commentOrder.get(commentId) ?? commentOrder.size + 1;
    for (const runId of asArray(reference?.runIds).map(asString).filter(Boolean)) {
      addReferenceMarker(markers, runId, `C${markerIndex}`);
    }
  }

  return markers;
}

function addReferenceMarker(markers: Map<string, string[]>, runId: string, marker: string): void {
  const existing = markers.get(runId) ?? [];
  if (!existing.includes(marker)) {
    markers.set(runId, [...existing, marker]);
  }
}

const wordReferenceMarkerStyle: CSSProperties = { color: "#475569", fontSize: "0.72em", marginLeft: 2 };
