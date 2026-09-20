const {
  SHAPES,
  setSlideDefaults,
  addTitle,
  addFooter,
  addSourceNotes,
  addBox,
  addParagraph,
  addDiamond,
  addLine,
} = require('../runtime/base');
const { COLORS } = require('../theme');

function renderProjectPlan(slide, pptx, data) {
  setSlideDefaults(slide);
  addTitle(slide, data.title);
  addFooter(slide, data.sourceSlide);
  addSourceNotes(slide, data);

  const chart = data.chart;
  slide.addShape(SHAPES.rect, {
    x: chart.x,
    y: chart.y,
    w: chart.w,
    h: chart.h,
    fill: { color: COLORS.mist },
    line: { color: COLORS.mist, transparency: 100 },
  });

  let cursorX = chart.x;
  data.columns.forEach((col, idx) => {
    addBox(slide, `${col.label}\n${col.duration}`, {
      x: cursorX,
      y: chart.headerY,
      w: col.w,
      h: chart.headerH,
      fill: COLORS.wave,
      color: COLORS.white,
      fontSize: 8.6,
      bold: false,
      margin: 0.01,
      maxFontSize: 8.6,
      minFontSize: 6.8,
    });
    if (idx > 0) {
      addLine(slide, cursorX, chart.y, cursorX, chart.y + chart.h, { color: COLORS.white, width: 1.1 });
    }
    cursorX += col.w;
  });

  data.bars.forEach((bar) => {
    addBox(slide, bar.label, {
      x: chart.x + bar.x,
      y: chart.y + bar.y,
      w: bar.w,
      h: bar.h,
      fill: COLORS[bar.color],
      color: COLORS.white,
      fontSize: 8.3,
      align: 'left',
      margin: 0.06,
      shape: SHAPES.rightArrow,
      maxFontSize: 8.3,
      minFontSize: 6.6,
    });
  });

  data.milestones.forEach((m) => {
    addDiamond(slide, chart.x + m.x, chart.y + m.y, 0.12, COLORS[m.color]);
  });

  addParagraph(slide, data.notes.join('\n'), {
    x: data.notesPanel.x,
    y: data.notesPanel.y,
    w: data.notesPanel.w,
    fontSize: 7.4,
    leading: 1.22,
  });

  addParagraph(slide, 'Legends for milestone', {
    x: data.legendPanel.x,
    y: data.legendPanel.y,
    w: 1.3,
    fontSize: 8.8,
    bold: true,
  });

  data.legend.forEach((item, idx) => {
    const y = data.legendPanel.y + 0.36 + idx * 0.28;
    if (item.type === 'diamond') {
      addDiamond(slide, data.legendPanel.x + 0.03, y + 0.03, 0.12, COLORS[item.color]);
    } else {
      addBox(slide, '', {
        x: data.legendPanel.x + 0.03,
        y,
        w: 0.14,
        h: 0.14,
        fill: COLORS[item.color],
        shape: SHAPES.rect,
      });
    }
    addParagraph(slide, item.label, {
      x: data.legendPanel.x + 0.25,
      y: y - 0.005,
      w: 1.2,
      fontSize: 7.9,
    });
  });

  addParagraph(slide, 'Streams of work', {
    x: data.streamPanel.x,
    y: data.streamPanel.y,
    w: 1.2,
    fontSize: 8.8,
    bold: true,
  });
  data.streamChips.forEach((chip, idx) => {
    const y = data.streamPanel.y + 0.28 + idx * 0.24;
    addBox(slide, chip.label, {
      x: data.streamPanel.x + (chip.offsetX || 0),
      y,
      w: 0.62,
      h: 0.17,
      fill: COLORS[chip.color],
      color: COLORS.white,
      align: 'left',
      margin: 0.05,
      fontSize: 8.2,
      maxFontSize: 8.2,
      minFontSize: 7,
    });
  });

  return { allowIntentionalOverlap: false };
}

module.exports = { renderProjectPlan };
