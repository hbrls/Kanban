---
title: "XLSX Reader Feature Completeness Checklist"
date: "2026-05-05"
kind: analysis
status: resolved
severity: medium
area: ui
tags: [artifact-viewer, office-documents, xlsx, spreadsheet, feature-checklist, completeness]
reported_by: "system"
related_issues: ["2026-05-01-office-document-viewer-wasm-reader.md", "2026-05-02-walnut-workbook-layout-adapter.md", "2026-05-03-xlsx-renderer-viewport-performance.md"]
github_issue: null
github_state: null
github_url: null
---

# XLSX Reader Feature Completeness Checklist

A structured inventory of XLSX reader and renderer capabilities, organized by feature domain. Tracks protocol parity against Walnut and rendering fidelity for production use.

## Overview

**Completeness**: ~90% (protocol/layout complete; chart/conditional-format visual depth next)

**Key Status**:
- ✅ Protocol equivalence: 21/21 production XLSX files + all committed fixtures report zero decoded diffs vs Walnut
- ✅ Layout foundation: prefix sums, viewport culling, freeze panes, frozen region projection all locked
- ✅ Viewport performance: memoization, lazy loading, canvas/worker boundary established
- ⏳ Chart visual fidelity and conditional-format formula evaluation (long-tail work)
- ⏳ Table style precision (Light/Medium/Dark built-in families)

---

## Feature Domains

### 1. Core Workbook Protocol

**Status**: 100% complete (zero decoded protocol diffs)

- [x] Workbook metadata (name, author, keywords, subject)
- [x] Worksheet list and sheet names
- [x] Sheet tab colors
- [x] Defined names (global and sheet-scoped)
- [x] Workbook theme colors
- [x] External link parts and formula references
- [x] Workbook protection settings
- [x] Shared styles and number formats

**Remaining**: None at protocol layer

---

### 2. Worksheet Layout & Geometry

**Status**: 100% complete

- [x] Row heights (pixel and point conversion)
- [x] Column widths (pixel and Excel unit conversion)
- [x] Prefix-sum viewport calculation (binary-search lookup)
- [x] Merged cells (spans and multi-cell coverage)
- [x] Hidden rows and columns (preserved as zero-size in layout)
- [x] Freeze panes (frozen row/column projection)
- [x] Frozen region segmentation (4 quadrants: top-left, top-right, bottom-left, bottom-right)
- [x] Viewport culling (visible range + overscan)
- [x] Column header sizing (fixed-width layout)
- [x] Row header sizing (fixed-height layout)
- [x] Sheet scroll offsets and camera positioning

**Remaining**: None at layout/viewport layer

---

### 3. Cell Data & Formatting

**Status**: 95% complete

- [x] Cell data types (string, number, date, boolean, formula, error)
- [x] Rich text shared strings (paragraph and run-level styling)
- [x] Cell styles and style inheritance
- [x] Cell number formatting (built-in and custom formats)
- [x] Cell alignment (horizontal, vertical, wrap, shrink-to-fit)
- [x] Cell borders (all sides, line styles, colors)
- [x] Cell fill (solid colors, patterns)
- [x] Cell font (typeface, size, bold, italic, underline, color, scheme)
- [x] Cell indent and text rotation
- [x] Formulas (cell values, shared formula metadata)
- [x] Array formulas
- [x] Text orientation (horizontal, vertical, rotation angles)

**Remaining**:
- [ ] Advanced cell protection (locked/hidden flags per cell)
- [ ] Cell comments/notes (now extracted; preview support partial)
- [ ] Legacy cell comments vs threaded comments UI distinction

---

### 4. Tables & Ranges

**Status**: 90% complete

- [x] Table structure (name, range, headers, footers)
- [x] Table style application (built-in and custom)
- [x] Table stripes (alternating row colors)
- [x] Table header styling
- [x] Table total row styling
- [x] Table first/last column emphasis
- [x] Filter buttons and dropdown UI
- [x] Table column definitions
- [x] Defined range names (references and scopes)
- [x] Structured references (current row syntax like `[@ColumnName]`)

