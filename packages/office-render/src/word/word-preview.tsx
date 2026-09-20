"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import {
  asArray,
  asRecord,
  asString,
  collectTextBlocks,
  elementImageReferenceId,
  type OfficeTextStyleMaps,
  type PreviewLabels,
  type RecordValue,
  useOfficeImageSources,
} from "../shared/office-preview-utils";
import {
  drawPresentationChart,
  presentationChartById,
  presentationChartReferenceId,
} from "../shared/office-chart-renderer";
import {
  wordBodyContentStyle,
  wordChartStyle,
  wordDocumentPageCssVars,
  wordDocumentPageStyleFromLayout,
  wordElementBox,
  wordImageStyle,
  wordPageContentWidthPx,
  wordPageLayout,
  wordPositionedShapeStyle,
  type WordPageLayout,
} from "./word-layout";
import { WordPageCropMarks } from "./word-crop-marks";
import { wordNumberingMarkers } from "./word-numbering";
import { WordSupplementalNotes, wordFooterNeedsComputedPageNumber } from "./word-notes-renderer";
import { WordParagraph, wordParagraphView } from "./word-paragraph-renderer";
import { wordIsPositionedShapeElement, wordPreviewPages } from "./word-pagination";
import { wordElementsHaveRenderableContent } from "./word-paragraph-utils";
import { WordTable } from "./word-table-renderer";
import { wordReferenceMarkers, wordReviewMarkTypes } from "./word-run-renderer";
import { WordPositionedTextBox, wordIsPositionedTextBoxElement } from "./word-text-box";

export function WordPreview({ labels, proto }: { labels: PreviewLabels; proto: unknown }) {
  const root = asRecord(proto);
  const elements = asArray(root?.elements);
  const charts = asArray(root?.charts).map(asRecord).filter((chart): chart is RecordValue => chart != null);
  const imageSources = useOfficeImageSources(root);
  const textStyles = new Map<string, RecordValue>();
  for (const style of asArray(root?.textStyles)) {
    const record = asRecord(style);
    const id = asString(record?.id);
    if (record && id) textStyles.set(id, record);
  }
  const styleMaps: OfficeTextStyleMaps = { textStyles, images: imageSources };
  const pages = wordPreviewPages(root, elements, styleMaps);
  const numberingMarkers = wordNumberingMarkers(elements, root, styleMaps);
  const referenceMarkers = wordReferenceMarkers(root);
  const reviewMarkTypes = wordReviewMarkTypes(root);

  const hasRenderableBlocks = pages.flatMap((page) => [...page.headerElements, ...page.elements, ...page.footerElements]).some((element) => {
    const record = asRecord(element);
    return (
      record != null &&
      (asArray(record.paragraphs).length > 0 ||
        asRecord(record.table) != null ||
        asRecord(record.chartReference) != null ||
        elementImageReferenceId(record) !== "")
    );
  });

  if (!hasRenderableBlocks) {
    const blocks = collectTextBlocks(elements.length > 0 ? elements : proto, 120);
    if (blocks.length === 0) {
      return <p style={{ color: "#64748b" }}>{labels.noDocumentBlocks}</p>;
    }

    return (
      <div data-testid="document-preview" style={{ display: "grid", gap: 10 }}>
        {blocks.map((block, index) => (
          <p key={`${block.slice(0, 24)}-${index}`} style={documentFallbackBlockStyle}>
            {block}
          </p>
        ))}
      </div>
    );
  }

  const renderedPages = pages.map((page, index) => (
    <WordDocumentPage
      charts={charts}
      elements={page.elements}
      footerElements={page.footerElements}
      headerElements={page.headerElements}
      key={page.id || index}
      numberingMarkers={numberingMarkers}
      pageNumber={index + 1}
      pageLayout={wordPageLayout(page.root)}
      pageRoot={page.root}
      referenceMarkers={referenceMarkers}
      reviewMarkTypes={reviewMarkTypes}
      supplementalRoot={index === pages.length - 1 ? root : null}
      styleMaps={styleMaps}
    />
  ));

  return pages.length > 1 ? <div style={wordDocumentStackStyle}>{renderedPages}</div> : renderedPages[0];
}

