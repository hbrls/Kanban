import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SpreadsheetShapeLayer } from "../spreadsheet-shapes";

describe("spreadsheet shape layer", () => {
  it("renders right triangle preset shapes as polygons", () => {
    const { container } = render(
      <SpreadsheetShapeLayer
        shapes={[
          {
            fill: "#E0F2FE",
            geometry: 4,
            height: 50,
            id: "triangle",
            left: 10,
            line: "#38BDF8",
            lineWidth: 1,
            text: "",
            top: 20,
            width: 100,
            zIndex: 0,
          },
        ]}
      />,
    );

    const shape = container.querySelector('[data-office-shape="triangle"]');
    const polygon = shape?.querySelector("polygon");

    expect(shape?.tagName.toLowerCase()).toBe("svg");
    expect(polygon?.getAttribute("points")).toBe("0.5,0.5 0.5,49.5 99.5,49.5");
    expect(polygon?.getAttribute("fill")).toBe("#E0F2FE");
    expect(polygon?.getAttribute("stroke")).toBe("#38BDF8");
  });
});