**Remaining**:
- [ ] Light family (`TableStyleLight1`-`TableStyleLight21`) exact element definitions
- [ ] Dark family (`TableStyleDark1`-`TableStyleDark11`) exact element definitions
- [ ] Medium family (`TableStyleMedium1`-`TableStyleMedium28`) precise shade mapping
- [ ] Custom table style definitions
- [ ] Slicer integration with table filtering

---

### 5. Conditional Formatting

**Status**: 85% complete

- [x] Color scales (2-color and 3-color)
- [x] Data bars (color, direction, min/max length)
- [x] Icon sets (rating, arrows, traffic, symbols, common families)
- [x] Text/cell comparison rules (equal, not-equal, contains, not-contains, begins-with, ends-with)
- [x] Blank/nonblank checks
- [x] Duplicate/unique value rules
- [x] Top/bottom rules (rank, percent, value)
- [x] Above/below average rules (standard deviation)
- [x] Formula-driven rules (conservative evaluator)
- [x] Rule priority and `stopIfTrue` precedence
- [x] Cfvo type/value handling (min, max, num, percent, percentile)
- [x] Negative data-bar colors and gradient fills
- [x] Viewer-side volatile `TODAY()` display refresh for date deltas and `COUNTIFS(...,"<"&TODAY())`
- [x] Shared preview formula adapter for empty cached formula values, including cross-sheet range references

**Remaining**:
- [ ] Arbitrary Excel formula-language parity (complex nested functions, array formulas)
- [ ] Full volatile formula parity (`NOW`, `RAND`, broader `TODAY` formulas, recalculation dependency graph)
- [ ] Cross-sheet formula references in conditional rules beyond direct workbook sheet ranges
- [ ] Complex structured references in formulas

---

### 6. Charts

**Status**: 75% complete

- [x] Chart anchors and sizing (two-cell and one-cell references)
- [x] Chart types (bar, column, line, area, pie, doughnut, scatter, bubble, radar, surface)
- [x] Chart series (name, category, value extraction)
- [x] Primary and secondary axes
- [x] Axis titles and gridlines
- [x] Chart title
- [x] Legend positioning and spacing
- [x] Data labels (position and show flags)
- [x] Trendlines (linear only for now)
- [x] Error bars (fixed-value)
- [x] Combo chart hints (bar + line)
- [x] Series markers (presence/absence per series)
- [x] Chart-space outline fill/line
- [x] Chart option defaults (bar gap, overlap, doughnut hole, pie first-slice)

**Remaining**:
- [ ] Bubble chart size value extraction
- [ ] Chart animation and interactivity
- [ ] More trendline types (exponential, logarithmic, polynomial, power)
- [ ] Advanced data-label positioning (inside, outside, centered)
- [ ] 3D chart options and perspective
- [ ] Bubble chart fill/line per point
- [ ] Sophisticated axis tick label formatting (log scale, custom intervals)

---

### 7. Drawing Objects & Overlays

**Status**: 85% complete

- [x] Image drawings (anchors and sizing)
- [x] Workbook image payloads
- [x] Walnut image-reference mapping
- [x] Shape drawings (basic rectangles, circles, callouts)
- [x] Shape text and text styling
- [x] Shape fill and line styles
- [x] Shape effects (shadows with offset/color/blur)
- [x] Shape/image z-order preservation
- [x] Drawing order stability
- [x] Floating hit regions (for selection, resize)
- [x] Chart anchors as drawing overlays
- [x] Shape paragraph and run styles

**Remaining**:
- [ ] Image crop (absent from Walnut schema)
- [ ] Advanced shape effects (soft edges, glows, 3D bevels)
- [ ] Connector lines and line-end styles
- [ ] Grouped shapes and shape transforms
- [ ] Complex custom shape paths
- [ ] Text box rotation and perspective

---

### 8. Sparklines

**Status**: 100% complete

- [x] Sparkline groups (per-group options)
- [x] Sparkline types (line, column, stacked-column)
- [x] Sparkline formulas and cell ranges
- [x] Sparkline colors (ARGB series, marker, negative, empty)
- [x] Sparkline line weight
- [x] Sparkline markers (high, low, first, last, negative)
- [x] Sparkline axis options

