import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import officeWasmConfig from "../../src/app/debug/office-wasm-poc/office-wasm-config";

type ReaderExports = {
  DocxReader: {
    ExtractDocxProto: (bytes: Uint8Array, ignoreErrors: boolean) => Uint8Array | ArrayBuffer | number[];
  };
};

type DocumentSummary = ReturnType<typeof summarizeDocument>;
type JsonContractSummary = ReturnType<typeof summarizeJsonContract>;
type JsonDiff = {
  actual: unknown;
  expected: unknown;
  path: string;
  type: "missing-in-routa" | "missing-in-walnut" | "type-mismatch" | "value-mismatch";
};

type ComparisonResult = {
  byteComparison: ReturnType<typeof summarizeByteComparison>;
  equivalence: ReturnType<typeof summarizeEquivalence>;
  fixture: string;
  jsonContract?: JsonContractSummary;
  parity: ReturnType<typeof summarizeParity>;
  routa: DocumentSummary;
  routaProtocol: string;
  targetProtocol: string;
  walnut: DocumentSummary;
};

const repoRoot = process.cwd();
const assetDir = path.resolve(repoRoot, officeWasmConfig.OFFICE_WASM_TMP_ASSET_DIR);
const assertMode = process.argv.includes("--assert");
const routaOnlyMode = process.argv.includes("--routa-only");
const jsonContractOnlyMode = process.argv.includes("--json-contract-only");
const jsonContractMode =
  process.argv.includes("--json-contract") ||
  process.argv.includes("--assert-json-contract") ||
  jsonContractOnlyMode;
const assertJsonContractMode = process.argv.includes("--assert-json-contract");
const jsonDiffLimit = numberArg("--json-diff-limit") ?? 40;
const fixturePaths = process.argv
  .slice(2)
  .filter((arg, index, args) => !arg.startsWith("--") && args[index - 1] !== "--json-diff-limit")
  .map((arg) => path.resolve(repoRoot, arg));
if (fixturePaths.length === 0) {
  fixturePaths.push(path.resolve(repoRoot, "tools/office-wasm-reader/fixtures/dll_viewer_solution_test_document.docx"));
}
const generatedBundleEntry = path.resolve(repoRoot, "public/office-wasm-reader/main.js");

async function main(): Promise<void> {
  assertFile(assetDir, "extracted Walnut asset directory");
  assertFile(generatedBundleEntry, "generated Routa office WASM bundle");

  const results: ComparisonResult[] = [];
  if (routaOnlyMode) {
    const routaOnlyResults = [];
    for (const fixturePath of fixturePaths) {
      assertFile(fixturePath, "DOCX fixture");
      routaOnlyResults.push(await summarizeRoutaOnlyFixture(fixturePath));
    }

    console.log(JSON.stringify(routaOnlyResults.length === 1 ? routaOnlyResults[0] : routaOnlyResults, null, 2));
    return;
  }

  for (const fixturePath of fixturePaths) {
    assertFile(fixturePath, "DOCX fixture");
    results.push(await compareFixture(fixturePath));
  }

  if (assertMode) {
    for (const result of results) {
      assertEquivalence(result);
      if (assertJsonContractMode) {
        assertJsonContract(result);
      }
      console.log(`ok ${result.fixture}`);
    }
    return;
  }

  const output = jsonContractOnlyMode ? results.map(summarizeJsonContractOutput) : results;
  console.log(JSON.stringify(output.length === 1 ? output[0] : output, null, 2));
}

async function summarizeRoutaOnlyFixture(fixturePath: string) {
  const sourceBytes = readFileSync(fixturePath);
  const routaProtoBytes = await extractRoutaDocumentProto(sourceBytes);
  const routaDocument = await decodeWalnutDocument(routaProtoBytes);

  return {
    fixture: path.relative(repoRoot, fixturePath),
    routa: summarizeRoutaSmoke(routaDocument, routaProtoBytes),
    routaProtocol: "oaiproto.coworker.docx.Document",
    status: "routa-ok",
  };
}

