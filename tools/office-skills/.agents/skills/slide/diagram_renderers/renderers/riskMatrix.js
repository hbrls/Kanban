const {
  SHAPES,
  setSlideDefaults,
  addTitle,
  addFooter,
  addSourceNotes,
  addParagraph,
  addBox,
  addCircleBadge,
  addLine,
} = require('../runtime/base');
const { COLORS } = require('../theme');

function renderRiskMatrix(slide, pptx, data) {
  setSlideDefaults(slide);
  addTitle(slide, data.title);
  addFooter(slide, data.sourceSlide);
  addSourceNotes(slide, data);

  slide.addShape(SHAPES.rect, {
    x: data.notePanel.x,
    y: 0,
    w: data.notePanel.w,
    h: 5.625,
    fill: { color: COLORS.mist },
    line: { color: COLORS.mist, transparency: 100 },
  });
  addParagraph(slide, data.note, {
    x: data.notePanel.x + 0.40,
    y: 1.72,
    w: data.notePanel.w - 0.8,
    fontSize: 12,
    leading: 1.25,
  });

  const { x, y, labelW, cellW, rowH, bottomH } = data.matrix;

  data.rows.forEach((rowLabel, r) => {
    addBox(slide, rowLabel, {
      x,
      y: y + r * rowH,
      w: labelW,
      h: rowH - 0.02,
      fill: COLORS.lightGrey,
      color: COLORS.text,
      fontSize: 9,
      bold: true,
      margin: 0.02,
      maxFontSize: 9,
      minFontSize: 7.5,
    });
    data.colors[r].forEach((colorKey, c) => {
      addBox(slide, '', {
        x: x + labelW + c * cellW,
        y: y + r * rowH,
        w: cellW - 0.02,
        h: rowH - 0.02,
        fill: COLORS[colorKey],
        line: { color: COLORS.white, transparency: 100 },
      });
    });
  });

  data.columns.forEach((colLabel, c) => {
    addBox(slide, colLabel, {
      x: x + labelW + c * cellW,
      y: y + data.rows.length * rowH,
      w: cellW - 0.02,
      h: bottomH,
      fill: COLORS.lightGrey,
      color: COLORS.text,
      fontSize: 7.3,
      bold: true,
      margin: 0.04,
      maxFontSize: 7.3,
      minFontSize: 5.9,
    });
  });

  addLine(slide, x - 0.12, y + data.rows.length * rowH + bottomH + 0.12, x + labelW + data.columns.length * cellW - 0.05, y + data.rows.length * rowH + bottomH + 0.12, {
    color: COLORS.line,
    width: 1,
    endArrowType: 'triangle',
  });
  addLine(slide, x - 0.12, y + data.rows.length * rowH + bottomH + 0.12, x - 0.12, y - 0.02, {
    color: COLORS.line,
    width: 1,
    endArrowType: 'triangle',
  });

  slide.addText('Probability', {
    x: 5.85,
    y: 4.64,
    w: 1.1,
    h: 0.18,
    fontFace: 'Inter',
    fontSize: 10,
    bold: true,
    margin: 0,
    breakLine: false,
  });
  slide.addText('Impact to business', {
    x: 0.18,
    y: 2.17,
    w: 1.3,
    h: 0.18,
    fontFace: 'Inter',
    fontSize: 10,
    bold: true,
    margin: 0,
    rotate: 270,
    breakLine: false,
  });

  data.markers.forEach((marker) => {
    addCircleBadge(slide, marker.label, {
      x: x + labelW + marker.col * cellW + cellW / 2 - 0.175,
      y: y + marker.row * rowH + rowH / 2 - 0.175,
      w: 0.35,
      h: 0.35,
      fill: COLORS.pink,
      color: COLORS.white,
      fontSize: 11,
      bold: true,
      line: { color: COLORS.white, width: 1.2 },
    });
  });

  return { allowIntentionalOverlap: false };
}

module.exports = { renderRiskMatrix };
