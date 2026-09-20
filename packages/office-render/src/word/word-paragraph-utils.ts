import { type CSSProperties } from "react";

import {
  asArray,
  asNumber,
  asRecord,
  elementImageReferenceId,
  type ParagraphView,
  paragraphView,
  type RecordValue,
} from "../shared/office-preview-utils";

export function wordParagraphHasVisibleContent(paragraph: ParagraphView): boolean {
  return Boolean(paragraph.marker) || paragraph.runs.some((run) => (
    run.text.trim() !== "" || (run.referenceMarkers?.length ?? 0) > 0
  ));
}

export function wordElementsHaveRenderableContent(elements: unknown[]): boolean {
  return elements.some((element) => {
    const record = asRecord(element);
    if (!record) return false;
    if (elementImageReferenceId(record) || asRecord(record.table) || asRecord(record.chartReference)) return true;
    return asArray(record.paragraphs).some((paragraph) =>
      wordParagraphHasVisibleContent(paragraphView(paragraph, { images: new Map(), textStyles: new Map() })),
    );
  });
}

export function wordEmptyParagraphEstimatedHeight(style: RecordValue | null): number {
  const before = Math.min(4, asNumber(style?.spaceBefore) / 20);
  const after = Math.min(4, asNumber(style?.spaceAfter) / 20);
  return Math.max(2, before + after);
}

export function wordEmptyParagraphStyle(style: CSSProperties): CSSProperties {
  return {
    ...style,
    fontSize: 0,
    lineHeight: 0,
    marginBottom: Math.min(asNumber(style.marginBottom), 4),
    marginTop: Math.min(asNumber(style.marginTop), 4),
    minHeight: 2,
  };
}
