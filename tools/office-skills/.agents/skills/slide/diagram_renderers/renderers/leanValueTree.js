const {
  SHAPES,
  setSlideDefaults,
  addTitle,
  addFooter,
  addSourceNotes,
  addParagraph,
  addBox,
  addLine,
} = require('../runtime/base');
const { COLORS } = require('../theme');

function renderLeanValueTree(slide, pptx, data) {
  setSlideDefaults(slide);
  slide.addShape(SHAPES.rect, {
    x: 5,
    y: 0,
    w: 5,
    h: 5.625,
    fill: { color: COLORS.mist },
    line: { color: COLORS.mist, transparency: 100 },
  });

  addTitle(slide, data.title);
  addFooter(slide, data.sourceSlide);
  addSourceNotes(slide, data);

  addParagraph(slide, data.leftPanel.whatTitle, {
    x: 0.42,
    y: 1.52,
    w: 1.0,
    fontSize: 15,
    bold: true,
  });
  addParagraph(slide, data.leftPanel.whatBody, {
    x: 0.42,
    y: 1.95,
    w: 3.85,
    fontSize: 13,
    leading: 1.25,
  });
  addParagraph(slide, data.leftPanel.whoTitle, {
    x: 0.42,
    y: 3.07,
    w: 1.0,
    fontSize: 15,
    bold: true,
  });
  addParagraph(slide, data.leftPanel.whoBody, {
    x: 0.42,
    y: 3.50,
    w: 3.95,
    fontSize: 13,
    leading: 1.25,
  });

  const nodes = {
    vision: { x: 6.75, y: 1.14, w: 1.55, h: 0.40, label: data.tree.vision, fill: COLORS.pink, color: COLORS.white },
    goals: [
      { x: 5.45, y: 1.95, w: 1.30, h: 0.34, label: data.tree.goals[0], fill: COLORS.purple, color: COLORS.white },
      { x: 6.83, y: 1.95, w: 1.30, h: 0.34, label: data.tree.goals[1], fill: COLORS.purple, color: COLORS.white },
      { x: 8.20, y: 1.95, w: 1.30, h: 0.34, label: data.tree.goals[2], fill: COLORS.purple, color: COLORS.white },
    ],
    bets: [
      { x: 6.24, y: 2.77, w: 1.32, h: 0.40, label: data.tree.bets[0], fill: COLORS.amber, color: COLORS.white },
      { x: 7.77, y: 2.77, w: 1.32, h: 0.40, label: data.tree.bets[1], fill: COLORS.amber, color: COLORS.white },
    ],
    initiatives: [
      { x: 5.90, y: 3.59, w: 1.20, h: 0.40, label: data.tree.initiatives[0], fill: COLORS.green, color: COLORS.white },
      { x: 7.22, y: 3.59, w: 1.20, h: 0.40, label: data.tree.initiatives[1], fill: COLORS.green, color: COLORS.white },
      { x: 8.57, y: 3.59, w: 1.20, h: 0.40, label: data.tree.initiatives[2], fill: COLORS.green, color: COLORS.white },
    ],
    pods: [
      { x: 6.18, y: 4.43, w: 0.92, h: 0.30, label: data.tree.pods[0], fill: COLORS.sapphire, color: COLORS.white },
      { x: 7.49, y: 4.43, w: 0.92, h: 0.30, label: data.tree.pods[1], fill: COLORS.sapphire, color: COLORS.white },
    ],
  };

  const visionCenter = nodes.vision.x + nodes.vision.w / 2;
  nodes.goals.forEach((goal) => {
    addLine(slide, visionCenter, nodes.vision.y + nodes.vision.h, goal.x + goal.w / 2, goal.y, {
      color: COLORS.line,
      width: 1,
    });
  });

  addLine(slide, nodes.goals[1].x + nodes.goals[1].w / 2, nodes.goals[1].y + nodes.goals[1].h, nodes.bets[0].x + nodes.bets[0].w / 2, nodes.bets[0].y, {
    color: COLORS.line,
    width: 1,
  });
  addLine(slide, nodes.goals[1].x + nodes.goals[1].w / 2, nodes.goals[1].y + nodes.goals[1].h, nodes.bets[1].x + nodes.bets[1].w / 2, nodes.bets[1].y, {
    color: COLORS.line,
    width: 1,
  });

  addLine(slide, nodes.bets[0].x + nodes.bets[0].w / 2, nodes.bets[0].y + nodes.bets[0].h, nodes.initiatives[0].x + nodes.initiatives[0].w / 2, nodes.initiatives[0].y, { color: COLORS.line, width: 1 });
  addLine(slide, nodes.bets[0].x + nodes.bets[0].w / 2, nodes.bets[0].y + nodes.bets[0].h, nodes.initiatives[1].x + nodes.initiatives[1].w / 2, nodes.initiatives[1].y, { color: COLORS.line, width: 1 });
  addLine(slide, nodes.bets[1].x + nodes.bets[1].w / 2, nodes.bets[1].y + nodes.bets[1].h, nodes.initiatives[2].x + nodes.initiatives[2].w / 2, nodes.initiatives[2].y, { color: COLORS.line, width: 1 });

  addLine(slide, nodes.initiatives[0].x + nodes.initiatives[0].w / 2, nodes.initiatives[0].y + nodes.initiatives[0].h, nodes.pods[0].x + nodes.pods[0].w / 2, nodes.pods[0].y, { color: COLORS.line, width: 1 });
  addLine(slide, nodes.initiatives[1].x + nodes.initiatives[1].w / 2, nodes.initiatives[1].y + nodes.initiatives[1].h, nodes.pods[1].x + nodes.pods[1].w / 2, nodes.pods[1].y, { color: COLORS.line, width: 1 });

  addBox(slide, nodes.vision.label, nodes.vision);
  nodes.goals.forEach((node) => addBox(slide, node.label, node));
  nodes.bets.forEach((node) => addBox(slide, node.label, node));
  nodes.initiatives.forEach((node) => addBox(slide, node.label, node));
  nodes.pods.forEach((node) => addBox(slide, node.label, node));

  return { allowIntentionalOverlap: false };
}

module.exports = { renderLeanValueTree };
