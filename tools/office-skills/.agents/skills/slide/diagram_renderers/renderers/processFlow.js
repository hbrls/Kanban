const {
  SHAPES,
  setSlideDefaults,
  addTitle,
  addFooter,
  addSourceNotes,
  addBox,
  addDurationBracket,
} = require('../runtime/base');
const { COLORS } = require('../theme');

function renderProcessFlow(slide, pptx, data) {
  setSlideDefaults(slide);
  addTitle(slide, data.title);
  addFooter(slide, data.sourceSlide);
  addSourceNotes(slide, data);

  slide.addShape(SHAPES.rightArrow, {
    x: 0.40,
    y: 1.17,
    w: 9.18,
    h: 0.43,
    fill: { color: COLORS.amber },
    line: { color: COLORS.amber, transparency: 100 },
  });
  addBox(slide, data.topDuration, {
    x: 3.95,
    y: 1.18,
    w: 1.3,
    h: 0.18,
    fill: COLORS.amber,
    color: COLORS.white,
    fontSize: 10,
    bold: true,
    line: { color: COLORS.amber, transparency: 100 },
    margin: 0,
  });

  addDurationBracket(slide, {
    x1: 1.76,
    x2: 5.64,
    y: 1.85,
    label: data.segmentDurations[0].label,
    labelW: 0.75,
    fontSize: 8,
  });
  addDurationBracket(slide, {
    x1: 5.79,
    x2: 8.28,
    y: 1.85,
    label: data.segmentDurations[1].label,
    labelW: 0.55,
    fontSize: 8,
  });

  const stageW = 1.20;
  const gap = 0.136;
  const stageY = 2.06;
  const stageH = 0.80;
  const detailY1 = 2.99;
  const detailY2 = 3.92;
  const detailH = 0.78;
  const startX = 0.40;

  data.stages.forEach((stage, index) => {
    const x = startX + index * (stageW + gap);
    addBox(slide, stage.label, {
      x,
      y: stageY,
      w: stageW,
      h: stageH,
      fill: stage.color === 'pink' ? COLORS.pink : COLORS.wave,
      color: COLORS.white,
      fontSize: 10,
      bold: true,
      margin: 0.07,
      maxFontSize: 10,
      minFontSize: 7,
    });

    const detailFill = stage.detailColor === 'pink' ? COLORS.palePink : COLORS.card;
    addBox(slide, stage.details[0], {
      x,
      y: detailY1,
      w: stageW,
      h: detailH,
      fill: detailFill,
      color: COLORS.text,
      fontSize: 8.6,
      margin: 0.06,
      maxFontSize: 8.6,
      minFontSize: 6.6,
    });
    addBox(slide, stage.details[1], {
      x,
      y: detailY2,
      w: stageW,
      h: detailH,
      fill: detailFill,
      color: COLORS.text,
      fontSize: 8.6,
      margin: 0.06,
      maxFontSize: 8.6,
      minFontSize: 6.6,
    });
  });

  return { allowIntentionalOverlap: false };
}

module.exports = { renderProcessFlow };
