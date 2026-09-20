// Copyright (c) OpenAI. All rights reserved.
"use strict";

const {
  registry,
  renderDiagramSlide,
  PAGE,
  FONTS,
  COLORS,
  MARGINS,
} = require("../diagram_renderers");

module.exports = {
  diagramRendererRegistry: registry,
  renderDiagramSlide,
  diagramTheme: {
    PAGE,
    FONTS,
    COLORS,
    MARGINS,
  },
};
