const {
  setSlideDefaults,
  addTitle,
  addSubtitle,
  addFooter,
  addSourceNotes,
  addBox,
  addLine,
  addPolyline,
  addParagraph,
} = require('../runtime/base');
const { COLORS } = require('../theme');

const STYLE_MAP = {
  pink: { fill: COLORS.pink, color: COLORS.white, fontSize: 7.6, bold: false },
  grey: { fill: COLORS.lightGrey, color: COLORS.text, fontSize: 7.0, bold: false },
  mustard: { fill: COLORS.amber, color: COLORS.white, fontSize: 7.4, bold: true },
  navy: { fill: COLORS.wave, color: COLORS.white, fontSize: 7.0, bold: false },
  aqua: { fill: COLORS.sapphire, color: COLORS.white, fontSize: 7.0, bold: false },
};

function renderTestingApproach(slide, pptx, data) {
  setSlideDefaults(slide);
  addTitle(slide, data.title);
  addSubtitle(slide, data.subtitle, { y: 0.93, fontSize: 16 });
  addFooter(slide, data.sourceSlide);
  addSourceNotes(slide, data);

  data.lines.forEach((line) => {
    const pts = line.points;
    if (pts.length === 2) {
      addLine(slide, pts[0][0], pts[0][1], pts[1][0], pts[1][1], {
        color: line.color || COLORS.line,
        width: line.width || 1,
        endArrowType: line.endArrow ? 'triangle' : undefined,
        beginArrowType: line.beginArrow ? 'triangle' : undefined,
      });
    } else {
      addPolyline(slide, pts, {
        color: line.color || COLORS.line,
        width: line.width || 1,
        endArrowType: line.endArrow ? 'triangle' : undefined,
        beginArrowType: line.beginArrow ? 'triangle' : undefined,
      });
    }
  });

  data.nodes.forEach((node) => {
    const style = STYLE_MAP[node.style] || STYLE_MAP.grey;
    addBox(slide, node.text, {
      x: node.x,
      y: node.y,
      w: node.w,
      h: node.h,
      fill: style.fill,
      color: style.color,
      fontSize: node.fontSize || style.fontSize,
      bold: node.bold !== undefined ? node.bold : style.bold,
      margin: node.margin ?? 0.04,
      maxFontSize: node.maxFontSize || node.fontSize || style.fontSize,
      minFontSize: node.minFontSize || 5.4,
      align: node.align || 'center',
      valign: node.valign || 'mid',
    });
  });

  data.labels.forEach((label) => {
    addParagraph(slide, label.text, {
      x: label.x,
      y: label.y,
      w: label.w,
      fontSize: label.fontSize || 6.8,
      bold: label.bold || false,
      color: label.color ? COLORS[label.color] || label.color : COLORS.pink,
    });
  });

  return { allowIntentionalOverlap: false };
}

module.exports = { renderTestingApproach };
