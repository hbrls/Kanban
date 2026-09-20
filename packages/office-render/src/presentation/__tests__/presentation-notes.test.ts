import { describe, expect, it } from "vitest";

import { presentationSlideNotesText } from "../presentation-notes";

describe("presentationSlideNotesText", () => {
  it("extracts speaker notes from notes body placeholders", () => {
    expect(
      presentationSlideNotesText({
        notesSlide: {
          elements: [
            {
              name: "Slide Image Placeholder",
              placeholderType: "sldImg",
              paragraphs: [{ runs: [{ text: "ignored preview image text" }] }],
            },
            {
              name: "Notes Placeholder",
              placeholderType: "body",
              paragraphs: [
                { runs: [{ text: "First " }, { text: "talking point" }] },
                { runs: [{ text: "Second talking point" }] },
              ],
            },
          ],
        },
      }),
    ).toBe("First talking point\nSecond talking point");
  });

  it("filters slide numbers and duplicate note blocks", () => {
    const note = {
      name: "Body",
      placeholderType: "",
      paragraphs: [
        { runs: [{ text: "12" }] },
        { runs: [{ text: "Share the dependency risk." }] },
      ],
    };

    expect(
      presentationSlideNotesText({
        notesSlide: {
          elements: [note, note],
        },
      }),
    ).toBe("Share the dependency risk.");
  });
});
