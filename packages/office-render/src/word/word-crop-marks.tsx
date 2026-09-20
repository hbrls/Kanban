import type { CSSProperties } from "react";

import type { WordPageLayout } from "./word-layout";

type WordCropMarkCorner = "bottom-left" | "bottom-right" | "top-left" | "top-right";

export function WordPageCropMarks({ pageLayout }: { pageLayout: WordPageLayout }) {
  return (
    <>
      {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((corner) => (
        <span
          aria-hidden="true"
          data-testid="word-page-crop-mark"
          key={corner}
          style={wordPageCropMarkStyle(corner, pageLayout)}
        />
      ))}
    </>
  );
}

function wordPageCropMarkStyle(corner: WordCropMarkCorner, pageLayout: WordPageLayout): CSSProperties {
  const size = 28;
  const offset = 2;
  const horizontalSide = corner.endsWith("left") ? "left" : "right";
  const verticalSide = corner.startsWith("top") ? "top" : "bottom";
  const style: CSSProperties = {
    borderColor: "#a3a3a3",
    borderStyle: "solid",
    borderWidth: 0,
    height: size,
    pointerEvents: "none",
    position: "absolute",
    width: size,
    zIndex: 5,
  };

  style[horizontalSide] = `${pageLayout[horizontalSide === "left" ? "paddingLeft" : "paddingRight"] - size - offset}px`;
  style[verticalSide] = `${pageLayout[verticalSide === "top" ? "paddingTop" : "paddingBottom"] - size - offset}px`;
  style[`border${horizontalSide === "left" ? "Right" : "Left"}Width`] = 2;
  style[`border${verticalSide === "top" ? "Bottom" : "Top"}Width`] = 2;
  return style;
}