**Remaining**: None

---

### 9. Slicers & Timelines

**Status**: 90% complete

- [x] Slicer caches (items, hierarchy, state)
- [x] Sheet slicers (connections to tables/pivots)
- [x] Slicer shape overlays
- [x] Slicer style defaults
- [x] Timeline caches and state
- [x] Timeline drawing shapes
- [x] Slicer/timeline fallback UI when no drawing shape exists

**Remaining**:
- [ ] Slicer interaction (click to filter)
- [ ] Slicer style customization (colors, font)
- [ ] Timeline range selection interaction
- [ ] Multi-select slicer UI

---

### 10. Pivot Tables

**Status**: 90% complete

- [x] Pivot cache definition and fields
- [x] Pivot table structure and location
- [x] Pivot field configuration (row, column, page, data fields)
- [x] Pivot data ranges
- [x] Pivot style and formatting
- [x] Pivot field subtotals and grand totals
- [x] Pivot cache items and hierarchies

**Remaining**:
- [ ] Pivot interaction (drill-down, expand/collapse)
- [ ] Pivot refresh and external data connections
- [ ] Advanced pivot field options (grouping, calculated fields)
- [ ] Pivot table styling and banding
- [ ] `PivotDynamicArrays` (Open XML SDK 3.1.0+, Y2024 namespace) — dynamic array spilled pivot results
- [ ] `PivotAutoRefresh` (Open XML SDK 3.1.0+, Y2024 namespace) — auto-refresh pivot cache connections
- [ ] `Pivot2023Calculation` (Open XML SDK 3.1.0+, Y2023 namespace) — 2023-era pivot calculation semantics
- [ ] `PivotRichData` (Open XML SDK 3.2.0+, Y2022 namespace) — rich value/linked data types in pivot caches
- [ ] `WorkbookCompatibilityVersion` (Open XML SDK 3.3.0+, Y2024 namespace) — compatibility flag for newer workbooks

---

### 11. Data Validation

**Status**: 85% complete

- [x] Data validation ranges
- [x] Validation type (list, whole number, decimal, date, time, text length)
- [x] Validation operators (between, not-between, equal, not-equal, greater-than, less-than, etc.)
- [x] Validation formulas
- [x] List dropdown rendering for visible cells
- [x] Validation indicator icons
- [x] Error messages and input prompts

**Remaining**:
- [ ] Formula-driven list validation
- [ ] Custom validation error display
- [ ] Input prompt interaction
- [ ] Nested/dependent validation lists

---

### 12. Comments & Threaded Comments

**Status**: 100% complete

- [x] Legacy comments (notes) with author and timestamp
- [x] Threaded comments with reply chains
- [x] Comment people/authors
- [x] Comment resolved status
- [x] Comment body text
- [x] Comment cell targets
- [x] Threaded comment timestamps

**Remaining**:
- [ ] Comment UI interaction (view, reply, resolve)
- [ ] Rich text formatting in comments

---

### 13. Viewport & Interaction

**Status**: 100% complete

- [x] Scroll coalescing (requestAnimationFrame)
- [x] Visible range calculation (binary search)
- [x] Cell selection (single, multi-cell, merged-cell normalization)
- [x] Keyboard navigation (arrow keys, Enter, Tab, Shift+Tab)
- [x] Formula bar display (address, value)
- [x] Edit mode overlay
- [x] Cell resizing (row height, column width)
- [x] Hit testing (cells, merged regions, frozen panes)
- [x] Scroll-into-view behavior

**Remaining**: None for core interaction

---

### 14. Canvas & Worker Integration

**Status**: 100% complete

- [x] Canvas frame scheduling (plan-signature caching)
- [x] Canvas draw commands (cell geometry, text, fill, color)
- [x] Worker/offscreen canvas capability detection
- [x] Worker message serialization
- [x] Fallback to main-thread canvas
- [x] Frame coalescing (no redundant canvas redraws)
- [x] DPR and bitmap size syncing
- [x] CSS/intrinsic size scaling

