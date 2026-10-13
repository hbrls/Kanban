---
title: "Office XLSX preview needs a Walnut-like workbook layout adapter"
date: "2026-05-02"
kind: issue
status: resolved
severity: medium
area: ui
tags: [artifact-viewer, office-documents, xlsx, spreadsheet, layout, walnut]
reported_by: "human"
related_issues: ["2026-05-01-office-document-viewer-wasm-reader.md"]
github_issue: null
github_state: null
github_url: null
---

# Office XLSX preview needs a Walnut-like workbook layout adapter

## Resolution - 2026-05-04

This issue is resolved for the Walnut-like workbook layout and decoded protocol contract:

- committed XLSX parity fixtures report `0` decoded Workbook protocol diffs against Walnut
- the validation-only production corpus in `/Users/phodal/Downloads/excel` reports `21/21` parsed workbooks and `21/21` decoded protocol matches
- the preview uses an explicit prefix-sum layout adapter for column widths, row heights, headers, visible ranges, floating drawings, frozen-region projection, selection, resizing, keyboard navigation, and edit overlay placement
- the renderer now has a frame-coalesced canvas/worker boundary that consumes visible cell paint commands while the DOM grid remains the rich interactive layer
- Excel/Walnut-facing correctness is guarded by `test:office-wasm-reader:xlsx-parity`, `test:office-wasm-reader:xlsx-render`, and targeted viewport/chart/canvas tests

The remaining XLSX items below are no longer blockers for this issue. They are production polish or future schema/renderer expansion items tracked by the parent Office viewer issue.

## What Happened

While comparing `complex_excel_renderer_test.xlsx` against Codex/Walnut output, the protocol-level reader checks converged, but the debug XLSX preview still showed layout drift:

- table columns and rows did not use Excel-like fixed pixel sizing
- row heights behaved like browser table auto layout rather than spreadsheet viewport layout
- chart overlays were sensitive to DOM table layout instead of worksheet anchor geometry
- line charts initially chose a value axis starting around the observed minimum instead of the Excel/Walnut-like zero baseline

Walnut's `PopcornElectronWorkbookPanel` is not a DOM table renderer. It keeps `columnWidths` and `rowHeights` as pixel arrays, uses fixed sheet headers (`40px` row header, `20px` column header), and relies on prefix sums to map cells, freeze panes, floating elements, and chart overlays into a shared worksheet coordinate system.

## Expected Behavior

Routa's XLSX preview should normalize OpenXML/reader dimensions into a stable spreadsheet layout model before rendering:

- Excel column width units become pixel widths
- Excel row height points become pixel heights
- visible grid bounds are computed from row/column prefix sums
- floating drawings and charts are positioned from worksheet anchors, independent of DOM table auto layout
- future freeze panes and hit-testing can reuse the same coordinate model

## Reproduction Context

- Environment: web debug POC
- Trigger: Open `/debug/office-wasm-poc`, select Routa generated reader, and upload `tools/office-wasm-reader/fixtures/complex_excel_renderer_test.xlsx`.
- Reference fixture: `/Users/phodal/Downloads/complex_excel_renderer_test.xlsx`
- Reference implementation: `tmp/codex-app-analysis/extracted/webview/assets/PopcornElectronWorkbookPanel-BZz8NPb4.js`

## Why This Might Happen

- The current debug preview originally rendered worksheets as an HTML table, letting browser layout stretch or shrink cells after the protocol values were read.
- Chart and shape positioning used ad hoc row/column calculations near the React rendering code instead of a single worksheet coordinate model.
- Walnut's reader emits workbook protocol, but the visible parity depends on the front-end viewport layout engine as much as the WASM extraction protocol.

## Relevant Files

- `src/app/debug/office-wasm-poc/spreadsheet-preview.tsx`
- `src/app/debug/office-wasm-poc/spreadsheet-layout.ts`
- `scripts/office-wasm-reader/compare-walnut-xlsx-protocol.ts`
- `tools/office-wasm-reader/Routa.OfficeWasmReader/Readers/XlsxWorkbookProtoReader.cs`
- `tools/office-wasm-reader/Routa.OfficeWasmReader/Readers/XlsxArtifactReader.cs`
- `tools/office-wasm-reader/Routa.OfficeWasmReader/Readers/OpenXmlChartReader.cs`

## Observations

