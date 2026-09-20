import { describe, expect, it } from "vitest";

import { extractRepoSlideSessionResult } from "../extract-reposlide-result";

describe("extractRepoSlideSessionResult", () => {
  it("extracts a completed result when the assistant reports a pptx path", () => {
    const result = extractRepoSlideSessionResult([
      {
        role: "assistant",
        content: "Saved PPTX to /tmp/reposlide/demo.pptx\nSlide outline:\n- Intro",
        timestamp: "2026-04-01T03:00:00.000Z",
      },
    ]);

    expect(result.status).toBe("completed");
    expect(result.deckPath).toBe("/tmp/reposlide/demo.pptx");
    expect(result.summary).toContain("Slide outline");
  });

  it("returns a running result when no assistant output exists yet", () => {
    const result = extractRepoSlideSessionResult([]);
    expect(result.status).toBe("running");
    expect(result.deckPath).toBeUndefined();
  });
});
