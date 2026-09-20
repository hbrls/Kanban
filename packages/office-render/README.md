# @autodev/office-render

React renderers for Office payloads produced by `@autodev/office`.

This package is the **UI/runtime layer** of the Office pipeline:

- `@autodev/office`: read `.docx` / `.pptx` / `.xlsx`, return protobuf bytes or decoded payloads
- `@autodev/office-render`: take the decoded payload shape and render it in React

## Public API

```ts
import {
  WordPreview,
  SpreadsheetPreview,
  PresentationPreview,
} from "@autodev/office-render";
```

Current public exports:

- `WordPreview`
- `SpreadsheetPreview`
- `PresentationPreview`
- `PRESENTATION_HEADER_ACTIONS_ID`
- `PreviewLabels`
- `RecordValue`

## Runtime expectations

`@autodev/office-render` is intentionally lighter than the Routa app, but it is
not "just static JSX". Today it expects a React toolchain that can handle:

- ESM packages
- DOM APIs
- CSS modules
- Web workers for spreadsheet canvas rendering

It does **not** depend on Next.js-specific APIs.

## Current shape: stage-1 layering is now explicit

The package now has explicit top-level boundaries in `src/`:

| Layer | Responsibility | Current files |
| --- | --- | --- |
| Public boundary | Stable package exports | `src/index.ts` |
| Shared substrate | Protocol coercion, style helpers, shared chart helpers, images, common text helpers | `src/shared/*` |
| Format shells | Top-level React entry per format | `src/word/word-preview.tsx`, `src/spreadsheet/spreadsheet-preview.tsx`, `src/presentation/presentation-preview.tsx` |
| Format engines | Pure layout, rendering, pagination, formulas, filtering, chart math | `src/word/*`, `src/spreadsheet/*`, `src/presentation/*` |
| Runtime adapters | Canvas layer, worker protocol/client, CSS shell, DOM chrome | `src/spreadsheet/spreadsheet-canvas-*.ts*`, `src/spreadsheet/spreadsheet-workbook-chrome.tsx`, `src/presentation/presentation-preview.module.css` |

This is still only **stage 1**: the top-level seams are explicit, but some
large files and mixed concerns still need deeper extraction inside each format.

## Recommended target layering

For future refactors, keep five explicit layers:

### 1. Package boundary

Only public exports and externally stable types.

**Goal:** keep `src/index.ts` tiny and boring.

### 2. Shared substrate

Cross-format helpers that are safe to reuse:

- payload coercion (`asRecord`, `asArray`, `asString`, `asNumber`)
- color/font/image helpers
- shared text run / paragraph normalization
- label and shared type definitions

**Rules:**

- shared code must not import from `word/`, `spreadsheet/`, or `presentation/`
- keep as much of this layer React-free as possible

### 3. Format shell

One top-level component per format:

- `WordPreview`
- `SpreadsheetPreview`
- `PresentationPreview`

These files should act as **orchestration shells**:

- read the payload root
- build memoized derived data
- wire event handlers and state
- compose lower-level renderers

They should **not** become the place where layout algorithms or rendering math
accumulate.

### 4. Format engine

Pure format-specific logic with minimal React coupling.

Examples from the current codebase:

- **Word:** page layout, numbering, paragraph visibility, oversized table split
- **Spreadsheet:** sheet layout, conditional formulas, table filters, chart math
- **Presentation:** slide fit, text layout, table drawing, chart drawing

This is the layer to prioritize for test coverage and reuse.

### 5. Runtime adapters

Host-facing code that depends on browser/runtime details:

- canvas rendering
- worker protocol and worker client
- CSS modules
- DOM portals and fullscreen behavior

This layer should stay thin and depend on the format engine, not the other way
around.

## Current directory layout

```text
src/
  index.ts
  shared/
    index.ts
    declarations.d.ts
    office-preview-utils.ts
    office-chart-renderer.ts
    __tests__/
  word/
    index.ts
    word-preview.tsx
    word-preview-layout.ts
    word-preview-numbering.ts
    word-preview-paragraph-utils.ts
    word-preview-table-pagination.ts
    word-preview-text-box.tsx
    word-preview-crop-marks.tsx
    __tests__/
  spreadsheet/
    index.ts
    spreadsheet-preview.tsx
    spreadsheet-layout.ts
    spreadsheet-selection.ts
    spreadsheet-resize.ts
    spreadsheet-viewport-store.ts
    spreadsheet-cell-overlays.tsx
    spreadsheet-frozen-headers.tsx
    spreadsheet-table-filters.ts
    spreadsheet-table-filter-menu.tsx
    spreadsheet-table-styles.ts
    spreadsheet-charts.tsx
    spreadsheet-chart-*.ts
    spreadsheet-canvas-*.ts*
    spreadsheet-canvas.worker.ts
    spreadsheet-workbook-chrome.tsx
    __tests__/
  presentation/
    index.ts
    presentation-preview.tsx
    presentation-preview.module.css
    presentation-renderer.ts
    presentation-text-layout.ts
    presentation-table-renderer.ts
    __tests__/
```