async function compareFixture(fixturePath: string): Promise<ComparisonResult> {
  const sourceBytes = readFileSync(fixturePath);
  const walnutProtoBytes = await extractWalnutDocumentProto(sourceBytes);
  const walnutDocument = await decodeWalnutDocument(walnutProtoBytes);
  const routaProtoBytes = await extractRoutaDocumentProto(sourceBytes);
  const routaDocument = await decodeWalnutDocument(routaProtoBytes);

  return {
    byteComparison: summarizeByteComparison(walnutProtoBytes, routaProtoBytes),
    equivalence: summarizeEquivalence(walnutDocument, routaDocument),
    fixture: path.relative(repoRoot, fixturePath),
    jsonContract: jsonContractMode ? summarizeJsonContract(walnutDocument, routaDocument) : undefined,
    parity: summarizeParity(summarizeEquivalence(walnutDocument, routaDocument)),
    routa: summarizeDocument(routaDocument, routaProtoBytes),
    routaProtocol: "oaiproto.coworker.docx.Document",
    targetProtocol: "oaiproto.coworker.docx.Document",
    walnut: summarizeDocument(walnutDocument, walnutProtoBytes),
  };
}

async function extractWalnutDocumentProto(sourceBytes: Uint8Array): Promise<Uint8Array> {
  const dotnetModule = moduleWithExport(await import(pathToFileURL(path.join(assetDir, "dotnet.js")).href), "dotnet") as {
    dotnet: {
      withConfig: (config: unknown) => {
        withResourceLoader: (loader: (resourceType: string, name: string, defaultUri: string) => string | Uint8Array) => {
          create: () => Promise<{ getAssemblyExports: (assemblyName: string) => Promise<ReaderExports> }>;
        };
      };
    };
  };

  const runtime = await dotnetModule.dotnet
    .withConfig(officeWasmConfig.OFFICE_WASM_DOTNET_RUNTIME_CONFIG)
    .withResourceLoader((resourceType, _name, defaultUri) => {
      const fullPath = path.join(assetDir, path.basename(defaultUri));
      if (resourceType === "dotnetjs") {
        return pathToFileURL(fullPath).href;
      }

      return readFileSync(fullPath);
    })
    .create();
  const exports = await runtime.getAssemblyExports("Walnut");
  return toUint8Array(exports.DocxReader.ExtractDocxProto(sourceBytes, false));
}

async function decodeWalnutDocument(protoBytes: Uint8Array): Promise<Record<string, unknown>> {
  const documentModule = moduleWithExport(await import(
    pathToFileURL(path.join(assetDir, officeWasmConfig.OFFICE_WASM_READER_MODULES.document)).href
  ), "Document") as {
    Document: { decode: (bytes: Uint8Array) => Record<string, unknown> };
  };

  return documentModule.Document.decode(protoBytes);
}

async function extractRoutaDocumentProto(sourceBytes: Uint8Array): Promise<Uint8Array> {
  await import(pathToFileURL(generatedBundleEntry).href);
  const bridge = (globalThis as typeof globalThis & {
    RoutaOfficeWasmReader?: { exports?: ReaderExports };
  }).RoutaOfficeWasmReader;

  if (!bridge?.exports) {
    throw new Error("RoutaOfficeWasmReader exports were not initialized.");
  }

  return toUint8Array(bridge.exports.DocxReader.ExtractDocxProto(sourceBytes, false));
}

