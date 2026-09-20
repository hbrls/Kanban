import { describe, expect, it } from "vitest";

import {
  collectPresentationTypefaces,
  getPresentationElementTargets,
  getSlideFrameSize,
  getSlideBounds,
} from "../presentation-renderer";

const EMU_PER_CSS_PIXEL = 9_525;

describe("getSlideBounds", () => {
  it("returns default slide bounds for an empty slide", () => {
    const bounds = getSlideBounds({});
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it("expands beyond default bounds when elements extend further", () => {
    // Default bounds are 12_192_000 x 6_858_000. Elements must go beyond to affect the result.
    const slide = {
      elements: [
        {
          // right edge: 10_000_000 + 4_000_000 = 14_000_000 > default 12_192_000
          bbox: { heightEmu: 500_000, widthEmu: 4_000_000, xEmu: 10_000_000, yEmu: 300_000 },
        },
        {
          // bottom edge: 6_000_000 + 2_000_000 = 8_000_000 > default 6_858_000
          bbox: { heightEmu: 2_000_000, widthEmu: 1_000_000, xEmu: 0, yEmu: 6_000_000 },
        },
      ],
    };
    const bounds = getSlideBounds(slide);
    expect(bounds.width).toBe(14_000_000);
    expect(bounds.height).toBe(8_000_000);
  });

  it("uses explicit slide size when provided", () => {
    const slide = { size: { heightEmu: 6_858_000, widthEmu: 12_192_000 } };
    const bounds = getSlideBounds(slide);
    expect(bounds.width).toBe(12_192_000);
    expect(bounds.height).toBe(6_858_000);
  });
});

describe("getSlideFrameSize", () => {
  it("converts EMU bounds to CSS pixels", () => {
    const slide = { size: { heightEmu: 6_858_000, widthEmu: 12_192_000 } };
    const frame = getSlideFrameSize(slide);
    expect(frame.width).toBeCloseTo(12_192_000 / EMU_PER_CSS_PIXEL, 1);
    expect(frame.height).toBeCloseTo(6_858_000 / EMU_PER_CSS_PIXEL, 1);
  });
});

describe("collectPresentationTypefaces", () => {
  it("returns empty array for empty slides", () => {
    expect(collectPresentationTypefaces([])).toEqual([]);
    expect(collectPresentationTypefaces([{}])).toEqual([]);
  });

  it("collects typefaces from paragraph-level text styles", () => {
    const slides = [
      {
        elements: [
          {
            paragraphs: [
              { textStyle: { typeface: "Aptos" }, runs: [] },
              { textStyle: { typeface: "Arial" }, runs: [] },
            ],
          },
        ],
      },
    ];
    const typefaces = collectPresentationTypefaces(slides);
    expect(typefaces).toContain("Aptos");
    expect(typefaces).toContain("Arial");
  });

  it("collects typefaces from run-level text styles", () => {
    const slides = [
      {
        elements: [
          {
            paragraphs: [
              {
                textStyle: {},
                runs: [
                  { text: "Hello", textStyle: { typeface: "Calibri" } },
                  { text: "World", textStyle: { typeface: "Times New Roman" } },
                ],
              },
            ],
          },
        ],
      },
    ];
    const typefaces = collectPresentationTypefaces(slides);
    expect(typefaces).toContain("Calibri");
    expect(typefaces).toContain("Times New Roman");
  });

  it("deduplicates typefaces across slides", () => {
    const slides = [
      { elements: [{ paragraphs: [{ textStyle: { typeface: "Aptos" }, runs: [] }] }] },
      { elements: [{ paragraphs: [{ textStyle: { typeface: "Aptos" }, runs: [] }] }] },
    ];
    const typefaces = collectPresentationTypefaces(slides);
    expect(typefaces.filter((t) => t === "Aptos")).toHaveLength(1);
  });

  it("skips elements with no paragraphs", () => {
    const slides = [{ elements: [{ id: "shape-1" }] }];
    expect(collectPresentationTypefaces(slides)).toEqual([]);
  });
});

describe("getPresentationElementTargets", () => {
  const canvas = { height: 720, width: 1280 };
  const slideSize = { size: { heightEmu: 6_858_000, widthEmu: 12_192_000 } };

  it("returns empty array for a slide with no elements", () => {
    expect(getPresentationElementTargets({}, canvas)).toEqual([]);
    expect(getPresentationElementTargets({ elements: [] }, canvas)).toEqual([]);
  });

  it("maps element bounding boxes to canvas coordinates", () => {
    const slide = {
      ...slideSize,
      elements: [
        {
          bbox: { heightEmu: 1_714_500, widthEmu: 3_048_000, xEmu: 1_524_000, yEmu: 857_250 },
          id: "title-1",
          name: "Title",
        },
      ],
    };
    const targets = getPresentationElementTargets(slide, canvas);
    expect(targets).toHaveLength(1);
    expect(targets[0].id).toBe("title-1");
    expect(targets[0].name).toBe("Title");
    expect(targets[0].rect.left).toBeCloseTo(160, 0);
    expect(targets[0].rect.top).toBeCloseTo(90, 0);
    expect(targets[0].rect.width).toBeCloseTo(320, 0);
    expect(targets[0].rect.height).toBeCloseTo(180, 0);
  });

  it("filters out zero-size elements", () => {
    const slide = {
      ...slideSize,
      elements: [
        { bbox: { heightEmu: 0, widthEmu: 0, xEmu: 0, yEmu: 0 }, id: "empty" },
        {
          bbox: { heightEmu: 1_000_000, widthEmu: 1_000_000, xEmu: 0, yEmu: 0 },
          id: "visible",
        },
      ],
    };
    const targets = getPresentationElementTargets(slide, canvas);
    expect(targets).toHaveLength(1);
    expect(targets[0].id).toBe("visible");
  });

  it("uses element index as fallback id and name", () => {
    const slide = {
      ...slideSize,
      elements: [
        { bbox: { heightEmu: 1_000_000, widthEmu: 1_000_000, xEmu: 0, yEmu: 0 } },
      ],
    };
    const targets = getPresentationElementTargets(slide, canvas);
    expect(targets[0].id).toBe("element-0");
    expect(targets[0].name).toBe("1");
  });

  it("sorts elements by zIndex when present", () => {
    const slide = {
      ...slideSize,
      elements: [
        { bbox: { heightEmu: 100_000, widthEmu: 100_000, xEmu: 0, yEmu: 0 }, id: "z3", zIndex: 3 },
        { bbox: { heightEmu: 100_000, widthEmu: 100_000, xEmu: 0, yEmu: 0 }, id: "z1", zIndex: 1 },
        { bbox: { heightEmu: 100_000, widthEmu: 100_000, xEmu: 0, yEmu: 0 }, id: "z2", zIndex: 2 },
      ],
    };
    const targets = getPresentationElementTargets(slide, canvas);
    expect(targets.map((t) => t.id)).toEqual(["z1", "z2", "z3"]);
  });
});