This layout is the current stable baseline for the next refactor slices.

## How current files map to the target structure

### Shared

- `shared/office-preview-utils.ts`
- `shared/office-chart-renderer.ts`
- `shared/declarations.d.ts`

### Word

- `word-preview.tsx` -> `word/word-preview.tsx`
- `word-preview-layout.ts` -> `word/word-preview-layout.ts`
- `word-preview-numbering.ts` -> `word/word-preview-numbering.ts`
- `word-preview-paragraph-utils.ts` -> `word/word-preview-paragraph-utils.ts`
- `word-preview-table-pagination.ts` -> `word/word-preview-table-pagination.ts`
- `word-preview-text-box.tsx` -> `word/word-preview-text-box.tsx`
- `word-preview-crop-marks.tsx` -> `word/word-preview-crop-marks.tsx`

### Spreadsheet

- `spreadsheet-preview.tsx` -> `spreadsheet/spreadsheet-preview.tsx`
- `spreadsheet-layout.ts` -> `spreadsheet/spreadsheet-layout.ts`
- `spreadsheet-selection.ts`, `spreadsheet-resize.ts`, `spreadsheet-viewport-store.ts` -> `spreadsheet/`
- `spreadsheet-cell-overlays.tsx`, `spreadsheet-frozen-headers.tsx` -> `spreadsheet/`
- `spreadsheet-table-filters.ts`, `spreadsheet-table-filter-menu.tsx`, `spreadsheet-table-styles.ts` -> `spreadsheet/`
- `spreadsheet-charts.tsx`, `spreadsheet-chart-*.ts` -> `spreadsheet/`
- `spreadsheet-canvas-*.ts*`, `spreadsheet-canvas.worker.ts` -> `spreadsheet/`
- `spreadsheet-workbook-chrome.tsx` -> `spreadsheet/`

### Presentation

- `presentation-preview.tsx` -> `presentation/presentation-preview.tsx`
- `presentation-preview.module.css` -> `presentation/presentation-preview.module.css`
- `presentation-renderer.ts` -> `presentation/presentation-renderer.ts`
- `presentation-text-layout.ts` -> `presentation/presentation-text-layout.ts`
- `presentation-chart-renderer.ts` -> `shared/office-chart-renderer.ts`
- `presentation-table-renderer.ts` -> `presentation/presentation-table-renderer.ts`

## Dependency rules

These rules keep the package modular even before every file is moved:

1. `src/index.ts` only re-exports public entry points.
2. `shared/` must not depend on any format directory.
3. `word/`, `spreadsheet/`, and `presentation/` must not import each other.
4. Pure engine files should avoid React, DOM, and browser globals.
5. Worker files may depend on pure spreadsheet canvas engine files, but engine
   files must not depend on the worker client.
6. Top-level preview components may compose submodules, but should avoid owning
   low-level rendering math.

## Refactor order

If we continue the split, the safest order is:

1. Move files into format directories without changing behavior.
2. Extract `shared/` from `office-preview-utils.ts` by responsibility, not by
   arbitrary size.
3. Split `spreadsheet-preview.tsx` first, because it currently mixes orchestration,
   interaction, chrome, overlays, and canvas runtime.
4. Keep worker protocol + renderer as a closed spreadsheet submodule.
5. Only after file moves stabilize, decide whether any cross-format protocol
   types deserve their own package.

## Design guidance

- Prefer **orchestration shell + pure engine** over giant preview components.
- Split by **workflow or rendering concern** before introducing generic helpers.
- Keep format-specific behavior inside the format directory unless there is real
  reuse across at least two formats.
- Treat tests as architecture hints: if a helper is easy to test in isolation,
  it probably belongs below the shell layer.

## Practical takeaway

The next refactor should **not** start with a massive rewrite. The better move
is:

1. make the implicit layers explicit in directories,
2. keep `shared` small and format-agnostic,
3. push heavy logic down out of `*Preview.tsx`,
4. preserve the current package boundary as the stable reuse surface.
