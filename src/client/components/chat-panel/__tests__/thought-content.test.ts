import { describe, expect, it } from "vitest";
import { normalizeThoughtContent } from "../thought-content";

describe("normalizeThoughtContent", () => {
  it("removes leading blank lines from thought content", () => {
    expect(normalizeThoughtContent("\n\nFirst visible line")).toBe("First visible line");
  });

  it("handles CRLF newlines without changing later spacing", () => {
    expect(normalizeThoughtContent("\r\n\r\n  indented line\nnext")).toBe("  indented line\nnext");
  });

  it("leaves content without leading newlines unchanged", () => {
    expect(normalizeThoughtContent("Already visible")).toBe("Already visible");
  });
});
