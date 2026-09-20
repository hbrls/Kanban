import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import officeWasmConfig from "../../src/app/debug/office-wasm-poc/office-wasm-config";

type ReaderExports = {
  DocxReader: {
    ExtractDocxProto: (bytes: Uint8Array, ignoreErrors: boolean) => Uint8Array | ArrayBuffer | number[];
  };
  PptxReader: {
    ExtractSlidesProto: (bytes: Uint8Array, ignoreErrors: boolean) => Uint8Array | ArrayBuffer | number[];
  };
  XlsxReader: {
    ExtractXlsxProto: (bytes: Uint8Array, ignoreErrors: boolean) => Uint8Array | ArrayBuffer | number[];
  };
};

type DecodeDocument = (bytes: Uint8Array) => Record<string, unknown>;

type DecodePresentation = (bytes: Uint8Array) => Record<string, unknown>;

type DecodeWorkbook = (bytes: Uint8Array) => Record<string, unknown>;

type FixtureCase = {
  kind: "docx" | "pptx" | "xlsx";
  name: string;
  path: string;
};

const repoRoot = path.resolve(import.meta.dirname, "../..");
const bundleEntry = path.join(repoRoot, "public/office-wasm-reader/main.js");
const fixturesDir = path.join(repoRoot, "tools/office-wasm-reader/fixtures");
const goldenDir = path.join(fixturesDir, "golden");
const updateGoldens = process.argv.includes("--update");
const fixtureFilter = new Set(readRepeatedOption("--only"));

const fixtureCases: FixtureCase[] = [
  {
    kind: "docx",
    name: "dll_viewer_solution_test_document",
    path: path.join(fixturesDir, "dll_viewer_solution_test_document.docx"),
  },
  {
    kind: "docx",
    name: "docx_advanced_contract",
    path: path.join(fixturesDir, "docx_advanced_contract.docx"),
  },
  {
    kind: "docx",
    name: "docx_style_section_contract",
    path: path.join(fixturesDir, "docx_style_section_contract.docx"),
  },
  {
    kind: "docx",
    name: "docx_table_style_contract",
    path: path.join(fixturesDir, "docx_table_style_contract.docx"),
  },
  {
    kind: "docx",
    name: "docx_anchor_layout_contract",
    path: path.join(fixturesDir, "docx_anchor_layout_contract.docx"),
  },
  {
    kind: "xlsx",
    name: "complex_excel_renderer_test",
    path: path.join(fixturesDir, "complex_excel_renderer_test.xlsx"),
  },
  {
    kind: "pptx",
    name: "agentic_ui_proactive_agent_technical_blueprint",
    path: path.join(fixturesDir, "agentic_ui_proactive_agent_technical_blueprint.pptx"),
  },
];

async function main(): Promise<void> {
  if (!existsSync(bundleEntry)) {
    throw new Error("Office WASM bundle is missing. Run `npm run build:office-wasm-reader` first.");
  }

  const decodeDocument = await loadDocumentDecoder();
  const decodePresentation = await loadPresentationDecoder();
  const decodeWorkbook = await loadWorkbookDecoder();
  const exports = await loadReaderExports();
  for (const fixture of fixtureCases.filter((fixture) => fixtureFilter.size === 0 || fixtureFilter.has(fixture.name))) {
    const bytes = readFileSync(fixture.path);
    const protoBytes =
      fixture.kind === "docx"
        ? exports.DocxReader.ExtractDocxProto(bytes, false)
        : fixture.kind === "xlsx"
          ? exports.XlsxReader.ExtractXlsxProto(bytes, false)
          : exports.PptxReader.ExtractSlidesProto(bytes, false);
    const protoPayload = toUint8Array(protoBytes);
    const summary =
      fixture.kind === "docx"
        ? summarizeDocument(decodeDocument(protoPayload), protoPayload)
        : fixture.kind === "pptx"
        ? summarizePresentation(decodePresentation(protoPayload), protoPayload)
        : summarizeWorkbook(decodeWorkbook(protoPayload), protoPayload);
    const goldenPath = path.join(goldenDir, `${fixture.name}.json`);
    const serialized = `${JSON.stringify(summary, null, 2)}\n`;

    if (updateGoldens) {
      writeFileSync(goldenPath, serialized);
      console.log(`updated ${path.relative(repoRoot, goldenPath)}`);
      continue;
    }

    const expected = readFileSync(goldenPath, "utf8");
    if (expected !== serialized) {
      throw new Error(`Fixture output changed: ${path.relative(repoRoot, goldenPath)}`);
    }

    console.log(`ok ${fixture.name}`);
  }
}