**Remaining**: None for viewport optimization layer

---

## Recommended Next Steps

Formula engine decision: do not embed HyperFormula by default because the current npm package is `GPL-3.0-only`; `@formulajs/formulajs` is MIT but is a function library rather than a workbook parser/dependency engine. The preview reuses the in-repo Excel-like formula evaluator as the safe adapter path and expands it incrementally where real fixtures need parity.

### High-Priority (production-ready surface)
1. **Chart visual fidelity** — Axis label formatting, more trendline types, advanced data labels, 3D options
2. **Conditional-format formula depth** — Broader Excel formula support beyond conservative evaluator
3. **Table style families** — Complete Light, Medium, Dark built-in definitions

### Medium-Priority (polish)
4. **Data validation UI** — Error messages, input prompts, formula-driven lists
5. **Slicer/timeline UI** — Filter interaction, state updates
6. **Pivot table interaction** — Drill-down, expand/collapse

### Lower-Priority (rare features)
7. **Image crop** — Requires schema extension (absent from Walnut)
8. **Advanced shapes** — Grouped shapes, connectors, 3D effects
9. **External data** — Pivot refresh, linked workbooks

---

## Test Coverage & Validation

**Protocol Parity**:
- Committed fixtures: 12/12 report zero decoded Workbook diffs
- Production corpus: 21/21 XLSX files parse; 21/21 report zero decoded diffs

**Rendering Contract**:
- Viewport screenshot comparison: `complex_excel_renderer_test.xlsx` (9 sheets, 27 scroll positions) all pass < 0.5% diff threshold
- Canvas render-plan validation: text, fill, color, alignment, indent all match DOM cell styling

**Performance Baseline**:
- Visible range culling: O(log n) binary search on prefix sums
- Frame coalescing: zero canvas redraws per unchanged viewport
- Memoization: layout/chart/shape specs built once per sheet change, not per scroll

---

## References

- `docs/issues/2026-05-01-office-document-viewer-wasm-reader.md` (parent epic)
- `docs/issues/2026-05-02-walnut-workbook-layout-adapter.md` (layout foundation)
- `docs/issues/2026-05-03-xlsx-renderer-viewport-performance.md` (viewport optimization)
- `tools/office-wasm-reader/Routa.OfficeWasmReader/Readers/XlsxWorkbookProtoReader.cs`
- `src/app/debug/office-wasm-poc/spreadsheet-layout.ts`
- `src/app/debug/office-wasm-poc/spreadsheet-preview.tsx`
- `scripts/office-wasm-reader/compare-walnut-xlsx-protocol.ts`
- `tools/office-wasm-reader/DEPENDENCIES.md` — SDK version rationale (updated to `3.4.1`)
- Open XML SDK CHANGELOG: https://github.com/dotnet/Open-XML-SDK/blob/main/CHANGELOG.md

## Open XML SDK Version Notes

The WASM reader was updated from `DocumentFormat.OpenXml 3.3.0` to `3.4.1` (2026-01-06). Key gains:

| Change | Impact on XLSX |
|--------|----------------|
| Q3 2025 Office schemas bundled | New Excel 365 schema types accessible at protocol level |
| WASM JIT/AOT size reduction | Smaller browser-wasm bundle for the spreadsheet reader |
| Faster `FromChunkedBase64String` (2.4×) | Lower-latency image/embedded object extraction |
| Improved error messages for missing parts | Better diagnostics for malformed workbooks |

New namespaces that are now schema-accessible but not yet mapped to Walnut protocol fields:
- `SpreadSheetML.Y2024.PivotDynamicArrays` — dynamic array spilled pivot results
- `SpreadSheetML.Y2024.PivotAutoRefresh` — auto-refresh pivot connections
- `SpreadSheetML.Y2023.Pivot2023Calculation` — 2023 pivot calculation semantics
- `SpreadSheetML.Y2022.PivotRichData` — rich value / linked data types in pivot caches
- `SpreadSheetML.Y2024.WorkbookCompatibilityVersion` — newer workbook compatibility marker