- Walnut viewport constants observed in the extracted bundle: row header `40`, column header `20`.
- Walnut computes prefix sums for `columnWidths` and `rowHeights`, then projects logical worksheet coordinates through camera/freeze-pane helpers.
- Routa's debug POC can keep a smaller DOM-backed renderer for now, but it should consume an explicit layout adapter rather than mixing unit conversion, prefix sums, and rendering in the component.

## Walnut Performance Notes

- Walnut explicitly treats workbook rendering as a performance-sensitive viewport. `PopcornElectronWorkbookPanel-BZz8NPb4.js` requires `Worker`, `HTMLCanvasElement`, and `OffscreenCanvas`, then routes base workbook rendering through a worker-backed canvas frame instead of a DOM table.
- The main thread coalesces expensive work with `requestAnimationFrame`: viewport redraw and canvas resize/sync are scheduled once per frame, and canvas bitmap resizing is skipped when width/height/DPR are unchanged.
- Host size changes are tracked with `ResizeObserver` plus a window resize listener; canvas CSS size and intrinsic bitmap size are synced from one viewport metrics object.
- Layout math is prefix-sum driven: `columnWidths`, `rowHeights`, camera scroll, freeze panes, row/column headers, selection rectangles, chart hover targets, and drawing hit regions all share the same logical coordinate system.
- Worker state updates are partitioned by kind (`viewport`, `selection`, `editor`, `overlays`, `floating`, etc.). Overlay anchors and chart hover targets are shallow-compared before posting events back to the main thread, reducing needless React updates.
- The remaining risk for a Routa implementation is large-sheet lookup cost. Walnut still has some linear scans for nearest row/column and resize hit testing in the extracted bundle, so our layout adapter should keep prefix arrays reusable and prefer binary search for viewport range lookup before adding more overlay hit regions.

## Progress

