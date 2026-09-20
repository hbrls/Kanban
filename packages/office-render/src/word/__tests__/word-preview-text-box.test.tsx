import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PreviewLabels } from "../../shared/office-preview-utils";
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

describe("WordPreview text boxes", () => {
  it("renders decoded DOCX text boxes as positioned page overlays", () => {
    const { container } = render(
      <WordPreview
        labels={labels}
        proto={{
          elements: [
            {
              bbox: {
                heightEmu: 952_500,
                widthEmu: 1_905_000,
                xEmu: 952_500,
                yEmu: 1_905_000,
              },
              paragraphs: [{ runs: [{ text: "Box text" }] }],
            },
          ],
          heightEmu: 10_691_470,
          widthEmu: 7_560_000,
        }}
      />,
    );

    const textBox = container.querySelector<HTMLElement>('[data-testid="word-text-box"]');
    expect(textBox?.textContent).toBe("Box text");
    expect(textBox?.style.position).toBe("absolute");
    expect(textBox?.style.left).toBe("100px");
    expect(textBox?.style.top).toBe("200px");
  });
});
