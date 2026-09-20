import { describe, expect, it } from "vitest";

import { wordBulletMarker, wordNumberingMarkers } from "../word-numbering";
import { EMPTY_OFFICE_TEXT_STYLE_MAPS } from "../../shared/office-preview-utils";

describe("wordBulletMarker", () => {
  it("maps Symbol font private-use codepoints to visible bullets", () => {
    expect(wordBulletMarker("\uf0b7")).toBe("•");
    expect(wordBulletMarker("\uf0a7")).toBe("▪");
    expect(wordBulletMarker("\uf0d8")).toBe("➢");
    expect(wordBulletMarker("\uf0fc")).toBe("✓");
  });

  it("returns the levelText as-is for unmapped characters", () => {
    expect(wordBulletMarker("→")).toBe("→");
    expect(wordBulletMarker("–")).toBe("–");
  });

  it("falls back to bullet character for empty levelText", () => {
    expect(wordBulletMarker("")).toBe("•");
  });
});

describe("wordNumberingMarkers", () => {
  it("returns empty map when root has no numbering definitions", () => {
    const markers = wordNumberingMarkers([], null, EMPTY_OFFICE_TEXT_STYLE_MAPS);
    expect(markers.size).toBe(0);
  });

  it("assigns decimal markers to paragraphs with numbering", () => {
    const root = {
      numberingDefinitions: [
        {
          numId: "1",
          levels: [{ level: 0, levelText: "%1.", numberFormat: "decimal", startAt: 1 }],
        },
      ],
      paragraphNumberings: [
        { paragraphId: "p1", numId: "1", level: 0 },
        { paragraphId: "p2", numId: "1", level: 0 },
        { paragraphId: "p3", numId: "1", level: 0 },
      ],
    };
    const elements = [
      { paragraphs: [{ id: "p1", runs: [{ text: "First" }] }] },
      { paragraphs: [{ id: "p2", runs: [{ text: "Second" }] }] },
      { paragraphs: [{ id: "p3", runs: [{ text: "Third" }] }] },
    ];
    const markers = wordNumberingMarkers(elements, root, EMPTY_OFFICE_TEXT_STYLE_MAPS);
    expect(markers.get("p1")).toBe("1.");
    expect(markers.get("p2")).toBe("2.");
    expect(markers.get("p3")).toBe("3.");
  });

  it("handles roman numeral formats", () => {
    const root = {
      numberingDefinitions: [
        {
          numId: "1",
          levels: [{ level: 0, levelText: "%1.", numberFormat: "upperRoman", startAt: 1 }],
        },
      ],
      paragraphNumberings: [
        { paragraphId: "p1", numId: "1", level: 0 },
        { paragraphId: "p4", numId: "1", level: 0 },
      ],
    };
    const elements = [
      { paragraphs: [{ id: "p1", runs: [] }] },
      { paragraphs: [{ id: "p4", runs: [] }] },
    ];
    const markers = wordNumberingMarkers(elements, root, EMPTY_OFFICE_TEXT_STYLE_MAPS);
    expect(markers.get("p1")).toBe("I.");
    expect(markers.get("p4")).toBe("II.");
  });

  it("assigns bullet markers for bullet format", () => {
    const root = {
      numberingDefinitions: [
        {
          numId: "2",
          levels: [{ level: 0, levelText: "\uf0b7", numberFormat: "bullet", startAt: 1 }],
        },
      ],
      paragraphNumberings: [{ paragraphId: "pb1", numId: "2", level: 0 }],
    };
    const elements = [
      { paragraphs: [{ id: "pb1", runs: [{ text: "Bullet item" }] }] },
    ];
    const markers = wordNumberingMarkers(elements, root, EMPTY_OFFICE_TEXT_STYLE_MAPS);
    expect(markers.get("pb1")).toBe("•");
  });

  it("skips paragraphs not referenced in paragraphNumberings", () => {
    const root = {
      numberingDefinitions: [
        {
          numId: "1",
          levels: [{ level: 0, levelText: "%1.", numberFormat: "decimal", startAt: 1 }],
        },
      ],
      paragraphNumberings: [{ paragraphId: "p1", numId: "1", level: 0 }],
    };
    const elements = [
      { paragraphs: [{ id: "p1", runs: [] }] },
      { paragraphs: [{ id: "p-no-num", runs: [] }] },
    ];
    const markers = wordNumberingMarkers(elements, root, EMPTY_OFFICE_TEXT_STYLE_MAPS);
    expect(markers.has("p-no-num")).toBe(false);
    expect(markers.size).toBe(1);
  });
});
