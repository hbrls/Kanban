import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import PptxGenJS from "pptxgenjs";

import { loadRoutaTokens, pickTextColor } from "./color-tokens.mjs";

const require = createRequire(import.meta.url);
const {
  warnIfSlideElementsOutOfBounds,
  safeOuterShadow,
} = require("../.agents/skills/slide/pptxgenjs_helpers/index.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "dist");
const outputPath = path.join(outDir, "routa-color-template.pptx");

const pptx = new PptxGenJS();
const tokens = loadRoutaTokens();
const light = tokens.desktop.light;
const dark = tokens.desktop.dark;

const slideW = 13.333;
const slideH = 7.5;
const pageMarginX = 0.72;
const contentW = slideW - pageMarginX * 2;

const paletteById = Object.fromEntries(tokens.paletteFamilies.map((family) => [family.id, family.colors]));
const semanticByName = Object.fromEntries(tokens.semanticAliases.map((alias) => [alias.name, alias]));

const fonts = {
  heading: "Aptos Display",
  body: "Aptos",
  mono: "Aptos Mono",
};

const footerText = "Copyright (c) Routa contributors. Released under the MIT License.";

function color(hex) {
  return hex.replace(/^#/, "").toUpperCase();
}

function addPageNumber(slide, index, fillColor, textColor, label = "Routa Template") {
  slide.addText(`${label}  ·  ${String(index).padStart(2, "0")}`, {
    x: slideW - 2.3,
    y: slideH - 0.44,
    w: 1.58,
    h: 0.18,
    fontFace: fonts.body,
    fontSize: 8,
    color: textColor,
    align: "right",
    margin: 0,
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: slideW - 0.56,
    y: slideH - 0.46,
    w: 0.18,
    h: 0.18,
    fill: { color: fillColor },
    line: { color: fillColor, transparency: 100 },
  });
}

function addCopyrightFooter(slide, textColor, ruleColor = null) {
  if (ruleColor) {
    addFooterRule(slide, ruleColor);
  }
  slide.addText(footerText, {
    x: pageMarginX,
    y: slideH - 0.46,
    w: 5.7,
    h: 0.16,
    fontFace: fonts.body,
    fontSize: 7.5,
    color: textColor,
    margin: 0,
  });
}

function addTopRule(slide, colorHex, y = 0.38, h = 0.08) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y,
    w: slideW,
    h,
    fill: { color: colorHex },
    line: { color: colorHex, transparency: 100 },
  });
}

function addChip(slide, text, x, y, fillColor, textColor, width = 1.3) {
  slide.addText(text, {
    x,
    y,
    w: width,
    h: 0.34,
    fontFace: fonts.body,
    fontSize: 10,
    bold: true,
    color: textColor,
    align: "center",
    valign: "mid",
    margin: 0,
    fill: { color: fillColor },
    line: { color: fillColor, transparency: 100 },
    radius: 0.12,
  });
}

function addTitleBlock(slide, {
  eyebrow,
  title,
  subtitle,
  darkMode = false,
  accent = color(light["--dt-accent"]),
}) {
  const bodyColor = darkMode ? color(dark["--dt-text-primary"]) : color(light["--dt-text-primary"]);
  const secondaryColor = darkMode ? color(dark["--dt-text-secondary"]) : color(light["--dt-text-secondary"]);
  addChip(slide, eyebrow, pageMarginX, 0.18, accent, pickTextColor(accent), 1.58);
  slide.addText(title, {
    x: pageMarginX,
    y: 0.52,
    w: 8.7,
    h: 0.9,
    fontFace: fonts.heading,
    fontSize: 26,
    bold: true,
    color: bodyColor,
    margin: 0,
  });
  slide.addText(subtitle, {
    x: pageMarginX,
    y: 1.32,
    w: 7.4,
    h: 0.44,
    fontFace: fonts.body,
    fontSize: 12,
    color: secondaryColor,
    breakLine: false,
    margin: 0,
    valign: "top",
  });
}

function addBulletList(slide, items, x, y, w, fillTextColor, bulletColor) {
  let currentY = y;
  for (const item of items) {
    slide.addShape(pptx.ShapeType.ellipse, {
      x,
      y: currentY + 0.08,
      w: 0.12,
      h: 0.12,
      fill: { color: bulletColor },
      line: { color: bulletColor, transparency: 100 },
    });
    slide.addText(item, {
      x: x + 0.22,
      y: currentY,
      w: w - 0.22,
      h: 0.4,
      fontFace: fonts.body,
      fontSize: 14,
      color: fillTextColor,
      margin: 0,
    });
    currentY += 0.46;
  }
}