function summarizeDocument(document: Record<string, unknown>, protoBytes: Uint8Array) {
  const charts = arrayOfRecords(document.charts);
  const elements = arrayOfRecords(document.elements);
  const images = arrayOfRecords(document.images);
  const footnotes = arrayOfRecords(document.footnotes);
  const comments = arrayOfRecords(document.comments);
  const commentReferences = arrayOfRecords(document.commentReferences);
  const reviewMarks = arrayOfRecords(document.reviewMarks);
  const sections = arrayOfRecords(document.sections);
  const paragraphNumberings = arrayOfRecords(document.paragraphNumberings);
  const imageIds = new Set(images.map((image) => String(image.id ?? "")).filter(Boolean));
  const imageReferenceIds = elements.flatMap(elementImageReferenceIds);
  const chartReferenceIds = elements.flatMap(elementChartReferenceIds);
  const paragraphs = elements.flatMap(elementParagraphs);
  const textRuns = paragraphs.flatMap((paragraph) => arrayOfRecords(paragraph.runs));

  return {
    protoByteLength: protoBytes.length,
    protoSha256: sha256(protoBytes),
    topLevelKeys: Object.keys(document),
    name: document.name,
    widthEmu: document.widthEmu,
    heightEmu: document.heightEmu,
    chartCount: charts.length,
    chartIds: charts.map((chart) => String(chart.id ?? "")).filter(Boolean),
    chartReferenceCount: chartReferenceIds.length,
    chartReferenceIds,
    elementCount: elements.length,
    elementTypes: countBy(elements, elementTypeKey),
    imageCount: images.length,
    imageDigests: images.map(summarizeImage),
    imageReferenceCount: imageReferenceIds.length,
    imageReferenceIds,
    imageBboxSignatures: elements.filter((element) => elementImageReferenceIds(element).length > 0).map(summarizeReferenceBbox),
    missingImageReferenceIds: [...new Set(imageReferenceIds.filter((id) => !imageIds.has(id)))],
    paragraphCount: paragraphs.length,
    paragraphSpacingSignatures: paragraphs.map(summarizeParagraphSpacing),
    textRunCount: textRuns.length,
    textRunStyleSignatures: textRuns.map(summarizeRunStyle),
    hyperlinkCount: textRuns.filter((run) => isRecord(run.hyperlink)).length,
    reviewMarkedRunCount: textRuns.filter((run) => arrayOfStrings(run.reviewMarkIds).length > 0).length,
    footnoteCount: footnotes.length,
    footnoteReferenceIds: footnotes.flatMap((footnote) =>
      arrayOfStrings(footnote.referenceRunIds).map(() => String(footnote.id ?? ""))
    ),
    footnoteReferenceRunIds: footnotes.flatMap((footnote) =>
      arrayOfStrings(footnote.referenceRunIds).map((runId) => `${String(footnote.id ?? "")}:${runId}`)
    ),
    commentCount: comments.length,
    commentReferenceCount: commentReferences.length,
    commentReferenceIds: commentReferences.flatMap((reference) =>
      arrayOfStrings(reference.runIds).map(() => String(reference.commentId ?? ""))
    ),
    commentReferenceRunIds: commentReferences.flatMap((reference) =>
      arrayOfStrings(reference.runIds).map((runId) => `${String(reference.commentId ?? "")}:${runId}`)
    ),
    reviewMarkCount: reviewMarks.length,
    tableCount: elements.filter((element) => isRecord(element.table)).length,
    textStyleCount: arrayOfRecords(document.textStyles).length,
    textStyleIds: arrayOfRecords(document.textStyles).map((style) => String(style.id ?? "")).filter(Boolean),
    sectionCount: sections.length,
    sectionShapes: sections.map(summarizeSection),
    numberingDefinitionCount: arrayOfRecords(document.numberingDefinitions).length,
    paragraphNumberingCount: paragraphNumberings.length,
    paragraphNumberings: paragraphNumberings.map((numbering) => ({
      paragraphId: String(numbering.paragraphId ?? ""),
      numId: String(numbering.numId ?? ""),
      level: Number(numbering.level ?? 0),
    })),
    tableShapes: elements.filter((element) => isRecord(element.table)).map(summarizeTableShape),
    tableBboxSignatures: elements.filter((element) => isRecord(element.table)).map(summarizeTableBbox),
    tableColorSignatures: elements.filter((element) => isRecord(element.table)).map(summarizeTableColors),
    firstElements: elements.slice(0, 12).map(summarizeElement),
  };
}

function summarizeRoutaSmoke(document: Record<string, unknown>, protoBytes: Uint8Array) {
  const summary = summarizeDocument(document, protoBytes);

  return {
    protoByteLength: summary.protoByteLength,
    protoSha256: summary.protoSha256,
    widthEmu: summary.widthEmu,
    heightEmu: summary.heightEmu,
    elementCount: summary.elementCount,
    elementTypes: summary.elementTypes,
    paragraphCount: summary.paragraphCount,
    tableCount: summary.tableCount,
    imageCount: summary.imageCount,
    chartCount: summary.chartCount,
    textRunCount: summary.textRunCount,
    textStyleCount: summary.textStyleCount,
    sectionCount: summary.sectionCount,
    footnoteCount: summary.footnoteCount,
    commentCount: summary.commentCount,
    reviewMarkCount: summary.reviewMarkCount,
    numberingDefinitionCount: summary.numberingDefinitionCount,
    paragraphNumberingCount: summary.paragraphNumberingCount,
    missingImageReferenceIds: summary.missingImageReferenceIds,
  };
}

