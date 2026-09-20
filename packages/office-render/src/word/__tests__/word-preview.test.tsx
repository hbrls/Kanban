import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PreviewLabels } from "../../shared/office-preview-utils";
import {
  wordChartStyle,
  wordDocumentPageStyle,
  wordImageStyle,
  wordBodyContentStyle,
  wordPositionedShapeStyle,
  wordTableCellStyle,
  wordTableContainerStyle,
  wordTableRowStyle,
} from "../word-layout";
import { WordPreview } from "../word-preview";

const labels: PreviewLabels = {
  closeSlideshow: "Close",
  nextSlide: "Next",
  playSlideshow: "Play",
  previousSlide: "Previous",
  visualPreview: "Preview",
  rawJson: "JSON",
  sheet: "Sheet",
  slide: "Slide",
  noSheets: "No sheets",
  noSlides: "No slides",
  noDocumentBlocks: "No document blocks",
  showingFirstRows: "Showing rows",
  shapes: "Shapes",
  textRuns: "Text runs",
};

describe("WordPreview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses decoded DOCX table bbox, spans, and column widths", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              bbox: {
                widthEmu: 2_857_500,
                xEmu: 95_250,
              },
              table: {
                columnWidths: [1000, 3000, 2000],
                rows: [
                  {
                    heightEmu: 285_750,
                    cells: [
                      {
                        id: "cell-1",
                        gridSpan: 2,
                        paragraphs: [{ runs: [{ text: "Merged heading" }] }],
                      },
                      {
                        id: "cell-2",
                        paragraphs: [{ runs: [{ text: "Tail" }] }],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }}
      />,
    );

    const firstCell = container.querySelector("td");
    const firstRow = container.querySelector("tr");
    const tableWrapper = container.querySelector("table")?.parentElement;
    const columns = Array.from(container.querySelectorAll("col"));
    expect(firstCell?.getAttribute("colspan")).toBe("2");
    expect(firstRow?.style.height).toBe("30px");
    expect(tableWrapper?.style.width).toBe("300px");
    expect(tableWrapper?.style.marginLeft).toBe("10px");
    expect(columns.map((column) => column.getAttribute("style"))).toEqual([
      "width: 16.666666666666664%;",
      "width: 50%;",
      "width: 33.33333333333333%;",
    ]);
  });

  it("maps decoded DOCX cell margins, anchors, and borders into CSS", () => {
    const style = wordTableCellStyle(
      {
        anchor: "center",
        lines: {
          bottom: {
            style: 3,
            widthEmu: 19_050,
            fill: { color: { value: "CCCCCC" } },
          },
        },
        marginBottom: 19_050,
        marginLeft: 38_100,
        marginRight: 47_625,
        marginTop: 9_525,
      },
      "#ffffff",
      "#0f172a",
    );

    expect(style).toMatchObject({
      backgroundColor: "#ffffff",
      borderBottomColor: "#CCCCCC",
      borderBottomStyle: "dotted",
      borderBottomWidth: 2.1166666666666667,
      borderWidth: 0,
      paddingBottom: 2,
      paddingLeft: 4,
      paddingRight: 5,
      paddingTop: 2,
      verticalAlign: "middle",
    });
  });

  it("maps decoded DOCX diagonal table borders into cell backgrounds", () => {
    const style = wordTableCellStyle(
      {
        lines: {
          diagonalDown: {
            style: 1,
            widthEmu: 9_525,
            fill: { color: { value: "FF0000" } },
          },
          diagonalUp: {
            style: 1,
            widthEmu: 9_525,
            fill: { color: { value: "00AA00" } },
          },
        },
      },
      "#f8fafc",
      "#0f172a",
    );

    expect(style.backgroundColor).toBe("#f8fafc");
    expect(style.backgroundImage).toContain("linear-gradient(to bottom right");
    expect(style.backgroundImage).toContain("#FF0000");
    expect(style.backgroundImage).toContain("linear-gradient(to top right");
    expect(style.backgroundImage).toContain("#00AA00");
  });

  it("maps decoded DOCX paragraph alignment, indentation, and line spacing into CSS", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [
                {
                  paragraphStyle: {
                    alignment: 4,
                    indent: -47_625,
                    lineSpacingPercent: 150_000,
                    marginLeft: 190_500,
                  },
                  runs: [{ text: "Indented justified paragraph" }],
                },
              ],
            },
          ],
        }}
      />,
    );

    const paragraph = container.querySelector("p");
    expect(paragraph?.style.lineHeight).toBe("1.5");
    expect(paragraph?.style.marginLeft).toBe("20px");
    expect(paragraph?.style.textAlign).toBe("justify");
    expect(paragraph?.style.textIndent).toBe("-5px");
  });

  it("maps decoded DOCX style font units into CSS pixels", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [
                {
                  runs: [{ text: "10 point body" }],
                  styleId: "Body10",
                },
              ],
            },
          ],
          textStyles: [
            {
              id: "Body10",
              textStyle: { fontSize: 1000 },
            },
          ],
        }}
      />,
    );

    const paragraph = container.querySelector<HTMLElement>("p");
    const run = container.querySelector<HTMLElement>("p span");
    expect(Number.parseFloat(paragraph?.style.fontSize ?? "0")).toBeCloseTo(13.33, 1);
    expect(Number.parseFloat(run?.style.fontSize ?? "0")).toBeCloseTo(13.33, 1);
  });

  it("does not apply DOCX paragraph mark color to visible text runs", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [
                {
                  textStyle: {
                    fill: { color: { value: "FF0000" } },
                    fontSize: 1450,
                  },
                  runs: [{ text: "Paragraph mark formatting should not be visible" }],
                },
              ],
            },
          ],
        }}
      />,
    );

    const paragraph = container.querySelector<HTMLElement>("p");
    const run = container.querySelector<HTMLElement>("p span");
    expect(paragraph?.style.color).toBe("rgb(15, 23, 42)");
    expect(Number.parseFloat(paragraph?.style.fontSize ?? "0")).toBe(14);
    expect(run?.style.color).toBe("");
    expect(run?.style.fontSize).toBe("");
  });

  it("maps decoded DOCX scheme metadata into run CSS", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [
                {
                  runs: [
                    {
                      text: "highlighted caps",
                      textStyle: {
                        scheme: "__docxHighlight:yellow;__docxCaps:true;__docxEastAsiaTypeface:SimSun",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    );

    const run = container.querySelector<HTMLElement>("p span");
    expect(run?.style.backgroundColor).toBe("rgb(255, 255, 0)");
    expect(run?.style.fontFamily).toContain("SimSun");
    expect(run?.style.textTransform).toBe("uppercase");
  });

  it("uses decoded DOCX explicit false run styles to override inherited emphasis", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [
                {
                  runs: [
                    {
                      text: "Plain override",
                      textStyle: { bold: false, italic: false, underline: false },
                    },
                  ],
                  styleId: "EmphasisStyle",
                },
              ],
            },
          ],
          textStyles: [
            {
              id: "EmphasisStyle",
              textStyle: { bold: true, italic: true, underline: true },
            },
          ],
        }}
      />,
    );

    const paragraph = container.querySelector<HTMLElement>("p");
    const run = container.querySelector<HTMLElement>("p span");
    expect(paragraph?.style.fontWeight).toBe("700");
    expect(run?.style.fontStyle).toBe("normal");
    expect(run?.style.fontWeight).toBe("400");
    expect(run?.style.textDecoration).toBe("none");
  });

  it("maps decoded DOCX underline string values into run decoration", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [
                {
                  runs: [
                    { text: "Underlined", textStyle: { underline: "single" } },
                    { text: "Double", textStyle: { underline: "double" } },
                    { text: "Dotted", textStyle: { underline: "dottedHeavy" } },
                    { text: "Dashed", textStyle: { underline: "dash" } },
                    { text: "Wavy", textStyle: { underline: "wave" } },
                    { text: "Not underlined", textStyle: { underline: "none" } },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    );

    const runs = Array.from(container.querySelectorAll<HTMLElement>("p span"));
    expect(runs[0]?.style.textDecoration).toBe("underline");
    expect(runs[1]?.style.textDecoration).toBe("underline");
    expect(runs[1]?.style.textDecorationStyle).toBe("double");
    expect(runs[2]?.style.textDecorationStyle).toBe("dotted");
    expect(runs[3]?.style.textDecorationStyle).toBe("dashed");
    expect(runs[4]?.style.textDecorationStyle).toBe("wavy");
    expect(runs[5]?.style.textDecoration).toBe("none");
  });

  it("renders decoded DOCX auto-number markers in document order", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [
                {
                  id: "p1",
                  paragraphStyle: {
                    autoNumberStartAt: 3,
                    autoNumberType: "arabicPeriod",
                  },
                  runs: [{ text: "First item" }],
                },
                {
                  id: "p2",
                  paragraphStyle: {
                    autoNumberStartAt: 3,
                    autoNumberType: "arabicPeriod",
                  },
                  runs: [{ text: "Second item" }],
                },
              ],
            },
          ],
          paragraphNumberings: [
            { level: 0, numId: "list-1", paragraphId: "p1" },
            { level: 0, numId: "list-1", paragraphId: "p2" },
          ],
        }}
      />,
    );

    const paragraphs = Array.from(container.querySelectorAll("p")).map((paragraph) => paragraph.textContent);
    expect(paragraphs).toEqual(["3.First item", "4.Second item"]);
  });

  it("renders decoded DOCX bullet markers when no numbering marker is present", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [
                {
                  paragraphStyle: { bulletCharacter: "•" },
                  runs: [{ text: "Bullet item" }],
                },
              ],
            },
          ],
        }}
      />,
    );

    const marker = container.querySelector<HTMLElement>("p span");
    expect(marker?.textContent).toBe("•");
    expect(container.querySelector("p")?.textContent).toBe("•Bullet item");
  });

  it("renders decoded DOCX bullet markers from numbering definitions", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [
                {
                  id: "p-bullet",
                  runs: [{ text: "Definition bullet item" }],
                },
              ],
            },
          ],
          numberingDefinitions: [
            {
              levels: [{ level: 0, levelText: "●", numberFormat: "bullet", startAt: 1 }],
              numId: "bullet-list",
            },
          ],
          paragraphNumberings: [{ level: 0, numId: "bullet-list", paragraphId: "p-bullet" }],
        }}
      />,
    );

    const marker = container.querySelector<HTMLElement>("p span");
    expect(marker?.textContent).toBe("●");
    expect(marker?.style.color).toBe("rgb(74, 166, 178)");
  });

  it("renders decoded DOCX hyperlinks and note reference markers", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          commentReferences: [{ commentId: "12", runIds: ["run-link"] }],
          comments: [{ id: "12", paragraphs: [{ runs: [{ text: "Check this" }] }] }],
          elements: [
            {
              paragraphs: [
                {
                  runs: [
                    {
                      hyperlink: { isExternal: true, uri: "https://example.test" },
                      id: "run-link",
                      text: "Linked text",
                    },
                  ],
                },
              ],
            },
          ],
          footnotes: [{ id: "footnote-1", referenceRunIds: ["run-link"] }],
        }}
      />,
    );

    const link = container.querySelector("a");
    const markers = Array.from(container.querySelectorAll("sup")).map((marker) => marker.textContent);
    expect(link?.getAttribute("href")).toBe("https://example.test");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(markers).toEqual(["1", "C1"]);
  });

  it("renders generated DOCX TOC tabs as right-aligned page-number leaders", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [
                {
                  runs: [
                    {
                      hyperlink: { action: "#_Toc1" },
                      id: "toc-run",
                      text: "Thoughtworks approach to operations and maintenance\t3",
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    );

    const paragraph = container.querySelector<HTMLElement>("p");
    const spans = Array.from(paragraph?.querySelectorAll<HTMLElement>("span") ?? []);
    const links = Array.from(paragraph?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    expect(paragraph?.style.display).toBe("flex");
    expect(paragraph?.style.whiteSpace).toBe("nowrap");
    expect(spans[0]?.textContent).toBe("Thoughtworks approach to operations and maintenance");
    expect(spans[1]?.style.borderBottom).toBe("1px dotted");
    expect(spans[1]?.style.flex).toBe("1 1 auto");
    expect(spans[1]?.style.opacity).toBe("1");
    expect(spans[2]?.textContent).toBe("3");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["#_Toc1", "#_Toc1"]);
    expect(links[0]?.style.color).toBe("");
    expect(links[0]?.style.textDecoration).toBe("");
  });

  it("does not render ordinary DOCX tabs as TOC dotted leaders", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [{ runs: [{ text: "Label\tValue" }] }],
            },
          ],
        }}
      />,
    );

    const paragraph = container.querySelector("p");
    expect(paragraph?.textContent).toBe("Label\tValue");
    expect(paragraph?.style.display).toBe("");
    expect(paragraph?.style.tabSize).toBe("4");
    expect(container.querySelector('[style*="dotted"]')).toBeNull();
  });

  it("renders the generated DOCX TOC title with Word-like serif styling", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [{ runs: [{ text: "Table of contents" }] }],
            },
          ],
        }}
      />,
    );

    const paragraph = container.querySelector<HTMLElement>("p");
    const run = paragraph?.querySelector<HTMLElement>("span");
    expect(paragraph?.style.fontFamily).toContain("Bitter");
    expect(paragraph?.style.fontSize).toBe("30px");
    expect(paragraph?.style.marginBottom).toBe("28px");
    expect(run?.style.fontFamily).toBe("");
    expect(run?.style.fontSize).toBe("");
  });

  it("renders decoded DOCX footnote and comment bodies", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          comments: [
            {
              author: "Reviewer",
              createdAt: "2026-05-05T00:00:00.000Z",
              id: "12",
              initials: "RV",
              paragraphs: [{ runs: [{ text: "Comment body" }] }],
            },
          ],
          elements: [
            {
              paragraphs: [{ runs: [{ id: "run-main", text: "Main text" }] }],
            },
          ],
          footnotes: [{ id: "footnote-1", paragraphs: [{ runs: [{ text: "Footnote body" }] }] }],
        }}
      />,
    );

    const paragraphs = Array.from(container.querySelectorAll("p")).map((paragraph) => paragraph.textContent);
    expect(paragraphs).toEqual(["Main text", "1Footnote body", "C1Comment body"]);
    expect(container.textContent).toContain("Reviewer (RV) 2026-05-05T00:00:00.000Z");
  });

  it("renders decoded DOCX section header and footer content", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [{ runs: [{ text: "Body text" }] }],
            },
          ],
          sections: [
            {
              footer: { elements: [{ paragraphs: [{ runs: [{ text: "Footer text" }] }] }] },
              header: { elements: [{ paragraphs: [{ runs: [{ text: "Header text" }] }] }] },
            },
          ],
        }}
      />,
    );

    const paragraphs = Array.from(container.querySelectorAll("p")).map((paragraph) => paragraph.textContent);
    expect(paragraphs).toEqual(["Header text", "Body text", "Footer text"]);
  });

  it("renders Word-like page crop marks at decoded page margins", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [{ paragraphs: [{ runs: [{ text: "Body text" }] }] }],
          sections: [
            {
              elements: [{ paragraphs: [{ runs: [{ text: "Body text" }] }] }],
              pageSetup: {
                heightEmu: 10_691_470,
                pageMargin: { bottom: 1_143_000, left: 914_400, right: 914_400, top: 914_400 },
                widthEmu: 7_560_000,
              },
            },
          ],
        }}
      />,
    );

    const cropMarks = Array.from(container.querySelectorAll<HTMLElement>('[data-testid="word-page-crop-mark"]'));
    expect(cropMarks).toHaveLength(4);
    expect(cropMarks[0]?.style.left).toBe("66px");
    expect(cropMarks[0]?.style.top).toBe("66px");
    expect(cropMarks[0]?.style.borderRightWidth).toBe("2px");
    expect(cropMarks[0]?.style.borderBottomWidth).toBe("2px");
  });

  it("renders decoded DOCX section elements as separate pages", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          sections: [
            {
              elements: [{ paragraphs: [{ runs: [{ text: "Cover page" }] }] }],
              id: "section-cover",
            },
            {
              elements: [{ paragraphs: [{ runs: [{ text: "Second page" }] }] }],
              id: "section-body",
            },
          ],
        }}
      />,
    );

    const pages = Array.from(container.querySelectorAll('[data-testid="document-preview"]'));
    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.textContent)).toEqual(["Cover page", "Second page"]);
  });

  it("inherits decoded DOCX section footer content across later sections", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          sections: [
            {
              elements: [{ paragraphs: [{ runs: [{ text: "First section" }] }] }],
              footer: { elements: [{ paragraphs: [{ runs: [{ text: "Shared footer" }] }] }] },
              id: "section-first",
            },
            {
              elements: [{ paragraphs: [{ runs: [{ text: "Second section" }] }] }],
              id: "section-second",
            },
          ],
        }}
      />,
    );

    const pages = Array.from(container.querySelectorAll('[data-testid="document-preview"]'));
    expect(pages.map((page) => page.textContent)).toEqual([
      "First sectionShared footer",
      "Second sectionShared footer",
    ]);
  });

  it("renders computed DOCX footer page numbers for PAGE fields", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          sections: [
            {
              elements: [{ paragraphs: [{ runs: [{ text: "Cover" }] }] }],
              footer: { elements: [{ paragraphs: [{ runs: [{ text: "©2023 Thoughtworks |  " }] }] }] },
              id: "section-cover",
            },
            {
              elements: [{ paragraphs: [{ runs: [{ text: "Body" }] }] }],
              id: "section-body",
            },
          ],
        }}
      />,
    );

    const pages = Array.from(container.querySelectorAll('[data-testid="document-preview"]'));
    expect(pages.map((page) => page.textContent)).toEqual([
      "Cover©2023 Thoughtworks |  ",
      "Body©2023 Thoughtworks |  2",
    ]);
  });

  it("does not render empty DOCX sections as footer-only pages", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          sections: [
            {
              elements: [{ paragraphs: [{ runs: [{ text: "Body section" }] }] }],
              footer: { elements: [{ paragraphs: [{ runs: [{ text: "Shared footer" }] }] }] },
              id: "section-body",
            },
            {
              id: "section-empty",
            },
          ],
        }}
      />,
    );

    const pages = Array.from(container.querySelectorAll('[data-testid="document-preview"]'));
    expect(pages).toHaveLength(1);
    expect(pages[0]?.textContent).toBe("Body sectionShared footer");
  });

  it("does not render root element redistribution leftovers as footer-only pages", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            { paragraphs: [{ runs: [{ text: "Root body" }] }] },
          ],
          sections: [
            {
              elements: [{ paragraphs: [{ runs: [{ text: "Section body" }] }] }],
              footer: { elements: [{ paragraphs: [{ runs: [{ text: "Shared footer" }] }] }] },
              id: "section-body",
            },
            {
              elements: [{ paragraphs: [{ runs: [{ text: "No matching root body" }] }] }],
              id: "section-leftover",
            },
          ],
        }}
      />,
    );

    const pages = Array.from(container.querySelectorAll('[data-testid="document-preview"]'));
    expect(pages).toHaveLength(1);
    expect(pages[0]?.textContent).toBe("Root bodyShared footer");
  });

  it("does not give adjacent tiny duplicate image placeholders their own layout height", () => {
    const bbox = {
      heightEmu: 2_794_000,
      widthEmu: 5_731_200,
      xEmu: 914_400,
      yEmu: 0,
    };
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            { bbox, imageReference: { id: "real-image" } },
            { bbox, imageReference: { id: "tiny-placeholder" } },
          ],
          images: [
            { contentType: "image/png", data: Array.from({ length: 256 }, () => 1), id: "real-image" },
            { contentType: "image/png", data: Array.from({ length: 70 }, () => 1), id: "tiny-placeholder" },
          ],
        }}
      />,
    );

    expect(container.querySelectorAll('[role="img"]')).toHaveLength(1);
  });

  it("renders decoded DOCX figure captions after adjacent images", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            { paragraphs: [{ runs: [{ text: "\nFigure- Diagram caption" }] }] },
            {
              bbox: { heightEmu: 914_400, widthEmu: 1_828_800, xEmu: 0, yEmu: 0 },
              imageReference: { id: "diagram" },
            },
          ],
          images: [{ contentType: "image/png", data: Array.from({ length: 256 }, () => 1), id: "diagram" }],
        }}
      />,
    );

    const bodyChildren = Array.from(container.querySelector<HTMLElement>('[data-testid="word-body-content"]')?.children ?? []);
    expect(bodyChildren[0]?.getAttribute("role")).toBe("img");
    expect(bodyChildren[1]?.textContent?.trim()).toBe("Figure- Diagram caption");
  });

  it("uses section boundaries without dropping trailing root DOCX elements", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            { paragraphs: [{ runs: [{ text: "Cover page" }] }] },
            { paragraphs: [{ runs: [{ text: "Second page" }] }] },
            { paragraphs: [{ runs: [{ text: "Trailing page image caption" }] }] },
          ],
          sections: [
            {
              elements: [{ paragraphs: [{ runs: [{ text: "Cover page" }] }] }],
              id: "section-cover",
            },
            {
              elements: [{ paragraphs: [{ runs: [{ text: "Second page" }] }] }],
              id: "section-body",
            },
          ],
        }}
      />,
    );

    const pages = Array.from(container.querySelectorAll('[data-testid="document-preview"]'));
    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.textContent)).toEqual([
      "Cover page",
      "Second pageTrailing page image caption",
    ]);
  });

  it("paginates long decoded DOCX section content by page height", () => {
    const paragraphText =
      "Long section paragraph that should consume enough estimated height to continue on another visual page. ";
    const elements = Array.from({ length: 8 }, (_, index) => ({
      paragraphs: [{ runs: [{ text: `${index + 1}. ${paragraphText.repeat(3)}` }] }],
    }));
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements,
          sections: [
            {
              elements,
              id: "section-long",
              pageSetup: {
                heightEmu: 3_048_000,
                pageMargin: { bottom: 360, left: 720, right: 720, top: 360 },
                widthEmu: 4_572_000,
              },
            },
          ],
        }}
      />,
    );

    const pages = Array.from(container.querySelectorAll('[data-testid="document-preview"]'));
    expect(pages.length).toBeGreaterThan(1);
  });

  it("does not count page-overlay DOCX images as body pagination height", () => {
    const paragraphText = "Body paragraph that drives pagination after an overlaid page image. ";
    const overlay = {
      bbox: {
        heightEmu: 5_345_735,
        widthEmu: 7_560_000,
        xEmu: -1_424,
        yEmu: 5_372_100,
      },
      imageReference: { id: "airport" },
    };
    const elements = [
      overlay,
      ...Array.from({ length: 5 }, (_, index) => ({
        paragraphs: [{ runs: [{ text: `${index + 1}. ${paragraphText.repeat(4)}` }] }],
      })),
    ];

    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements,
          images: [{ contentType: "image/png", data: Array.from({ length: 256 }, () => 1), id: "airport" }],
          sections: [
            {
              elements,
              id: "section-overlay-pagination",
              pageSetup: {
                heightEmu: 10_691_470,
                pageMargin: { bottom: 1_143_000, left: 914_400, right: 914_400, top: 914_400 },
                widthEmu: 7_560_000,
              },
            },
          ],
        }}
      />,
    );

    const firstPage = container.querySelector('[data-testid="document-preview"]');
    expect(firstPage?.querySelector('[role="img"]')).not.toBeNull();
    expect(firstPage?.textContent).toContain("1. Body paragraph");
  });

  it("keeps single trailing DOCX body paragraphs with the previous visual page", () => {
    const longParagraph = "Long body paragraph that fills a page in the Word preview estimator. ".repeat(120);
    const elements = [
      { paragraphs: [{ runs: [{ text: longParagraph }] }] },
      { paragraphs: [{ runs: [{ text: longParagraph }] }] },
      { paragraphs: [{ runs: [{ text: "Trailing paragraph should not become a lone page." }] }] },
    ];
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements,
          sections: [
            {
              elements,
              id: "section-orphan",
              pageSetup: {
                heightEmu: 3_048_000,
                pageMargin: { bottom: 360, left: 720, right: 720, top: 360 },
                widthEmu: 4_572_000,
              },
            },
          ],
        }}
      />,
    );

    const pages = Array.from(container.querySelectorAll('[data-testid="document-preview"]'));
    expect(pages).toHaveLength(2);
    expect(pages[1]?.textContent).toContain("Trailing paragraph should not become a lone page.");
  });

  it("splits oversized decoded DOCX tables across preview pages", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      cells: [{ paragraphs: [{ runs: [{ text: `Row ${index + 1}` }] }] }],
    }));
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [{ table: { rows } }],
          sections: [
            {
              elements: [{ table: { rows } }],
              id: "section-table",
              pageSetup: {
                heightEmu: 2_286_000,
                pageMargin: { bottom: 360, left: 720, right: 720, top: 360 },
                widthEmu: 4_572_000,
              },
            },
          ],
        }}
      />,
    );

    const pages = Array.from(container.querySelectorAll('[data-testid="document-preview"]'));
    expect(pages.length).toBeGreaterThan(1);
    expect(container.querySelectorAll("table").length).toBeGreaterThan(1);
  });

  it("splits decoded DOCX tables using tall row content height", () => {
    const longCellText = "Tall DOCX table cell content that should affect pagination. ".repeat(20);
    const rows = Array.from({ length: 4 }, (_, index) => ({
      cells: [{ paragraphs: [{ runs: [{ text: `Row ${index + 1}. ${longCellText}` }] }] }],
    }));
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [{ table: { rows } }],
          sections: [
            {
              elements: [{ table: { rows } }],
              id: "section-tall-table-rows",
              pageSetup: {
                heightEmu: 2_286_000,
                pageMargin: { bottom: 360, left: 720, right: 720, top: 360 },
                widthEmu: 4_572_000,
              },
            },
          ],
        }}
      />,
    );

    expect(container.querySelectorAll('[data-testid="document-preview"]').length).toBeGreaterThan(1);
    expect(container.querySelectorAll("table").length).toBeGreaterThan(1);
  });

  it("maps decoded DOCX section columns into body CSS columns", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [{ runs: [{ text: "Column text" }] }],
            },
          ],
          sections: [{ columns: { count: 2, hasSeparatorLine: true, space: 720 } }],
        }}
      />,
    );

    const body = container.querySelector<HTMLElement>('[data-testid="word-body-content"]');
    expect(body?.style.columnCount).toBe("2");
    expect(body?.style.columnGap).toBe("48px");
    expect(body?.style.columnRuleStyle).toBe("solid");
  });

  it("maps decoded DOCX page setup into preview page dimensions", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [{ runs: [{ text: "Page setup text" }] }],
            },
          ],
          sections: [
            {
              pageSetup: {
                heightEmu: 15840,
                pageMargin: { bottom: 720, left: 900, right: 900, top: 720 },
                widthEmu: 10080,
              },
            },
          ],
        }}
      />,
    );

    const preview = container.querySelector<HTMLElement>('[data-testid="document-preview"]');
    expect(preview?.style.width).toBe("672px");
    expect(preview?.style.height).toBe("1056px");
    expect(preview?.style.paddingLeft).toBe("60px");
    expect(preview?.style.paddingTop).toBe("48px");
  });

  it("keeps DOCX page grid content constrained to the page content box", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [{ runs: [{ text: "Cover page text" }] }],
            },
          ],
          sections: [
            {
              pageSetup: {
                pageMargin: { left: 1440, right: 1440 },
                widthEmu: 11906 * 9525,
              },
            },
          ],
        }}
      />,
    );

    const preview = container.querySelector<HTMLElement>('[data-testid="document-preview"]');
    const body = container.querySelector<HTMLElement>('[data-testid="word-body-content"]');
    expect(preview?.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(body?.style.width).toBe("100%");
    expect(body?.style.maxWidth).toBe("100%");
    expect(body?.style.minWidth).toBe("0px");
    expect(body?.style.gridRow).toBe("2");
  });

  it("uses decoded DOCX section columns for body style", () => {
    expect(wordBodyContentStyle({ sections: [{ columns: { count: 3, hasSeparatorLine: true, space: 360 } }] })).toMatchObject({
      columnCount: 3,
      columnGap: 24,
      columnRuleStyle: "solid",
    });
  });

  it("uses decoded DOCX page setup for document page style", () => {
    expect(
      wordDocumentPageStyle({
        sections: [
          {
            pageSetup: {
              heightEmu: 15840,
              pageMargin: { bottom: 720, left: 900, right: 900, top: 720 },
              widthEmu: 10080,
            },
          },
        ],
      }),
    ).toMatchObject({
      height: 1056,
      paddingBottom: 48,
      paddingLeft: 60,
      paddingRight: 60,
      paddingTop: 48,
      width: 672,
    });
  });

  it("renders decoded DOCX insertion review marks", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              paragraphs: [
                {
                  runs: [
                    {
                      id: "run-inserted",
                      reviewMarkIds: ["review-9"],
                      text: "Inserted text",
                    },
                  ],
                },
              ],
            },
          ],
          reviewMarks: [{ id: "review-9", type: 1 }],
        }}
      />,
    );

    const run = container.querySelector<HTMLElement>("p span");
    expect(run?.style.backgroundColor).toBe("rgb(220, 252, 231)");
    expect(run?.style.textDecoration).toContain("underline");
  });

  it("uses decoded DOCX image bbox for preview dimensions", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 457_200,
          widthEmu: 914_400,
          xEmu: 457_200,
          yEmu: 228_600,
        },
      },
      "blob:test-image",
    );

    expect(style).toMatchObject({
      aspectRatio: "96 / 48",
      backgroundImage: 'url("blob:test-image")',
      height: undefined,
      marginLeft: 48,
      marginTop: 24,
      width: 96,
    });
  });

  it("maps decoded DOCX image crop rectangles into background positioning", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 1_905_000,
          widthEmu: 3_810_000,
        },
        fill: {
          srcRect: {
            b: 20_000,
            l: 10_000,
            r: 30_000,
            t: 5_000,
          },
        },
      },
      "blob:test-image",
    );

    expect(style.backgroundPosition).toBe("25% 20%");
    expect(style.backgroundSize).toContain("166.666666666666");
    expect(style.backgroundSize).toContain("133.33333333333334%");
  });

  it("renders page-width DOCX images outside body margins", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 5_345_735,
          widthEmu: 7_560_000,
          xEmu: -380,
          yEmu: 0,
        },
      },
      "blob:test-image",
      {
        heightPx: 1122.53,
        paddingBottom: 120,
        paddingLeft: 96,
        paddingRight: 96,
        paddingTop: 96,
        widthPx: 793.73,
      },
    );

    expect(style).toMatchObject({
      marginLeft: "calc(-1 * var(--word-page-padding-left, 0px))",
      marginTop: "calc(-1 * var(--word-page-padding-top, 0px) - 16px)",
      maxWidth: "none",
      width: 793.73,
    });
  });

  it("clamps DOCX image offsets to the decoded page content width", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 304_800,
          widthEmu: 1_143_000,
          xEmu: 5_715_000,
        },
      },
      "blob:test-image",
      {
        heightPx: 1122.53,
        paddingBottom: 120,
        paddingLeft: 96,
        paddingRight: 96,
        paddingTop: 96,
        widthPx: 793.73,
      },
    );

    expect(style.marginLeft).toBeCloseTo(481.73, 2);
    expect(style.width).toBe(120);
  });

  it("does not double-apply page padding for top margin-aligned DOCX images", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 331_916,
          widthEmu: 2_052_638,
          xEmu: 914_400,
          yEmu: 0,
        },
      },
      "blob:test-image",
      {
        heightPx: 1122.53,
        paddingBottom: 120,
        paddingLeft: 96,
        paddingRight: 96,
        paddingTop: 96,
        widthPx: 793.73,
      },
    );

    expect(style.position).toBeUndefined();
    expect(style.marginLeft).toBe(0);
    expect(style.width).toBeCloseTo(216, 0);
  });

  it("renders top margin-aligned square portrait DOCX images as circular crops", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 1_235_000,
          widthEmu: 1_235_000,
          xEmu: 914_400,
          yEmu: 0,
        },
      },
      "blob:test-image",
      {
        heightPx: 1122.53,
        paddingBottom: 120,
        paddingLeft: 96,
        paddingRight: 96,
        paddingTop: 96,
        widthPx: 793.73,
      },
    );

    expect(style.backgroundSize).toBe("cover");
    expect(style.borderRadius).toBe("50%");
    expect(style.boxShadow).toContain("rgba");
    expect(style.marginLeft).toBe(0);
  });

  it("positions page-footer anchored DOCX images against the page box", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 331_916,
          widthEmu: 2_052_638,
          xEmu: 3_457_575,
          yEmu: 9_549_686,
        },
      },
      "blob:test-image",
      {
        heightPx: 1122.53,
        paddingBottom: 120,
        paddingLeft: 96,
        paddingRight: 96,
        paddingTop: 96,
        widthPx: 793.73,
      },
    );

    expect(style.position).toBe("absolute");
    expect(style.left).toBeCloseTo(363, 0);
    expect(style.top).toBeCloseTo(1002.6, 1);
    expect(style.marginLeft).toBeUndefined();
    expect(style.width).toBeCloseTo(216, 0);
  });

  it("positions top page-anchored DOCX logo images as overlays", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 340_102,
          widthEmu: 1_253_962,
          xEmu: 3_210_088,
          yEmu: 1_203_325,
        },
      },
      "blob:test-image",
      {
        heightPx: 1122.53,
        paddingBottom: 120,
        paddingLeft: 96,
        paddingRight: 96,
        paddingTop: 96,
        widthPx: 793.73,
      },
    );

    expect(style.position).toBe("absolute");
    expect(style.left).toBeCloseTo(337, 0);
    expect(style.top).toBeCloseTo(126.3, 1);
    expect(style.marginLeft).toBeUndefined();
    expect(style.marginTop).toBeUndefined();
  });

  it("snaps near-top page-width DOCX anchors to the page top", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 5_345_735,
          widthEmu: 7_560_000,
          xEmu: -380,
          yEmu: 500_000,
        },
      },
      "blob:test-image",
      {
        heightPx: 1122.53,
        paddingBottom: 120,
        paddingLeft: 96,
        paddingRight: 96,
        paddingTop: 96,
        widthPx: 793.73,
      },
    );

    expect(style.position).toBe("absolute");
    expect(style.left).toBe(0);
    expect(style.top).toBe(0);
    expect(style.marginLeft).toBeUndefined();
    expect(style.marginTop).toBeUndefined();
  });

  it("positions non-top page-width DOCX anchors without consuming body flow", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 5_345_735,
          widthEmu: 7_560_000,
          xEmu: -1_424,
          yEmu: 5_372_100,
        },
      },
      "blob:test-image",
      {
        heightPx: 1122.53,
        paddingBottom: 120,
        paddingLeft: 96,
        paddingRight: 96,
        paddingTop: 96,
        widthPx: 793.73,
      },
    );

    expect(style.position).toBe("absolute");
    expect(style.left).toBe(0);
    expect(style.top).toBe(564);
    expect(style.marginLeft).toBeUndefined();
    expect(style.marginTop).toBeUndefined();
    expect(style.width).toBeCloseTo(793.73, 2);
  });

  it("places behind-text DOCX page anchors below foreground body content", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 5_345_735,
          widthEmu: 7_560_000,
          xEmu: -1_424,
          yEmu: 5_372_100,
        },
        zIndex: -10,
      },
      "blob:test-image",
      {
        heightPx: 1122.53,
        paddingBottom: 120,
        paddingLeft: 96,
        paddingRight: 96,
        paddingTop: 96,
        widthPx: 793.73,
      },
    );

    expect(style.position).toBe("absolute");
    expect(style.zIndex).toBe(-1);
  });

  it("places in-front DOCX page anchors above ordinary overlays", () => {
    const style = wordImageStyle(
      {
        bbox: {
          heightEmu: 5_345_735,
          widthEmu: 7_560_000,
          xEmu: -1_424,
          yEmu: 5_372_100,
        },
        zIndex: 24,
      },
      "blob:test-image",
      {
        heightPx: 1122.53,
        paddingBottom: 120,
        paddingLeft: 96,
        paddingRight: 96,
        paddingTop: 96,
        widthPx: 793.73,
      },
    );

    expect(style.position).toBe("absolute");
    expect(style.zIndex).toBe(26);
  });

  it("positions DOCX grouped shape frames against the page box", () => {
    const style = wordPositionedShapeStyle(
      {
        bbox: {
          heightEmu: 5_345_735,
          widthEmu: 7_560_000,
          xEmu: -1_424,
          yEmu: 5_372_100,
        },
        fill: { color: { value: "E2E8F0" } },
        line: {
          fill: { color: { value: "334155" } },
          widthEmu: 19_050,
        },
        zIndex: -10,
      },
      {
        heightPx: 1122.53,
        paddingBottom: 120,
        paddingLeft: 96,
        paddingRight: 96,
        paddingTop: 96,
        widthPx: 793.73,
      },
    );

    expect(style.backgroundColor).toBe("#E2E8F0");
    expect(style.borderColor).toBe("#334155");
    expect(style.position).toBe("absolute");
    expect(style.left).toBe(0);
    expect(style.top).toBeCloseTo(561.28, 2);
    expect(style.marginLeft).toBeUndefined();
    expect(style.marginTop).toBeUndefined();
    expect(style.width).toBeCloseTo(793.73, 2);
    expect(style.zIndex).toBe(-1);
  });

  it("uses decoded DOCX table bbox for preview dimensions", () => {
    const style = wordTableContainerStyle({
      bbox: {
        widthEmu: 2_857_500,
        xEmu: 95_250,
        yEmu: 114_300,
      },
    });

    expect(style).toMatchObject({
      marginLeft: 10,
      marginTop: 12,
      width: 300,
    });
  });

  it("uses decoded DOCX table row height for preview rows", () => {
    expect(wordTableRowStyle({ heightEmu: 285_750 })).toMatchObject({
      height: 30,
    });
  });

  it("renders DOCX chart references with decoded bbox sizing", async () => {
    const context = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      clip: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      rect: vi.fn(),
      restore: vi.fn(),
      rotate: vi.fn(),
      save: vi.fn(),
      setLineDash: vi.fn(),
      setTransform: vi.fn(),
      stroke: vi.fn(),
      strokeRect: vi.fn(),
      translate: vi.fn(),
    };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);

    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          charts: [
            {
              id: "chart-1",
              dataLabels: { showValue: true },
              series: [
                {
                  fill: { color: { type: 1, value: "FF0000" }, type: 1 },
                  values: [2, 4, 3],
                },
              ],
              title: "Delivery Trend",
              xAxis: { title: "Month" },
              yAxis: { majorGridlines: {}, title: "Velocity" },
            },
          ],
          elements: [
            {
              bbox: {
                heightEmu: 1_905_000,
                widthEmu: 3_810_000,
                xEmu: 95_250,
                yEmu: 190_500,
              },
              chartReference: { id: "chart-1" },
            },
          ],
        }}
      />,
    );

    const canvas = container.querySelector("canvas");
    expect(canvas?.getAttribute("aria-label")).toBe("Delivery Trend");
    expect(canvas?.getAttribute("style")).toContain("width: 400px");
    expect(canvas?.getAttribute("style")).toContain("height: 200px");
    expect(canvas?.style.marginLeft).toBe("10px");
    expect(canvas?.style.marginTop).toBe("20px");
    await waitFor(() => expect(getContext).toHaveBeenCalledWith("2d"));
    expect(context.setTransform).toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith("Month", expect.any(Number), expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("Velocity", 0, 0, expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith("4", expect.any(Number), expect.any(Number), expect.any(Number));
  });

  it("uses decoded DOCX chart bbox for preview dimensions", () => {
    const style = wordChartStyle({
      bbox: {
        heightEmu: 1_905_000,
        widthEmu: 3_810_000,
        xEmu: 95_250,
        yEmu: 190_500,
      },
    });

    expect(style).toMatchObject({
      height: 200,
      marginLeft: 10,
      marginTop: 20,
      width: 400,
    });
  });
});
