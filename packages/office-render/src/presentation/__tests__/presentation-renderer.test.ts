import { describe, expect, it } from "vitest";

import { drawPresentationChart } from "../../shared/office-chart-renderer";
import { EMPTY_OFFICE_TEXT_STYLE_MAPS, officeFontFamily, paragraphView } from "../../shared/office-preview-utils";
import {
  applyPresentationLayoutInheritance,
  computePresentationFit,
  emuRectToCanvasRect,
  getSlideBounds,
  presentationGradientStops,
  presentationChartById,
  presentationChartReferenceId,
  presentationElementLineStyle,
  presentationImageSourceRect,
  presentationLineEndStyle,
  presentationLineStyle,
  presentationScaledFontSize,
  presentationShadowStyle,
  presentationShapeKind,
  presentationTableGrid,
  renderPresentationSlide,
} from "../presentation-renderer";
import {
  presentationEffectiveTextMaxWidth,
  presentationParagraphSpacingPx,
  presentationTextShouldShrinkForAutoFit,
} from "../presentation-text-layout";
import { shapeFillToPaint } from "../presentation-fill-styles";
import { drawLineEndPath } from "../presentation-line-styles";
import {
  customGeometryLinePoints,
  elementPath,
  presetGeometryLinePoints,
} from "../presentation-shape-paths";

