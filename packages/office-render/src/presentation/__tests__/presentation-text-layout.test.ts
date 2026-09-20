import { describe, expect, it } from "vitest";

import {
  presentationEffectiveTextMaxWidth,
  presentationParagraphSpacingPx,
  presentationScaledFontSize,
  trimPresentationFrameParagraphs,
} from "../presentation-text-layout";

describe("presentationScaledFontSize", () => {
  it("converts half-point font sizes to CSS pixels at scale 1", () => {
    // 2400 half-points = 1200 points; 1pt = 1/72 inch; 96dpi → 1pt ≈ 1.333px
    expect(presentationScaledFontSize(2400, 1)).toBeCloseTo(32, 1);
    expect(presentationScaledFontSize(3600, 1)).toBeCloseTo(48, 1);
  });

  it("scales proportionally with slideScale", () => {
    const base = presentationScaledFontSize(2400, 1);
    expect(presentationScaledFontSize(2400, 0.5)).toBeCloseTo(base * 0.5, 1);
    expect(presentationScaledFontSize(2400, 2)).toBeCloseTo(base * 2, 1);
  });

  it("uses fallback px value scaled by PRESENTATION_POINT_TO_CSS_PIXEL", () => {
    // fallback goes through cssFontSize then multiplied by 1.333
    const result = presentationScaledFontSize(null, 1, 16);
    expect(result).toBeGreaterThan(16); // 16 * 1.333 ≈ 21.3
    expect(result).toBeCloseTo(21.3, 0);
    expect(presentationScaledFontSize(0, 1, 16)).toBeCloseTo(result, 1);
    expect(presentationScaledFontSize(undefined, 1, 14)).toBeGreaterThan(14);
  });

  it("keeps sub-8pt PPTX font sizes instead of clamping them up", () => {
    expect(presentationScaledFontSize(700, 1)).toBeCloseTo(9.33, 1);
  });

  it("applies fallback with slideScale", () => {
    const base = presentationScaledFontSize(null, 1, 16);
    expect(presentationScaledFontSize(null, 0.5, 16)).toBeCloseTo(base * 0.5, 1);
  });
});

describe("presentationParagraphSpacingPx", () => {
  it("returns 0 when value is undefined/null", () => {
    expect(presentationParagraphSpacingPx(undefined, 1)).toBe(0);
    expect(presentationParagraphSpacingPx(null, 1)).toBe(0);
  });

  it("returns 0 for negative spacing without default paragraph spacing flag", () => {
    expect(presentationParagraphSpacingPx(-100, 1, false)).toBe(0);
  });

  it("converts positive spacing values to pixels", () => {
    // value / 20 * scale, capped at 24
    expect(presentationParagraphSpacingPx(120, 1, true)).toBeCloseTo(6, 1);
    expect(presentationParagraphSpacingPx(200, 2, false)).toBeCloseTo(20, 1);
  });

  it("caps spacing at 24px", () => {
    expect(presentationParagraphSpacingPx(99999, 1)).toBe(24);
  });

  it("scales with slideScale", () => {
    const base = presentationParagraphSpacingPx(200, 1, false);
    expect(presentationParagraphSpacingPx(200, 2, false)).toBeCloseTo(base * 2, 1);
  });
});

describe("presentationEffectiveTextMaxWidth", () => {
  it("returns maxWidth as-is when wrap is false", () => {
    expect(presentationEffectiveTextMaxWidth(500, false)).toBe(500);
    expect(presentationEffectiveTextMaxWidth(0, false)).toBe(0);
  });

  it("returns at least 1px when wrap is true with positive width", () => {
    expect(presentationEffectiveTextMaxWidth(500, true)).toBeGreaterThanOrEqual(1);
    expect(presentationEffectiveTextMaxWidth(500, true)).toBeLessThanOrEqual(500);
  });

  it("returns 1 for zero-width when wrap is true", () => {
    expect(presentationEffectiveTextMaxWidth(0, true)).toBe(1);
  });
});

describe("trimPresentationFrameParagraphs", () => {
  it("removes empty edge paragraphs while preserving internal blank lines", () => {
    const paragraphs = [
      paragraph("leading"),
      paragraph("Chris Murphy"),
      paragraph(""),
      paragraph("Chief Client and Revenue Officer"),
      paragraph("trailing"),
    ];
    paragraphs[0]!.runs = [];
    paragraphs[4]!.runs = [];

    expect(trimPresentationFrameParagraphs(paragraphs).map((item) => item.id)).toEqual([
      "Chris Murphy",
      "",
      "Chief Client and Revenue Officer",
    ]);
  });

  it("keeps empty bullet paragraphs because they carry visible markers", () => {
    const paragraphs = [
      {
        ...paragraph("bullet"),
        runs: [],
        style: { bulletCharacter: "•" },
      },
      paragraph("body"),
    ];

    expect(trimPresentationFrameParagraphs(paragraphs).map((item) => item.id)).toEqual(["bullet", "body"]);
  });
});

function paragraph(text: string) {
  return {
    id: text,
    runs: text ? [{ id: `${text}-run`, style: {}, text }] : [],
    style: {},
    styleId: "",
  };
}
