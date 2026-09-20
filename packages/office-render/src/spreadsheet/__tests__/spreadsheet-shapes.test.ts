import { describe, expect, it } from "vitest";

import { buildSpreadsheetLayout, spreadsheetColumnLeft, spreadsheetRowTop } from "../spreadsheet-layout";
import { buildSpreadsheetImages, buildSpreadsheetShapes } from "../spreadsheet-shapes";

describe("spreadsheet shapes", () => {
  it("builds shape overlays from sheet drawing anchors", () => {
    const sheet = {
      drawings: [
        {
          extentCx: "952500",
          extentCy: "476250",
          fromAnchor: {
            colId: "2",
            colOffset: "9525",
            rowId: "3",
            rowOffset: "19050",
          },
          shape: {
            bbox: {
              heightEmu: "476250",
              widthEmu: "952500",
            },
            id: "shape-1",
            shape: {
              fill: { color: { value: "F0FDFA" } },
              geometry: 26,
              line: {
                fill: { color: { value: "14B8A6" } },
                widthEmu: "19050",
              },
            },
          },
        },
      ],
      name: "Shapes",
      rows: [{ cells: [{ address: "C4" }], index: 4 }],
    };
    const layout = buildSpreadsheetLayout(sheet);

    const shapes = buildSpreadsheetShapes({
      activeSheet: sheet,
      layout,
      shapes: [],
    });

    expect(shapes).toEqual([
      {
        fill: "#F0FDFA",
        geometry: 26,
        height: 50,
        id: "shape-1",
        left: spreadsheetColumnLeft(layout, 2) + 1,
        line: "#14B8A6",
        lineWidth: 2,
        text: "",
        top: spreadsheetRowTop(layout, 3) + 2,
        width: 100,
        zIndex: 0,
      },
    ]);
  });

  it("builds image overlays from sheet drawing image references", () => {
    const sheet = {
      drawings: [
        {
          extentCx: "1905000",
          extentCy: "952500",
          fromAnchor: {
            colId: "1",
            colOffset: "9525",
            rowId: "2",
            rowOffset: "19050",
          },
          imageReference: { id: "/xl/media/image1.png" },
        },
      ],
      name: "Images",
      rows: [{ cells: [{ address: "B3" }], index: 3 }],
    };
    const layout = buildSpreadsheetLayout(sheet);

    const images = buildSpreadsheetImages({
      activeSheet: sheet,
      imageSources: new Map([["/xl/media/image1.png", "blob:sheet-image"]]),
      layout,
    });

    expect(images).toEqual([
      {
        height: 100,
        id: "/xl/media/image1.png",
        left: spreadsheetColumnLeft(layout, 1) + 1,
        src: "blob:sheet-image",
        top: spreadsheetRowTop(layout, 2) + 2,
        width: 200,
        zIndex: 0,
      },
    ]);
  });

  it("falls back to two-cell anchors for drawing image dimensions", () => {
    const sheet = {
      drawings: [
        {
          fromAnchor: { colId: "1", rowId: "2" },
          imageReference: { id: "/xl/media/image2.png" },
          toAnchor: { colId: "3", rowId: "5" },
        },
      ],
      name: "Images",
      rows: [{ cells: [{ address: "B3" }], index: 3 }],
    };
    const layout = buildSpreadsheetLayout(sheet);

    const images = buildSpreadsheetImages({
      activeSheet: sheet,
      imageSources: new Map([["/xl/media/image2.png", "blob:two-cell-image"]]),
      layout,
    });

    expect(images).toEqual([
      {
        height: spreadsheetRowTop(layout, 5) - spreadsheetRowTop(layout, 2),
        id: "/xl/media/image2.png",
        left: spreadsheetColumnLeft(layout, 1),
        src: "blob:two-cell-image",
        top: spreadsheetRowTop(layout, 2),
        width: spreadsheetColumnLeft(layout, 3) - spreadsheetColumnLeft(layout, 1),
        zIndex: 0,
      },
    ]);
  });

  it("preserves sheet drawing order across image and shape specs", () => {
    const sheet = {
      drawings: [
        {
          imageReference: { id: "/xl/media/image1.png" },
          fromAnchor: { colId: "1", rowId: "1" },
          toAnchor: { colId: "2", rowId: "2" },
        },
        {
          extentCx: "952500",
          extentCy: "476250",
          fromAnchor: { colId: "1", rowId: "1" },
          shape: {
            id: "shape-over-image",
            shape: { fill: { color: { value: "FFFFFF" } } },
          },
        },
      ],
      name: "Drawings",
      rows: [{ cells: [{ address: "B2" }], index: 2 }],
    };
    const layout = buildSpreadsheetLayout(sheet);

    const images = buildSpreadsheetImages({
      activeSheet: sheet,
      imageSources: new Map([["/xl/media/image1.png", "blob:sheet-image"]]),
      layout,
    });
    const shapes = buildSpreadsheetShapes({ activeSheet: sheet, layout, shapes: [] });

    expect(images[0]?.zIndex).toBe(0);
    expect(shapes[0]?.zIndex).toBe(1);
  });

  it("projects sheet drawing shape shadows from presentation effects", () => {
    const sheet = {
      drawings: [
        {
          extentCx: "952500",
          extentCy: "476250",
          fromAnchor: { colId: "1", rowId: "1" },
          shape: {
            effects: [
              {
                shadow: {
                  blurRadius: "19050",
                  color: {
                    transform: { alpha: 50000 },
                    type: 1,
                    value: "334155",
                  },
                  direction: 0,
                  distance: "38100",
                },
              },
            ],
            id: "shadowed-shape",
            shape: { fill: { color: { value: "FFFFFF" } } },
          },
        },
      ],
      name: "Drawings",
      rows: [{ cells: [{ address: "B2" }], index: 2 }],
    };
    const layout = buildSpreadsheetLayout(sheet);

    const shapes = buildSpreadsheetShapes({ activeSheet: sheet, layout, shapes: [] });

    expect(shapes[0]?.boxShadow).toBe("4px 0px 2px rgba(51, 65, 85, 0.5)");
  });

  it("adds slicer fallback shapes when no drawing shape is present", () => {
    const sheet = {
      name: "Slicers",
      rows: [{ cells: [{ address: "B2" }], index: 2 }],
      slicers: [
        {
          caption: "Status",
          fromAnchor: { colId: "1", rowId: "1" },
          name: "StatusSlicer",
          toAnchor: { colId: "3", rowId: "4" },
        },
      ],
    };
    const layout = buildSpreadsheetLayout(sheet);

    const shapes = buildSpreadsheetShapes({ activeSheet: sheet, layout, shapes: [] });

    expect(shapes).toEqual([
      {
        fill: "#ffffff",
        geometry: "roundRect",
        height: Math.max(24, spreadsheetRowTop(layout, 4) - spreadsheetRowTop(layout, 1)),
        id: "StatusSlicer",
        left: spreadsheetColumnLeft(layout, 1),
        line: "#94a3b8",
        lineWidth: 1,
        text: "Status",
        top: spreadsheetRowTop(layout, 1),
        width: spreadsheetColumnLeft(layout, 3) - spreadsheetColumnLeft(layout, 1),
        zIndex: 5000,
      },
    ]);
  });

  it("adds slicer cache item states to fallback shapes", () => {
    const sheet = {
      name: "Slicers",
      rows: [{ cells: [{ address: "B2" }], index: 2 }],
      slicers: [
        {
          cache: "Slicer_Category",
          caption: "Category",
          fromAnchor: { colId: "1", rowId: "1" },
          name: "CategorySlicer",
          toAnchor: { colId: "3", rowId: "4" },
        },
      ],
    };
    const layout = buildSpreadsheetLayout(sheet);

    const shapes = buildSpreadsheetShapes({
      activeSheet: sheet,
      layout,
      shapes: [],
      slicerCaches: [
        {
          items: [
            { selected: true, value: "Hardware" },
            { selected: false, value: "Software" },
          ],
          name: "Slicer_Category",
        },
      ],
    });

    expect(shapes[0]?.text).toBe("Category\n* Hardware\n- Software");
  });
});
