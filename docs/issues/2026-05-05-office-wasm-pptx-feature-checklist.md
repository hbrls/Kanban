---
title: "PPTX Reader Feature Completeness Checklist"
date: "2026-05-05"
kind: analysis
status: resolved
severity: medium
area: ui
tags: [artifact-viewer, office-documents, pptx, presentation, feature-checklist, completeness]
reported_by: "system"
related_issues: ["2026-05-01-office-document-viewer-wasm-reader.md"]
github_issue: null
github_state: null
github_url: null
---

# PPTX Reader Feature Completeness Checklist

A structured inventory of PPTX reader and renderer capabilities, organized by feature domain. Tracks progress toward Walnut-like presentation rendering and identifies gaps.

## Overview

**Completeness**: ~60% (theme colors + tables shipped; charts, SmartArt, effects next)

**Key Status**:
- ✅ Core slide structure and basic shape rendering
- ✅ Text, tables, grouped shapes, connectors (basic)
- ✅ Charts and basic chart types
- ✅ Thumbnail generation and slideshow mode
- ✅ Per-run text rendering (DirectTextParagraph[]/DirectTextRun[] — mixed colors/sizes/weights per element)
- ✅ Master slide inheritance with 3-tier placeholder dedup (master→layout→slide)
- ✅ Theme color resolution (accent1-6, dk1/dk2, lt1/lt2, hlink, folHlink → RGB)
- ✅ Tables in slides (decoded from proto field 21; HTML table render with borders/fills/per-run text)
- ⏳ SmartArt/diagrams and complex nested shapes
- ⏳ Advanced effects, cropping, and masks
- ⏳ Presentation interaction (navigation, timing, transitions)

---

## Feature Domains

### 1. Core Presentation Structure

**Status**: 95% complete

- [x] Presentation metadata (name, author, keywords, subject)
- [x] Slide list and ordering
- [x] Slide notes and speaker notes
- [x] Slide layout references
- [x] Master slide references
- [x] Slide background (solid, gradient, pattern, image)
- [x] Slide transitions (basic detection)
- [x] Slide timing and animation (basic detection)
- [x] Slide hidden flag
- [x] Presentation part relationships

**Remaining**:
- [ ] Presentation-level view settings
- [ ] Zoom and scroll position per slide
- [ ] Custom show definitions
- [ ] Handout/notes page master layout

---

### 2. Theme, Layout & Master Inheritance

**Status**: 75% complete (3-tier inheritance shipped; theme color resolution remaining)

- [x] Theme colors (accent, accent1-6, dark1, dark2, light1, light2, hyperlink, followed-hyperlink)
- [x] Theme fonts (Latin and East Asian typefaces)
- [x] Slide layout placeholders
- [x] Master slide shape definitions
- [x] Placeholder type and role (title, body, subtitle, picture, table, chart, etc.)
- [x] Placeholder geometry and anchoring
- [x] Placeholder text style defaults
- [x] Layout inheritance from master
- [x] Basic placeholder fill fallback
- [x] Master slides decoded separately from layouts (field 3 + kind="master")
- [x] 3-tier placeholder dedup: slide > layout > master (non-placeholder shapes always pass through)
- [x] Master background fallback in render layer
- [ ] Complete text-body style inheritance (font, size, color, spacing)
- [ ] List-level defaults from master/layout
- [ ] Placeholder shape line/border inheritance
- [ ] Nested layout/master resolution chains

**Remaining** (blocking production fidelity):
- [x] Theme color scheme resolution in render layer (accent1-6, dk1/dk2, lt1/lt2, hlink, folHlink + aliases)
- [ ] Master placeholder text style cascading (run font, size, color) — proto available, render not consuming
- [ ] Layout-specific placeholder overrides
- [ ] Multiple master slides and fallback resolution
- [ ] Placeholder numbering and bullet formatting

---

### 3. Slide Elements & Shapes

**Status**: 80% complete

