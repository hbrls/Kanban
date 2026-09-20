"use strict";

const registry = require("./registry");
const { PAGE, FONTS, COLORS, MARGINS } = require("./theme");

function renderDiagramSlide(slide, pptx, kind, data) {
  const renderer = registry[kind];
  if (!renderer) {
    throw new Error(`Unknown diagram renderer kind: ${kind}`);
  }
  slide.__diagramRenderData = data || {};
  try {
    return renderer(slide, pptx, data || {});
  } finally {
    delete slide.__diagramRenderData;
  }
}

module.exports = {
  registry,
  renderDiagramSlide,
  PAGE,
  FONTS,
  COLORS,
  MARGINS,
};