function WordDocumentPage({
  charts,
  elements,
  footerElements,
  headerElements,
  numberingMarkers,
  pageNumber,
  pageLayout,
  pageRoot,
  referenceMarkers,
  reviewMarkTypes,
  supplementalRoot,
  styleMaps,
}: {
  charts: RecordValue[];
  elements: unknown[];
  footerElements: unknown[];
  headerElements: unknown[];
  numberingMarkers: Map<string, string>;
  pageNumber: number;
  pageLayout: WordPageLayout;
  pageRoot: RecordValue | null;
  referenceMarkers: Map<string, string[]>;
  reviewMarkTypes: Map<string, number>;
  supplementalRoot: RecordValue | null;
  styleMaps: OfficeTextStyleMaps;
}) {
  return (
    <article
      data-testid="document-preview"
      style={{
        ...wordDocumentPageStyleFromLayout(pageLayout),
        ...wordDocumentPageCssVars(pageLayout),
        background: "#ffffff",
        borderColor: "#d8e0ea",
        borderRadius: 8,
        borderStyle: "solid",
        borderWidth: 1,
        boxSizing: "border-box",
        boxShadow: "0 12px 28px rgba(15, 23, 42, 0.10)",
        color: "#0f172a",
        display: "grid",
        gap: 6,
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: "auto minmax(0, 1fr) auto auto",
        isolation: "isolate",
        margin: "0 auto",
        maxWidth: "100%",
        minWidth: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <WordPageCropMarks pageLayout={pageLayout} />
      <WordSectionContent
        charts={charts}
        elements={headerElements}
        numberingMarkers={numberingMarkers}
        pageNumber={pageNumber}
        referenceMarkers={referenceMarkers}
        reviewMarkTypes={reviewMarkTypes}
        pageLayout={pageLayout}
        styleMaps={styleMaps}
        variant="header"
      />
      <section data-testid="word-body-content" style={wordBodyContentStyle(pageRoot)}>
        {elements.map((element, index) => (
          <WordElement
            charts={charts}
            element={asRecord(element) ?? {}}
            key={`${asString(asRecord(element)?.id)}-${index}`}
            numberingMarkers={numberingMarkers}
            pageLayout={pageLayout}
            referenceMarkers={referenceMarkers}
            reviewMarkTypes={reviewMarkTypes}
            styleMaps={styleMaps}
          />
        ))}
      </section>
      <WordSupplementalNotes
        numberingMarkers={numberingMarkers}
        referenceMarkers={referenceMarkers}
        reviewMarkTypes={reviewMarkTypes}
        root={supplementalRoot}
        styleMaps={styleMaps}
      />
      <WordSectionContent
        charts={charts}
        elements={footerElements}
        numberingMarkers={numberingMarkers}
        pageNumber={pageNumber}
        referenceMarkers={referenceMarkers}
        reviewMarkTypes={reviewMarkTypes}
        pageLayout={pageLayout}
        styleMaps={styleMaps}
        variant="footer"
      />
    </article>
  );
}

function WordSectionContent({
  charts,
  elements,
  numberingMarkers,
  pageNumber,
  pageLayout,
  referenceMarkers,
  reviewMarkTypes,
  styleMaps,
  variant,
}: {
  charts: RecordValue[];
  elements: unknown[];
  numberingMarkers: Map<string, string>;
  pageNumber: number;
  pageLayout: WordPageLayout;
  referenceMarkers: Map<string, string[]>;
  reviewMarkTypes: Map<string, number>;
  styleMaps: OfficeTextStyleMaps;
  variant: "footer" | "header";
}) {
  if (!wordElementsHaveRenderableContent(elements)) return null;
  const computedPageNumber =
    variant === "footer" && pageNumber > 1 && wordFooterNeedsComputedPageNumber(elements)
      ? String(pageNumber)
      : undefined;

  return (
    <section style={variant === "header" ? wordHeaderContentStyle : wordFooterContentStyle}>
      {elements.map((element, index) => (
        <WordElement
          charts={charts}
          element={asRecord(element) ?? {}}
          key={`${variant}-${asString(asRecord(element)?.id)}-${index}`}
          numberingMarkers={numberingMarkers}
          pageLayout={pageLayout}
          referenceMarkers={referenceMarkers}
          reviewMarkTypes={reviewMarkTypes}
          styleMaps={styleMaps}
          trailingText={computedPageNumber && index === elements.length - 1 ? computedPageNumber : undefined}
        />
      ))}
    </section>
  );
}

function WordElement({
  charts,
  element,
  numberingMarkers,
  pageLayout,
  referenceMarkers,
  reviewMarkTypes,
  styleMaps,
  trailingText,
}: {
  charts: RecordValue[];
  element: RecordValue;
  numberingMarkers: Map<string, string>;
  pageLayout: WordPageLayout;
  referenceMarkers: Map<string, string[]>;
  reviewMarkTypes: Map<string, number>;
  styleMaps: OfficeTextStyleMaps;
  trailingText?: string;
}) {
  const table = asRecord(element.table);
  if (table) {
    return (
      <WordTable
        element={element}
        numberingMarkers={numberingMarkers}
        pageLayout={pageLayout}
        referenceMarkers={referenceMarkers}
        reviewMarkTypes={reviewMarkTypes}
        table={table}
        styleMaps={styleMaps}
      />
    );
  }

  const imageId = elementImageReferenceId(element);
  const imageSrc = imageId ? styleMaps.images.get(imageId) : undefined;
  if (imageSrc) {
    return (
      <span
        aria-label={asString(element.name)}
        role="img"
        style={wordImageStyle(element, imageSrc, pageLayout)}
      />
    );
  }

  const chart = presentationChartById(charts, presentationChartReferenceId(element.chartReference));
  if (chart) return <WordChart chart={chart} element={element} pageLayout={pageLayout} />;

  if (wordIsPositionedShapeElement(element)) {
    return <span aria-hidden="true" data-testid="word-positioned-shape" style={wordPositionedShapeStyle(element, pageLayout)} />;
  }

  const paragraphs = asArray(element.paragraphs).map((paragraph) =>
    wordParagraphView(paragraph, styleMaps, numberingMarkers, referenceMarkers, reviewMarkTypes),
  );
  if (paragraphs.length === 0) return null;

  const paragraphElements = (
    <>
      {paragraphs.map((paragraph, index) => (
        <WordParagraph
          key={paragraph.id || index}
          paragraph={paragraph}
          trailingText={trailingText && index === paragraphs.length - 1 ? trailingText : undefined}
        />
      ))}
    </>
  );

  if (wordIsPositionedTextBoxElement(element)) {
    return <WordPositionedTextBox element={element} pageLayout={pageLayout}>{paragraphElements}</WordPositionedTextBox>;
  }

  return paragraphElements;
}

function WordChart({ chart, element, pageLayout }: { chart: RecordValue; element: RecordValue; pageLayout: WordPageLayout }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentWidth = wordPageContentWidthPx(pageLayout, 560);
  const box = wordElementBox(element, Math.min(560, contentWidth), 300, contentWidth);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(box.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(box.height * pixelRatio));
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, box.width, box.height);
    drawPresentationChart(
      context,
      chart,
      { height: box.height, left: 0, top: 0, width: box.width },
      Math.max(0.7, Math.min(1.2, box.width / 560)),
    );
  }, [box.height, box.width, chart]);

  return (
    <canvas
      aria-label={asString(chart.title) || "Chart"}
      ref={canvasRef}
      role="img"
      style={wordChartStyle(element, pageLayout)}
    />
  );
}

const wordDocumentStackStyle: CSSProperties = { display: "grid", gap: 20 };

const wordHeaderContentStyle: CSSProperties = {
  borderBottom: "1px solid #e2e8f0",
  boxSizing: "border-box",
  color: "#475569",
  fontSize: 12,
  gridRow: 1,
  marginBottom: 12,
  maxWidth: "100%",
  minWidth: 0,
  paddingBottom: 8,
  width: "100%",
};

const wordFooterContentStyle: CSSProperties = {
  borderTop: "1px solid #e2e8f0",
  boxSizing: "border-box",
  color: "#475569",
  fontSize: 12,
  gridRow: 4,
  marginTop: 12,
  maxWidth: "100%",
  minWidth: 0,
  paddingTop: 8,
  width: "100%",
};

const documentFallbackBlockStyle: CSSProperties = {
  borderBottom: "1px solid #e2e8f0",
  color: "#0f172a",
  lineHeight: 1.6,
  margin: 0,
  paddingBottom: 10,
  whiteSpace: "pre-wrap",
};