- [x] Title shapes (text rendering)
- [x] Subtitle shapes
- [x] Body text shapes (paragraphs, runs)
- [x] Picture/image shapes (with anchors and sizing)
- [x] Rectangle, circle, polygon shapes
- [x] Line and connector shapes
- [x] Callout and label shapes
- [x] Shape text (paragraphs and runs inside shapes)
- [x] Shape fill (solid, gradient, pattern, image)
- [x] Shape line/border (color, width, style)
- [x] Shape bounding box and transforms
- [x] Shape z-order and layering
- [x] Grouped shapes (basic flattening)

**Remaining**:
- [ ] SmartArt diagrams (structure and layout)
- [ ] Custom shape geometry (paths and vertices)
- [ ] Complex shape transforms (rotation, skew, perspective)
- [ ] Connector lines with dynamic routing
- [ ] 3D shape effects and extrusion
- [ ] Shape shadows and advanced effects
- [ ] Shape glows, soft edges, and bevels

---

### 4. Text & Paragraph Styling

**Status**: 85% complete

- [x] Paragraph alignment (left, center, right, justified)
- [x] Line spacing (single, 1.5, double, exact, at-least)
- [x] Paragraph spacing (before, after)
- [x] Indentation (left, right, first-line, hanging)
- [x] Text color (RGB, theme colors)
- [x] Font selection (Latin, East Asian, complex-script)
- [x] Font size
- [x] Bold, italic, underline
- [x] Strike-through
- [x] Subscript, superscript
- [x] Caps and small caps
- [x] Highlight color
- [x] Bullets and numbering (basic markers)
- [x] Hyperlinks and external links
- [x] Text shadow

**Remaining**:
- [ ] Bullets from master slide numbering definitions
- [ ] Complex list levels and hierarchies
- [ ] Field codes and placeholders (date, slide number, etc.)
- [ ] Tabs and tab stops
- [ ] Outline levels
- [ ] Text outline (stroke) effects

---

### 5. Tables

**Status**: 95% complete (render layer now consuming table proto)

- [x] Table structure (rows, columns, cells)
- [x] Table cell text and styling
- [x] Table cell borders
- [x] Table cell fill (solid colors)
- [x] Table cell alignment (horizontal, vertical)
- [x] Table cell margins
- [x] Merged cells (spans)
- [x] Table row height
- [x] Table column width
- [x] Table style application
- [x] Table banding (row/column stripe colors)
- [x] Table header row styling
- [x] Table total row styling

**Remaining**:
- [ ] Complex merged-cell edge cases
- [ ] Advanced cell borders (diagonal, double-line)
- [ ] Cell gradient fill
- [ ] Custom table style definitions
- [ ] Table hyperlinks in cells
- [ ] Table cell notes/comments

---

### 6. Charts

**Status**: 75% complete

- [x] Chart anchors and sizing
- [x] Chart types (bar, column, line, area, pie, doughnut, scatter, bubble, radar)
- [x] Chart series (name, category, value)
- [x] Chart legend positioning
- [x] Chart title
- [x] Axis titles
- [x] Axis gridlines
- [x] Chart data labels
- [x] Trendlines (basic)
- [x] Error bars
- [x] Combo hints (bar + line)
- [x] Secondary axes
- [x] 3D chart options

**Remaining**:
- [ ] Chart animation
- [ ] Chart interaction (drill-down, data table)
- [ ] More trendline types (exponential, logarithmic, polynomial)
- [ ] Bubble size scaling
- [ ] Chart-specific axis formatting
- [ ] Rich axis tick labels
- [ ] Series fill/line customization per point
- [ ] Pie/doughnut slice rotation and depth

---

### 7. Images & Pictures

**Status**: 80% complete

- [x] Image anchors and sizing
- [x] Image aspect ratio
- [x] Image opacity
- [x] Image rotation
- [x] Image borders
- [x] Image shadow effects
- [x] Image in shapes (text box, callout)
- [x] Image in tables (cells)
- [ ] Image crop (rectangle crop area)
- [ ] Image masks and clipping paths
- [ ] Image duotone and color effects
- [ ] Image tile and stretch options