function addCard(slide, {
  x,
  y,
  w,
  h,
  title,
  body,
  fillColor,
  titleColor,
  bodyColor,
  borderColor,
  accentColor,
}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.14,
    fill: { color: fillColor },
    line: { color: borderColor, pt: 1.2 },
    shadow: safeOuterShadow("000000", 0.12, 45, 1.6, 1),
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: x + 0.26,
    y: y + 0.28,
    w: 0.18,
    h: h - 0.56,
    fill: { color: accentColor },
    line: { color: accentColor, transparency: 100 },
  });
  slide.addText(title, {
    x: x + 0.58,
    y: y + 0.24,
    w: w - 0.84,
    h: 0.38,
    fontFace: fonts.heading,
    fontSize: 16,
    bold: true,
    color: titleColor,
    margin: 0,
  });
  slide.addText(body, {
    x: x + 0.58,
    y: y + 0.76,
    w: w - 0.84,
    h: h - 0.96,
    fontFace: fonts.body,
    fontSize: 11.5,
    color: bodyColor,
    valign: "top",
    margin: 0,
  });
}

function addMetricCard(slide, { x, y, w, h, label, value, hint, fillColor, accentColor, textColor }) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.12,
    fill: { color: fillColor },
    line: { color: accentColor, pt: 1.2 },
  });
  slide.addText(label, {
    x: x + 0.22,
    y: y + 0.18,
    w: w - 0.44,
    h: 0.22,
    fontFace: fonts.body,
    fontSize: 9,
    bold: true,
    color: accentColor,
    margin: 0,
  });
  slide.addText(value, {
    x: x + 0.22,
    y: y + 0.48,
    w: w - 0.44,
    h: 0.44,
    fontFace: fonts.heading,
    fontSize: 24,
    bold: true,
    color: textColor,
    margin: 0,
  });
  slide.addText(hint, {
    x: x + 0.22,
    y: y + 1.02,
    w: w - 0.44,
    h: 0.22,
    fontFace: fonts.body,
    fontSize: 9.5,
    color: textColor,
    opacity: 0.76,
    margin: 0,
  });
}

function addArchitectureLayer(slide, {
  x,
  y,
  w,
  h,
  label,
  title,
  body,
  fillColor,
  accentColor,
  titleColor,
  bodyColor,
}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.12,
    fill: { color: fillColor },
    line: { color: accentColor, pt: 1.2 },
  });
  slide.addText(label, {
    x: x + 0.22,
    y: y + 0.16,
    w: 0.92,
    h: 0.24,
    fontFace: fonts.body,
    fontSize: 8.5,
    bold: true,
    color: accentColor,
    align: "center",
    valign: "mid",
    margin: 0,
    fill: { color: "FFFFFF" },
    line: { color: accentColor, pt: 1 },
    radius: 0.1,
  });
  slide.addText(title, {
    x: x + 1.28,
    y: y + 0.16,
    w: w - 1.56,
    h: 0.24,
    fontFace: fonts.heading,
    fontSize: 14,
    bold: true,
    color: titleColor,
    margin: 0,
  });
  slide.addText(body, {
    x: x + 1.28,
    y: y + 0.48,
    w: w - 1.56,
    h: h - 0.66,
    fontFace: fonts.body,
    fontSize: 9.8,
    color: bodyColor,
    margin: 0,
    valign: "top",
  });
}

function addFlowNode(slide, { x, y, w, h, text, fillColor, lineColor, textColor, fontSize = 9.5 }) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: fillColor },
    line: { color: lineColor, pt: 1 },
  });
  slide.addText(text, {
    x,
    y: y + 0.08,
    w,
    h: h - 0.16,
    fontFace: fonts.body,
    fontSize,
    bold: true,
    color: textColor,
    align: "center",
    valign: "mid",
    margin: 0.02,
  });
}