function readRepeatedOption(optionName: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index++) {
    if (process.argv[index] === optionName && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
      index++;
    }
  }

  return values;
}

async function loadDocumentDecoder(): Promise<DecodeDocument> {
  const imported = await import(
    pathToFileURL(path.join(repoRoot, officeWasmConfig.OFFICE_WASM_TMP_ASSET_DIR, officeWasmConfig.OFFICE_WASM_READER_MODULES.document)).href
  ) as {
    Document?: { decode?: DecodeDocument };
    default?: { Document?: { decode?: DecodeDocument } };
    "module.exports"?: { Document?: { decode?: DecodeDocument } };
  };

  const decoder =
    imported.Document?.decode ??
    imported.default?.Document?.decode ??
    imported["module.exports"]?.Document?.decode;

  if (!decoder) {
    throw new Error("Could not load Walnut Document decoder.");
  }

  return decoder;
}

async function loadPresentationDecoder(): Promise<DecodePresentation> {
  const imported = await import(
    pathToFileURL(path.join(repoRoot, officeWasmConfig.OFFICE_WASM_TMP_ASSET_DIR, officeWasmConfig.OFFICE_WASM_READER_MODULES.presentation)).href
  ) as {
    Presentation?: { decode?: DecodePresentation };
    default?: { Presentation?: { decode?: DecodePresentation } };
    "module.exports"?: { Presentation?: { decode?: DecodePresentation } };
  };

  const decoder =
    imported.Presentation?.decode ??
    imported.default?.Presentation?.decode ??
    imported["module.exports"]?.Presentation?.decode;

  if (!decoder) {
    throw new Error("Could not load Walnut Presentation decoder.");
  }

  return decoder;
}

async function loadWorkbookDecoder(): Promise<DecodeWorkbook> {
  const imported = await import(
    pathToFileURL(path.join(repoRoot, officeWasmConfig.OFFICE_WASM_TMP_ASSET_DIR, officeWasmConfig.OFFICE_WASM_READER_MODULES.spreadsheet)).href
  ) as {
    Workbook?: { decode?: DecodeWorkbook };
    default?: { Workbook?: { decode?: DecodeWorkbook } };
    "module.exports"?: { Workbook?: { decode?: DecodeWorkbook } };
  };
  const decoder =
    imported.Workbook?.decode ??
    imported.default?.Workbook?.decode ??
    imported["module.exports"]?.Workbook?.decode;

  if (!decoder) {
    throw new Error("Could not load Walnut Workbook decoder.");
  }

  return decoder;
}

async function loadReaderExports(): Promise<ReaderExports> {
  await import(pathToFileURL(bundleEntry).href);
  const bridge = (globalThis as typeof globalThis & {
    RoutaOfficeWasmReader?: { exports?: ReaderExports };
  }).RoutaOfficeWasmReader;

  if (!bridge?.exports) {
    throw new Error("RoutaOfficeWasmReader exports were not initialized.");
  }

  return bridge.exports;
}

function summarizeDocument(document: Record<string, unknown>, protoPayload: Uint8Array): unknown {
  const elements = arrayOfRecords(document.elements);
  const images = arrayOfRecords(document.images);
  return {
    elementCount: elements.length,
    elementTypes: countBy(elements, (element) => String(element.type ?? "unset")),
    heightEmu: document.heightEmu,
    imageCount: images.length,
    images: images.slice(0, 12).map(summarizeProtoImage),
    numberingDefinitionCount: arrayOfRecords(document.numberingDefinitions).length,
    protocol: "oaiproto.coworker.docx.Document",
    sectionCount: arrayOfRecords(document.sections).length,
    tableCount: elements.filter((element) => isRecord(element.table)).length,
    tableShapes: elements.filter((element) => isRecord(element.table)).slice(0, 12).map(summarizeDocumentTable),
    textStyleCount: arrayOfRecords(document.textStyles).length,
    textStyleIds: arrayOfRecords(document.textStyles).map((style) => String(style.id ?? "")).filter(Boolean),
    previewElements: elements.slice(0, 16).map(summarizeDocumentElement),
    wasmProtoByteLength: protoPayload.length,
    wasmProtoSha256: createHash("sha256").update(protoPayload).digest("hex"),
    widthEmu: document.widthEmu,
  };
}

