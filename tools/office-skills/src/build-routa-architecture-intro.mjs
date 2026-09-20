import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import PptxGenJS from "pptxgenjs";

import { loadRoutaTokens, pickTextColor } from "./color-tokens.mjs";

const require = createRequire(import.meta.url);
const {
  imageSizingContain,
  renderDiagramSlide,
  diagramTheme,
  warnIfSlideElementsOutOfBounds,
} = require("../.agents/skills/slide/pptxgenjs_helpers/index.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const architectureSvgPath = path.join(projectRoot, "docs", "architecture.svg");
const distDir = path.join(__dirname, "..", "dist");
const outputPath = path.join(distDir, "routa-architecture-intro.pptx");

const tokens = loadRoutaTokens();
const light = tokens.desktop.light;
const slideW = diagramTheme.PAGE.width;
const marginX = 0.42;
const shapeRef = new PptxGenJS();
const SHAPES = shapeRef.ShapeType;

const fonts = {
  heading: "Aptos Display",
  body: "Aptos",
};

const palette = {
  bg: light["--dt-bg-primary"],
  panel: light["--dt-bg-secondary"],
  panelAlt: light["--dt-bg-tertiary"],
  border: light["--dt-border"],
  text: light["--dt-text-primary"],
  muted: light["--dt-text-secondary"],
  subtle: light["--dt-text-muted"],
  blue: light["--dt-brand-blue"],
  blueSoft: light["--dt-brand-blue-soft"],
  amber: light["--dt-brand-orange"],
  green: light["--dt-brand-green"],
  purple: light["--dt-brand-purple"],
  route: light["--dt-brand-route"],
  white: "FFFFFF",
};

function addCoverSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: palette.bg };

  slide.addShape(SHAPES.rect, {
    x: 0,
    y: 0,
    w: slideW,
    h: 0.12,
    fill: { color: palette.blue },
    line: { color: palette.blue, transparency: 100 },
  });

  slide.addText("Architecture Intro", {
    x: marginX,
    y: 0.28,
    w: 1.75,
    h: 0.24,
    fontFace: fonts.body,
    fontSize: 9.5,
    bold: true,
    color: pickTextColor(palette.blue),
    fill: { color: palette.blue },
    line: { color: palette.blue, transparency: 100 },
    radius: 0.16,
    align: "center",
    valign: "mid",
    margin: 0,
  });

  slide.addText("Routa.js", {
    x: marginX,
    y: 0.84,
    w: 3.1,
    h: 0.42,
    fontFace: fonts.heading,
    fontSize: 24,
    bold: true,
    color: palette.text,
    margin: 0,
  });
  slide.addText("Workspace-first multi-agent coordination across Web and Desktop runtimes", {
    x: marginX,
    y: 1.3,
    w: 4.8,
    h: 0.34,
    fontFace: fonts.body,
    fontSize: 12,
    color: palette.muted,
    margin: 0,
  });

  addMetric(slide, 0.42, 2.06, "2", "runtime surfaces", palette.blue);
  addMetric(slide, 2.1, 2.06, "7", "protocol families", palette.amber);
  addMetric(slide, 3.78, 2.06, "6", "shared layers", palette.green);

  slide.addShape(SHAPES.roundRect, {
    x: 5.98,
    y: 0.74,
    w: 3.55,
    h: 3.96,
    rectRadius: 0.18,
    fill: { color: palette.panel },
    line: { color: palette.border, pt: 1 },
  });
  slide.addImage({
    path: architectureSvgPath,
    ...imageSizingContain(architectureSvgPath, 6.12, 0.92, 3.26, 3.58),
  });

  slide.addText("This deck now uses the local diagram pack as reusable composition patterns, with Routa colors and neutral footer/notes content.", {
    x: marginX,
    y: 3.48,
    w: 5.15,
    h: 0.56,
    fontFace: fonts.body,
    fontSize: 10.5,
    color: palette.text,
    margin: 0,
  });
  slide.addText("Sources: docs/ARCHITECTURE.md, docs/adr/README.md, docs/product-specs/FEATURE_TREE.md, docs/architecture.svg", {
    x: marginX,
    y: 5.1,
    w: 6.6,
    h: 0.14,
    fontFace: fonts.body,
    fontSize: 7.5,
    color: palette.subtle,
    margin: 0,
  });
  slide.addNotes(
    "[Sources]\n- docs/ARCHITECTURE.md\n- docs/adr/README.md\n- docs/product-specs/FEATURE_TREE.md\n- docs/architecture.svg",
  );
  return slide;
}

