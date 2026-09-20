const PptxGenJS = require('pptxgenjs');
const { calcTextBox, autoFontSize, svgToDataUri } = require('./slide-skill');
const { PAGE, COLORS, FONTS, MARGINS } = require('../theme');

const shapeRef = new PptxGenJS();
const SHAPES = shapeRef.ShapeType;

function noLine() {
  return { color: COLORS.white, transparency: 100 };
}

function getSlideMeta(slide) {
  return slide && slide.__diagramRenderData ? slide.__diagramRenderData : {};
}

function setSlideDefaults(slide) {
  slide.background = { color: COLORS.white };
}

function addTitle(slide, title, opts = {}) {
  const y = opts.y ?? 0.40;
  const h = opts.h ?? 0.50;
  slide.addText(title, {
    x: opts.x ?? MARGINS.left,
    y,
    w: opts.w ?? PAGE.width - MARGINS.left - MARGINS.right,
    h,
    fontFace: FONTS.headline,
    fontSize: opts.fontSize ?? 28,
    bold: true,
    color: opts.color ?? COLORS.text,
    margin: 0,
    valign: 'mid',
    align: opts.align ?? 'left',
    breakLine: false,
  });
}

function addSubtitle(slide, subtitle, opts = {}) {
  if (!subtitle) return;
  slide.addText(subtitle, {
    x: opts.x ?? MARGINS.left,
    y: opts.y ?? 0.90,
    w: opts.w ?? PAGE.width - MARGINS.left - MARGINS.right,
    h: opts.h ?? 0.25,
    fontFace: FONTS.body,
    fontSize: opts.fontSize ?? 14,
    bold: true,
    color: opts.color ?? COLORS.text,
    margin: 0,
    valign: 'mid',
    align: opts.align ?? 'left',
    breakLine: false,
  });
}

function addFooter(slide, pageNumber) {
  const meta = getSlideMeta(slide);
  const footerText = typeof meta.footerText === 'string' ? meta.footerText.trim() : '';
  const footerLabel = meta.footerLabel ?? pageNumber;
  const showPageNumber = meta.showPageNumber !== false;

  if (footerText) {
    slide.addText(footerText, {
      x: MARGINS.left,
      y: PAGE.height - 0.34,
      w: 3.4,
      h: 0.12,
      fontFace: FONTS.body,
      fontSize: 5.8,
      color: COLORS.footer,
      margin: 0,
      breakLine: false,
    });
  }

  if (showPageNumber && footerLabel !== undefined && footerLabel !== null && String(footerLabel).length > 0) {
    slide.addText(String(footerLabel), {
      x: PAGE.width - 0.46,
      y: PAGE.height - 0.34,
      w: 0.28,
      h: 0.12,
      fontFace: FONTS.body,
      fontSize: 7,
      color: COLORS.footer,
      margin: 0,
      align: 'right',
      breakLine: false,
    });
  }
}

function addSourceNotes(slide, data) {
  const meta = getSlideMeta(slide);
  if (meta.disableSourceNotes === true || data.disableSourceNotes === true) {
    return;
  }

  const sourceNotes = Array.isArray(data.sourceNotes)
    ? data.sourceNotes
    : Array.isArray(meta.sourceNotes)
      ? meta.sourceNotes
      : [];
  if (sourceNotes.length > 0) {
    slide.addNotes(`[Sources]\n${sourceNotes.map((line) => `- ${line}`).join('\n')}`);
    return;
  }

  const sourceNoteOverride =
    typeof data.sourceNoteOverride === 'string' && data.sourceNoteOverride.trim().length > 0
      ? data.sourceNoteOverride.trim()
      : typeof meta.sourceNoteOverride === 'string' && meta.sourceNoteOverride.trim().length > 0
        ? meta.sourceNoteOverride.trim()
        : '';
  if (sourceNoteOverride) {
    slide.addNotes(`[Sources]\n- ${sourceNoteOverride}`);
  }
}

function addParagraph(slide, text, opts = {}) {
  const fontFace = opts.fontFace || FONTS.body;
  const fontSize = opts.fontSize || 11;
  const textOpts = calcTextBox(fontSize, {
    text,
    x: opts.x,
    y: opts.y,
    w: opts.w,
    fontFace,
    bold: opts.bold || false,
    italic: opts.italic || false,
    margin: opts.margin ?? 0,
    padding: opts.padding ?? 0,
    leading: opts.leading ?? 1.15,
    paraSpaceAfter: opts.paraSpaceAfter ?? 0,
  });
  slide.addText(text, {
    ...textOpts,
    fontFace,
    fontSize,
    bold: opts.bold || false,
    italic: opts.italic || false,
    color: opts.color || COLORS.text,
    margin: opts.margin ?? 0,
    valign: opts.valign || 'top',
    align: opts.align || 'left',
    fit: 'shrink',
  });
}