function addPaletteStrip(slide, familyId, y, label) {
  const family = paletteById[familyId];
  slide.addText(label, {
    x: pageMarginX,
    y,
    w: 2.2,
    h: 0.22,
    fontFace: fonts.body,
    fontSize: 9.5,
    bold: true,
    color: color(light["--dt-text-secondary"]),
    margin: 0,
  });
  const startX = 2.18;
  const swatchW = 0.88;
  family.forEach((step, idx) => {
    const x = startX + idx * swatchW;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: y - 0.04,
      w: 0.74,
      h: 0.44,
      rectRadius: 0.08,
      fill: { color: step.hex },
      line: { color: step.hex, transparency: 100 },
    });
    slide.addText(step.step, {
      x,
      y: y + 0.46,
      w: 0.74,
      h: 0.16,
      fontFace: fonts.mono,
      fontSize: 7.5,
      color: color(light["--dt-text-muted"]),
      align: "center",
      margin: 0,
    });
  });
}

function addFooterRule(slide, colorHex) {
  slide.addShape(pptx.ShapeType.line, {
    x: pageMarginX,
    y: slideH - 0.7,
    w: contentW,
    h: 0,
    line: { color: colorHex, pt: 1 },
  });
}

function finalizeSlide(slide) {
  warnIfSlideElementsOutOfBounds(slide, pptx);
}

