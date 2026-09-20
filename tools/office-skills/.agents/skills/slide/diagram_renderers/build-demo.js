const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { warnIfSlideHasOverlaps, warnIfSlideElementsOutOfBounds } = require('./runtime/slide-skill');
const { PAGE, FONTS } = require('./theme');
const registry = require('./registry');

function loadJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relPath), 'utf8'));
}

async function main() {
  const manifest = loadJson('examples/demo-deck.json');
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: PAGE.name, width: PAGE.width, height: PAGE.height });
  pptx.layout = PAGE.name;
  pptx.author = 'OpenAI';
  pptx.company = 'OpenAI';
  pptx.subject = manifest.subject;
  pptx.title = manifest.title;
  pptx.lang = 'en-US';
  pptx.theme = {
    headFontFace: FONTS.headline,
    bodyFontFace: FONTS.body,
    lang: 'en-US',
  };

  for (const item of manifest.slides) {
    const slide = pptx.addSlide();
    const renderer = registry[item.kind];
    if (!renderer) throw new Error(`Missing renderer for kind: ${item.kind}`);
    const data = loadJson(item.file);
    const result = renderer(slide, pptx, data) || {};
    if (item.checkOverlap === true && !result.allowIntentionalOverlap) {
      warnIfSlideHasOverlaps(slide, pptx);
    }
    warnIfSlideElementsOutOfBounds(slide, pptx);
  }

  const outPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, manifest.output);
  await pptx.writeFile({ fileName: outPath });
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