function summarizePresentation(presentation: Record<string, unknown>, protoPayload: Uint8Array): unknown {
  const slides = arrayOfRecords(presentation.slides);
  return {
    chartCount: arrayOfRecords(presentation.charts).length,
    imageCount: arrayOfRecords(presentation.images).length,
    layoutCount: arrayOfRecords(presentation.layouts).length,
    protocol: "oaiproto.coworker.presentation.Presentation",
    slideCount: slides.length,
    slides: slides.slice(0, 12).map(summarizePresentationSlide),
    wasmProtoByteLength: protoPayload.length,
    wasmProtoSha256: createHash("sha256").update(protoPayload).digest("hex"),
  };
}

function summarizeWorkbook(workbook: Record<string, unknown>, protoPayload: Uint8Array): unknown {
  const sheets = arrayOfRecords(workbook.sheets);
  const drawings = sheets.flatMap((sheet) => arrayOfRecords(sheet.drawings));
  const charts = drawings.filter((drawing) => isRecord(drawing.chart));
  return {
    chartCount: charts.length,
    imageCount: arrayOfRecords(workbook.images).length,
    protocol: "oaiproto.coworker.spreadsheet.Workbook",
    sheetCount: sheets.length,
    sheets: sheets.slice(0, 8).map(summarizeWorkbookSheet),
    styleCounts: summarizeWorkbookStyleCounts(asRecord(workbook.styles) ?? {}),
    tableCount: sheets.reduce((count, sheet) => count + arrayOfRecords(sheet.tables).length, 0),
    wasmProtoByteLength: protoPayload.length,
    wasmProtoSha256: createHash("sha256").update(protoPayload).digest("hex"),
  };
}

function summarizeWorkbookSheet(sheet: Record<string, unknown>): unknown {
  const rows = arrayOfRecords(sheet.rows);
  const cells = rows.flatMap((row) => arrayOfRecords(row.cells));
  return {
    cellCount: cells.length,
    columnCount: arrayOfRecords(sheet.columns).length,
    conditionalFormatCount: arrayOfRecords(sheet.conditionalFormattings).length,
    dataValidationCount: arrayOfRecords(sheet.dataValidations).length,
    drawingCount: arrayOfRecords(sheet.drawings).length,
    formulaCellCount: cells.filter((cell) => typeof cell.formula === "string" && cell.formula.length > 0).length,
    mergedRangeCount: arrayOfRecords(sheet.mergedCells).length,
    name: typeof sheet.name === "string" ? sheet.name : "",
    previewCells: cells
      .filter((cell) => Boolean(cell.value) || Boolean(cell.formula))
      .slice(0, 12)
      .map((cell) => ({
        address: typeof cell.address === "string" ? cell.address : "",
        formula: typeof cell.formula === "string" ? cell.formula : "",
        value: truncate(String(cell.value ?? ""), 120),
      })),
    rowCount: rows.length,
    tableCount: arrayOfRecords(sheet.tables).length,
    tables: arrayOfRecords(sheet.tables).slice(0, 12).map((table) => ({
      displayName: typeof table.displayName === "string" ? table.displayName : "",
      name: typeof table.name === "string" ? table.name : "",
      ref: typeof table.ref === "string" ? table.ref : "",
    })),
  };
}

function summarizeWorkbookStyleCounts(styles: Record<string, unknown>): unknown {
  return {
    borderCount: arrayOfRecords(styles.borders).length,
    cellFormatCount: arrayOfRecords(styles.cellXfs).length,
    fillCount: arrayOfRecords(styles.fills).length,
    fontCount: arrayOfRecords(styles.fonts).length,
    numberFormatCount: arrayOfRecords(styles.numberFormats).length,
  };
}

function summarizeDocumentElement(element: Record<string, unknown>): unknown {
  const paragraphs = documentElementParagraphs(element);
  return {
    bbox: element.bbox,
    hasImageReference: documentElementImageReferenceIds(element).length > 0,
    hasTable: isRecord(element.table),
    paragraphCount: paragraphs.length,
    textPreview: paragraphs.map(paragraphText).filter(Boolean).join(" ").slice(0, 160),
    type: element.type,
  };
}