describe("presentation renderer helpers", () => {
  it("quotes source typefaces and appends Office/CJK fallbacks", () => {
    expect(officeFontFamily("PingFang SC")).toContain('"PingFang SC"');
    expect(officeFontFamily('Aptos "Display"')).toContain('"Aptos \\"Display\\""');
    expect(officeFontFamily("")).toContain("Carlito");
    expect(officeFontFamily("")).toContain('"Microsoft YaHei"');
    expect(officeFontFamily("Noto Serif CJK SC")).toContain('"Songti SC"');
    expect(officeFontFamily("Arial;Helvetica;sans-serif")).toContain('"Arial", "Helvetica", sans-serif');
    expect(officeFontFamily("Arial;Helvetica;sans-serif")).not.toContain('"Songti SC"');
  });

  it("fits a slide into the viewport with Codex-like padding and zoom clamping", () => {
    const fit = computePresentationFit({ height: 720, width: 1280 }, { height: 720, width: 1280 });
    expect(fit.width).toBeCloseTo(1109.33, 1);
    expect(fit.height).toBeCloseTo(624, 1);

    const fullscreen = computePresentationFit(
      { height: 720, width: 1280 },
      { height: 720, width: 1280 },
      { padding: 0 },
    );
    expect(fullscreen.width).toBeCloseTo(1280, 1);
    expect(fullscreen.height).toBeCloseTo(720, 1);

    const zoomed = computePresentationFit(
      { height: 720, width: 1280 },
      { height: 720, width: 1280 },
      { zoom: 99 },
    );
    expect(zoomed.scale).toBeCloseTo(fit.scale * 6);

    const zoomedOut = computePresentationFit(
      { height: 720, width: 1280 },
      { height: 720, width: 1280 },
      { zoom: 0.01 },
    );
    expect(zoomedOut.scale).toBeCloseTo(fit.scale * 0.25);
  });

  it("maps EMU bounding boxes into canvas coordinates", () => {
    const rect = emuRectToCanvasRect(
      { heightEmu: 1_714_500, widthEmu: 3_048_000, xEmu: 1_524_000, yEmu: 857_250 },
      { height: 6_858_000, width: 12_192_000 },
      { height: 720, width: 1280 },
    );

    expect(rect).toEqual({
      height: 180,
      left: 160,
      top: 90,
      width: 320,
    });
  });

  it("scales presentation font sizes with the fitted slide", () => {
    const fullSize = presentationScaledFontSize(3600, 1);
    expect(fullSize).toBeCloseTo(48, 1);
    expect(presentationScaledFontSize(3600, 0.25)).toBeCloseTo(fullSize * 0.25, 1);
    expect(presentationScaledFontSize(3600, 2)).toBeCloseTo(fullSize * 2, 1);
  });

  it("maps protocol geometry codes to canvas shape kinds", () => {
    const rect = { height: 100, left: 0, top: 0, width: 100 };
    expect(presentationShapeKind({ geometry: 35 }, rect)).toBe("ellipse");
    expect(presentationShapeKind({ geometry: 96 }, rect)).toBe("line");
    expect(presentationShapeKind({ geometry: 99 }, rect)).toBe("line");
    expect(presentationShapeKind({ geometry: 100 }, rect)).toBe("line");
    expect(presentationShapeKind({ geometry: 3 }, rect)).toBe("triangle");
    expect(presentationShapeKind({ geometry: 23 }, rect)).toBe("triangle");
    expect(presentationShapeKind({ geometry: 6 }, rect)).toBe("diamond");
    expect(presentationShapeKind({ geometry: 30 }, rect)).toBe("diamond");
    expect(presentationShapeKind({ geometry: 37 }, rect)).toBe("homePlate");
    expect(presentationShapeKind({ geometry: 11 }, rect)).toBe("hexagon");
    expect(presentationShapeKind({ geometry: 39 }, rect)).toBe("hexagon");
    expect(presentationShapeKind({ geometry: 18 }, rect)).toBe("star6");
    expect(presentationShapeKind({ geometry: 20 }, rect)).toBe("star8");
    expect(presentationShapeKind({ geometry: 25 }, rect)).toBe("star32");
    expect(presentationShapeKind({ geometry: 215 }, rect)).toBe("star4");
    expect(presentationShapeKind({ geometry: 28 }, rect)).toBe("roundRect");
    expect(presentationShapeKind({ geometry: 29 }, rect)).toBe("roundRect");
    expect(presentationShapeKind({ geometry: 32 }, rect)).toBe("snipRect");
    expect(presentationShapeKind({ geometry: 33 }, rect)).toBe("snipRect");
    expect(presentationShapeKind({ geometry: 44 }, rect)).toBe("rightArrow");
    expect(presentationShapeKind({ geometry: 45 }, rect)).toBe("leftArrow");
    expect(presentationShapeKind({ geometry: 46 }, rect)).toBe("upArrow");
    expect(presentationShapeKind({ geometry: 47 }, rect)).toBe("downArrow");
    expect(presentationShapeKind({ geometry: 48 }, rect)).toBe("rightArrow");
    expect(presentationShapeKind({ geometry: 201 }, rect)).toBe("curvedLeftArrow");
    expect(presentationShapeKind({ geometry: 202 }, rect)).toBe("curvedRightArrow");
    expect(presentationShapeKind({ geometry: 203 }, rect)).toBe("curvedUpArrow");
    expect(presentationShapeKind({ geometry: 204 }, rect)).toBe("curvedDownArrow");
    expect(presentationShapeKind({ geometry: 205 }, rect)).toBe("uturnArrow");
    expect(presentationShapeKind({ geometry: 50 }, rect)).toBe("bentUpArrow");
    expect(presentationShapeKind({ geometry: 51 }, rect)).toBe("leftRightArrow");
    expect(presentationShapeKind({ geometry: 52 }, rect)).toBe("upDownArrow");
    expect(presentationShapeKind({ geometry: 60 }, rect)).toBe("leftRightArrowCallout");
    expect(presentationShapeKind({ geometry: 62 }, rect)).toBe("quadArrowCallout");
    expect(presentationShapeKind({ geometry: 63 }, rect)).toBe("bentArrow");
    expect(presentationShapeKind({ geometry: 74 }, rect)).toBe("can");
    expect(presentationShapeKind({ geometry: 40 }, rect)).toBe("pie");
    expect(presentationShapeKind({ geometry: 41 }, rect)).toBe("blockArc");
    expect(presentationShapeKind({ geometry: 75 }, rect)).toBe("lightningBolt");
    expect(presentationShapeKind({ geometry: 76 }, rect)).toBe("heart");
    expect(presentationShapeKind({ geometry: 78 }, rect)).toBe("moon");
    expect(presentationShapeKind({ geometry: 89 }, rect)).toBe("arc");
    expect(presentationShapeKind({ geometry: 117 }, rect)).toBe("wedgeRectCallout");
    expect(presentationShapeKind({ geometry: 118 }, rect)).toBe("wedgeRoundRectCallout");
    expect(presentationShapeKind({ geometry: 119 }, rect)).toBe("wedgeEllipseCallout");
    expect(presentationShapeKind({ geometry: 120 }, rect)).toBe("cloudCallout");
    expect(presentationShapeKind({ geometry: 158 }, rect)).toBe("delay");
    expect(presentationShapeKind({ geometry: 155 }, rect)).toBe("can");
    expect(presentationShapeKind({ geometry: 176 }, rect)).toBe("mathPlus");
    expect(presentationShapeKind({ geometry: 177 }, rect)).toBe("mathEqual");
    expect(presentationShapeKind({ geometry: 206 }, rect)).toBe("chord");
    expect(presentationShapeKind({ geometry: 207 }, rect)).toBe("snip1Rect");
    expect(presentationShapeKind({ geometry: 208 }, rect)).toBe("teardrop");
    expect(presentationShapeKind({ geometry: 209 }, rect)).toBe("cloud");
    expect(presentationShapeKind({ geometry: 210 }, rect)).toBe("corner");
    expect(presentationShapeKind({ geometry: 211 }, rect)).toBe("octagon");
    expect(presentationShapeKind({ geometry: 213 }, rect)).toBe("halfFrame");
    expect(presentationShapeKind({ geometry: 87 }, rect)).toBe("diagStripe");
    expect(presentationShapeKind({ geometry: 90 }, rect)).toBe("leftBracket");
    expect(presentationShapeKind({ geometry: 91 }, rect)).toBe("rightBracket");
    expect(presentationShapeKind({ geometry: 92 }, rect)).toBe("leftBrace");
    expect(presentationShapeKind({ geometry: 93 }, rect)).toBe("rightBrace");
    expect(presentationShapeKind({ geometry: 95 }, rect)).toBe("bracePair");
    expect(presentationShapeKind({ geometry: 137 }, rect)).toBe("document");
    expect(presentationShapeKind({ geometry: 150 }, rect)).toBe("extract");
  });

  it("uses PPTX pie geometry adjustments for the rendered sector", () => {
    const previousPath2D = globalThis.Path2D;
    globalThis.Path2D = class {
      commands: unknown[] = [];
      closePath() {
        this.commands.push({ command: "closePath" });
      }
      ellipse(
        x: number,
        y: number,
        radiusX: number,
        radiusY: number,
        rotation: number,
        startAngle: number,
        endAngle: number,
      ) {
        this.commands.push({ command: "ellipse", endAngle, radiusX, radiusY, rotation, startAngle, x, y });
      }
      lineTo(x: number, y: number) {
        this.commands.push({ command: "lineTo", x, y });
      }
      moveTo(x: number, y: number) {
        this.commands.push({ command: "moveTo", x, y });
      }
    } as unknown as typeof Path2D;

    try {
      const path = elementPath(
        "pie",
        { height: 200, left: 0, top: 0, width: 400 },
        {
          adjustmentList: [
            { formula: "val 10800000", name: "adj1" },
            { formula: "val 16200000", name: "adj2" },
          ],
        },
      ) as unknown as { commands: Array<Record<string, number | string>> };

      expect(path.commands[0]).toEqual({ command: "moveTo", x: 200, y: 100 });
      expect(path.commands[1]?.command).toBe("lineTo");
      expect(path.commands[1]?.x).toBeCloseTo(0, 6);
      expect(path.commands[1]?.y).toBeCloseTo(100, 6);
      expect(path.commands[2]?.command).toBe("ellipse");
      expect(path.commands[2]?.startAngle).toBeCloseTo(Math.PI, 6);
      expect(path.commands[2]?.endAngle).toBeCloseTo(Math.PI * 1.5, 6);
    } finally {
      globalThis.Path2D = previousPath2D;
    }
  });

  it("uses PPTX rounded rectangle adjustments for corner radius", () => {
    const previousPath2D = globalThis.Path2D;
    globalThis.Path2D = class {
      commands: unknown[] = [];
      closePath() {
        this.commands.push({ command: "closePath" });
      }
      lineTo(x: number, y: number) {
        this.commands.push({ command: "lineTo", x, y });
      }
      moveTo(x: number, y: number) {
        this.commands.push({ command: "moveTo", x, y });
      }
      quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
        this.commands.push({ command: "quadraticCurveTo", cpx, cpy, x, y });
      }
    } as unknown as typeof Path2D;

    try {
      const path = elementPath(
        "roundRect",
        { height: 40, left: 0, top: 0, width: 120 },
        {
          adjustmentList: [{ formula: "val 50000", name: "adj" }],
        },
      ) as unknown as { commands: Array<Record<string, number | string>> };

      expect(path.commands[0]).toEqual({ command: "moveTo", x: 20, y: 0 });
      expect(path.commands[1]).toEqual({ command: "lineTo", x: 100, y: 0 });
      expect(path.commands[2]).toEqual({ command: "quadraticCurveTo", cpx: 120, cpy: 0, x: 120, y: 20 });
    } finally {
      globalThis.Path2D = previousPath2D;
    }
  });

  it("maps PPT source rectangles to image crop coordinates", () => {
    const crop = presentationImageSourceRect(
      {
        fill: {
          sourceRect: {
            bottom: 20_000,
            left: 10_000,
            right: 30_000,
            top: 5_000,
          },
        },
      },
      { height: 500, width: 1000 },
    );

    expect(crop.height).toBeCloseTo(375);
    expect(crop.width).toBeCloseTo(600);
    expect(crop.x).toBeCloseTo(100);
    expect(crop.y).toBeCloseTo(25);
  });

  it("resolves PPT chart references by relationship or chart uri", () => {
    const charts = [
      { id: "/ppt/charts/chart1.xml", title: "One" },
      { uri: "/ppt/charts/chart2.xml", title: "Two" },
    ];

    expect(presentationChartReferenceId({ id: "/ppt/charts/chart1.xml" })).toBe("/ppt/charts/chart1.xml");
    expect(presentationChartReferenceId({ relationshipId: "rId9" })).toBe("rId9");
    expect(presentationChartById(charts, "/ppt/charts/chart2.xml")?.title).toBe("Two");
    expect(presentationChartById(charts, "missing")).toBeNull();
  });

  it("renders protocol trendline and error bar hints in shared Office charts", () => {
    const context = mockCanvasContext();

    drawPresentationChart(
      context,
      {
        series: [
          {
            errorBars: { amount: 2, color: { value: "334155" }, direction: "both" },
            fill: { color: { value: "156082" } },
            name: "Forecast",
            trendlines: [{ color: { value: "FF0000" }, type: "linear" }],
            values: [2, 5, 8],
          },
        ],
        type: 13,
      },
      { height: 180, left: 0, top: 0, width: 320 },
      1,
    );

    expect(context.strokeStyles).toContain("#334155");
    expect(context.strokeStyles).toContain("#FF0000");
    expect(context.lineDashes).toContainEqual([6, 4]);
  });

  it("normalizes PPT table rows, columns, and spans into fitted cells", () => {
    const grid = presentationTableGrid(
      {
        columns: [2_000, 1_000, 1_000],
        rows: [
          { cells: [{ gridSpan: 2 }, {}], height: 2_000 },
          { cells: [{}, {}, {}], height: 1_000 },
        ],
      },
      { height: 150, left: 0, top: 0, width: 300 },
    );

    expect(grid.columns).toEqual([150, 75, 75]);
    expect(grid.rows).toEqual([100, 50]);
  });

  it("maps PPT line styles without clamping Office line widths", () => {
    const line = presentationLineStyle(
      {
        cap: 3,
        fill: { color: { type: 1, value: "8FA69D" } },
        headEnd: { length: 3, type: 2, width: 2 },
        join: 1,
        style: 2,
        tailEnd: { length: 2, type: 5, width: 2 },
        widthEmu: 19_050,
      },
      2,
    );

    expect(line.color).toBe("#8FA69D");
    expect(line.width).toBeCloseTo(4);
    expect(line.lineCap).toBe("round");
    expect(line.lineJoin).toBe("round");
    expect(line.dash.length).toBeGreaterThan(0);
    expect(line.headEnd?.type).toBe(2);
    expect(line.tailEnd?.type).toBe(5);
  });

  it("renders connector line-end metadata with the base shape line", () => {
    const line = presentationElementLineStyle(
      {
        connector: {
          lineStyle: {
            cap: 2,
            head: { length: 3, type: 2, width: 3 },
            join: 2,
            tail: { length: 1, type: 5, width: 1 },
          },
        },
        shape: {
          line: {
            fill: { color: { type: 1, value: "C65F20" } },
            style: 1,
            widthEmu: 38_100,
          },
        },
      },
      1,
    );

    expect(line.color).toBe("#C65F20");
    expect(line.width).toBeCloseTo(4);
    expect(line.lineCap).toBe("square");
    expect(line.lineJoin).toBe("bevel");
    expect(line.headEnd?.type).toBe(2);
    expect(line.tailEnd?.type).toBe(5);
  });

  it("anchors connector paths to connected shape sites", () => {
    const previousPath2D = globalThis.Path2D;
    globalThis.Path2D = class {
      arc() {}
      bezierCurveTo() {}
      closePath() {}
      ellipse() {}
      lineTo() {}
      moveTo() {}
      quadraticCurveTo() {}
      rect() {}
    } as unknown as typeof Path2D;
    const context = mockCanvasContext();

    try {
      renderPresentationSlide({
        context,
        height: 100,
        images: new Map(),
        slide: {
          elements: [
            {
              bbox: { heightEmu: 1_000, widthEmu: 1_000, xEmu: 1_000, yEmu: 1_000 },
              id: "start",
              shape: { fill: { color: { type: 1, value: "FFFFFF" } }, geometry: 5 },
            },
            {
              bbox: { heightEmu: 1_000, widthEmu: 1_000, xEmu: 5_000, yEmu: 5_000 },
              id: "end",
              shape: { fill: { color: { type: 1, value: "FFFFFF" } }, geometry: 5 },
            },
            {
              bbox: { heightEmu: 3_000, widthEmu: 3_000, xEmu: 2_000, yEmu: 2_000 },
              connector: {
                end: "end",
                endIndex: 0,
                start: "start",
                startIndex: 2,
              },
              shape: {
                geometry: 96,
                line: {
                  fill: { color: { type: 1, value: "000000" } },
                  widthEmu: 9_525,
                },
              },
              zIndex: 3,
            },
          ],
          heightEmu: 10_000,
          widthEmu: 10_000,
        },
        width: 100,
      });
    } finally {
      globalThis.Path2D = previousPath2D;
    }

    const connectorPath = context.paths.at(-1);
    expect(connectorPath?.[0]).toEqual({ command: "moveTo", x: 15, y: 20 });
    expect(connectorPath?.at(-1)).toEqual({ command: "lineTo", x: 55, y: 50 });
  });

  it("renders curved PPT connectors as sampled curves for arrow-end direction", () => {
    const context = mockCanvasContext();

    renderPresentationSlide({
      context,
      height: 100,
      images: new Map(),
      slide: {
        elements: [
          {
            bbox: { heightEmu: 1_000, widthEmu: 1_000, xEmu: 0, yEmu: 0 },
            shape: {
              geometry: 101,
              line: {
                fill: { color: { type: 1, value: "000000" } },
                headEnd: { length: 2, type: 2, width: 2 },
                tailEnd: { length: 2, type: 2, width: 2 },
                widthEmu: 9_525,
              },
            },
          },
        ],
        heightEmu: 1_000,
        widthEmu: 1_000,
      },
      width: 100,
    });

    const connectorPath = context.paths.reduce((longest, path) =>
      path.length > longest.length ? path : longest,
    );
    expect(connectorPath?.length).toBeGreaterThan(10);
    expect(connectorPath?.[6]).toEqual({ command: "lineTo", x: 75, y: 25 });
    expect(context.rotations.at(-1)).toBeGreaterThan(1);
  });

  it("renders PPT arc presets as sampled open lines", () => {
    const context = mockCanvasContext();

    renderPresentationSlide({
      context,
      height: 100,
      images: new Map(),
      slide: {
        elements: [
          {
            bbox: { heightEmu: 1_000, widthEmu: 1_000, xEmu: 0, yEmu: 0 },
            shape: {
              adjustmentList: [
                { formula: "val 0", name: "adj1" },
                { formula: "val 5400000", name: "adj2" },
              ],
              geometry: 89,
              line: {
                fill: { color: { type: 1, value: "000000" } },
                tailEnd: { length: 2, type: 2, width: 2 },
                widthEmu: 9_525,
              },
            },
          },
        ],
        heightEmu: 1_000,
        widthEmu: 1_000,
      },
      width: 100,
    });

    const arcPath = context.paths.reduce((longest, path) =>
      path.length > longest.length ? path : longest,
    );
    expect(arcPath?.length).toBeGreaterThan(8);
    expect(arcPath?.[0]).toEqual({ command: "moveTo", x: 100, y: 50 });
    expect(arcPath?.at(-1)?.x).toBeCloseTo(50, 6);
    expect(arcPath?.at(-1)?.y).toBeCloseTo(100, 6);
    expect(context.rotations.at(-1)).toBeGreaterThan(1);
  });

  it("maps PPT line end records into canvas arrowhead dimensions", () => {
    expect(presentationLineEndStyle(undefined, 2)).toBeNull();
    expect(presentationLineEndStyle({ type: 0 }, 2)).toBeNull();
    expect(presentationLineEndStyle({ length: 1, type: 1, width: 1 }, 2)).toBeNull();
    expect(presentationLineEndStyle({ length: 3, type: 2, width: 2 }, 2)).toEqual({
      length: 10,
      type: 2,
      width: 7,
    });
  });

  it("places DrawingML headEnd at the line start and tailEnd at the line end", () => {
    const context = mockCanvasContext();

    renderPresentationSlide({
      context,
      height: 100,
      images: new Map(),
      slide: {
        elements: [
          {
            bbox: { heightEmu: 0, widthEmu: 1_000, xEmu: 0, yEmu: 0 },
            shape: {
              geometry: 96,
              line: {
                fill: { color: { type: 1, value: "FF0000" } },
                headEnd: { length: 2, type: 2, width: 2 },
                tailEnd: { length: 2, type: 4, width: 2 },
                widthEmu: 9_525,
              },
            },
          },
        ],
        heightEmu: 1_000,
        widthEmu: 1_000,
      },
      width: 100,
    });

    const lineEndTranslations = context.translations.slice(-2);
    expect(lineEndTranslations[0]?.x).toBeCloseTo(0);
    expect(lineEndTranslations[0]?.y).toBeCloseTo(0);
    expect(lineEndTranslations[1]?.x).toBeCloseTo(100);
    expect(lineEndTranslations[1]?.y).toBeCloseTo(0);

    const lineEndRotations = context.rotations.slice(-2);
    expect(lineEndRotations[0]).toBeCloseTo(Math.PI);
    expect(lineEndRotations[1]).toBeCloseTo(0);
  });

  it("resolves PPT highlight scheme metadata against presentation theme colors", () => {
    const previousPath2D = globalThis.Path2D;
    globalThis.Path2D = class {
      arc() {}
      bezierCurveTo() {}
      closePath() {}
      ellipse() {}
      lineTo() {}
      moveTo() {}
      quadraticCurveTo() {}
      rect() {}
    } as unknown as typeof Path2D;
    const context = mockCanvasContext();

    renderPresentationSlide({
      context,
      height: 100,
      images: new Map(),
      slide: {
        elements: [
          {
            bbox: { heightEmu: 1_000, widthEmu: 1_000, xEmu: 0, yEmu: 0 },
            paragraphs: [
              {
                runs: [
                  {
                    text: "highlight",
                    textStyle: {
                      fill: { color: { type: 1, value: "FFFFFF" } },
                      fontSize: 900,
                      scheme: "__pptxHighlight:accent1",
                    },
                  },
                ],
              },
            ],
          },
        ],
        heightEmu: 1_000,
        widthEmu: 1_000,
      },
      theme: { colors: { accent1: "003D4F" } },
      width: 100,
    });
    globalThis.Path2D = previousPath2D;

    expect(context.fillRects.some((entry) => entry.fillStyle === "#003D4F")).toBe(true);
  });

  it("draws PPT line end shapes according to their preset type", () => {
    const context = mockCanvasContext();

    drawLineEndPath(context, { length: 10, type: 4, width: 8 });
    expect(context.paths.at(-1)).toEqual([
      { command: "moveTo", x: 0, y: 0 },
      { command: "lineTo", x: -5, y: -4 },
      { command: "lineTo", x: -10, y: 0 },
      { command: "lineTo", x: -5, y: 4 },
    ]);

    drawLineEndPath(context, { length: 10, type: 3, width: 8 });
    expect(context.paths.at(-1)).toEqual([
      { command: "moveTo", x: 0, y: 0 },
      { command: "lineTo", x: -10, y: -4 },
      { command: "lineTo", x: -6.2, y: 0 },
      { command: "lineTo", x: -10, y: 4 },
    ]);
  });

  it("extracts custom geometry endpoints for line ends", () => {
    expect(
      customGeometryLinePoints(
        {
          customPaths: [
            {
              commands: [
                { moveTo: { x: 0, y: 10 } },
                { lineTo: { x: 0, y: 20 } },
                { lineTo: { x: 10, y: 20 } },
              ],
              heightEmu: 20,
              widthEmu: 10,
            },
          ],
        },
        { height: 40, left: 0, top: 0, width: 20 },
      ),
    ).toEqual([
      { x: 0, y: 20 },
      { x: 0, y: 40 },
      { x: 20, y: 40 },
    ]);
  });

  it("extracts PPT arc preset endpoints from geometry adjustments", () => {
    const points = presetGeometryLinePoints(
      {
        adjustmentList: [
          { formula: "val 0", name: "adj1" },
          { formula: "val 5400000", name: "adj2" },
        ],
        geometry: 89,
      },
      { height: 100, left: 0, top: 0, width: 200 },
    );

    expect(points?.[0]).toEqual({ x: 200, y: 50 });
    expect(points?.at(-1)?.x).toBeCloseTo(100, 6);
    expect(points?.at(-1)?.y).toBeCloseTo(100, 6);
  });

  it("normalizes PPT gradient stops and percent positions", () => {
    expect(
      presentationGradientStops({
        gradientStops: [
          { color: { type: 1, value: "FF0000" }, position: 0 },
          { color: { transform: { alpha: 50_000 }, type: 1, value: "00FF00" }, position: 50_000 },
          { color: { lastColor: "0000FF", transform: { alpha: 25_000 }, type: 2, value: "accent2" }, position: 100_000 },
        ],
      }),
    ).toEqual([
      { color: "#FF0000", position: 0 },
      { color: "rgba(0, 255, 0, 0.5)", position: 0.5 },
      { color: "rgba(0, 0, 255, 0.25)", position: 1 },
    ]);

    expect(
      presentationGradientStops({
        gradientStops: [
          { color: { type: 1, value: "111111" } },
          { color: { type: 1, value: "222222" } },
          { color: { type: 1, value: "333333" } },
        ],
      }),
    ).toEqual([
      { color: "#111111", position: 0 },
      { color: "#222222", position: 0.5 },
      { color: "#333333", position: 1 },
    ]);
  });

  it("renders PPT path gradients as radial gradients", () => {
    const gradient = {
      stops: [] as Array<{ color: string; offset: number }>,
      addColorStop(offset: number, color: string) {
        this.stops.push({ color, offset });
      },
    };
    const calls: number[][] = [];
    const context = {
      createRadialGradient: (...args: number[]) => {
        calls.push(args);
        return gradient;
      },
    } as unknown as CanvasRenderingContext2D;

    const paint = shapeFillToPaint(
      context,
      {
        fill: {
          gradientKind: 2,
          gradientStops: [
            { color: { type: 1, value: "FFFFFF" }, position: 0 },
            { color: { type: 1, value: "808080" }, position: 100_000 },
          ],
          type: 2,
        },
      },
      {},
      undefined,
      { height: 60, left: 10, top: 20, width: 120 },
    );

    expect(paint).toBe(gradient);
    expect(calls).toEqual([[60, 30, 0, 60, 30, 60]]);
    expect(gradient.stops).toEqual([
      { color: "#FFFFFF", offset: 0 },
      { color: "#808080", offset: 1 },
    ]);
  });

  it("preserves top-level PPT paragraph spacing, bullet, and indent fields", () => {
    const paragraph = paragraphView(
      {
        bulletCharacter: "*",
        indent: -90_000,
        marginLeft: 180_000,
        runs: [{ text: "Nested point", textStyle: { fontSize: 1400 } }],
        spaceAfter: 120,
        textStyle: { alignment: 1 },
      },
      EMPTY_OFFICE_TEXT_STYLE_MAPS,
    );

    expect(paragraph.style?.bulletCharacter).toBe("*");
    expect(paragraph.style?.marginLeft).toBe(180_000);
    expect(paragraph.style?.indent).toBe(-90_000);
    expect(paragraph.style?.spaceAfter).toBe(120);
    expect(paragraph.runs[0]?.style?.marginLeft).toBe(180_000);
  });

  it("uses PPT text frame paragraph spacing and full text frame width", () => {
    expect(presentationParagraphSpacingPx(undefined, 2, false)).toBe(0);
    expect(presentationParagraphSpacingPx(undefined, 2, true)).toBe(0);
    expect(presentationParagraphSpacingPx(120, 2, true)).toBe(12);
    expect(presentationEffectiveTextMaxWidth(500, false)).toBe(500);
    expect(presentationEffectiveTextMaxWidth(500, true)).toBe(500);
  });

  it("only shrinks text for normal autofit, not shape autofit", () => {
    expect(presentationTextShouldShrinkForAutoFit({ normalAutoFit: {} })).toBe(true);
    expect(presentationTextShouldShrinkForAutoFit({ normAutofit: {} })).toBe(true);
    expect(presentationTextShouldShrinkForAutoFit({ shapeAutoFit: {} })).toBe(false);
    expect(presentationTextShouldShrinkForAutoFit({ spAutoFit: {} })).toBe(false);
    expect(presentationTextShouldShrinkForAutoFit({ noAutoFit: {} })).toBe(false);
  });

  it("inherits PPT placeholder geometry and text styles from layouts and masters", () => {
    const slide = {
      elements: [
        {
          id: "body-1",
          paragraphs: [
            {
              runs: [{ text: "Inherited body" }],
            },
          ],
          placeholderIndex: 1,
          placeholderType: "body",
        },
        {
          id: "title-1",
          paragraphs: [
            {
              textStyle: { fontSize: 1800 },
              runs: [
                {
                  text: "Direct title",
                  textStyle: { fill: { color: { type: 1, value: "AA0000" } } },
                },
              ],
            },
          ],
          placeholderType: "title",
        },
      ],
      useLayoutId: "layout-1",
    };
    const layouts = [
      {
        bodyLevelStyles: [
          {
            level: 1,
            paragraphStyle: {
              bulletCharacter: "•",
              marginLeft: 342_900,
            },
            spaceAfter: 120,
            textStyle: {
              fill: { color: { type: 1, value: "111111" } },
              fontSize: 2400,
              typeface: "Aptos",
            },
          },
        ],
        id: "master-1",
        titleLevelStyles: [
          {
            level: 1,
            textStyle: {
              fill: { color: { type: 1, value: "FFFFFF" } },
              fontSize: 3200,
            },
          },
        ],
        type: "master",
      },
      {
        elements: [
          {
            bbox: {
              heightEmu: 1_000,
              widthEmu: 2_000,
              xEmu: 100,
              yEmu: 200,
            },
            placeholderIndex: 1,
            placeholderType: "body",
            levelStyles: [
              {
                level: 1,
                paragraphStyle: {
                  indent: -228_600,
                },
                textStyle: {
                  fontSize: 2800,
                },
              },
            ],
            textStyle: { anchor: 2 },
          },
        ],
        id: "layout-1",
        parentLayoutId: "master-1",
        type: "layout",
      },
    ];

    const effectiveSlide = applyPresentationLayoutInheritance(slide, layouts);
    const effectiveElements = effectiveSlide.elements as Array<Record<string, unknown>>;
    const body = effectiveElements[0];
    const bodyParagraph = (body.paragraphs as Array<Record<string, unknown>>)[0];
    const bodyTextStyle = bodyParagraph.textStyle as Record<string, unknown>;
    const bodyParagraphStyle = bodyParagraph.paragraphStyle as Record<string, unknown>;
    const title = effectiveElements[1];
    const titleParagraph = (title.paragraphs as Array<Record<string, unknown>>)[0];
    const titleTextStyle = titleParagraph.textStyle as Record<string, unknown>;

    expect(body.bbox).toEqual({
      heightEmu: 1_000,
      widthEmu: 2_000,
      xEmu: 100,
      yEmu: 200,
    });
    expect(body.textStyle).toEqual({ anchor: 2 });
    expect(bodyTextStyle.fontSize).toBe(2800);
    expect(bodyTextStyle.typeface).toBe("Aptos");
    expect(bodyParagraph.spaceAfter).toBe(120);
    expect(bodyParagraphStyle.bulletCharacter).toBe("•");
    expect(bodyParagraphStyle.indent).toBe(-228_600);
    expect(bodyParagraphStyle.marginLeft).toBe(342_900);
    expect(titleTextStyle.fontSize).toBe(1800);
    expect(titleTextStyle.fill).toEqual({ color: { type: 1, value: "FFFFFF" } });
  });

  it("materializes slide number placeholder text from the slide index", () => {
    const effectiveSlide = applyPresentationLayoutInheritance(
      {
        elements: [
          {
            id: "slide-number",
            paragraphs: [],
            placeholderIndex: 12,
            placeholderType: "sldNum",
          },
        ],
        index: 7,
        useLayoutId: "layout-1",
      },
      [
        {
          elements: [
            {
              bbox: { heightEmu: 100, widthEmu: 100, xEmu: 0, yEmu: 0 },
              placeholderIndex: 12,
              placeholderType: "sldNum",
            },
          ],
          id: "layout-1",
        },
      ],
    );

    const slideNumber = (effectiveSlide.elements as Array<Record<string, unknown>>)[0];
    const paragraph = (slideNumber.paragraphs as Array<{ runs: Array<{ text: string }> }>)[0];
    expect(paragraph.runs[0]?.text).toBe("7");
  });

  it("does not let generated decoder undefined optionals erase placeholder styles", () => {
    const slide = {
      elements: [
        {
          id: "title-1",
          paragraphs: [
            {
              indent: undefined,
              marginLeft: undefined,
              paragraphStyle: {
                bulletCharacter: undefined,
                indent: undefined,
                marginLeft: undefined,
              },
              runs: [
                {
                  text: "Inherited title",
                  textStyle: {
                    fill: undefined,
                    fontSize: 4800,
                    typeface: undefined,
                  },
                },
              ],
              spaceAfter: undefined,
              spaceBefore: undefined,
              textStyle: {
                alignment: 1,
                fill: undefined,
                fontSize: undefined,
                typeface: undefined,
              },
            },
          ],
          placeholderType: "ctrTitle",
        },
      ],
      useLayoutId: "layout-title",
    };
    const layouts = [
      {
        elements: [
          {
            placeholderType: "ctrTitle",
            levelsStyles: [
              {
                level: 1,
                paragraphStyle: {
                  bulletCharacter: "",
                  marginLeft: 12_700,
                },
                spaceAfter: 0,
                spaceBefore: 0,
                textStyle: {
                  fill: { color: { type: 1, value: "FFFFFF" } },
                  fontSize: 3200,
                  typeface: "Bitter",
                },
              },
            ],
          },
        ],
        id: "layout-title",
      },
    ];

    const effectiveSlide = applyPresentationLayoutInheritance(slide, layouts);
    const title = (effectiveSlide.elements as Array<Record<string, unknown>>)[0];
    const paragraph = (title.paragraphs as Array<Record<string, unknown>>)[0];
    const paragraphTextStyle = paragraph.textStyle as Record<string, unknown>;
    const paragraphStyle = paragraph.paragraphStyle as Record<string, unknown>;

    expect(paragraph.spaceAfter).toBe(0);
    expect(paragraph.spaceBefore).toBe(0);
    expect(paragraphStyle.bulletCharacter).toBe("");
    expect(paragraphStyle.marginLeft).toBe(12_700);
    expect(paragraphTextStyle.alignment).toBe(1);
    expect(paragraphTextStyle.fill).toEqual({ color: { type: 1, value: "FFFFFF" } });
    expect(paragraphTextStyle.fontSize).toBe(3200);
    expect(paragraphTextStyle.typeface).toBe("Bitter");
  });

  it("inherits title master styles for center title placeholders", () => {
    const slide = {
      elements: [
        {
          id: "title-1",
          paragraphs: [
            {
              runs: [{ text: "Center title", textStyle: { fontSize: 4800 } }],
            },
          ],
          placeholderType: "ctrTitle",
        },
      ],
      useLayoutId: "layout-title",
    };
    const layouts = [
      {
        elements: [
          {
            placeholderType: "title",
            levelsStyles: [
              {
                level: 1,
                textStyle: {
                  bold: true,
                  fill: { color: { type: 2, value: "dk1" } },
                  fontSize: 2800,
                  typeface: "Bitter",
                },
              },
            ],
          },
        ],
        id: "master-title",
      },
      {
        elements: [
          {
            placeholderType: "ctrTitle",
            levelsStyles: [
              {
                level: 1,
                textStyle: {
                  fill: { color: { type: 2, value: "lt1" } },
                  fontSize: 3200,
                },
              },
            ],
          },
        ],
        id: "layout-title",
        parentLayoutId: "master-title",
      },
    ];

    const effectiveSlide = applyPresentationLayoutInheritance(slide, layouts);
    const title = (effectiveSlide.elements as Array<Record<string, unknown>>)[0];
    const paragraph = (title.paragraphs as Array<Record<string, unknown>>)[0];
    const paragraphTextStyle = paragraph.textStyle as Record<string, unknown>;

    expect(paragraphTextStyle.bold).toBe(true);
    expect(paragraphTextStyle.fill).toEqual({ color: { type: 2, value: "lt1" } });
    expect(paragraphTextStyle.fontSize).toBe(3200);
    expect(paragraphTextStyle.typeface).toBe("Bitter");
    expect(((paragraph.runs as Array<Record<string, unknown>>)[0].textStyle as Record<string, unknown>).fontSize).toBe(4800);
  });

  it("inherits non-placeholder layout artwork before slide content", () => {
    const slide = {
      elements: [
        {
          id: "title-1",
          paragraphs: [{ runs: [{ text: "Slide title" }] }],
          placeholderType: "title",
        },
      ],
      useLayoutId: "layout-1",
    };
    const layouts = [
      {
        elements: [
          {
            bbox: {
              heightEmu: 6_858_000,
              widthEmu: 12_192_000,
              xEmu: 0,
              yEmu: 0,
            },
            fill: {
              imageReference: { id: "/ppt/media/background.png" },
              type: 4,
            },
            id: "background-art",
            name: "background.png",
            type: 7,
          },
          {
            bbox: {
              heightEmu: 1_000,
              widthEmu: 2_000,
              xEmu: 100,
              yEmu: 200,
            },
            placeholderType: "title",
          },
        ],
        id: "layout-1",
      },
    ];

    const effectiveSlide = applyPresentationLayoutInheritance(slide, layouts);
    const effectiveElements = effectiveSlide.elements as Array<Record<string, unknown>>;

    expect(effectiveElements).toHaveLength(2);
    expect(effectiveElements[0]?.id).toBe("background-art");
    expect(effectiveElements[1]?.id).toBe("title-1");
    expect(effectiveElements[1]?.bbox).toEqual({
      heightEmu: 1_000,
      widthEmu: 2_000,
      xEmu: 100,
      yEmu: 200,
    });
  });

  it("uses explicit PPT slide size instead of expanding to off-canvas template artwork", () => {
    expect(
      getSlideBounds({
        elements: [
          {
            bbox: {
              heightEmu: 1_000,
              widthEmu: 1_000,
              xEmu: 30_000_000,
              yEmu: 0,
            },
          },
        ],
        heightEmu: 13_716_000,
        widthEmu: 24_384_000,
      }),
    ).toEqual({
      height: 13_716_000,
      width: 24_384_000,
    });
  });

  it("inherits document text styles through basedOn chains", () => {
    const paragraph = paragraphView(
      {
        runs: [{ text: "Inherited heading" }],
        styleId: "Heading1",
      },
      {
        images: new Map(),
        textStyles: new Map([
          [
            "Normal",
            {
              id: "Normal",
              textStyle: { fill: { color: { type: 1, value: "111111" } }, fontSize: 1050 },
              spaceAfter: 200,
            },
          ],
          [
            "Heading1",
            {
              basedOn: "Normal",
              id: "Heading1",
              paragraphStyle: { alignment: 2 },
              textStyle: { bold: true },
              spaceBefore: 480,
            },
          ],
        ]),
      },
    );

    expect(paragraph.style?.bold).toBe(true);
    expect(paragraph.style?.fontSize).toBe(1050);
    expect(paragraph.style?.spaceAfter).toBe(200);
    expect(paragraph.style?.spaceBefore).toBe(480);
    expect(paragraph.style?.alignment).toBe(2);
    expect(paragraph.runs[0]?.style?.bold).toBe(true);
  });

  it("maps PPT shadow effects into canvas offsets", () => {
    const shadow = presentationShadowStyle(
      {
        effects: [
          {
            shadow: {
              blurRadius: 19_050,
              color: { transform: { alpha: 50_000 }, type: 1, value: "000000" },
              direction: 5_400_000,
              distance: 9_525,
            },
          },
        ],
      },
      1,
    );

    expect(shadow?.color).toBe("rgba(0, 0, 0, 0.5)");
    expect(shadow?.blur).toBeCloseTo(2);
    expect(shadow?.offsetX).toBeCloseTo(0, 5);
    expect(shadow?.offsetY).toBeCloseTo(1);
  });
});