function buildPresentation() {
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "OpenAI Codex";
  pptx.company = "Routa.js";
  pptx.subject = "Routa color token PowerPoint template";
  pptx.title = "Routa Color Token Template";
  pptx.lang = "zh-CN";
  pptx.theme = {
    headFontFace: fonts.heading,
    bodyFontFace: fonts.body,
    lang: "zh-CN",
    themeColors: {
      accent1: color(light["--dt-brand-blue"]),
      accent2: color(light["--dt-brand-orange"]),
      accent3: color(light["--dt-brand-green"]),
      accent4: color(light["--dt-brand-purple"]),
      accent5: color(light["--dt-brand-route"]),
      accent6: color(light["--dt-brand-red"]),
      bg1: color(semanticByName["app-background"].lightHex),
      tx1: color(light["--dt-text-primary"]),
      bg2: color(light["--dt-bg-primary"]),
      tx2: color(light["--dt-text-secondary"]),
    },
  };

  const cover = pptx.addSlide();
  cover.background = { color: color(dark["--dt-bg-primary"]) };
  cover.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 3.8,
    h: slideH,
    fill: { color: color(dark["--dt-bg-secondary"]) },
    line: { color: color(dark["--dt-bg-secondary"]), transparency: 100 },
  });
  cover.addShape(pptx.ShapeType.rect, {
    x: 9.82,
    y: 0,
    w: 3.513,
    h: slideH,
    fill: { color: color(dark["--dt-bg-secondary"]) },
    line: { color: color(dark["--dt-bg-secondary"]), transparency: 100 },
  });
  addTopRule(cover, color(light["--dt-brand-orange"]), 0, 0.12);
  cover.addText("Routa", {
    x: pageMarginX,
    y: 0.72,
    w: 2.4,
    h: 0.48,
    fontFace: fonts.heading,
    fontSize: 20,
    bold: true,
    color: color(dark["--dt-text-primary"]),
    margin: 0,
  });
  cover.addText("Color Token\nPresentation Template", {
    x: pageMarginX,
    y: 1.48,
    w: 6.6,
    h: 1.58,
    fontFace: fonts.heading,
    fontSize: 28,
    bold: true,
    color: color(dark["--dt-text-primary"]),
    margin: 0,
  });
  cover.addText("一套基于 Routa 设计令牌自动生成的 16:9 演示模板。适合产品概览、方案提案、状态汇报与流程说明。", {
    x: pageMarginX,
    y: 3.18,
    w: 5.8,
    h: 0.7,
    fontFace: fonts.body,
    fontSize: 13,
    color: color(dark["--dt-text-secondary"]),
    margin: 0,
  });
  ["blue", "amber", "emerald", "orchid"].forEach((familyId, idx) => {
    const swatch = paletteById[familyId][5];
    cover.addShape(pptx.ShapeType.roundRect, {
      x: 10.54,
      y: 1.24 + idx * 1.1,
      w: 1.78,
      h: 0.72,
      rectRadius: 0.16,
      fill: { color: swatch.hex },
      line: { color: swatch.hex, transparency: 100 },
    });
    cover.addText(tokens.paletteFamilies.find((f) => f.id === familyId).label, {
      x: 10.82,
      y: 1.49 + idx * 1.1,
      w: 1.25,
      h: 0.2,
      fontFace: fonts.body,
      fontSize: 9.5,
      bold: true,
      color: pickTextColor(swatch.hex),
      margin: 0,
      align: "center",
    });
  });
  addCopyrightFooter(cover, color(dark["--dt-text-secondary"]));
  addPageNumber(cover, 1, color(light["--dt-brand-blue"]), color(dark["--dt-text-secondary"]), "Master");
  finalizeSlide(cover);

  const section = pptx.addSlide();
  section.background = { color: color(dark["--dt-bg-secondary"]) };
  section.addShape(pptx.ShapeType.rect, {
    x: 0.72,
    y: 0.86,
    w: 5.92,
    h: 5.82,
    fill: { color: color(dark["--dt-bg-primary"]) },
    line: { color: color(dark["--dt-border"]), pt: 1.2 },
  });
  section.addShape(pptx.ShapeType.rect, {
    x: 7.3,
    y: 0.86,
    w: 5.31,
    h: 5.82,
    fill: { color: color(light["--dt-brand-blue"]) },
    line: { color: color(light["--dt-brand-blue"]), transparency: 100 },
  });
  section.addText("Section", {
    x: 1.18,
    y: 1.16,
    w: 1.2,
    h: 0.22,
    fontFace: fonts.body,
    fontSize: 10,
    bold: true,
    color: color(light["--dt-brand-orange"]),
    margin: 0,
  });
  section.addText("Workflow\nOverview", {
    x: 1.18,
    y: 1.68,
    w: 4.6,
    h: 1.1,
    fontFace: fonts.heading,
    fontSize: 28,
    bold: true,
    color: color(dark["--dt-text-primary"]),
    margin: 0,
  });
  section.addText("用章节页隔断内容，适合切换主题、阶段、模块或目标。", {
    x: 1.18,
    y: 3.22,
    w: 3.8,
    h: 0.42,
    fontFace: fonts.body,
    fontSize: 12.5,
    color: color(dark["--dt-text-secondary"]),
    margin: 0,
  });
  section.addText("01", {
    x: 9.1,
    y: 2.42,
    w: 1.8,
    h: 1.1,
    fontFace: fonts.heading,
    fontSize: 36,
    bold: true,
    color: "FFFFFF",
    margin: 0,
  });
  section.addText("Coordinator blue drives section transitions.\nAmber can be swapped in for execution-heavy chapters.", {
    x: 8.26,
    y: 3.78,
    w: 3.3,
    h: 0.76,
    fontFace: fonts.body,
    fontSize: 12,
    color: "DCEAFE",
    margin: 0,
  });
  addCopyrightFooter(section, "B6C6E6");
  addPageNumber(section, 2, color(light["--dt-brand-orange"]), "B6C6E6", "Section");
  finalizeSlide(section);

  const agenda = pptx.addSlide();
  agenda.background = { color: color(semanticByName["app-background"].lightHex) };
  addTopRule(agenda, color(light["--dt-brand-blue"]));
  addTitleBlock(agenda, {
    eyebrow: "Agenda",
    title: "模板结构",
    subtitle: "这页适合目录、议程、路线图，也可以替换成项目范围或交付边界。",
  });
  addCard(agenda, {
    x: pageMarginX,
    y: 2.22,
    w: 5.7,
    h: 4.02,
    title: "Recommended Sections",
    body: "01  背景与目标\n02  当前状态与关键问题\n03  方案设计与执行路径\n04  风险、资源与下一步",
    fillColor: "FFFFFF",
    titleColor: color(light["--dt-text-primary"]),
    bodyColor: color(light["--dt-text-secondary"]),
    borderColor: color(light["--dt-border"]),
    accentColor: color(light["--dt-brand-blue"]),
  });
  addCard(agenda, {
    x: 6.66,
    y: 2.22,
    w: 5.95,
    h: 4.02,
    title: "Layout Guidance",
    body: "保持标题短促，正文每块不超过 4 条。\n优先用浅色底的卡片承载信息，再用蓝 / 橙 / 绿做状态强调。\n章节页和封面可以切换到深色背景形成节奏变化。",
    fillColor: color(light["--dt-bg-primary"]),
    titleColor: color(light["--dt-text-primary"]),
    bodyColor: color(light["--dt-text-secondary"]),
    borderColor: color(light["--dt-border-light"]),
    accentColor: color(light["--dt-brand-orange"]),
  });
  addCopyrightFooter(agenda, color(light["--dt-text-muted"]), color(light["--dt-border"]));
  addPageNumber(agenda, 3, color(light["--dt-brand-blue"]), color(light["--dt-text-muted"]), "Agenda");
  finalizeSlide(agenda);

  const architecture = pptx.addSlide();
  architecture.background = { color: color(light["--dt-bg-primary"]) };
  addTopRule(architecture, color(light["--dt-brand-blue"]));
  addTitleBlock(architecture, {
    eyebrow: "Architecture",
    title: "Routa.js 项目架构",
    subtitle: "Workspace-first 多代理协作平台，通过 Next.js 与 Rust/Axum 双后端保持相同的领域语义与运行行为。",
  });
  slideArchitecture(architecture);
  addCopyrightFooter(architecture, color(light["--dt-text-muted"]), color(light["--dt-border"]));
  addPageNumber(architecture, 4, color(light["--dt-brand-blue"]), color(light["--dt-text-muted"]), "Architecture");
  finalizeSlide(architecture);

  const content = pptx.addSlide();
  content.background = { color: color(light["--dt-bg-primary"]) };
  addTopRule(content, color(light["--dt-brand-green"]));
  addTitleBlock(content, {
    eyebrow: "Content",
    title: "双栏内容页",
    subtitle: "左侧放论点和步骤，右侧放引用、图示、关键结论或风险说明。",
    accent: color(light["--dt-brand-green"]),
  });
  slideDualColumnContent(content);
  addCopyrightFooter(content, color(light["--dt-text-muted"]), color(light["--dt-border"]));
  addPageNumber(content, 5, color(light["--dt-brand-green"]), color(light["--dt-text-muted"]), "Content");
  finalizeSlide(content);

  const metrics = pptx.addSlide();
  metrics.background = { color: color(semanticByName["app-background"].lightHex) };
  addTopRule(metrics, color(light["--dt-brand-orange"]));
  addTitleBlock(metrics, {
    eyebrow: "Metrics",
    title: "指标 / 状态页",
    subtitle: "用于项目周报、运营概览、交付状态或多角色协作看板。",
    accent: color(light["--dt-brand-orange"]),
  });
  slideMetrics(metrics);
  addCopyrightFooter(metrics, color(light["--dt-text-muted"]), color(light["--dt-border"]));
  addPageNumber(metrics, 6, color(light["--dt-brand-orange"]), color(light["--dt-text-muted"]), "Metrics");
  finalizeSlide(metrics);

  const palette = pptx.addSlide();
  palette.background = { color: "FFFFFF" };
  addTopRule(palette, color(light["--dt-brand-purple"]));
  addTitleBlock(palette, {
    eyebrow: "Tokens",
    title: "色板参考页",
    subtitle: "所有主色和语义别名都来自 `src/color-tokens.mjs`，可以作为后续模板二次开发的基准。",
    accent: color(light["--dt-brand-purple"]),
  });
  addPaletteStrip(palette, "blue", 2.6, "Coordinator Blue");
  addPaletteStrip(palette, "amber", 3.28, "Crafter Amber");
  addPaletteStrip(palette, "emerald", 3.96, "Gate Emerald");
  addPaletteStrip(palette, "orchid", 4.64, "Signal Purple");
  addPaletteStrip(palette, "slate", 5.32, "Slate Neutral");
  addCopyrightFooter(palette, color(light["--dt-text-muted"]), color(light["--dt-border"]));
  addPageNumber(palette, 7, color(light["--dt-brand-purple"]), color(light["--dt-text-muted"]), "Palette");
  finalizeSlide(palette);

  const closing = pptx.addSlide();
  closing.background = { color: color(light["--dt-bg-primary"]) };
  closing.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: slideW,
    h: slideH,
    fill: { color: color(light["--dt-bg-primary"]) },
    line: { color: color(light["--dt-bg-primary"]), transparency: 100 },
  });
  closing.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 5.94,
    w: slideW,
    h: 1.56,
    fill: { color: color(dark["--dt-bg-primary"]) },
    line: { color: color(dark["--dt-bg-primary"]), transparency: 100 },
  });
  closing.addText("Thanks.", {
    x: pageMarginX,
    y: 1.02,
    w: 3.6,
    h: 0.64,
    fontFace: fonts.heading,
    fontSize: 30,
    bold: true,
    color: color(light["--dt-text-primary"]),
    margin: 0,
  });
  closing.addText("这个模板已经把 Routa 的品牌语义色和汇报常用版式打包好了。\n后续只需要替换文案、图表和截图。", {
    x: pageMarginX,
    y: 1.88,
    w: 5.1,
    h: 0.74,
    fontFace: fonts.body,
    fontSize: 13,
    color: color(light["--dt-text-secondary"]),
    margin: 0,
  });
  ["primary-action", "execution", "verified", "signal"].forEach((aliasName, idx) => {
    const alias = semanticByName[aliasName];
    addChip(
      closing,
      alias.name,
      pageMarginX + idx * 1.58,
      4.1,
      color(alias.lightHex),
      pickTextColor(alias.lightHex),
      1.38,
    );
  });
  closing.addText("routa-js/tools/ppt-template/dist/routa-color-template.pptx", {
    x: pageMarginX,
    y: 6.42,
    w: 6.1,
    h: 0.22,
    fontFace: fonts.mono,
    fontSize: 9,
    color: color(dark["--dt-text-secondary"]),
    margin: 0,
  });
  addCopyrightFooter(closing, color(dark["--dt-text-secondary"]));
  addPageNumber(closing, 8, color(light["--dt-brand-blue"]), color(dark["--dt-text-secondary"]), "Closing");
  finalizeSlide(closing);
}

