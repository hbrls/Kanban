import type { ReactNode } from "react";

import {
  asArray,
  asNumber,
  asRecord,
  elementImageReferenceId,
  type RecordValue,
} from "../shared/office-preview-utils";
import { wordTextBoxStyle, type WordPageLayout } from "./word-layout";

export function WordPositionedTextBox({
  children,
  element,
  pageLayout,
}: {
  children: ReactNode;
  element: RecordValue;
  pageLayout: WordPageLayout;
}) {
  return (
    <div data-testid="word-text-box" style={wordTextBoxStyle(element, pageLayout)}>
      {children}
    </div>
  );
}

export function wordIsPositionedTextBoxElement(element: RecordValue): boolean {
  const bbox = asRecord(element.bbox);
  return asNumber(bbox?.widthEmu) > 0 &&
    asNumber(bbox?.heightEmu) > 0 &&
    asArray(element.paragraphs).length > 0 &&
    !elementImageReferenceId(element) &&
    asRecord(element.chartReference) == null &&
    asRecord(element.table) == null;
}