function summarizeDocumentTable(element: Record<string, unknown>): unknown {
  const table = asRecord(element.table) ?? {};
  const rows = arrayOfRecords(table.rows);
  return {
    rowCount: rows.length,
    cellCounts: rows.map((row) => arrayOfRecords(row.cells).length),
    preview: rows.slice(0, 3).map((row) =>
      arrayOfRecords(row.cells).slice(0, 4).map((cell) => collectTextPreview(cell).slice(0, 80))
    ),
  };
}

function summarizeProtoImage(image: Record<string, unknown>): unknown {
  const bytes = bytesFromUnknown(image.data ?? image.bytes);
  return {
    byteLength: bytes.length,
    contentType: typeof image.contentType === "string" ? image.contentType : "",
    id: typeof image.id === "string" ? image.id : "",
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function summarizePresentationSlide(slide: Record<string, unknown>): unknown {
  const elements = arrayOfRecords(slide.elements);
  return {
    elementCount: elements.length,
    elementTypes: countBy(elements, (element) => String(element.type ?? "unset")),
    hasBackground: isRecord(slide.background),
    heightEmu: slide.heightEmu,
    id: slide.id,
    index: slide.index,
    textElementCount: elements.filter((element) => element.type === 1).length,
    shapeElementCount: elements.filter((element) => element.type === 5).length,
    previewElements: elements.slice(0, 10).map(summarizePresentationElement),
    widthEmu: slide.widthEmu,
  };
}

function summarizePresentationElement(element: Record<string, unknown>): unknown {
  const paragraphs = arrayOfRecords(element.paragraphs);
  return {
    bbox: element.bbox,
    hasFill: isRecord(element.fill) || isRecord(asRecord(element.shape)?.fill),
    hasLine: isRecord(element.line) || isRecord(asRecord(element.shape)?.line),
    id: element.id,
    name: element.name,
    paragraphCount: paragraphs.length,
    textPreview: paragraphs.map(paragraphText).filter(Boolean).join(" ").slice(0, 160),
    type: element.type,
  };
}

function paragraphText(paragraph: Record<string, unknown>): string {
  return arrayOfRecords(paragraph.runs)
    .map((run) => typeof run.text === "string" ? run.text : "")
    .join("");
}

function documentElementParagraphs(element: Record<string, unknown>): Array<Record<string, unknown>> {
  const direct = arrayOfRecords(element.paragraphs);
  if (direct.length > 0) {
    return direct;
  }

  const paragraph = asRecord(element.paragraph);
  if (paragraph) {
    return [paragraph];
  }

  const table = asRecord(element.table);
  if (!table) {
    return [];
  }

  return arrayOfRecords(table.rows)
    .flatMap(row => arrayOfRecords(row.cells))
    .flatMap(cell => arrayOfRecords(cell.paragraphs));
}

function documentElementImageReferenceIds(element: Record<string, unknown>): string[] {
  return [
    imageReferenceId(element.imageReference),
    imageReferenceId(asRecord(element.fill)?.imageReference),
    imageReferenceId(asRecord(asRecord(element.shape)?.fill)?.imageReference),
  ].filter(Boolean);
}

function imageReferenceId(value: unknown): string {
  const record = asRecord(value);
  return typeof record?.id === "string" ? record.id : "";
}

function collectTextPreview(value: unknown): string {
  const items: string[] = [];
  const seen = new WeakSet<object>();

  function visit(node: unknown): void {
    if (items.length >= 8) {
      return;
    }

    if (typeof node === "string") {
      const text = node.trim();
      if (text.length > 0) {
        items.push(text);
      }
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (!isRecord(node) || seen.has(node)) {
      return;
    }

    seen.add(node);
    for (const key of ["text", "value", "alt"]) {
      visit(node[key]);
    }

    for (const child of Object.values(node)) {
      if (typeof child === "object" && child !== null) {
        visit(child);
      }
    }
  }

  visit(value);
  return items.join(" | ").slice(0, 260);
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const itemKey = key(item);
    counts[itemKey] = (counts[itemKey] ?? 0) + 1;
    return counts;
  }, {});
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function bytesFromUnknown(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "number")) {
    return new Uint8Array(value);
  }

  return new Uint8Array();
}

function toUint8Array(value: Uint8Array | ArrayBuffer | number[]): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value);
}

main()
  .then(() => {
    setTimeout(() => process.exit(0), 0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    setTimeout(() => process.exit(1), 0);
  });