**Remaining**:
- Advanced cropping and masking
- Complex fill effects
- Transparency/opacity blending
- Artistic effects (blur, sharpen, emboss)

---

### 8. Text Boxes & Callouts

**Status**: 80% complete

- [x] Text box creation and sizing
- [x] Text box text and styling
- [x] Text box fill (solid, gradient)
- [x] Text box line/border
- [x] Text box word-wrap behavior
- [x] Callout shapes (with pointer)
- [x] Callout text
- [x] Callout fill and line styling
- [ ] Text rotation in callouts
- [ ] Callout pointer positioning and angle

**Remaining**:
- Text overflow handling
- Vertical text orientation

---

### 9. Grouping & Transforms

**Status**: 60% complete

- [x] Group shapes (basic flattening into slide coordinate system)
- [x] Group child transforms (apply group matrix to children)
- [x] Group child z-order preservation
- [x] Nested groups (multi-level flattening)
- [ ] Complex group transforms (skew, perspective)
- [ ] Group interaction model (select group vs individual shapes)
- [ ] Group lock/protect settings

**Remaining**:
- Advanced transforms and 3D rotations
- Complex nested group resolution
- Group animation

---

### 10. Connectors & Lines

**Status**: 70% complete

- [x] Line shapes (straight lines)
- [x] Connector shapes (basic straight connectors)
- [x] Line/connector endpoints
- [x] Line head/tail styles (arrow, circle, triangle, etc.)
- [x] Line color and width
- [x] Line dash style (solid, dash, dot, dash-dot)
- [ ] Dynamic connector routing (avoid shapes)
- [ ] Connector connection points (from/to shape anchors)
- [ ] Connector rerouting on shape move

**Remaining**:
- Freeform connectors
- Curved path support
- Connector anchor points
- Connector selection handles

---

### 11. Effects & Fills

**Status**: 50% complete

- [x] Solid fill (RGB and theme colors)
- [x] Gradient fill (linear and radial, preset colors)
- [x] Pattern fill (basic patterns)
- [x] Picture fill (stretch and tile)
- [x] Shadow effects (offset shadow)
- [ ] Glow and soft edge effects
- [ ] 3D bevels and extrusion
- [ ] Reflection effects
- [ ] Lens distortion
- [ ] Artistic effects (blur, sharpen, emboss)

**Remaining**:
- Advanced gradient stops and transparency
- Complex fill blending modes
- Artistic effect parameters
- Duotone and color matrix effects

---

### 12. Animations & Interactions

**Status**: 20% complete

- [x] Animation detection (basic)
- [x] Animation timing (sequencing)
- [ ] Animation playback (implementation)
- [ ] Entrance animations (fade, wipe, zoom, etc.)
- [ ] Emphasis animations (color change, grow/shrink)
- [ ] Exit animations
- [ ] Motion path animations
- [ ] Trigger types (on-click, with-previous, after-previous)
- [ ] Interaction triggers (go to slide, execute macro)

**Remaining**:
- Full animation engine
- Timeline rendering
- Interaction handling
- Sound and video playback

---

### 13. Slide Navigation & Viewer

**Status**: 70% complete

- [x] Slide deck navigation (previous/next)
- [x] Slide thumbnail generation
- [x] Slide preview rendering
- [x] Zoom levels
- [x] Fit-to-width and fit-to-page
- [ ] Slide sorter view
- [ ] Outline view
- [ ] Notes view (content available, UI needed)
- [ ] Full-screen slideshow mode
- [ ] Presenter view (notes + slide)
- [ ] Slide timing and automatic advance
- [ ] Custom slide show definitions

**Remaining**:
- Advanced navigation (go to slide, custom shows)
- Presenter speaker notes display
- Timing and automatic slide transitions
- Keyboard shortcuts and accessibility

---

### 14. Video & Media (New in Open XML SDK 3.4.1)

**Status**: 0% (enabled by SDK upgrade to 3.4.1 with Q3 2025 Office schemas)

