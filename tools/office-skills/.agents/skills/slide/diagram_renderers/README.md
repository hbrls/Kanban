# Reference diagram renderers — slide-skill integrated

This package contains reusable diagram patterns adapted from reference slides and rebuilt as maintainable PptxGenJS renderers for the local slide-skill bundle.

The diagrams are included as reference composition patterns, not as branded third-party deliverables. Default branding, footer text, and palette choices are normalized to the local Routa slide environment.

## What changed vs. the previous codekit

- Uses **PptxGenJS** as the render engine
- Imports the OpenAI slide helper bundle from `slides/pptxgenjs_helpers`
- Uses `autoFontSize` / `calcTextBox` for text fitting
- Runs `warnIfSlideHasOverlaps` and `warnIfSlideElementsOutOfBounds` during build
- Organizes code into a **renderer registry + JSON examples**
- Keeps the output close to the underlying diagram pattern, while still being editable as code

## Package structure

- `build-demo.js` — builds the demo PPT
- `registry.js` — maps slide kinds to renderers
- `theme.js` — page size, fonts, palette aligned to the Routa token system
- `runtime/slide-skill.js` — bridge to the local slide-skill helper bundle
- `runtime/base.js` — shared slide primitives
- `renderers/*.js` — diagram-specific renderers
- `examples/*.json` — editable data for each diagram slide
- `tools/export_selected_slides.py` — export PPT shape metadata to JSON for bootstrapping new renderers
- `diagram_renderer_demo.pptx` — generated demo deck

## Included demo slides

- Lean value tree
- Process flow
- Project plan
- Risk status matrix - sample
- Agile planning onion diagram
- Our approach to testing
- Integrated design

## Build

```bash
node .agents/skills/slide-skill/diagram_renderers/build-demo.js
```

Optional output override:

```bash
node .agents/skills/slide-skill/diagram_renderers/build-demo.js /tmp/diagram_renderer_demo.pptx
```

## Notes

This package intentionally uses the local slide-skill helpers. If you want to run it outside this environment, replace `runtime/slide-skill.js` with your own helper bridge or a local helper package that exposes equivalent APIs.