function summarizeEquivalence(
  walnutDocument: Record<string, unknown>,
  routaDocument: Record<string, unknown>,
) {
  const walnutSummary = summarizeDocument(walnutDocument, new Uint8Array());
  const routaSummary = summarizeDocument(routaDocument, new Uint8Array());

  return {
    sameTopLevelProtocol: true,
    topLevelKeysMatch: stableJson(walnutSummary.topLevelKeys) === stableJson(routaSummary.topLevelKeys),
    pageSizeMatches:
      walnutSummary.widthEmu === routaSummary.widthEmu &&
      walnutSummary.heightEmu === routaSummary.heightEmu,
    elementCountMatches: walnutSummary.elementCount === routaSummary.elementCount,
    elementTypeCountsMatch: stableJson(walnutSummary.elementTypes) === stableJson(routaSummary.elementTypes),
    imageCountMatches: walnutSummary.imageCount === routaSummary.imageCount,
    imageDigestsMatch: stableJson(walnutSummary.imageDigests) === stableJson(routaSummary.imageDigests),
    imageReferenceIdsMatch: stableJson(walnutSummary.imageReferenceIds) === stableJson(routaSummary.imageReferenceIds),
    imageBboxSignaturesMatch:
      stableJson(walnutSummary.imageBboxSignatures) === stableJson(routaSummary.imageBboxSignatures),
    imageReferencesResolve: routaSummary.missingImageReferenceIds.length === 0,
    chartCountMatches: walnutSummary.chartCount === routaSummary.chartCount,
    chartReferenceIdsMatch: stableJson(walnutSummary.chartReferenceIds) === stableJson(routaSummary.chartReferenceIds),
    paragraphCountMatches: walnutSummary.paragraphCount === routaSummary.paragraphCount,
    paragraphSpacingSignaturesMatch:
      stableJson(walnutSummary.paragraphSpacingSignatures) === stableJson(routaSummary.paragraphSpacingSignatures),
    hyperlinkCountMatches: walnutSummary.hyperlinkCount === routaSummary.hyperlinkCount,
    footnoteCountMatches: walnutSummary.footnoteCount === routaSummary.footnoteCount,
    footnoteReferenceIdsMatch:
      stableJson(walnutSummary.footnoteReferenceIds) === stableJson(routaSummary.footnoteReferenceIds),
    commentCountMatches: walnutSummary.commentCount === routaSummary.commentCount,
    commentReferenceIdsMatch:
      stableJson(walnutSummary.commentReferenceIds) === stableJson(routaSummary.commentReferenceIds),
    reviewMarkCountMatches: walnutSummary.reviewMarkCount === routaSummary.reviewMarkCount,
    tableShapesMatch: stableJson(walnutSummary.tableShapes) === stableJson(routaSummary.tableShapes),
    tableBboxSignaturesMatch:
      stableJson(walnutSummary.tableBboxSignatures) === stableJson(routaSummary.tableBboxSignatures),
    tableColorSignaturesMatch:
      stableJson(walnutSummary.tableColorSignatures) === stableJson(routaSummary.tableColorSignatures),
    textRunCountMatches: walnutSummary.textRunCount === routaSummary.textRunCount,
    textRunStyleSignaturesMatch:
      stableJson(walnutSummary.textRunStyleSignatures) === stableJson(routaSummary.textRunStyleSignatures),
    textStyleCountMatches: walnutSummary.textStyleCount === routaSummary.textStyleCount,
    textStyleIdsMatch: stableJson(walnutSummary.textStyleIds) === stableJson(routaSummary.textStyleIds),
    sectionCountMatches: walnutSummary.sectionCount === routaSummary.sectionCount,
    sectionShapesMatch: stableJson(walnutSummary.sectionShapes) === stableJson(routaSummary.sectionShapes),
    numberingDefinitionCountMatches:
      walnutSummary.numberingDefinitionCount === routaSummary.numberingDefinitionCount,
    paragraphNumberingCountMatches:
      walnutSummary.paragraphNumberingCount === routaSummary.paragraphNumberingCount,
  };
}