function addMetric(slide, x, y, value, label, accent) {
  slide.addShape(SHAPES.roundRect, {
    x,
    y,
    w: 1.42,
    h: 0.84,
    rectRadius: 0.14,
    fill: { color: palette.white },
    line: { color: palette.border, pt: 1 },
  });
  slide.addText(label, {
    x: x + 0.14,
    y: y + 0.12,
    w: 1.1,
    h: 0.12,
    fontFace: fonts.body,
    fontSize: 7.5,
    bold: true,
    color: accent,
    margin: 0,
  });
  slide.addText(value, {
    x: x + 0.14,
    y: y + 0.34,
    w: 1.0,
    h: 0.22,
    fontFace: fonts.heading,
    fontSize: 18,
    bold: true,
    color: palette.text,
    margin: 0,
  });
}

function addPlanningOnionSlide(pptx) {
  const slide = pptx.addSlide();
  renderDiagramSlide(slide, pptx, "planning-onion", {
    sourceSlide: "",
    footerText: "Routa architecture intro",
    footerLabel: "02",
    sourceNotes: [
      "Layer labels adapted from docs/ARCHITECTURE.md#shared-architecture-model",
      "Repository boundaries from docs/ARCHITECTURE.md#repository-shape",
    ],
    title: "Shared architecture layers",
    layers: [
      { x: 2.19, y: 1.25, w: 5.63, h: 3.84, color: "wave" },
      { x: 2.66, y: 1.87, w: 4.69, h: 3.22, color: "sapphire" },
      { x: 3.15, y: 2.49, w: 3.71, h: 2.6, color: "purple" },
      { x: 3.45, y: 3.12, w: 3.11, h: 1.97, color: "green" },
      { x: 3.78, y: 3.69, w: 2.45, h: 1.4, color: "amber" },
      { x: 4.2, y: 4.23, w: 1.6, h: 0.86, color: "pink" },
    ],
    labels: [
      { text: "Presentation", x: 4.08, y: 1.48, w: 1.86, h: 0.2, fontSize: 12.5 },
      { text: "API / Transport", x: 4.0, y: 2.14, w: 2.02, h: 0.2, fontSize: 11.8 },
      { text: "Protocols", x: 4.25, y: 2.79, w: 1.52, h: 0.2, fontSize: 11.8 },
      { text: "Services", x: 4.29, y: 3.42, w: 1.43, h: 0.2, fontSize: 11.8 },
      { text: "Stores", x: 4.28, y: 4.08, w: 1.46, h: 0.2, fontSize: 11.4 },
      { text: "Runtime", x: 4.43, y: 4.7, w: 1.15, h: 0.2, fontSize: 11.2 },
    ],
  });
  return slide;
}

function addProcessFlowSlide(pptx) {
  const slide = pptx.addSlide();
  renderDiagramSlide(slide, pptx, "process-flow", {
    sourceSlide: "",
    footerText: "Routa architecture intro",
    footerLabel: "03",
    sourceNotes: [
      "Execution flow adapted from docs/ARCHITECTURE.md#acp-and-provider-architecture",
      "Queue behavior reference: src/core/kanban/kanban-session-queue.ts",
    ],
    title: "Session execution lifecycle",
    topDuration: "workspace action -> session updates",
    segmentDurations: [
      { label: "request path" },
      { label: "execution + feedback" },
    ],
    stages: [
      {
        label: "Workspace\nsignal",
        color: "pink",
        detailColor: "pink",
        details: ["User action, lane automation, schedule tick", "Always scoped by workspace context"],
      },
      {
        label: "Route /\nrouter",
        color: "wave",
        detailColor: "grey",
        details: ["Next.js handler or Axum endpoint", "Web and desktop preserve same semantics"],
      },
      {
        label: "Protocol\nadapter",
        color: "wave",
        detailColor: "grey",
        details: ["REST, ACP, MCP, A2A, AG-UI, SSE", "Normalize transport into domain calls"],
      },
      {
        label: "Domain\nservice",
        color: "wave",
        detailColor: "grey",
        details: ["RoutaSystem / AppState orchestration", "Boards, notes, workflows, traces, workers"],
      },
      {
        label: "ACP /\nprovider",
        color: "wave",
        detailColor: "grey",
        details: ["Provider-specific process or bridge", "Adapter turns output into unified updates"],
      },
      {
        label: "Stores /\ntraces",
        color: "wave",
        detailColor: "grey",
        details: ["DB rows, JSONL traces, artifacts", "Persistence and debugging evidence"],
      },
      {
        label: "UI /\nSSE",
        color: "pink",
        detailColor: "pink",
        details: ["Session detail, kanban, dashboard refresh", "Incremental updates flow back to the user"],
      },
    ],
  });
  return slide;
}

