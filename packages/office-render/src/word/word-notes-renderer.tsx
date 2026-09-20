"use client";

import type { CSSProperties } from "react";

import { asArray, asRecord, asString, type OfficeTextStyleMaps, type ParagraphView, type RecordValue } from "../shared/office-preview-utils";
import { WordParagraph, wordParagraphView } from "./word-paragraph-renderer";

export function WordSupplementalNotes({
  numberingMarkers,
  referenceMarkers,
  reviewMarkTypes,
  root,
  styleMaps,
}: {
  numberingMarkers: Map<string, string>;
  referenceMarkers: Map<string, string[]>;
  reviewMarkTypes: Map<string, number>;
  root: RecordValue | null;
  styleMaps: OfficeTextStyleMaps;
}) {
  const items = wordSupplementalNoteItems(root, styleMaps, numberingMarkers, referenceMarkers, reviewMarkTypes);
  if (items.length === 0) return null;

  return (
    <section style={wordSupplementalNotesStyle}>
      {items.map((item) => (
        <div key={item.id} style={wordSupplementalNoteStyle}>
          {item.meta ? <div style={wordSupplementalNoteMetaStyle}>{item.meta}</div> : null}
          {item.paragraphs.map((paragraph, index) => (
            <WordParagraph key={paragraph.id || `${item.id}-${index}`} paragraph={paragraph} />
          ))}
        </div>
      ))}
    </section>
  );
}

function wordSupplementalNoteItems(
  root: RecordValue | null,
  styleMaps: OfficeTextStyleMaps,
  numberingMarkers: Map<string, string>,
  referenceMarkers: Map<string, string[]>,
  reviewMarkTypes: Map<string, number>,
): { id: string; meta?: string; paragraphs: ParagraphView[] }[] {
  const items: { id: string; meta?: string; paragraphs: ParagraphView[] }[] = [];

  for (const [index, footnote] of asArray(root?.footnotes).map(asRecord).entries()) {
    if (!footnote) continue;
    const paragraphs = wordSupplementalParagraphs(
      footnote,
      String(index + 1),
      styleMaps,
      numberingMarkers,
      referenceMarkers,
      reviewMarkTypes,
    );
    if (paragraphs.length > 0) {
      items.push({ id: `footnote-${asString(footnote.id) || index}`, paragraphs });
    }
  }

  for (const [index, comment] of asArray(root?.comments).map(asRecord).entries()) {
    if (!comment) continue;
    const paragraphs = wordSupplementalParagraphs(
      comment,
      `C${index + 1}`,
      styleMaps,
      numberingMarkers,
      referenceMarkers,
      reviewMarkTypes,
    );
    if (paragraphs.length > 0) {
      items.push({
        id: `comment-${asString(comment.id) || index}`,
        meta: wordCommentMeta(comment),
        paragraphs,
      });
    }
  }

  return items;
}

function wordCommentMeta(comment: RecordValue): string | undefined {
  const author = asString(comment.author);
  const initials = asString(comment.initials);
  const createdAt = asString(comment.createdAt || comment.date);
  const parts = [author, initials ? `(${initials})` : "", createdAt]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function wordFooterNeedsComputedPageNumber(elements: unknown[]): boolean {
  const text = elements.map(wordElementVisibleText).join("").trimEnd();
  return /\|\s*$/u.test(text);
}

function wordElementVisibleText(element: unknown): string {
  const record = asRecord(element);
  if (!record) return "";
  return asArray(record.paragraphs)
    .map((paragraph) => asArray(asRecord(paragraph)?.runs).map((run) => asString(asRecord(run)?.text)).join(""))
    .join("");
}

function wordSupplementalParagraphs(
  record: RecordValue,
  marker: string,
  styleMaps: OfficeTextStyleMaps,
  numberingMarkers: Map<string, string>,
  referenceMarkers: Map<string, string[]>,
  reviewMarkTypes: Map<string, number>,
): ParagraphView[] {
  return asArray(record.paragraphs).map((paragraph, index) => {
    const view = wordParagraphView(paragraph, styleMaps, numberingMarkers, referenceMarkers, reviewMarkTypes);
    return index === 0 ? { ...view, marker } : view;
  });
}

const wordSupplementalNotesStyle: CSSProperties = {
  borderTop: "1px solid #cbd5e1",
  display: "grid",
  gap: 4,
  gridRow: 3,
  marginTop: 18,
  paddingTop: 10,
};

const wordSupplementalNoteStyle: CSSProperties = { color: "#334155", fontSize: 12 };

const wordSupplementalNoteMetaStyle: CSSProperties = { color: "#64748b", fontSize: 11, fontWeight: 600, marginBottom: 2 };