function slideDualColumnContent(slide) {
  addCard(slide, {
    x: pageMarginX,
    y: 2.22,
    w: 5.35,
    h: 4.16,
    title: "Narrative Flow",
    body: "",
    fillColor: "FFFFFF",
    titleColor: color(light["--dt-text-primary"]),
    bodyColor: color(light["--dt-text-secondary"]),
    borderColor: color(light["--dt-border"]),
    accentColor: color(light["--dt-brand-blue"]),
  });
  addBulletList(slide, [
    "用 3 到 4 个层级清晰的小标题组织论证。",
    "每一点保持单一语义，避免一行里塞入多个结论。",
    "关键动作使用蓝 / 橙色强调，验证结果使用绿色强调。",
    "如果内容偏密，可以把右侧改成图示区或截图区。",
  ], pageMarginX + 0.34, 2.94, 4.66, color(light["--dt-text-secondary"]), color(light["--dt-brand-blue"]));

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.18,
    y: 2.22,
    w: 6.42,
    h: 4.16,
    rectRadius: 0.14,
    fill: { color: color(dark["--dt-bg-primary"]) },
    line: { color: color(dark["--dt-border"]), pt: 1.2 },
  });
  slide.addText("Key Callout", {
    x: 6.58,
    y: 2.68,
    w: 1.6,
    h: 0.2,
    fontFace: fonts.body,
    fontSize: 10,
    bold: true,
    color: color(light["--dt-brand-orange"]),
    margin: 0,
  });
  slide.addText("“用深色引用区承载一句主结论，可以迅速建立页面视觉重心。”", {
    x: 6.58,
    y: 3.1,
    w: 5.4,
    h: 0.92,
    fontFace: fonts.heading,
    fontSize: 20,
    bold: true,
    color: color(dark["--dt-text-primary"]),
    margin: 0,
  });
  slide.addText("适用场景：方案总结、用户洞察、项目原则、评审结论。", {
    x: 6.58,
    y: 5.46,
    w: 4.8,
    h: 0.26,
    fontFace: fonts.body,
    fontSize: 11.5,
    color: color(dark["--dt-text-secondary"]),
    margin: 0,
  });
}

