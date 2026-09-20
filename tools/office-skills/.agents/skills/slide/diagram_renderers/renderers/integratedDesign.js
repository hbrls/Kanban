const {
  SHAPES,
  setSlideDefaults,
  addTitle,
  addFooter,
  addSourceNotes,
  addParagraph,
  addRichParagraph,
  addBox,
  addCircleBadge,
  addLine,
  addWaveStroke,
} = require('../runtime/base');
const { COLORS } = require('../theme');

function drawDevice(slide, x, y, w, h, color = COLORS.wave) {
  slide.addShape(SHAPES.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color },
    line: { color, transparency: 100 },
  });
  slide.addShape(SHAPES.rect, {
    x: x + w * 0.18,
    y: y + h * 0.14,
    w: w * 0.64,
    h: h * 0.62,
    fill: { color: COLORS.white, transparency: 100 },
    line: { color: COLORS.white, width: 0.8 },
  });
}

function drawPeople(slide, x, y, color = COLORS.amber, count = 3) {
  const spacing = 0.18;
  for (let i = 0; i < count; i += 1) {
    const cx = x + i * spacing;
    slide.addShape(SHAPES.ellipse, {
      x: cx,
      y,
      w: 0.12,
      h: 0.12,
      fill: { color },
      line: { color, transparency: 100 },
    });
    slide.addShape(SHAPES.arc, {
      x: cx - 0.005,
      y: y + 0.10,
      w: 0.13,
      h: 0.10,
      fill: { color: COLORS.white, transparency: 100 },
      line: { color, width: 1.6 },
    });
  }
}

function drawPlatformIconColumn(slide, x, topY, bottomY, iconKind) {
  addLine(slide, x, topY, x, bottomY, { color: COLORS.wave, width: 1.4, endArrowType: 'triangle' });
  if (iconKind === 'building') {
    addBox(slide, '', { x: x - 0.12, y: topY - 0.10, w: 0.18, h: 0.18, fill: COLORS.sapphire });
    slide.addText('▦', { x: x - 0.11, y: topY - 0.095, w: 0.16, h: 0.16, fontFace: 'Inter', fontSize: 8, color: COLORS.white, align: 'center', margin: 0 });
  } else if (iconKind === 'money') {
    addBox(slide, '$', { x: x - 0.10, y: topY - 0.10, w: 0.18, h: 0.18, fill: COLORS.wave, color: COLORS.white, fontSize: 8.5, bold: true });
  } else if (iconKind === 'cloud') {
    slide.addShape(SHAPES.cloud, {
      x: x - 0.10,
      y: topY - 0.08,
      w: 0.20,
      h: 0.14,
      fill: { color: COLORS.wave },
      line: { color: COLORS.wave, transparency: 100 },
    });
  } else if (iconKind === 'database') {
    slide.addShape(SHAPES.can, {
      x: x - 0.09,
      y: topY - 0.11,
      w: 0.18,
      h: 0.20,
      fill: { color: COLORS.wave },
      line: { color: COLORS.wave, transparency: 100 },
    });
  } else if (iconKind === 'network') {
    const pts = [
      [x - 0.08, topY - 0.02],
      [x + 0.08, topY - 0.02],
      [x - 0.08, topY + 0.08],
      [x + 0.08, topY + 0.08],
    ];
    pts.forEach(([cx, cy]) => addCircleBadge(slide, '', { x: cx - 0.02, y: cy - 0.02, w: 0.04, h: 0.04, fill: COLORS.wave }));
    addLine(slide, pts[0][0], pts[0][1], pts[1][0], pts[1][1], { color: COLORS.wave, width: 1 });
    addLine(slide, pts[0][0], pts[0][1], pts[2][0], pts[2][1], { color: COLORS.wave, width: 1 });
    addLine(slide, pts[1][0], pts[1][1], pts[3][0], pts[3][1], { color: COLORS.wave, width: 1 });
    addLine(slide, pts[2][0], pts[2][1], pts[3][0], pts[3][1], { color: COLORS.wave, width: 1 });
  }
}