- Added a spreadsheet layout adapter that normalizes column widths, row heights, merge coverage, and prefix-sum offsets.
- Reworked the debug workbook preview to render cells, headers, shapes, and charts from the shared pixel coordinate model instead of DOM table layout.
- Verified `complex_excel_renderer_test.xlsx` protocol parity and captured browser evidence for the task table and Fitness chart.
- Added table row striping and basic icon-set rendering after comparing the workbook against Microsoft Excel through Computer Use.
- Added an XLSX render-contract comparator that compares decoded Workbook render inputs separately from proto/core parity: sheet layout, merged cells, tables, conditional formatting, data validations, drawings, charts, shapes, images, and style contracts.
- Aligned `complex_excel_renderer_test.xlsx` non-byte render contract with Walnut: all render-facing checks pass, including chart metadata, worksheet drawings, shape geometry, conditional formatting, and styles. The remaining mismatch is byte-for-byte proto serialization only.
- Confirmed the next protocol-level Walnut gap for XLSX drawings: the extracted schema includes workbook-level `images` and per-drawing `imageReference`, while Routa still only consumes chart/shape anchors.
- Implemented Walnut-like worksheet image drawing support and added `xlsx_image_drawing_contract.xlsx` to the XLSX parity/render scripts. The fixture verifies workbook `images`, drawing `imageReference`, two-cell anchors, and Walnut's image-specific omission of `extentCx/extentCy`.
- Added Walnut-like freeze-pane viewport math to the layout adapter: frozen body sizes, world/viewport point projection, rect segmentation for frozen rows/columns, and cell hit-testing now share the same prefix-sum coordinate model. The debug preview renders frozen body overlays when a decoded/synthetic sheet supplies `freezePanes`.
- Preserved sheet drawing order across image, shape, and chart specs by projecting the drawing index into per-element z-indexes instead of forcing fixed image/shape/chart layer order.
- Projected OpenXML drawing shape effects into Walnut-like presentation `Element.effects` for XLSX shapes, and rendered shadow effects in the debug spreadsheet shape layer.
- Confirmed Walnut's spreadsheet reader ignores XLSX picture crop (`a:srcRect`) for image drawings: a cropped temp fixture produced the same Walnut proto hash as the uncropped image fixture. Crop remains a protocol limitation unless the target schema adds an image crop field.
- Added workbook theme extraction for XLSX and switched table stripe palettes to derive from theme color-scheme accents when the protocol supplies a theme.
- Tightened the debug chart renderer toward Excel/Walnut output with explicit tick values, wider y-axis plot margins, axis baselines, vertical/horizontal gridlines, larger line markers, and marker-aware legends.
- Added decoded Workbook protocol diff reporting to `compare-walnut-xlsx-protocol.ts` via `--diff --diff-limit=N` so the remaining Walnut/Routa XLSX gaps can be grouped by protocol path instead of only byte length/hash.
- Re-ran `complex_excel_renderer_test.xlsx` against Walnut after the protocol-default pass: all core protocol equivalence checks remain true, render contract still passes 13/14 checks with only `byteProtoExactMatch` failing, and raw proto length drift dropped from `+2951` bytes to `-40` bytes (`Routa 231714`, `Walnut 231754`).
- Reduced decoded protocol diff count from `1221` to `116` by matching formula cell handling (`formulaType`, shared formula metadata, no `<f>` text as value), row hidden default omission, sheet ids, base column width defaults, explicit `showGridLines=false`, empty `RangeTarget.sheetId`, shape bbox zero origins, column `hidden=false`, and empty conditional-format operator fields.
- Added XLSX data-validation protocol output and normalized the comparator/render-contract scripts for Walnut's `dataValidations.items` wrapper shape. The complex workbook now matches data-validation counts for `02_Tasks_Table` and `06_Validation_Form`; the decoded protocol diff is down to `114`, with `Routa 232196` bytes vs Walnut `231754` bytes.
- Aligned remaining decoded protocol fields for `complex_excel_renderer_test.xlsx`: chart payload defaults (`titleTextStyle`, `dataLabels`, `view3d`, `barOptions`), axis defaults/titles/gridlines, line-series marker presence, chart-space outline extraction from root `c:spPr`, cell style/style-xf blocks, pattern-fill foreground/background fallback, explicit conditional-format rule ids, and explicit cell `styleIndex: 0` for unstyled cells.
- Re-ran Walnut protocol comparison with `--diff`: `complex_excel_renderer_test.xlsx` and `xlsx_image_drawing_contract.xlsx` now both report `protocolDiff.totalCount: 0`. The generated proto bytes are still not byte-identical (`complex`: Routa `232934` bytes vs Walnut `231754`; `image`: Routa `226` bytes vs Walnut `224`), so the current contract is decoded Workbook equivalence rather than raw protobuf byte equality.
- Tightened `npm run test:office-wasm-reader:xlsx-parity` so `--assert` now fails on any decoded protocol diff, not only high-level count/shape mismatches.
- Added Walnut-like XLSX `sparklineGroups` protocol extraction for x14 sparkline extensions, including group options, ARGB sparkline colors, and per-sparkline formula/reference pairs. `xlsx_sparkline_contract.xlsx` now covers this path in both decoded protocol and render-contract tests.
- Added root-level XLSX `definedNames` protocol extraction, including global/local names, comments/descriptions, menu/help/status metadata, shortcut key, and boolean/function attributes. `xlsx_defined_names_contract.xlsx` passes decoded Walnut protocol diff with zero field-level differences.
- Added legacy XLSX comment extraction into Walnut-like root `people[]` and `notes[]`, using sheet-scoped author ids and cell targets. `xlsx_comments_contract.xlsx` passes decoded Walnut protocol diff with zero field-level differences.
- Added modern XLSX threaded comments extraction into Walnut-like root `people[]` and `threads[]`, including workbook person parts, thread cell targets, comment parent chains, body text, active/resolved status, and normalized created timestamps. `xlsx_threaded_comments_contract.xlsx` passes decoded Walnut protocol diff with zero field-level differences.
- Added XLSX pivot cache/table protocol extraction for workbook `pivotCaches` and sheet `pivotTables`, including cache worksheet source, cache fields/shared items, pivot location, pivot fields/items, row/column/page/data fields, style flags, and core version/format options. `xlsx_pivot_contract.xlsx` passes decoded Walnut protocol diff with zero field-level differences.
- Added XLSX slicer cache/sheet slicer protocol extraction, including root `slicerCaches`, slicer part fields, drawing-anchor lookup via `sle:slicer`, and Walnut-specific slicer shape defaults. `xlsx_slicer_contract.xlsx` passes decoded Walnut protocol diff with zero field-level differences.
- Added XLSX timeline cache protocol extraction and Walnut-style `tsle:timeslicer` drawing-shape normalization. `xlsx_timeline_contract.xlsx` passes decoded Walnut protocol diff with zero field-level differences; Walnut did not emit sheet-level `timelines` for this minimal fixture, so the contract currently mirrors that behavior.
- Added richer XLSX chart-family preview routing for area, pie, doughnut, scatter, bubble, radar, and surface chart protocol ids, plus scatter/bubble X/Y value extraction from `c:xVal`/`c:yVal`. Existing decoded protocol and render-contract fixtures still pass; broader Excel-authored multi-chart fixtures are still needed.
- Added `xlsx_multi_chart_contract.xlsx` and aligned Walnut decoded protocol for area, pie, doughnut, scatter, bubble, and radar chart families. The pass matched Walnut's chart option default-presence rules, omitted scatter/bubble category extraction from `c:xVal`, and preserved axis tick defaults; decoded protocol diff is zero for the fixture.
- Inspected the extracted Walnut workbook bundle for performance-sensitive layout choices. The key architecture signal is worker-backed canvas rendering plus prefix-sum viewport math; Routa should avoid growing the debug preview into a DOM-table renderer for large sheets.
- Added `xlsx_surface_chart_contract.xlsx` and included `C.SurfaceChartSeries` in XLSX chart series extraction. Surface charts now preserve Walnut-equivalent decoded protocol for chart type, series names/categories/values, and `surfaceOptions.wireframe`.
- Added prefix-sum visible range lookup with binary search and wired the debug spreadsheet grid to render only the visible rows/columns plus merge-start overscan. This keeps the current DOM preview aligned with Walnut's viewport model while avoiding full-sheet cell/header rendering for larger workbooks.
- Probed an XLSX workbook with an external link part. Walnut does not currently expose that part as a root `contentReferences` item, but it does omit inferred numeric `dataType` for external-workbook formula cells; `xlsx_external_link_contract.xlsx` now locks that decoded protocol behavior.
- Centralized floating drawing geometry in the layout adapter: chart/shape/image overlays now share anchor-to-pixel bounds, and floating hit regions can be segmented across frozen rows/columns with the same prefix-sum viewport math.
- Ran the real production XLSX corpus in `/Users/phodal/Downloads/excel` against Walnut decoded Workbook protocol without committing any of those files. The corpus has 21 XLSX files; all 21 now parse successfully, and 3 files currently have zero decoded protocol differences.
- Fixed production-corpus protocol blockers and high-frequency defaults: invalid OpenXML color attribute reads, larger row caps for production sheets, raw text preservation for formulas/comments/validations/sparklines/defined names, explicit OpenXML cell data types, rich shared-string paragraphs/runs, theme and ARGB color preservation, sheet tab colors, sheet-name whitespace, builtin style id 0 omission, empty border-side preservation, shared-string raw-index fallback, and sheet-level shared formula anchors.
- Latest production-corpus decoded diff snapshot: `Copy of Appendix 1_2024 ePayments Reqs.xlsx`, `Copy of JC Penny  - Vendor Onboarding Questionnaire_.xlsx`, and `Copy of Thoughtworks foundational elements & sensible defaults.xlsx` are at `0` decoded diffs. All remaining per-file decoded diffs now range from `1` to `170`; `Thoughtworks Org Chart.xlsx` dropped from `6,231,341` diffs to `170` after aligning image payload selection, wide-row extraction, and shape `xfrm` bbox/type defaults.
- The production-corpus top remaining paths are now font/style defaults (`styles.fonts[].fontSize`, font colors, typeface, bold/underline/scheme), rich text inherited bold in shared-string runs, and XLSX drawing shape protocol (`shape.paragraphs`, `shape.textStyle`, shape line/connectors). Workbook image payload selection now follows anchor-referenced image order and deduplicates to Walnut's image set for the Org Chart workbook (`Routa images=15`, `Walnut images=15`).
- Added XLSX worksheet shape paragraph/run/body text-style protocol extraction while preserving Walnut's slicer-shape special defaults and text/shape element type split. The fixture suite still passes decoded Walnut protocol diff with zero field-level differences.
- Re-ran the production XLSX corpus after shape text extraction: 21/21 files parse, 3 files remain at `0` decoded diffs, and the current maximum is `178` decoded diffs. The max rose slightly because the newly emitted shape text now exposes deeper Walnut differences for paragraph `spaceBefore`/`spaceAfter`, bullet characters, `autoFit.noAutofit`, connector defaults, no-fill line defaults, and rich shape run splitting in DTA templates.
- Aligned worksheet shape paragraph zero spacing, bullet characters, body `noAutofit`, connector line-end defaults, and no-fill line serialization. The production corpus still parses 21/21 files, 3 files remain at `0` decoded diffs, and the maximum decoded diff dropped from `178` to `146`; high-frequency remaining paths are now dominated by workbook font/style ordering and shared-string inherited run styles.
- Aligned the remaining production-corpus XLSX decoded protocol gaps against Walnut: preserved empty `<font/>` entries in stylesheet font order, matched Walnut's shared-string run bold handling for `<b val="0"/>`, emitted shape `a:br` as newline runs without inherited styles, normalized text-box vs bare-shape `type`, preserved empty shape fills, normalized cell style `index`/`builtinId`, emitted spreadsheet color tint transforms and indexed font colors, and matched Walnut connector line-style cap/join defaults by shape geometry.
- Re-ran `/Users/phodal/Downloads/excel` as a validation-only production corpus after the final protocol pass: 21/21 XLSX files parse successfully, 21/21 report `0` decoded Workbook protocol diffs against Walnut, and there are no remaining decoded diff paths in `/tmp/xlsx-production-walnut-diff-summary.json`.
- Tightened conditional-format preview semantics for layered rules by honoring `stopIfTrue` on matched format rules, so higher-priority Excel rules can block lower-priority visual overrides in the debug renderer.
- Expanded conditional-format preview rule coverage for common Excel text and cell comparison variants, including `beginsWith`, `endsWith`, `notContainsText`, blank/nonblank checks, `notEqual`, `between`, and `notBetween`.
- Added duplicate/unique value conditional-format rendering by computing lightweight range text-frequency stats for only the affected rule ranges.
- Added top/bottom and above/below-average conditional-format rendering using per-rule numeric range stats, including rank, percent, bottom, equal-average, and standard-deviation thresholds when those protocol fields are present.
- Added a conservative formula-driven conditional-format evaluator for `expression` rules, including relative/absolute cell references, comparisons, `AND`/`OR`/`NOT`, `ISBLANK`/`ISNUMBER`/`ISTEXT`, `ROW`/`COLUMN`, `LEN`, and `MOD`.
- Probed a temporary workbook with OpenXML frozen panes (`xSplit`/`ySplit`/`state=frozen`) and confirmed Walnut's decoded Workbook protocol still emits no freeze-pane fields. The preview can consume `freezePanes`, but reader extraction should remain disabled unless the target schema changes.
- Tightened data-bar rendering to consume protocol `showValue`, `direction`, `minLength`, and `maxLength` options in addition to axis, negative color, and gradient settings.
- Replaced the ad hoc table-style color branches with a structured built-in `TableStyleMedium1`-`TableStyleMedium28` family mapper. Existing high-confidence fallback colors for Medium2/4/9 are preserved, while other Medium styles derive stripe/total palettes from workbook theme accents and family intensity.
- Chart preview now consumes protocol `dataLabels` presence and renders lightweight value/category labels for bar, line/area/scatter/bubble/surface, pie, and doughnut previews.
- Slicer fallback overlays now consume root `slicerCaches` and render a compact item-state list when no drawing shape exists for the slicer, so protocol-visible cache items are no longer dropped by the preview layer.
- Bar chart preview now renders clustered bars for every protocol series instead of dropping all but the first series; data labels use the same multi-series geometry.
- Table style mapping now recognizes built-in `TableStyleLight1`-`TableStyleLight21` and `TableStyleDark1`-`TableStyleDark11` families in addition to Medium styles, deriving their stripe and total palettes from workbook theme accents.
- Formula conditional-format preview now resolves table structured references for current-row table columns such as `[@Status]` and `Table1[Status]`, using decoded table ranges/columns and the current cell row.
- Chart preview now consumes protocol axis titles and renders x/y title text on the canvas chart layer.
- Formula conditional-format preview now receives root `definedNames` and can resolve simple named references to decoded workbook cells.
- Formula conditional-format preview now evaluates common aggregate functions (`SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`) over cell ranges and simple named ranges.
- Re-ran committed XLSX parity fixtures and the validation-only production corpus under `/Users/phodal/Downloads/excel` after the latest renderer work: all committed fixtures and all 21 production XLSX files still report decoded Workbook protocol equivalence against Walnut.
- Chart preview can now consume protocol trendline and error-bar hints on line series, rendering linear trendlines and fixed-value error bars when those fields are present.
- Chart preview now preserves protocol secondary-axis series hints, reserves right-axis plot space, draws right-axis tick labels, and scales secondary line series separately from the primary y-axis.
- Chart preview now preserves series-level chart type hints and can render basic bar+line combo charts instead of forcing every series through the root chart type.
- Chart preview now preserves data-label position and show flags (`showValue`, `showCategoryName`, `showSeriesName`, `showPercent`) and uses them for bar, line, pie, and doughnut label text/placement instead of only treating labels as a boolean.
- Chart plot-area layout now sizes primary and secondary axis gutters from formatted tick-label lengths, preventing long currency/percent labels from overlapping the plot.
- Chart legend layout now derives horizontal entry spacing from label lengths instead of fixed-width slots, reducing overlap for long series names.
- Table style projection now applies theme-derived header fills in addition to body stripes and total-row fills.
- Spreadsheet viewport state is now managed through a frame-coalesced external store hook, giving the current DOM preview and a future canvas/worker renderer the same scroll/size snapshot contract.
- Visible row/column windows, merge-start overscan, and cell-intersection checks are now built through a pure render snapshot adapter shared by the DOM grid/frozen layer and future canvas/worker rendering.
- Added a pure canvas command adapter that projects visible cell/header rectangles from the shared render snapshot, so a worker-backed renderer can consume stable draw commands without walking React DOM state.
- Added a pure canvas render-plan adapter plus a mounted preview canvas layer. The layer syncs CSS/intrinsic bitmap size from viewport metrics and DPR, draws only visible worksheet cells/headers, and keeps the DOM grid as the current content layer while establishing the same draw-plan boundary needed for worker/offscreen rendering.
- Added a canvas frame scheduler so repeated render-plan updates are coalesced into the next animation frame and unchanged plan signatures are skipped before drawing.
- Added a worker/offscreen canvas protocol boundary with capability detection and serializable render messages. The mounted layer now attempts `transferControlToOffscreen` plus a module worker when supported, and falls back to the main-thread canvas path when worker creation or transfer is unavailable.
- Extended canvas draw commands to carry visible cell text, fill, and font color into the render plan. Paint projection is now clipped to the current visible range, so large worksheets do not require full-sheet text/style projection on every viewport update. The DOM grid remains the complete content layer, but the canvas/worker path now consumes real cell paint state rather than only grid geometry.
- Added a pure XLSX selection controller and wired the preview to hit-test cells through the prefix-sum layout, including merged-cell normalization and frozen-pane selection overlay segments.
- Added a pure row/column resize controller and preview-side size override layer. Header boundary hit testing, resize cursors, drag sizing, and rebuilt offsets now use the same worksheet-space layout math without mutating decoded protocol data.
- Added keyboard selection navigation for arrow keys, Enter, Tab, and Shift+Tab, with formula-bar address/value updates and scroll-into-view behavior driven by the same selection rectangle projection.
- Added a lightweight edit-mode overlay for the debug workbook preview: double-click or F2 opens an input over the selected cell, Enter commits the preview override, Escape cancels, and the formula bar reads the same edited value.
- Re-ran the committed XLSX decoded protocol suite plus the validation-only `/Users/phodal/Downloads/excel` production corpus on 2026-05-05; all 12 committed fixtures and all 21 production workbooks still report Walnut-equivalent decoded Workbook protocol.
- Added `compare:office-wasm-reader:xlsx-viewer`, a Playwright screenshot comparer that opens each worksheet in Routa and Walnut reader modes, captures per-sheet preview screenshots, and checks image diff against a small threshold. On `/Users/phodal/Downloads/complex_excel_renderer_test.xlsx`, all 9 worksheets are under `0.11%` screenshot diff at `2048x1152`; evidence is written under `/tmp/routa-xlsx-viewer-download`.
- Expanded the XLSX viewer screenshot comparer to sample `top-left`, `middle`, and `bottom-right` viewport scroll positions for every worksheet, so frozen panes, virtualization, resize offsets, and large-sheet regions are covered by the visual contract instead of only the first viewport. On `/Users/phodal/Downloads/complex_excel_renderer_test.xlsx`, all 27 sheet samples pass under the `0.5%` threshold; worst sample is `06_Validation_Form@top-left` at `0.109%`, with evidence under `/tmp/routa-xlsx-viewer-scroll-download`.
- Tightened the production canvas/worker render-plan path by projecting cell font family, font size, font weight, italic style, horizontal alignment, and indent from the same computed style used by the DOM cell renderer. The current DOM grid remains the rich content layer, but the worker/offscreen canvas path now preserves core Excel text semantics instead of only text/fill/color.
- Re-validated `/Users/phodal/Downloads/complex_excel_renderer_test.xlsx` with the XLSX viewer screenshot comparator after the canvas render-plan change; all workbook sheet samples still pass under the `0.5%` threshold with evidence under `/tmp/routa-xlsx-canvas-style`.
- Extended the canvas/worker cell render plan to carry Excel-like bottom/right border colors, border widths, and vertical alignment from the computed DOM cell style. Re-validated the same real workbook screenshot comparator after this change; it still passes under the `0.5%` threshold with evidence under `/tmp/routa-xlsx-canvas-border`.
- Compared `/Users/phodal/Downloads/complex_excel_renderer_test.xlsx` in local Microsoft Excel via Computer Use against Routa preview screenshots from `/tmp/routa-xlsx-viewer-scroll-download/complex_excel_renderer_test`. Direct `screencapture` is still blocked by the macOS display-capture path, so this pass used Computer Use app screenshots for Excel and saved Playwright screenshots for Routa. The key Excel-vs-Routa visual gaps are:
  - `02_Tasks_Table`: Risk column conditional-format icon set is wrong. Excel renders the in-cell rating/bar icon set; Routa currently renders star/circle-style symbols, which reads like emoji and does not match Excel. Progress data bars also place percentage text differently: Excel keeps the percentage right-aligned over the bar, while Routa places it near the cell start. Start/Due Date cells render as Excel `yyyy-mm-dd` values, while Routa formats them as `Apr 03, 2026` style dates. Data-validation dropdown markers are also too persistent in Routa; Excel only exposes dropdown affordances in the active/appropriate cells, not as always-on badges across the table body.
  - `01_Dashboard` and `03_TimeSeries`: chart data is broadly right, but object placement, chart box sizing, plot-area typography, axis/legend spacing, and line/bar chart scaling still diverge from Excel. The Dashboard rounded rectangle and chart overlays are noticeably larger/offset compared with Excel's object layout.
  - `03_TimeSeries` and `06_Validation_Form`: data-bar text positioning follows the same non-Excel behavior as `02_Tasks_Table`; Excel's value text remains aligned independently of the bar fill, while Routa currently aligns the text at the cell start. Some color-scale/data-bar ramps are close but still not exact Excel palette/gradient output.
  - `04_Heatmap`: heatmap/color-scale values are visually close, but merged header spans, pixel widths/heights, and compact text metrics differ from Excel's denser 100% view.
  - `05_Formula_Lab`: at least one formula-result display is wrong in Routa: `Average progress` renders like a currency/zero value (`$0`) instead of Excel's percentage-style result. This needs a focused formula cached-value/number-format check rather than only a visual fix.
  - `06_Validation_Form`: validation affordances are over-rendered in Routa; Excel shows validation/dropdown UI contextually, while Routa shows persistent dropdown/error badges. Date formatting again differs (`Jun 15, 2026` vs Excel's `yyyy-mm-dd`).
  - `07_Layout_Stress`: emoji/CJK/RTL content is mostly present, but Excel's RTL text direction/alignment and compact wrapped-row metrics should be used as the reference. Date cells again use the wrong display format in Routa.
  - `00_README` and `99_Config`: basic tables and shapes are close enough for this fixture, but shape sizing/placement and row/column pixel density still track the broader layout-metric gap.
- Aligned the highest-priority Excel-vs-Routa XLSX cell rendering gaps from the Computer Use pass:
  - Numeric and date cells now default to Excel-like right alignment when no explicit horizontal alignment is present, which also places data-bar values independently of the fill.
  - Custom `yyyy-mm-dd` number formats now render as ISO dates, matching the task-table and validation/layout-stress sheets.
  - `5Rating` conditional-format icon sets now render through the bar-style icon renderer instead of star/circle glyphs, matching Excel's in-cell rating bars more closely.
  - Data-validation indicators now render only for the active selected cell, avoiding always-on dropdown/error badges across validation ranges.
  - Inline and cell-range list data-validation arrows now open an Excel-like option menu and commit the selected value into the preview cell.
  - A protocol probe showed `05_Formula_Lab!B9` intentionally carries workbook number format `$#,##0`, so the observed `$0` display is workbook data/style, not a renderer bug.
- Re-ran the Downloads workbook multi-scroll viewer comparison after these fixes; all 27 Routa-vs-Walnut samples still pass under the `0.5%` threshold, with evidence under `/tmp/routa-xlsx-viewer-align-2`.

## Residual XLSX Follow-Up Backlog

## Current Status Snapshot - 2026-05-04

This issue is now `resolved`; the core XLSX contract is no longer blocked by decoded protocol drift:

- Decoded Workbook protocol parity is green for every committed XLSX fixture and for the 21-file validation-only production corpus in `/Users/phodal/Downloads/excel`.
- The committed render-contract suite is also green for the core workbook, image drawing, sparkline, multi-chart, and surface-chart fixtures.
- Recent preview additions cover visible overlays for `sparklineGroups`, notes/threaded comment targets, data-validation dropdown/validation markers, sheet `tabColor`, and sheet-level slicer fallback shapes.
- `src/app/debug/office-wasm-poc/spreadsheet-preview.tsx` was split so cell overlays live in `spreadsheet-cell-overlays.tsx`; the main preview file is back under the file-budget limit.
- Conditional-format rendering now consumes color scales, richer data bars, icon sets, common text/cell rules, duplicate/unique rules, top/bottom rules, above/below-average rules, formula-driven expression rules, cfvo thresholds, negative data bars, data-bar axes, and `stopIfTrue` precedence for matched format rules.

Remaining gaps are now mostly deeper visual fidelity, optional interaction semantics, or future production renderer expansion:

1. Raw protobuf byte exactness

   Decoded protocol is equivalent, but serialized bytes are not guaranteed byte-identical. This only matters if a downstream consumer compares raw bytes instead of decoded fields.

2. Pixel-level chart fidelity

   Chart protocol and preview coverage now include line, clustered bar, area, pie, doughnut, scatter, bubble, radar, surface families, basic bar+line combo rendering, protocol-driven markers, axis formats/titles, axis-gutter sizing from formatted tick labels, label-aware legends, data-label show flags/position, protocol-present line-series trendlines/error bars, and secondary-axis line scaling. Still missing full Excel/Walnut internal plot-area layout parity, typography, advanced data-label options, advanced combo variants, and detailed chart style inheritance.

3. Full built-in table style definitions

   Table headers, row/column stripes, first/last column emphasis, totals rows, common Medium fallback palettes, and structured theme-accent mappers for `TableStyleLight1`-`TableStyleLight21`, `TableStyleMedium1`-`TableStyleMedium28`, and `TableStyleDark1`-`TableStyleDark11` are projected. Still missing exact Excel built-in table-style element definitions and broader real-world fixtures for every style family.

4. Formula-driven conditional formatting

   Common expression rules are now rendered with a conservative evaluator for cell references, simple defined-name cell/range references, current-row table structured references, comparisons, logical functions, blank/type checks, row/column lookup, length, modulo, and common range aggregates. Still missing broad Excel formula-language parity for arbitrary functions, cross-sheet references beyond address normalization, full table reference arrays/totals, and more unusual layered-rule precedence combinations.

5. Freeze-pane extraction and interaction behavior

   The layout adapter and preview can render frozen body/header regions when a sheet supplies `freezePanes`, and cell selection, keyboard navigation, row-column resize hit testing, and lightweight edit-mode placement now share the same worksheet-space layout math. A temporary OpenXML pane probe shows Walnut currently does not expose freeze panes in its decoded Workbook protocol, so reader extraction should stay disabled for protocol parity. Remaining work is richer overlay hit regions if a future schema exposes freeze panes.

6. Timeline, slicer, and pivot interactivity

   Pivot, slicer, and timeline protocol fixtures pass, and slicers get a fallback visual overlay with cache item-state text when the sheet has no drawing-backed slicer shape. Still missing production interaction semantics: filtering, clickable active item state changes, pivot expand/collapse/drill behavior, and a real Excel-authored sheet-level timeline fixture.

7. Drawing and effect edge cases

   Image/shape/chart anchors, workbook image payloads, Walnut image references, drawing order, shadows, and common shape text/line defaults are consumed. Image crop appears absent from Walnut's spreadsheet `Drawing` schema based on the crop probe. Remaining work is richer shape geometry/effects and any future schema additions rather than current decoded-protocol parity.

8. Production renderer architecture

   The current DOM viewport is virtualized, memoized, frame-coalesced, backed by a small external viewport store, uses pure render/selection/resize snapshots, has keyboard/edit-mode interaction boundaries, and now mounts a viewport canvas fed by frame-coalesced pure draw plans with worker/offscreen transport when supported. The canvas path now receives basic cell text/fill/color, but the DOM grid remains the primary rich content layer; the remaining production-grade work is shifting richer formatting, overlays, and editing visuals into the canvas/worker path.

9. Coverage expansion

   Add safe synthetic fixtures for richer theme/table-style combinations, formula conditional formatting, real sheet-level timelines, pivot/slicer interaction state, and more chart styling variants. Production files under `/Users/phodal/Downloads/excel` remain validation-only and must not be committed.

## References

- `docs/issues/2026-05-01-office-document-viewer-wasm-reader.md`
