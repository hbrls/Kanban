import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SpreadsheetCellContent, spreadsheetIconSetShape, spreadsheetValidationChoices } from "../spreadsheet-cell-overlays";

describe("spreadsheet cell overlays", () => {
  it("renders Excel icon sets as SVG shapes instead of font emoji glyphs", () => {
    const { container } = render(
      <SpreadsheetCellContent
        text=""
        visual={{
          iconSet: {
            color: "#16638a",
            iconSet: "5Arrows",
            level: 5,
            levelCount: 5,
            showValue: false,
          },
        }}
      />,
    );

    const icon = container.querySelector('[data-testid="spreadsheet-icon-set"]');
    expect(icon?.tagName.toLowerCase()).toBe("svg");
    expect(container.textContent).toBe("");
  });

  it("renders rating icon sets as SVG bars instead of text glyphs", () => {
    const { container } = render(
      <SpreadsheetCellContent
        text=""
        visual={{
          iconSet: {
            color: "#16638a",
            iconSet: "5Rating",
            level: 4,
            levelCount: 5,
            showValue: false,
          },
        }}
      />,
    );

    const icon = container.querySelector('[data-testid="spreadsheet-icon-set"]');
    expect(icon?.tagName.toLowerCase()).toBe("svg");
    expect(icon?.querySelectorAll("rect")).toHaveLength(5);
    expect(container.textContent).toBe("");
  });

  it("maps common Excel icon-set families to stable renderer shapes", () => {
    expect(
      spreadsheetIconSetShape({
        color: "#16638a",
        iconSet: "5Rating",
        level: 4,
        levelCount: 5,
        showValue: false,
      }),
    ).toBe("rating");
    expect(
      spreadsheetIconSetShape({
        color: "#16638a",
        iconSet: "5Quarters",
        level: 4,
        levelCount: 5,
        showValue: false,
      }),
    ).toBe("quarter");
    expect(
      spreadsheetIconSetShape({
        color: "#16638a",
        iconSet: "3TrafficLights1",
        level: 2,
        levelCount: 3,
        showValue: false,
      }),
    ).toBe("traffic");
  });

  it("parses inline Excel validation list choices", () => {
    expect(
      spreadsheetValidationChoices({
        formula: '"Open, Closed, Blocked"',
        prompt: "",
        type: "dropdown",
      }),
    ).toEqual(["Open", "Closed", "Blocked"]);
    expect(
      spreadsheetValidationChoices({
        formula: '"Needs ""review"", Done"',
        prompt: "",
        type: "dropdown",
      }),
    ).toEqual(['Needs "review"', "Done"]);
  });

  it("resolves Excel validation list choices from sheet ranges", () => {
    const activeSheet = {
      name: "Validation",
      rows: [
        { cells: [{ address: "A1", value: "Small" }], index: 1 },
        { cells: [{ address: "A2", value: "Medium" }], index: 2 },
      ],
    };
    const configSheet = {
      name: "Config",
      rows: [
        { cells: [{ address: "A1", value: "Open" }], index: 1 },
        { cells: [{ address: "A2", value: "Closed" }], index: 2 },
        { cells: [{ address: "A3", value: "" }], index: 3 },
      ],
    };

    expect(
      spreadsheetValidationChoices(
        {
          formula: "Config!$A$1:$A$3",
          prompt: "",
          type: "dropdown",
        },
        activeSheet,
        [activeSheet, configSheet],
      ),
    ).toEqual(["Open", "Closed"]);
    expect(
      spreadsheetValidationChoices(
        {
          formula: "$A$1:$A$2",
          prompt: "",
          type: "dropdown",
        },
        activeSheet,
        [activeSheet, configSheet],
      ),
    ).toEqual(["Small", "Medium"]);
  });

  it("opens dropdown validations through a clickable cell indicator", () => {
    const onValidationClick = vi.fn();
    const { getByLabelText } = render(
      <SpreadsheetCellContent
        onValidationClick={onValidationClick}
        text="Open"
        validation={{
          formula: '"Open,Closed"',
          prompt: "Pick a status",
          type: "dropdown",
        }}
      />,
    );

    fireEvent.pointerDown(getByLabelText("Open data validation list"));

    expect(onValidationClick).toHaveBeenCalledWith({ formula: '"Open,Closed"', prompt: "Pick a status", type: "dropdown" }, expect.any(Object));
  });
});
