const {
  SHAPES,
  setSlideDefaults,
  addTitle,
  addFooter,
  addSourceNotes,
  addBox,
} = require('../runtime/base');
const { COLORS } = require('../theme');

function renderPlanningOnion(slide, pptx, data) {
  setSlideDefaults(slide);
  addTitle(slide, data.title);
  addFooter(slide, data.sourceSlide);
  addSourceNotes(slide, data);

  data.layers.forEach((layer) => {
    addBox(slide, '', {
      x: layer.x,
      y: layer.y,
      w: layer.w,
      h: layer.h,
      fill: COLORS[layer.color],
      shape: SHAPES.ellipse,
      line: { color: COLORS.white, width: 1 },
    });
  });

  data.labels.forEach((label) => {
    slide.addText(label.text, {
      x: label.x,
      y: label.y,
      w: label.w,
      h: label.h,
      fontFace: 'Inter',
      fontSize: label.fontSize || 12,
      bold: true,
      color: COLORS.white,
      margin: 0,
      align: 'center',
      valign: 'mid',
      breakLine: false,
    });
  });

  return { allowIntentionalOverlap: true };
}

module.exports = { renderPlanningOnion };
