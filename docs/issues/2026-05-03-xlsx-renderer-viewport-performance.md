---
title: "XLSX renderer needs production-grade viewport performance"
date: "2026-05-03"
kind: issue
status: resolved
severity: medium
area: ui
tags: [artifact-viewer, office-documents, xlsx, spreadsheet, performance, walnut]
reported_by: "human"
related_issues: ["2026-05-02-walnut-workbook-layout-adapter.md"]
github_issue: null
github_state: null
github_url: null
---

# XLSX renderer needs production-grade viewport performance

## Resolution - 2026-05-04

This issue is resolved for the current debug viewer and Walnut-aligned architecture boundary:

- workbook/sheet-derived layout, charts, shapes, images, table visuals, conditional-format rules, data-validation ranges, sparklines, comments, and slicer fallbacks are memoized or lazily resolved instead of being rebuilt on every scroll
- visible row/column ranges are computed through prefix sums and binary search; body cells, headers, frozen regions, and floating overlays render only the active viewport plus overscan
- scroll/size updates flow through a frame-coalesced viewport store and pure render snapshot adapters
- the preview mounts a canvas layer with stable draw plans, requestAnimationFrame scheduling, plan-signature skipping, and worker/offscreen canvas transport when the browser supports it
- canvas draw commands now carry visible cell text, fill, and font color, giving a production renderer a stable non-DOM contract while preserving the current DOM grid for rich editing and overlay behavior
- committed XLSX fixtures and the 21-file validation-only corpus in `/Users/phodal/Downloads/excel` still pass decoded Walnut protocol parity after the viewport work

Follow-up performance work should be tracked as benchmark coverage or productization, not as an unresolved layout/performance blocker in this issue.

## What Happened

The XLSX reader now matches Walnut decoded Workbook protocol across the fixture suite and the validation-only production corpus in `/Users/phodal/Downloads/excel`, but the debug preview still renders spreadsheet cells with React DOM nodes. This is acceptable for the current POC and capped layouts, but it can become expensive as row/column caps are raised and more worksheet overlays are enabled.

## Expected Behavior

The viewer should keep Walnut-like viewport semantics without forcing every scroll event through expensive React work:

- stable layout, chart, image, shape, and conditional-format specs are memoized by workbook/sheet changes, not scroll changes
- visible cell rendering is limited to the current viewport plus overscan
- frozen panes render only visible frozen regions
- large worksheets can eventually move base grid drawing to a canvas or worker-backed canvas without changing the workbook protocol contract

## Walnut Reference

Walnut's extracted `PopcornElectronWorkbookPanel-BZz8NPb4.js` treats workbook rendering as a performance-sensitive viewport:

- workbook geometry is stored as `columnWidths` and `rowHeights`
- prefix sums map logical worksheet coordinates to screen/camera coordinates
- frozen panes, selections, floating elements, chart hover targets, and resize handles share the same coordinate system
- update paths are routed through a controller/worker boundary and coalesced with frame-based scheduling
- canvas-backed chart and worksheet interactions avoid full DOM-table layout

## Current Routa State

- `src/app/debug/office-wasm-poc/spreadsheet-layout.ts` already provides prefix sums, binary-search visible range lookup, frozen pane projection, floating hit regions, and drawing bounds.
- `src/app/debug/office-wasm-poc/spreadsheet-preview.tsx` renders only visible cells and visible floating overlays in the scrollable grid.
- `src/app/debug/office-wasm-poc/spreadsheet-frozen-headers.tsx` renders visible row/column headers from the same viewport range instead of mapping every worksheet row and column.
- Scroll-driven viewport state is coalesced with `requestAnimationFrame`, matching Walnut's frame-scheduled update style instead of updating React state for every scroll event.
- Table, conditional-format, data-validation, sparkline, comment, image, shape, and chart overlays are now either memoized from workbook/sheet changes or resolved lazily for visible cells.

## Progress

