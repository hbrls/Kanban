import { describe, expect, it } from "vitest";

import { wordEmptyParagraphEstimatedHeight, wordEmptyParagraphStyle, wordParagraphHasVisibleContent } from "../word-paragraph-utils";
import type { ParagraphView } from "../../shared/office-preview-utils";

function paragraph(overrides: Partial<ParagraphView> = {}): ParagraphView {
  return {
    id: "p1",
    styleId: "",
    runs: [],
    style: null,
    ...overrides,
  };
}

describe("wordParagraphHasVisibleContent", () => {
  it("returns false for empty paragraph", () => {
    expect(wordParagraphHasVisibleContent(paragraph())).toBe(false);
  });

  it("returns true when paragraph has a marker", () => {
    expect(wordParagraphHasVisibleContent(paragraph({ marker: "1." }))).toBe(true);
  });

  it("returns true when a run has non-whitespace text", () => {
    expect(
      wordParagraphHasVisibleContent(
        paragraph({ runs: [{ id: "r1", text: "Hello", style: null }] }),
      ),
    ).toBe(true);
  });

  it("returns false when all runs are whitespace-only", () => {
    expect(
      wordParagraphHasVisibleContent(
        paragraph({ runs: [{ id: "r2", text: "   ", style: null }] }),
      ),
    ).toBe(false);
  });

  it("returns true when run has reference markers", () => {
    expect(
      wordParagraphHasVisibleContent(
        paragraph({ runs: [{ id: "r3", text: "", style: null, referenceMarkers: ["ref1"] }] }),
      ),
    ).toBe(true);
  });
});

describe("wordEmptyParagraphEstimatedHeight", () => {
  it("returns minimum 2px for null style", () => {
    expect(wordEmptyParagraphEstimatedHeight(null)).toBe(2);
  });

  it("adds spaceBefore + spaceAfter, capped at 4 each, floored at 2", () => {
    // spaceBefore=200, spaceAfter=200 → (200/20)=10 → capped to 4+4=8
    expect(wordEmptyParagraphEstimatedHeight({ spaceBefore: 200, spaceAfter: 200 })).toBe(8);
    // spaceBefore=20, spaceAfter=0 → 1+0=1 → floored to 2
    expect(wordEmptyParagraphEstimatedHeight({ spaceBefore: 20, spaceAfter: 0 })).toBe(2);
    // spaceBefore=40, spaceAfter=20 → 2+1=3 → floored to 3
    expect(wordEmptyParagraphEstimatedHeight({ spaceBefore: 40, spaceAfter: 20 })).toBe(3);
  });
});

describe("wordEmptyParagraphStyle", () => {
  it("zeros out fontSize and lineHeight", () => {
    const style = wordEmptyParagraphStyle({ fontSize: 16, lineHeight: 1.5 });
    expect(style.fontSize).toBe(0);
    expect(style.lineHeight).toBe(0);
  });

  it("sets minHeight to 2", () => {
    expect(wordEmptyParagraphStyle({}).minHeight).toBe(2);
  });

  it("caps marginTop and marginBottom at 4", () => {
    const style = wordEmptyParagraphStyle({ marginTop: 20, marginBottom: 20 });
    expect(style.marginTop).toBe(4);
    expect(style.marginBottom).toBe(4);
  });

  it("preserves margins below 4", () => {
    const style = wordEmptyParagraphStyle({ marginTop: 2, marginBottom: 1 });
    expect(style.marginTop).toBe(2);
    expect(style.marginBottom).toBe(1);
  });
});