function slideArchitecture(slide) {
  const layerX = pageMarginX;
  const layerW = 7.48;
  const layerH = 0.78;
  const layerGap = 0.16;
  const startY = 2.1;

  addArchitectureLayer(slide, {
    x: layerX,
    y: startY,
    w: layerW,
    h: layerH,
    label: "L1",
    title: "体验层",
    body: "Home / Workspace / Kanban / Session / Trace / Settings 等页面与桌面壳统一承接用户交互。",
    fillColor: "FFFFFF",
    accentColor: color(light["--dt-brand-blue"]),
    titleColor: color(light["--dt-text-primary"]),
    bodyColor: color(light["--dt-text-secondary"]),
  });
  addArchitectureLayer(slide, {
    x: layerX,
    y: startY + (layerH + layerGap),
    w: layerW,
    h: layerH,
    label: "L2",
    title: "传输与协议层",
    body: "Next.js Route Handlers / Axum Routers 向上暴露 REST、MCP、ACP、A2A、AG-UI、SSE。",
    fillColor: color(light["--dt-bg-primary"]),
    accentColor: color(light["--dt-brand-orange"]),
    titleColor: color(light["--dt-text-primary"]),
    bodyColor: color(light["--dt-text-secondary"]),
  });
  addArchitectureLayer(slide, {
    x: layerX,
    y: startY + (layerH + layerGap) * 2,
    w: layerW,
    h: layerH,
    label: "L3",
    title: "领域服务层",
    body: "Workspace、Session、Task、Kanban、Workflow、Note、Artifact 在两套运行时中保持相同语义。",
    fillColor: "FFFFFF",
    accentColor: color(light["--dt-brand-green"]),
    titleColor: color(light["--dt-text-primary"]),
    bodyColor: color(light["--dt-text-secondary"]),
  });
  addArchitectureLayer(slide, {
    x: layerX,
    y: startY + (layerH + layerGap) * 3,
    w: layerW,
    h: layerH,
    label: "L4",
    title: "存储与执行层",
    body: "Postgres / SQLite / Memory + JSONL traces + local processes + Docker + filesystem。",
    fillColor: color(light["--dt-bg-primary"]),
    accentColor: color(light["--dt-brand-purple"]),
    titleColor: color(light["--dt-text-primary"]),
    bodyColor: color(light["--dt-text-secondary"]),
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 8.62,
    y: 2.1,
    w: 4.0,
    h: 2.16,
    rectRadius: 0.14,
    fill: { color: color(dark["--dt-bg-primary"]) },
    line: { color: color(dark["--dt-border"]), pt: 1.2 },
  });
  slide.addText("双后端运行面", {
    x: 8.94,
    y: 2.38,
    w: 1.8,
    h: 0.2,
    fontFace: fonts.body,
    fontSize: 10,
    bold: true,
    color: color(light["--dt-brand-orange"]),
    margin: 0,
  });
  slide.addText("Web", {
    x: 8.94,
    y: 2.78,
    w: 1.1,
    h: 0.22,
    fontFace: fonts.heading,
    fontSize: 16,
    bold: true,
    color: "FFFFFF",
    margin: 0,
  });
  slide.addText("`src/app` + `src/core`\nNext.js App Router\nRoutaSystem 组装服务容器", {
    x: 8.94,
    y: 3.06,
    w: 1.62,
    h: 0.9,
    fontFace: fonts.body,
    fontSize: 9.5,
    color: color(dark["--dt-text-secondary"]),
    margin: 0,
  });
  slide.addText("Desktop", {
    x: 10.86,
    y: 2.78,
    w: 1.3,
    h: 0.22,
    fontFace: fonts.heading,
    fontSize: 16,
    bold: true,
    color: "FFFFFF",
    margin: 0,
  });
  slide.addText("`apps/desktop` + `crates/*`\nTauri + Axum\nAppState 组装本地运行时", {
    x: 10.86,
    y: 3.06,
    w: 1.44,
    h: 0.9,
    fontFace: fonts.body,
    fontSize: 9.5,
    color: color(dark["--dt-text-secondary"]),
    margin: 0,
  });

  addCard(slide, {
    x: 8.62,
    y: 4.46,
    w: 4.0,
    h: 1.86,
    title: "架构重点",
    body: "1. 以 Workspace 作为顶层边界\n2. 用协议适配屏蔽 provider 差异\n3. Web / Desktop 共享领域模型，而不是分裂成两套产品",
    fillColor: "FFFFFF",
    titleColor: color(light["--dt-text-primary"]),
    bodyColor: color(light["--dt-text-secondary"]),
    borderColor: color(light["--dt-border"]),
    accentColor: color(light["--dt-brand-blue"]),
  });

  const flowY = 6.52;
  const flowW = 2.22;
  const flowH = 0.34;
  const flowGap = 0.28;
  const flowStartX = 0.92;
  addFlowNode(slide, {
    x: flowStartX,
    y: flowY,
    w: flowW,
    h: flowH,
    text: "User / Workspace",
    fillColor: color(paletteById.blue[0].hex),
    lineColor: color(light["--dt-brand-blue"]),
    textColor: color(light["--dt-text-primary"]),
  });
  addFlowNode(slide, {
    x: flowStartX + flowW + flowGap,
    y: flowY,
    w: flowW,
    h: flowH,
    text: "UI + Pages",
    fillColor: color(paletteById.amber[0].hex),
    lineColor: color(light["--dt-brand-orange"]),
    textColor: color(light["--dt-text-primary"]),
  });
  addFlowNode(slide, {
    x: flowStartX + (flowW + flowGap) * 2,
    y: flowY,
    w: flowW,
    h: flowH,
    text: "Protocols + Services",
    fillColor: color(paletteById.emerald[0].hex),
    lineColor: color(light["--dt-brand-green"]),
    textColor: color(light["--dt-text-primary"]),
  });
  addFlowNode(slide, {
    x: flowStartX + (flowW + flowGap) * 3,
    y: flowY,
    w: flowW,
    h: flowH,
    text: "Stores + Runtime",
    fillColor: color(paletteById.orchid[0].hex),
    lineColor: color(light["--dt-brand-purple"]),
    textColor: color(light["--dt-text-primary"]),
  });

  for (let idx = 0; idx < 3; idx += 1) {
    slide.addShape(pptx.ShapeType.chevron, {
      x: flowStartX + flowW + 0.08 + idx * (flowW + flowGap),
      y: flowY + 0.06,
      w: 0.12,
      h: 0.22,
      fill: { color: color(light["--dt-border-light"]) },
      line: { color: color(light["--dt-border-light"]), transparency: 100 },
    });
  }
}

