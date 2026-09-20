import { describe, expect, it } from "vitest";

import { wordBulletMarker } from "../word-numbering";

describe("WordPreview numbering", () => {
  it("normalizes Symbol font DOCX bullet markers", () => {
    expect(wordBulletMarker("\uf0b7")).toBe("•");
  });
});