function renderIntegratedDesign(slide, pptx, data) {
  setSlideDefaults(slide);
  addTitle(slide, data.title);
  addFooter(slide, data.sourceSlide);
  addSourceNotes(slide, data);

  addParagraph(slide, data.introTop, {
    x: 0.58,
    y: 1.34,
    w: 2.25,
    fontSize: 12,
    leading: 1.23,
  });
  addParagraph(slide, data.introBottom, {
    x: 0.58,
    y: 2.85,
    w: 2.25,
    fontSize: 12,
    leading: 1.23,
  });

  slide.addShape(SHAPES.triangle, {
    x: 2.93,
    y: 1.50,
    w: 4.15,
    h: 3.70,
    fill: { color: COLORS.triangle, transparency: 15 },
    line: { color: COLORS.triangle, transparency: 100 },
  });

  addWaveStroke(slide, { x: 1.14, y: 2.23, w: 7.90, h: 0.36, color: COLORS.sapphire, width: 1.2 });

  drawPeople(slide, 3.30, 1.88, COLORS.amber, 3);
  drawDevice(slide, 4.48, 1.47, 0.20, 0.36, COLORS.wave);
  drawDevice(slide, 4.81, 1.31, 0.36, 0.45, COLORS.wave);
  drawDevice(slide, 5.31, 1.47, 0.20, 0.36, COLORS.wave);
  slide.addShape(SHAPES.can, {
    x: 6.58,
    y: 1.39,
    w: 0.18,
    h: 0.53,
    fill: { color: COLORS.green },
    line: { color: COLORS.green, transparency: 100 },
  });
  slide.addShape(SHAPES.can, {
    x: 6.95,
    y: 1.54,
    w: 0.22,
    h: 0.38,
    fill: { color: COLORS.sapphire },
    line: { color: COLORS.sapphire, transparency: 100 },
  });
  drawPeople(slide, 7.33, 1.57, COLORS.purple, 2);

  slide.addText('New product', {
    x: 4.40,
    y: 2.03,
    w: 1.15,
    h: 0.18,
    fontFace: 'Inter',
    fontSize: 10.5,
    bold: true,
    margin: 0,
    align: 'center',
  });

  const evoXs = [3.74, 4.28, 4.82, 5.36, 5.90, 6.44];
  evoXs.forEach((x) => {
    slide.addShape(SHAPES.circularArrow, {
      x,
      y: 2.72,
      w: 0.32,
      h: 0.32,
      fill: { color: COLORS.white, transparency: 100 },
      line: { color: COLORS.pink, width: 1.4 },
    });
  });
  slide.addText('Evolution', {
    x: 4.42,
    y: 3.06,
    w: 1.10,
    h: 0.18,
    fontFace: 'Inter',
    fontSize: 10.5,
    bold: true,
    margin: 0,
    align: 'center',
  });

  drawPlatformIconColumn(slide, 3.99, 3.81, 4.50, 'building');
  drawPlatformIconColumn(slide, 4.43, 4.01, 4.50, 'money');
  drawPlatformIconColumn(slide, 4.88, 3.78, 4.50, 'cloud');
  drawPlatformIconColumn(slide, 5.32, 3.78, 4.50, 'database');
  drawPlatformIconColumn(slide, 5.76, 4.01, 4.50, 'network');

  slide.addShape(SHAPES.trapezoid, {
    x: 3.31,
    y: 4.50,
    w: 3.38,
    h: 0.52,
    fill: { color: COLORS.wave },
    line: { color: COLORS.wave, transparency: 100 },
    flipV: true,
  });
  slide.addText('Platforms', {
    x: 4.39,
    y: 4.68,
    w: 1.20,
    h: 0.16,
    fontFace: 'Inter',
    fontSize: 10.5,
    color: COLORS.white,
    bold: true,
    margin: 0,
    align: 'center',
  });

  drawDevice(slide, 5.93, 4.66, 0.10, 0.18, COLORS.white);
  drawDevice(slide, 6.11, 4.62, 0.15, 0.22, COLORS.white);
  drawDevice(slide, 6.33, 4.67, 0.10, 0.17, COLORS.white);

  addRichParagraph(slide, [
    { text: 'Evolution over time:\n', options: { bold: true } },
    { text: 'Enable regular rapid releases by applying Continuous Delivery practices to product development.' },
  ], {
    x: 0.82,
    y: 3.84,
    w: 2.47,
    h: 0.80,
    fontFace: 'Inter',
    fontSize: 10.5,
    margin: 0,
  });

  addRichParagraph(slide, [
    { text: 'CX strategy:\n', options: { bold: true } },
    { text: 'Apply user research and service design to ensure frictionless experience across multiple platforms.' },
  ], {
    x: 6.95,
    y: 2.73,
    w: 2.65,
    h: 0.94,
    fontFace: 'Inter',
    fontSize: 10.5,
    margin: 0,
  });

  addRichParagraph(slide, [
    { text: 'Microservice/API governance:\n', options: { bold: true } },
    { text: 'Create first class APIs for the applications to consume.' },
  ], {
    x: 7.55,
    y: 4.47,
    w: 2.20,
    h: 0.66,
    fontFace: 'Inter',
    fontSize: 10.5,
    margin: 0,
  });

  addLine(slide, 3.57, 3.59, 4.31, 3.59, { color: COLORS.sapphire, width: 1.1 });
  addLine(slide, 6.42, 4.76, 7.16, 4.76, { color: COLORS.sapphire, width: 1.1 });
  addCircleBadge(slide, '', { x: 3.55, y: 3.57, w: 0.06, h: 0.06, fill: COLORS.sapphire, line: { color: COLORS.sapphire, transparency: 100 } });
  addCircleBadge(slide, '', { x: 4.30, y: 3.57, w: 0.06, h: 0.06, fill: COLORS.sapphire, line: { color: COLORS.sapphire, transparency: 100 } });
  addCircleBadge(slide, '', { x: 6.40, y: 4.74, w: 0.06, h: 0.06, fill: COLORS.wave, line: { color: COLORS.wave, transparency: 100 } });
  addCircleBadge(slide, '', { x: 7.14, y: 4.74, w: 0.06, h: 0.06, fill: COLORS.wave, line: { color: COLORS.wave, transparency: 100 } });

  return { allowIntentionalOverlap: true };
}

module.exports = { renderIntegratedDesign };