function slideMetrics(slide) {
  const cardY = 2.18;
  const cardW = 2.92;
  const gap = 0.24;
  addMetricCard(slide, {
    x: pageMarginX,
    y: cardY,
    w: cardW,
    h: 1.46,
    label: "Coordinator",
    value: "12",
    hint: "active sessions",
    fillColor: color(paletteById.blue[0].hex),
    accentColor: color(light["--dt-brand-blue"]),
    textColor: color(light["--dt-text-primary"]),
  });
  addMetricCard(slide, {
    x: pageMarginX + cardW + gap,
    y: cardY,
    w: cardW,
    h: 1.46,
    label: "Crafter",
    value: "08",
    hint: "tasks in progress",
    fillColor: color(paletteById.amber[0].hex),
    accentColor: color(light["--dt-brand-orange"]),
    textColor: color(light["--dt-text-primary"]),
  });
  addMetricCard(slide, {
    x: pageMarginX + (cardW + gap) * 2,
    y: cardY,
    w: cardW,
    h: 1.46,
    label: "Gate",
    value: "96%",
    hint: "verification pass rate",
    fillColor: color(paletteById.emerald[0].hex),
    accentColor: color(light["--dt-brand-green"]),
    textColor: color(light["--dt-text-primary"]),
  });
  addMetricCard(slide, {
    x: pageMarginX + (cardW + gap) * 3,
    y: cardY,
    w: cardW,
    h: 1.46,
    label: "Risk",
    value: "03",
    hint: "blocked items",
    fillColor: color(paletteById.red[0].hex),
    accentColor: color(light["--dt-brand-red"]),
    textColor: color(light["--dt-text-primary"]),
  });

  addCard(slide, {
    x: pageMarginX,
    y: 3.9,
    w: 6.22,
    h: 2.42,
    title: "Status Summary",
    body: "用左下大卡片承接趋势、说明、结论或风险动作。\n如果要放图表，可以直接用这块区域替换成柱状图、漏斗图或时间线。",
    fillColor: "FFFFFF",
    titleColor: color(light["--dt-text-primary"]),
    bodyColor: color(light["--dt-text-secondary"]),
    borderColor: color(light["--dt-border"]),
    accentColor: color(light["--dt-brand-blue"]),
  });
  addCard(slide, {
    x: 6.52,
    y: 3.9,
    w: 2.96,
    h: 2.42,
    title: "Up Next",
    body: "1. 锁定负责人\n2. 清理阻塞项\n3. 推进评审闭环",
    fillColor: color(light["--dt-bg-primary"]),
    titleColor: color(light["--dt-text-primary"]),
    bodyColor: color(light["--dt-text-secondary"]),
    borderColor: color(light["--dt-border-light"]),
    accentColor: color(light["--dt-brand-orange"]),
  });
  addCard(slide, {
    x: 9.78,
    y: 3.9,
    w: 2.84,
    h: 2.42,
    title: "Signal",
    body: "用紫色卡片专门承载亮点、AI 提示或需要被记住的一句结论。",
    fillColor: color(paletteById.orchid[0].hex),
    titleColor: color(light["--dt-text-primary"]),
    bodyColor: color(light["--dt-text-secondary"]),
    borderColor: color(paletteById.orchid[2].hex),
    accentColor: color(light["--dt-brand-purple"]),
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  buildPresentation();
  await pptx.writeFile({ fileName: outputPath });
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