function assertEquivalence(result: ComparisonResult): void {
  const failed = requiredSemanticChecks(result.equivalence);

  if (failed.length > 0) {
    throw new Error(`${result.fixture} DOCX parity failed: ${failed.join(", ")}`);
  }
}

function assertJsonContract(result: ComparisonResult): void {
  if (!result.jsonContract) {
    throw new Error(`${result.fixture} DOCX JSON contract was not computed.`);
  }

  if (!result.jsonContract.exactMatch) {
    const diffSummary = result.jsonContract.diffs.map((diff) => diff.path).join(", ");
    throw new Error(
      `${result.fixture} DOCX JSON contract failed: ${result.jsonContract.diffCount} decoded Proto JSON diffs` +
        (diffSummary ? ` (${diffSummary})` : ""),
    );
  }
}

function summarizeJsonContractOutput(result: ComparisonResult) {
  return {
    byteComparison: result.byteComparison,
    fixture: result.fixture,
    jsonContract: result.jsonContract,
    parity: result.parity,
  };
}

function summarizeParity(equivalence: ReturnType<typeof summarizeEquivalence>) {
  const checks = Object.entries(equivalence).filter(([, value]) => typeof value === "boolean");
  const failedChecks = checks.filter(([, value]) => value !== true).map(([key]) => key);
  return {
    failedChecks,
    passedChecks: checks.length - failedChecks.length,
    semanticParityPercent: checks.length === 0 ? 100 : Number((((checks.length - failedChecks.length) / checks.length) * 100).toFixed(2)),
    totalChecks: checks.length,
  };
}

function summarizeJsonContract(
  walnutDocument: Record<string, unknown>,
  routaDocument: Record<string, unknown>,
) {
  const walnutCanonical = normalizeDecodedProtoJson(walnutDocument, "$");
  const routaCanonical = normalizeDecodedProtoJson(routaDocument, "$");
  const diffs = diffJson(walnutCanonical, routaCanonical, "$", []);
  const serializedWalnut = stableJson(walnutCanonical);
  const serializedRouta = stableJson(routaCanonical);

  return {
    diffCount: diffs.length,
    diffLimit: jsonDiffLimit,
    diffs: diffs.slice(0, jsonDiffLimit),
    exactMatch: diffs.length === 0,
    normalization: {
      binaryPayloads: "converted to byteLength/sha256 summaries",
      unstableIds: [
        "document element ids",
        "paragraph ids",
        "run ids",
        "section ids",
        "table row ids",
        "table cell ids",
        "footnote reference run ids",
        "comment reference run ids",
      ],
    },
    routaCanonicalSha256: sha256(new TextEncoder().encode(serializedRouta)),
    walnutCanonicalSha256: sha256(new TextEncoder().encode(serializedWalnut)),
  };
}

function summarizeByteComparison(walnutProtoBytes: Uint8Array, routaProtoBytes: Uint8Array) {
  return {
    byteLengthDelta: routaProtoBytes.length - walnutProtoBytes.length,
    protoBytesExactMatch:
      walnutProtoBytes.length === routaProtoBytes.length &&
      sha256(walnutProtoBytes) === sha256(routaProtoBytes),
    routaByteLength: routaProtoBytes.length,
    routaSha256: sha256(routaProtoBytes),
    walnutByteLength: walnutProtoBytes.length,
    walnutSha256: sha256(walnutProtoBytes),
  };
}

function requiredSemanticChecks(equivalence: ReturnType<typeof summarizeEquivalence>): string[] {
  return Object.entries(equivalence)
    .filter(([, value]) => typeof value === "boolean" && !value)
    .map(([key]) => key);
}

function summarizeElement(element: Record<string, unknown>) {
  const paragraphs = elementParagraphs(element);
  return {
    id: element.id,
    type: element.type,
    bbox: element.bbox,
    hasImageReference: elementImageReferenceIds(element).length > 0,
    hasChartReference: elementChartReferenceIds(element).length > 0,
    hasTable: isRecord(element.table),
    paragraphCount: paragraphs.length,
    textPreview: paragraphs.map(paragraphText).filter(Boolean).join(" ").slice(0, 220),
    tableShape: isRecord(element.table) ? summarizeTableShape(element) : undefined,
  };
}