- Created this tracker after decoded XLSX protocol parity reached `0` field-level diffs against Walnut across all 21 validation-only production workbooks.
- Memoized root workbook derivation, active sheet layout, chart specs, shape specs, image specs, and conditional-format visuals in the debug spreadsheet preview so scroll updates do not rebuild stable workbook-derived structures.
- Changed the frozen body overlay to reuse the visible viewport range and merge-start overscan logic instead of traversing every row/column in the current layout.
- Added viewport/overscan culling for floating image, shape, and chart overlays so offscreen drawings do not mount canvases or DOM nodes during scroll.
- Coalesced spreadsheet viewport scroll/size updates with `requestAnimationFrame`, keeping scroll handling closer to Walnut's frame-based viewport scheduling.
- Removed the debug-only 80 row / 32 column layout cap. The layout adapter now preserves full Excel-scale row/column bounds while the body and headers render only the active viewport window.
- Added a production-scale layout regression using Walnut-sized demo dimensions (`1500` rows, `182` columns) to lock full-layout + small-viewport behavior.
- Reworked conditional-format visual calculation to build the sheet row/cell index once and reuse it across range scans, avoiding repeated full-sheet map construction for large conditional-format ranges.
- Changed table style visuals from eager full-table materialization to a lazy lookup model. Header/filter, stripe, edge-column, and totals styling now resolve for visible cells on demand instead of allocating a visual entry for every table cell.
- Changed conditional-format visuals to the same lazy lookup model. Color scales, data bars, icon sets, text/cell rules, and known fallback rules now keep compact rule specs plus range statistics and resolve only for visible cells.
- Changed conditional-format numeric range scans to traverse populated sheet cells and filter by range, avoiding dense iteration across sparse full-column/full-sheet rules. Empty cells now stay non-numeric instead of being treated as `0`.
- Added Excel-style range parsing for absolute, sheet-qualified, full-column, and full-row references such as `$A$1:$B$2`, `Sheet1!A:A`, and `1:1`, so production conditional-format/table ranges expand to worksheet bounds without dense visual materialization.
- Added a bounded cell visual cache for lazy table/conditional lookups so repeated body/frozen rendering does not rescan rules for the same visible cells while scrolling cannot grow the cache without limit.
- Verified fixture protocol parity, fixture render contract, chart-heavy render contract, and the 21-file production XLSX corpus under `/Users/phodal/Downloads/excel` with `--assert`; all passed against Walnut after the lazy lookup/range parsing changes.
- Expanded `test:office-wasm-reader:xlsx-render` to include `xlsx_multi_chart_contract.xlsx` and `xlsx_surface_chart_contract.xlsx`, so common render checks now cover multi-chart and surface chart protocol/layout contracts.
- Hidden rows and columns now stay in the prefix-sum layout as zero-size entries, matching Excel/Walnut viewport semantics without shifting later row/column indexes.
- Row and column `styleIndex` values are now preserved in the layout adapter and participate in renderer style/number-format fallback when a cell has no direct style.
- Built-in Excel number formats now participate in cell text rendering, covering common date, percent, decimal, thousands, and currency `numFmtId` values even when no custom `numberFormats[]` entry exists.
- `showGridLines=false` now suppresses fallback worksheet gridline borders in the debug preview while preserving explicit cell border colors.
- Excel alignment flags now feed the viewport renderer for common horizontal/vertical alignment, wrap suppression, shrink-to-fit, and indent styling.
- Explicit cell border colors, line styles, and common Excel border widths now map into the viewport renderer instead of always falling back to a thin solid gridline.
- Built-in number formatting now covers common scientific, fraction, elapsed/clock time, and negative-section number/currency formats.
- Chart plot-area layout now honors non-overlay top/left/right/bottom legend space, while overlay legends no longer shrink the plot area.
- Chart y-axis tick labels now consume common axis number formats for percent, currency, fixed decimal, and thousands display.
- Line chart series markers are now protocol-driven instead of being forced for every series; fallback demo charts still opt into markers.
- Sheet `sparklineGroups` now render as per-cell inline SVG sparklines from the protocol ranges, with line/column/stacked types, series color, line weight, and marker flags.
- Cells targeted by XLSX notes or threaded comment threads now render a lightweight top-right comment indicator in the viewport.
- XLSX data-validation ranges now use a lazy bounded lookup and render list dropdown or validation indicators for visible cells, including full-column ranges without dense materialization.
- Workbook sheet `tabColor` values now feed the bottom sheet-tab chrome instead of being ignored by the preview.
- Sheet-level slicer protocol objects now get a fallback worksheet overlay when no drawing shape already represents the slicer.
- Conditional-format preview resolution now covers `stopIfTrue`, common text/cell comparisons, duplicate/unique rules, top/bottom rules, and above/below-average rules without returning to eager full-sheet visual materialization.
- Formula-driven conditional-format rules now use a conservative evaluator for common expressions without adding eager full-sheet rendering.
- Data-bar rendering now consumes `showValue`, `direction`, `minLength`, and `maxLength` from the existing lazy conditional-format lookup.
- Verified the low-risk viewport pass with the spreadsheet frozen-header, chart, and shape unit tests plus targeted ESLint for `spreadsheet-preview.tsx`.

## Residual Follow-Up Work

- Add synthetic stress fixtures and benchmark data for larger sheets without committing production files. The current validation corpus proves protocol parity, but it does not measure sustained scroll/resize/editor workload.
- Add explicit performance gates for large visible ranges, dense table/conditional-format/data-validation rules, sparkline groups, drawing overlays, frozen-pane segmentation, and repeated scroll updates. Current tests lock behavior, not runtime budgets.
- If XLSX preview becomes a product surface, continue moving richer formatting, overlay painting, pointer hover targets, and editor visuals into the canvas/worker draw-plan path. The adapter should remain the contract boundary for column/row prefix sums, freeze panes, floating hit regions, and overlay geometry.
- Keep `/Users/phodal/Downloads/excel` as validation-only input. Any future stress corpus should be generated synthetic data or small committed fixtures that avoid customer/production content.

## References

- `docs/issues/2026-05-02-walnut-workbook-layout-adapter.md`
- `tmp/codex-app-analysis/extracted/webview/assets/PopcornElectronWorkbookPanel-BZz8NPb4.js`