- [ ] Video media parts (`MediaDataPartType.Mp4`) in presentations
- [ ] Embedded video playback (click-to-play affordance)
- [ ] Video thumbnail/poster frame display
- [ ] Audio media parts (embedded audio in slides)
- [ ] Linked vs embedded media handling
- [ ] Video trimming/loop metadata extraction
- [ ] Volume and mute settings

**Note**: `DocumentFormat.OpenXml 3.4.1` added `MediaDataPartType.Mp4` and updated bundled schemas to the Q3 2025 Office release, enabling access to newer OOXML media and presentation features not previously available at protocol level.

---

### 15. Handout & Notes Pages

**Status**: 30% complete

- [x] Notes page detection
- [x] Notes page text extraction
- [ ] Notes page layout rendering
- [ ] Handout layout options (1/2/3/4/6 slides per page)
- [ ] Handout header/footer
- [ ] Notes page header/footer
- [ ] Page numbering

**Remaining**:
- Rendering notes pages as printable layout
- Handout generation
- Print settings application

---

## Recommended Implementation Order

### Phase 1: Foundation (Current)
1. ✅ Core slide structure and basic shapes
2. ✅ Text rendering and basic styling
3. ✅ Tables and basic table rendering
4. ✅ Charts (basic types and series)
5. ✅ Thumbnail and slideshow UI

### Phase 2: Theme & Master Inheritance (Mostly Done)
1. ✅ Master slide decoding + 3-tier placeholder dedup (slide > layout > master)
2. ✅ Per-run text rendering (DirectTextParagraph[]/DirectTextRun[]) in both SVG thumbnails and HTML canvas
3. ✅ Theme color scheme resolution: accent1-6, dk1/dk2, lt1/lt2, hlink, folHlink → RGB + aliases (tx1, bg1, phclr)
4. ✅ Tables decoded and rendered (HTML table with borders, fills, per-run text)
5. Complete layout-specific placeholder overrides (text style cascading from master/layout runs)
6. Add multiple master slide support and fallback resolution
7. Implement list-level defaults from master/layout

### Phase 3: Visual Fidelity (Medium Priority)
1. SmartArt and diagram support
2. Complex shape transforms and 3D shapes
3. Advanced image effects (crop, masks, duotone, artistic filters)
4. Connector dynamic routing
5. Glow, soft-edge, and bevels effects

### Phase 4: Interaction (Lower Priority)
1. Slide timing and automatic advance
2. Presenter view (notes + slide)
3. Full animation engine
4. Slide navigation and custom shows
5. Accessibility features

---

### Phase 5: Media & Video (Enabled by SDK 3.4.1)
1. MP4 video extraction and thumbnail display
2. Embedded audio playback
3. Linked media handling and fallback

---

## References

- `docs/issues/2026-05-01-office-document-viewer-wasm-reader.md` (parent epic)
- `tools/office-wasm-reader/Routa.OfficeWasmReader/Readers/PptxArtifactReader.cs`
- `src/app/debug/office-wasm-poc/pptx-preview.tsx`
- `scripts/office-wasm-reader/compare-walnut-pptx-protocol.ts`
- `tools/office-wasm-reader/DEPENDENCIES.md` — SDK version rationale (updated to `3.4.1`)
- Open XML SDK CHANGELOG: https://github.com/dotnet/Open-XML-SDK/blob/main/CHANGELOG.md

## Open XML SDK Version Notes

The WASM reader was updated from `DocumentFormat.OpenXml 3.3.0` to `3.4.1` (2026-01-06). Key gains for PPTX:

| Change | Impact on PPTX |
|--------|----------------|
| `MediaDataPartType.Mp4` added | MP4 video in presentations now accessible at part level |
| Q3 2025 Office schemas bundled | New PowerPoint 2025 features accessible (animations, layout, effects) |
| WASM JIT/AOT size reduction | Smaller presentation reader bundle in browser |
| New PowerPoint namespaces from prior releases | `Y2023.M02.Main`, `Y2022.M03.Main` unlocked from v3.0.0 |