function addRichParagraph(slide, runs, opts = {}) {
  slide.addText(runs, {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.h,
    fontFace: opts.fontFace || FONTS.body,
    fontSize: opts.fontSize || 10.5,
    color: opts.color || COLORS.text,
    margin: opts.margin ?? 0,
    valign: opts.valign || 'top',
    align: opts.align || 'left',
    fit: 'shrink',
    breakLine: false,
    paraSpaceAfterPt: 0,
    bold: false,
  });
}

function addBox(slide, text, opts = {}) {
  const shape = opts.shape || SHAPES.rect;
  slide.addShape(shape, {
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.h,
    fill: { color: opts.fill || COLORS.white, transparency: opts.fillTransparency ?? 0 },
    line: opts.line || noLine(),
    flipH: opts.flipH || false,
    flipV: opts.flipV || false,
    rotate: opts.rotate,
  });
  if (text !== undefined && text !== null && text !== '') {
    slide.addText(text, {
      x: opts.x,
      y: opts.y,
      w: opts.w,
      h: opts.h,
      fontFace: opts.fontFace || FONTS.body,
      color: opts.color || COLORS.text,
      bold: opts.bold || false,
      italic: opts.italic || false,
      margin: opts.margin ?? 0.03,
      align: opts.align || 'center',
      valign: opts.valign || 'mid',
      fit: 'shrink',
      breakLine: false,
      ...autoFontSize(text, opts.fontFace || FONTS.body, {
        x: opts.x,
        y: opts.y,
        w: opts.w,
        h: opts.h,
        fontSize: opts.fontSize || 10,
        minFontSize: opts.minFontSize || 6,
        maxFontSize: opts.maxFontSize || opts.fontSize || 10,
        mode: 'shrink',
      }),
    });
  }
}

function addCircleBadge(slide, text, opts = {}) {
  addBox(slide, text, {
    ...opts,
    shape: SHAPES.ellipse,
    align: 'center',
    valign: 'mid',
    bold: opts.bold ?? false,
    margin: opts.margin ?? 0,
  });
}

function addLine(slide, x1, y1, x2, y2, opts = {}) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.max(Math.abs(x2 - x1), 0.001);
  const h = Math.max(Math.abs(y2 - y1), 0.001);
  slide.addShape(SHAPES.line, {
    x,
    y,
    w,
    h,
    flipH: x2 < x1,
    flipV: y2 < y1,
    line: {
      color: opts.color || COLORS.line,
      width: opts.width || 1,
      transparency: opts.transparency || 0,
      beginArrowType: opts.beginArrowType,
      endArrowType: opts.endArrowType,
      dash: opts.dash,
    },
  });
}

function addPolyline(slide, points, opts = {}) {
  if (!Array.isArray(points) || points.length < 2) return;
  for (let i = 0; i < points.length - 1; i += 1) {
    const isFirst = i === 0;
    const isLast = i === points.length - 2;
    addLine(slide, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], {
      color: opts.color,
      width: opts.width,
      transparency: opts.transparency,
      dash: opts.dash,
      beginArrowType: isFirst ? opts.beginArrowType : undefined,
      endArrowType: isLast ? opts.endArrowType : undefined,
    });
  }
}

function addDurationBracket(slide, opts = {}) {
  const { x1, x2, y, label } = opts;
  const tick = opts.tick ?? 0.07;
  addLine(slide, x1, y, x2, y, { color: opts.color || COLORS.line, width: opts.width || 1 });
  addLine(slide, x1, y - tick, x1, y + tick, { color: opts.color || COLORS.line, width: opts.width || 1 });
  addLine(slide, x2, y - tick, x2, y + tick, { color: opts.color || COLORS.line, width: opts.width || 1 });
  if (label) {
    addBox(slide, label, {
      x: (x1 + x2) / 2 - (opts.labelW || 0.6) / 2,
      y: y - 0.12,
      w: opts.labelW || 0.6,
      h: 0.15,
      fill: COLORS.white,
      color: COLORS.text,
      fontSize: opts.fontSize || 8.5,
      margin: 0,
      line: noLine(),
      bold: true,
    });
  }
}

function addWaveStroke(slide, opts = {}) {
  const color = (opts.color || COLORS.sapphire).replace('#', '');
  const stroke = Math.max(1, Math.round((opts.width || 1.25) * 2.5));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 120">
      <path d="M0,60 C120,20 260,100 420,60 C580,20 740,100 1000,60" fill="none" stroke="#${color}" stroke-width="${stroke}" stroke-linecap="round"/>
    </svg>`;
  slide.addImage({ data: svgToDataUri(svg), x: opts.x, y: opts.y, w: opts.w, h: opts.h });
}

function addDiamond(slide, x, y, size, color) {
  slide.addShape(SHAPES.diamond, {
    x,
    y,
    w: size,
    h: size,
    fill: { color },
    line: noLine(),
  });
}

module.exports = {
  SHAPES,
  setSlideDefaults,
  addTitle,
  addSubtitle,
  addFooter,
  addSourceNotes,
  addParagraph,
  addRichParagraph,
  addBox,
  addCircleBadge,
  addLine,
  addPolyline,
  addDurationBracket,
  addWaveStroke,
  addDiamond,
  noLine,
};