function summarizeSection(section: Record<string, unknown>) {
  const columns = asRecord(section.columns);
  const header = asRecord(section.header);
  const footer = asRecord(section.footer);
  return {
    breakType: section.breakType,
    columnCount: columns?.count ?? 0,
    headerElementCount: arrayOfRecords(header?.elements).length,
    footerElementCount: arrayOfRecords(footer?.elements).length,
  };
}

function summarizeTableShape(element: Record<string, unknown>) {
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

function summarizeTableColors(element: Record<string, unknown>) {
  const table = asRecord(element.table) ?? {};
  return arrayOfRecords(table.rows).map((row) =>
    arrayOfRecords(row.cells).map((cell) => ({
      fill: fillColorSignature(cell.fill),
      paragraphFills: arrayOfRecords(cell.paragraphs).map((paragraph) =>
        fillColorSignature(asRecord(paragraph.textStyle)?.fill)
      ),
      runFills: arrayOfRecords(cell.paragraphs).map((paragraph) =>
        arrayOfRecords(paragraph.runs).map((run) => fillColorSignature(asRecord(run.textStyle)?.fill))
      ),
    }))
  );
}

function summarizeTableBbox(element: Record<string, unknown>) {
  const bbox = asRecord(element.bbox) ?? {};
  return {
    heightEmu: numericOrZero(bbox.heightEmu),
    tableTextHash: sha256(new TextEncoder().encode(collectTextPreview(asRecord(element.table) ?? {}))),
    widthEmu: numericOrZero(bbox.widthEmu),
    xEmu: numericOrZero(bbox.xEmu),
    yEmu: numericOrZero(bbox.yEmu),
  };
}

function summarizeReferenceBbox(element: Record<string, unknown>) {
  const bbox = asRecord(element.bbox) ?? {};
  return {
    heightEmu: numericOrZero(bbox.heightEmu),
    referenceIds: elementImageReferenceIds(element).concat(elementChartReferenceIds(element)).sort(),
    widthEmu: numericOrZero(bbox.widthEmu),
    xEmu: numericOrZero(bbox.xEmu),
    yEmu: numericOrZero(bbox.yEmu),
  };
}

function elementTypeKey(element: Record<string, unknown>): string {
  if (element.type != null) {
    return String(element.type);
  }

  if (isRecord(element.table)) {
    return "table";
  }

  if (elementImageReferenceIds(element).length > 0) {
    return "imageReference";
  }

  if (elementChartReferenceIds(element).length > 0) {
    return "chartReference";
  }

  return "text";
}

function elementParagraphs(element: Record<string, unknown>): Array<Record<string, unknown>> {
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
    .flatMap((row) => arrayOfRecords(row.cells))
    .flatMap((cell) => arrayOfRecords(cell.paragraphs));
}

function paragraphText(paragraph: Record<string, unknown>): string {
  return arrayOfRecords(paragraph.runs)
    .map((run) => typeof run.text === "string" ? run.text : "")
    .join("");
}

function summarizeParagraphSpacing(paragraph: Record<string, unknown>) {
  return {
    spaceAfter: numericOrNull(paragraph.spaceAfter),
    spaceBefore: numericOrNull(paragraph.spaceBefore),
    styleId: stringValue(paragraph.styleId),
    textHash: sha256(new TextEncoder().encode(paragraphText(paragraph))),
  };
}

function summarizeRunStyle(run: Record<string, unknown>) {
  const textStyle = asRecord(run.textStyle) ?? {};
  return {
    bold: booleanOrNull(textStyle.bold),
    fill: fillColorSignature(textStyle.fill),
    fontSize: numericOrNull(textStyle.fontSize),
    italic: booleanOrNull(textStyle.italic),
    textHash: sha256(new TextEncoder().encode(typeof run.text === "string" ? run.text : "")),
    typeface: stringValue(textStyle.typeface),
    underline: stringValue(textStyle.underline),
  };
}

function elementImageReferenceIds(element: Record<string, unknown>): string[] {
  return [
    imageReferenceId(element.imageReference),
    imageReferenceId(asRecord(element.fill)?.imageReference),
    imageReferenceId(asRecord(asRecord(element.shape)?.fill)?.imageReference),
  ].filter(Boolean);
}

function elementChartReferenceIds(element: Record<string, unknown>): string[] {
  return [chartReferenceId(element.chartReference)].filter(Boolean);
}

function chartReferenceId(value: unknown): string {
  const record = asRecord(value);
  return typeof record?.id === "string" ? record.id : "";
}

function imageReferenceId(value: unknown): string {
  const record = asRecord(value);
  return typeof record?.id === "string" ? record.id : "";
}

function fillColorSignature(value: unknown): string {
  const fill = asRecord(value);
  if (!fill) return "";
  return colorSignature(fill.color);
}

function colorSignature(value: unknown): string {
  const color = asRecord(value);
  if (!color) return "";
  const transform = asRecord(color.transform);
  return [
    String(color.type ?? ""),
    String(color.value ?? ""),
    String(color.lastColor ?? ""),
    String(transform?.alpha ?? ""),
    String(transform?.lumMod ?? ""),
    String(transform?.lumOff ?? ""),
    String(transform?.shade ?? ""),
    String(transform?.tint ?? ""),
  ].join(":");
}

function summarizeImage(image: Record<string, unknown>) {
  const data = bytesFromUnknown(image.data ?? image.bytes);
  return {
    id: typeof image.id === "string" ? image.id : "",
    contentType: typeof image.contentType === "string" ? image.contentType : "",
    byteLength: data.length,
    sha256: data.length > 0 ? sha256(data) : "",
    uri: typeof image.uri === "string" ? image.uri : "",
  };
}

function normalizeDecodedProtoJson(value: unknown, pathName: string): unknown {
  const bytes = bytesFromUnknown(value);
  if (bytes.length > 0 && (pathName.endsWith(".data") || pathName.endsWith(".bytes"))) {
    return {
      __bytes: {
        byteLength: bytes.length,
        sha256: sha256(bytes),
      },
    };
  }

  if (Array.isArray(value)) {
    if (isUnstableReferenceArrayPath(pathName)) {
      return { __unstableReferenceIds: value.length };
    }

    const normalizedItems = value.map((item, index) => normalizeDecodedProtoJson(item, `${pathName}[${index}]`));
    if (isStableSortedArrayPath(pathName)) {
      return normalizedItems.sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
    }

    return normalizedItems;
  }

  if (!isRecord(value)) {
    if (typeof value === "string" && pathName.endsWith(".scheme")) {
      return normalizeDocxScheme(value);
    }

    return value;
  }

  const normalizedEntries: Array<[string, unknown]> = [];
  for (const key of Object.keys(value).sort()) {
    const childPath = `${pathName}.${key}`;
    if (isUnstableIdPath(childPath)) {
      normalizedEntries.push([key, "__unstable__"]);
      continue;
    }

    normalizedEntries.push([key, normalizeDecodedProtoJson(value[key], childPath)]);
  }

  return Object.fromEntries(normalizedEntries);
}

function isUnstableIdPath(pathName: string): boolean {
  return (
    /\.elements\[\d+\]\.id$/u.test(pathName) ||
    /^\$\.sections\[\d+\]\.id$/u.test(pathName) ||
    /\.table\.rows\[\d+\]\.id$/u.test(pathName) ||
    /\.table\.rows\[\d+\]\.cells\[\d+\]\.id$/u.test(pathName) ||
    /\.paragraphs\[\d+\]\.id$/u.test(pathName) ||
    /\.runs\[\d+\]\.id$/u.test(pathName) ||
    /^\$\.paragraphNumberings\[\d+\]\.paragraphId$/u.test(pathName) ||
    /^\$\.reviewMarks\[\d+\]\.id$/u.test(pathName) ||
    /\.runs\[\d+\]\.reviewMarkIds\[\d+\]$/u.test(pathName)
  );
}

function isStableSortedArrayPath(pathName: string): boolean {
  return pathName === "$.reviewMarks";
}

function normalizeDocxScheme(value: string): string {
  const parts = value.split(";").filter(Boolean);
  if (parts.length < 2 || !parts.every((part) => part.startsWith("__docx"))) {
    return value;
  }

  return parts.sort((left, right) => left.localeCompare(right)).join(";");
}

function isUnstableReferenceArrayPath(pathName: string): boolean {
  return (
    /\.footnotes\[\d+\]\.referenceRunIds$/u.test(pathName) ||
    /\.commentReferences\[\d+\]\.runIds$/u.test(pathName) ||
    /\.runs\[\d+\]\.reviewMarkIds$/u.test(pathName)
  );
}

function diffJson(expected: unknown, actual: unknown, pathName: string, diffs: JsonDiff[]): JsonDiff[] {
  if (Object.is(expected, actual)) {
    return diffs;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      diffs.push({ actual: previewJsonValue(actual), expected: previewJsonValue(expected), path: pathName, type: "type-mismatch" });
      return diffs;
    }

    const maxLength = Math.max(expected.length, actual.length);
    for (let index = 0; index < maxLength; index++) {
      if (index >= expected.length) {
        diffs.push({ actual: previewJsonValue(actual[index]), expected: undefined, path: `${pathName}[${index}]`, type: "missing-in-walnut" });
        continue;
      }
      if (index >= actual.length) {
        diffs.push({ actual: undefined, expected: previewJsonValue(expected[index]), path: `${pathName}[${index}]`, type: "missing-in-routa" });
        continue;
      }

      diffJson(expected[index], actual[index], `${pathName}[${index}]`, diffs);
    }
    return diffs;
  }

  if (isRecord(expected) || isRecord(actual)) {
    if (!isRecord(expected) || !isRecord(actual)) {
      diffs.push({ actual: previewJsonValue(actual), expected: previewJsonValue(expected), path: pathName, type: "type-mismatch" });
      return diffs;
    }

    const keys = [...new Set(Object.keys(expected).concat(Object.keys(actual)))].sort();
    for (const key of keys) {
      if (!(key in expected)) {
        diffs.push({ actual: previewJsonValue(actual[key]), expected: undefined, path: `${pathName}.${key}`, type: "missing-in-walnut" });
        continue;
      }
      if (!(key in actual)) {
        diffs.push({ actual: undefined, expected: previewJsonValue(expected[key]), path: `${pathName}.${key}`, type: "missing-in-routa" });
        continue;
      }

      diffJson(expected[key], actual[key], `${pathName}.${key}`, diffs);
    }
    return diffs;
  }

  diffs.push({ actual: previewJsonValue(actual), expected: previewJsonValue(expected), path: pathName, type: "value-mismatch" });
  return diffs;
}

function previewJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 160 ? `${value.slice(0, 157)}...` : value;
  }

  if (Array.isArray(value)) {
    return { arrayLength: value.length };
  }

  if (isRecord(value)) {
    const textPreview = collectTextPreview(value);
    return {
      keys: Object.keys(value).sort().slice(0, 12),
      scalars: Object.fromEntries(
        Object.entries(value)
          .filter(([, entryValue]) => entryValue == null || ["boolean", "number", "string"].includes(typeof entryValue))
          .slice(0, 12),
      ),
      textPreview: textPreview || undefined,
    };
  }

  return value;
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

function stableJson(value: unknown): string {
  return JSON.stringify(sortForJson(value));
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForJson);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortForJson(value[key])]),
  );
}

function moduleWithExport(module: unknown, exportName: string): Record<string, unknown> {
  for (const candidate of moduleCandidates(module)) {
    if (exportName in candidate) {
      return candidate;
    }
  }

  throw new Error(`Could not find module export: ${exportName}`);
}

function moduleCandidates(module: unknown): Array<Record<string, unknown>> {
  const candidates: Array<Record<string, unknown>> = [];
  const seen = new WeakSet<object>();

  function visit(value: unknown): void {
    if (!isRecord(value) || seen.has(value)) {
      return;
    }

    seen.add(value);
    candidates.push(value);
    visit(value.default);
    visit(value["module.exports"]);
  }

  visit(module);
  return candidates;
}

function toUint8Array(value: Uint8Array | ArrayBuffer | number[]): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return new Uint8Array(value);
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numericOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function numericOrZero(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function booleanOrNull(value: unknown): boolean | null {
  return value === true ? true : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertFile(filePath: string, label: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function numberArg(name: string): number | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