function addLeanValueTreeSlide(pptx) {
  const slide = pptx.addSlide();
  renderDiagramSlide(slide, pptx, "lean-value-tree", {
    sourceSlide: "",
    footerText: "Routa architecture intro",
    footerLabel: "04",
    sourceNotes: [
      "Principles adapted from docs/ARCHITECTURE.md#core-principles",
      "ADRs from docs/adr/README.md",
    ],
    title: "Architecture priorities",
    leftPanel: {
      whatTitle: "What",
      whatBody: "A shared mental model for how Routa preserves domain semantics across Next.js Web and Tauri + Axum Desktop while keeping protocol integration explicit.",
      whoTitle: "Why",
      whoBody: "It aligns UI, transport, orchestration, persistence, and provider execution around workspace scope, ACP normalization, and durable boundaries.",
    },
    tree: {
      vision: "Semantic parity",
      goals: ["Workspace-first", "Protocol-oriented", "Local-first"],
      bets: ["ACP normalization", "Dual runtime parity"],
      initiatives: ["RoutaSystem", "AppState", "api-contract"],
      pods: ["TypeScript", "Rust"],
    },
  });
  return slide;
}

function addRiskMatrixSlide(pptx) {
  const slide = pptx.addSlide();
  renderDiagramSlide(slide, pptx, "risk-matrix", {
    sourceSlide: "",
    footerText: "Routa architecture intro",
    footerLabel: "05",
    sourceNotes: [
      "Transitional risks adapted from docs/ARCHITECTURE.md#current-transitional-areas",
      "Quality mitigations adapted from docs/fitness/README.md",
    ],
    title: "Current transitional risks",
    notePanel: { x: 7.42, w: 2.58 },
    note: "Main transition caveats:\ndefault workspace scaffolding still exists,\nnot every persistence path is fully symmetric,\nand some workflow-run persistence remains in-memory.",
    matrix: {
      x: 0.84,
      y: 1.32,
      labelW: 0.95,
      cellW: 1.09,
      rowH: 0.52,
      bottomH: 0.58,
    },
    rows: ["Critical", "High", "Significant", "Moderate", "Low"],
    columns: [
      "Highly unlikely\n(1-20%)",
      "Unlikely\n(21-40%)",
      "Moderately likely\n(41-60%)",
      "Likely\n(61-80%)",
      "Highly likely\n(81-100%)",
    ],
    colors: [
      ["lightGrey", "amber", "sapphire", "wave", "wave"],
      ["amber", "sapphire", "sapphire", "wave", "wave"],
      ["amber", "sapphire", "sapphire", "sapphire", "sapphire"],
      ["amber", "amber", "amber", "amber", "sapphire"],
      ["amber", "amber", "amber", "amber", "amber"],
    ],
    markers: [
      { row: 0, col: 3, label: "1" },
      { row: 1, col: 2, label: "2" },
      { row: 2, col: 1, label: "3" },
    ],
  });
  return slide;
}

async function main() {
  fs.mkdirSync(distDir, { recursive: true });
  const pptx = new PptxGenJS();
  pptx.defineLayout({
    name: diagramTheme.PAGE.name,
    width: diagramTheme.PAGE.width,
    height: diagramTheme.PAGE.height,
  });
  pptx.layout = diagramTheme.PAGE.name;
  pptx.author = "OpenAI Codex";
  pptx.company = "Routa";
  pptx.subject = "Routa.js architecture introduction";
  pptx.title = "Routa.js Architecture Intro";
  pptx.lang = "en-US";
  pptx.theme = {
    headFontFace: fonts.heading,
    bodyFontFace: fonts.body,
    lang: "en-US",
  };

  const slides = [
    addCoverSlide(pptx),
    addPlanningOnionSlide(pptx),
    addProcessFlowSlide(pptx),
    addLeanValueTreeSlide(pptx),
    addRiskMatrixSlide(pptx),
  ];

  for (const slide of slides) {
    warnIfSlideElementsOutOfBounds(slide, pptx);
  }

  await pptx.writeFile({ fileName: outputPath });
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