function mockCanvasContext(): CanvasRenderingContext2D & {
  fillRects: Array<{ fillStyle: string; height: number; width: number; x: number; y: number }>;
  lineDashes: number[][];
  paths: Array<Array<{ command: "lineTo" | "moveTo"; x: number; y: number }>>;
  rotations: number[];
  strokeStyles: string[];
  translations: Array<{ x: number; y: number }>;
} {
  const state = {
    currentPath: [] as Array<{ command: "lineTo" | "moveTo"; x: number; y: number }>,
    fillStyle: "",
    fillRects: [] as Array<{ fillStyle: string; height: number; width: number; x: number; y: number }>,
    lineDashes: [] as number[][],
    paths: [] as Array<Array<{ command: "lineTo" | "moveTo"; x: number; y: number }>>,
    rotations: [] as number[],
    strokeStyle: "",
    strokeStyles: [] as string[],
    translations: [] as Array<{ x: number; y: number }>,
  };
  return ({
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      state.fillStyle = String(value);
    },
    get fillRects() {
      return state.fillRects;
    },
    get lineDashes() {
      return state.lineDashes;
    },
    get paths() {
      return state.paths;
    },
    get rotations() {
      return state.rotations;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
      state.strokeStyle = String(value);
    },
    get strokeStyles() {
      return state.strokeStyles;
    },
    get translations() {
      return state.translations;
    },
    arc: () => {},
    beginPath: () => {
      state.currentPath = [];
    },
    clearRect: () => {},
    clip: () => {},
    closePath: () => {},
    fill: () => {
      if (state.currentPath.length > 0) {
        state.paths.push([...state.currentPath]);
      }
    },
    fillRect: (x: number, y: number, width: number, height: number) => {
      state.fillRects.push({ fillStyle: state.fillStyle, height, width, x, y });
    },
    fillText: () => {},
    lineTo: (x: number, y: number) => {
      state.currentPath.push({ command: "lineTo", x, y });
    },
    measureText: (text: string) => ({ width: text.length * 6 }) as TextMetrics,
    moveTo: (x: number, y: number) => {
      state.currentPath.push({ command: "moveTo", x, y });
    },
    rect: () => {},
    restore: () => {},
    rotate: (angle: number) => {
      state.rotations.push(angle);
    },
    save: () => {},
    setLineDash: (segments: number[]) => state.lineDashes.push([...segments]),
    stroke: () => {
      state.strokeStyles.push(state.strokeStyle);
      state.paths.push([...state.currentPath]);
    },
    strokeRect: () => {},
    translate: (x: number, y: number) => {
      state.translations.push({ x, y });
    },
  } as unknown) as CanvasRenderingContext2D & {
    fillRects: Array<{ fillStyle: string; height: number; width: number; x: number; y: number }>;
    lineDashes: number[][];
    paths: Array<Array<{ command: "lineTo" | "moveTo"; x: number; y: number }>>;
    rotations: number[];
    strokeStyles: string[];
    translations: Array<{ x: number; y: number }>;
  };
}
