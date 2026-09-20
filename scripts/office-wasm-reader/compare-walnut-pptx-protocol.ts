import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import officeWasmConfig from "../../src/app/debug/office-wasm-poc/office-wasm-config";

type ReaderExports = {
  PptxReader: {
    ExtractSlidesProto: (bytes: Uint8Array, ignoreErrors: boolean) => Uint8Array | ArrayBuffer | number[];
  };
};

type PresentationSummary = ReturnType<typeof summarizePresentation>;

type ComparisonResult = {
  byteComparison: ReturnType<typeof summarizeByteComparison>;
  fixture: string;
  targetProtocol: string;
  walnut: PresentationSummary;
  routa: PresentationSummary;
  routaProtocol: string;
  parity: ReturnType<typeof summarizeParity>;
  equivalence: ReturnType<typeof summarizeEquivalence>;
  protocolDiff?: ReturnType<typeof summarizeProtocolDiff>;
  semanticDiffs?: ReturnType<typeof summarizeSemanticDiffs>;
};

const repoRoot = process.cwd();
const assetDir = path.resolve(repoRoot, officeWasmConfig.OFFICE_WASM_TMP_ASSET_DIR);
const assertMode = process.argv.includes("--assert");
const diffMode = process.argv.includes("--diff");
const diffLimit = parseDiffLimit(process.argv);
const SEMANTIC_BBOX_TOLERANCE_EMU = 1000;
const BBOX_EMU_KEYS = new Set(["heightEmu", "widthEmu", "xEmu", "yEmu"]);
const fixturePaths = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--"))
  .map((arg) => path.resolve(repoRoot, arg));
if (fixturePaths.length === 0) {
  fixturePaths.push(path.resolve(repoRoot, "tools/office-wasm-reader/fixtures/agentic_ui_proactive_agent_technical_blueprint.pptx"));
}
const generatedBundleEntry = path.resolve(repoRoot, "public/office-wasm-reader/main.js");

async function main(): Promise<void> {
  assertFile(assetDir, "extracted Walnut asset directory");
  assertFile(generatedBundleEntry, "generated Routa office WASM bundle");

  const results: ComparisonResult[] = [];
  for (const fixturePath of fixturePaths) {
    assertFile(fixturePath, "PPTX fixture");
    results.push(await compareFixture(fixturePath));
  }

  if (assertMode) {
    for (const result of results) {
      assertEquivalence(result);
      console.log(`ok ${result.fixture}`);
    }
    return;
  }

  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
}

async function compareFixture(fixturePath: string): Promise<ComparisonResult> {
  const sourceBytes = readFileSync(fixturePath);
  const walnutProtoBytes = await extractWalnutPresentationProto(sourceBytes);
  const walnutPresentation = await decodeWalnutPresentation(walnutProtoBytes);
  const routaProtoBytes = await extractRoutaPresentationProto(sourceBytes);
  const routaPresentation = await decodeWalnutPresentation(routaProtoBytes);
  const equivalence = summarizeEquivalence(walnutPresentation, routaPresentation);

  return {
    byteComparison: summarizeByteComparison(walnutProtoBytes, routaProtoBytes),
    equivalence,
    fixture: path.relative(repoRoot, fixturePath),
    parity: summarizeParity(equivalence),
    ...(diffMode ? { protocolDiff: summarizeProtocolDiff(walnutPresentation, routaPresentation, diffLimit) } : {}),
    ...(diffMode ? { semanticDiffs: summarizeSemanticDiffs(walnutPresentation, routaPresentation, diffLimit) } : {}),
    routa: summarizePresentation(routaPresentation, routaProtoBytes),
    routaProtocol: "oaiproto.coworker.presentation.Presentation",
    targetProtocol: "oaiproto.coworker.presentation.Presentation",
    walnut: summarizePresentation(walnutPresentation, walnutProtoBytes),
  };
}

async function extractWalnutPresentationProto(sourceBytes: Uint8Array): Promise<Uint8Array> {
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
  return toUint8Array(exports.PptxReader.ExtractSlidesProto(sourceBytes, false));
}

async function decodeWalnutPresentation(protoBytes: Uint8Array): Promise<Record<string, unknown>> {
  const presentationModule = moduleWithExport(await import(
    pathToFileURL(path.join(assetDir, officeWasmConfig.OFFICE_WASM_READER_MODULES.presentation)).href
  ), "Presentation") as {
    Presentation: { decode: (bytes: Uint8Array) => Record<string, unknown> };
  };

  return presentationModule.Presentation.decode(protoBytes);
}

async function extractRoutaPresentationProto(sourceBytes: Uint8Array): Promise<Uint8Array> {
  await import(pathToFileURL(generatedBundleEntry).href);
  const bridge = (globalThis as typeof globalThis & {
    RoutaOfficeWasmReader?: { exports?: ReaderExports };
  }).RoutaOfficeWasmReader;

  if (!bridge?.exports) {
    throw new Error("RoutaOfficeWasmReader exports were not initialized.");
  }

  return toUint8Array(bridge.exports.PptxReader.ExtractSlidesProto(sourceBytes, false));
}

function summarizePresentation(presentation: Record<string, unknown>, protoBytes: Uint8Array) {
  const slides = arrayOfRecords(presentation.slides);
  const images = arrayOfRecords(presentation.images);
  const charts = arrayOfRecords(presentation.charts);
  const imageIds = new Set(images.map((image) => String(image.id ?? "")).filter(Boolean));
  const chartIds = new Set(charts.map((chart) => String(chart.id ?? "")).filter(Boolean));
  const allImageReferenceIds = slides.flatMap((slide) => arrayOfRecords(slide.elements).flatMap(elementImageReferenceIds));
  const allChartReferenceIds = slides.flatMap((slide) => arrayOfRecords(slide.elements).flatMap(elementChartReferenceIds));
  return {
    protoByteLength: protoBytes.length,
    protoSha256: sha256(protoBytes),
    topLevelKeys: Object.keys(presentation),
    slideCount: slides.length,
    layoutCount: arrayOfRecords(presentation.layouts).length,
    imageCount: images.length,
    imageDigests: images.map(summarizeImage),
    chartCount: charts.length,
    chartIds: charts.map((chart) => String(chart.id ?? "")).filter(Boolean),
    hasTheme: isRecord(presentation.theme),
    imageReferenceCount: allImageReferenceIds.length,
    missingImageReferenceIds: [...new Set(allImageReferenceIds.filter((id) => !imageIds.has(id)))],
    chartReferenceCount: allChartReferenceIds.length,
    missingChartReferenceIds: [...new Set(allChartReferenceIds.filter((id) => !chartIds.has(id)))],
    slideBboxDigests: slides.map((slide) => summarizeSlideDigest(slide, summarizeElementBbox)),
    slideConnectorDigests: slides.map((slide) => summarizeSlideConnectorDigest(slide)),
    slideNotesTextDigests: slides.map((slide) => summarizeNotesTextDigest(slide)),
    slideShapeGeometryCounts: slides.map((slide) => summarizeShapeGeometryCounts(slide)),
    slideShapeStyleDigests: slides.map((slide) => summarizeSlideDigest(slide, summarizeElementShapeStyle)),
    slideTableDigests: slides.map((slide) => summarizeSlideTableDigest(slide)),
    slideTableSummaries: slides.map(summarizeSlideTables),
    slideTextDigests: slides.map((slide) => summarizeSlideTextDigest(slide)),
    slideTextStyleDigests: slides.map((slide) => summarizeSlideDigest(slide, summarizeElementTextStyle)),
    slides: slides.map(summarizeSlide),
    firstSlide: summarizeSlide(slides[0] ?? {}),
  };
}

function summarizeSlide(slide: Record<string, unknown>) {
  const elements = arrayOfRecords(slide.elements);
  const elementTypes = new Map<string, number>();
  const imageReferenceIds = elements.flatMap(elementImageReferenceIds);
  const chartReferenceIds = elements.flatMap(elementChartReferenceIds);
  for (const element of elements) {
    const type = String(element.type ?? "unset");
    elementTypes.set(type, (elementTypes.get(type) ?? 0) + 1);
  }

  return {
    keys: Object.keys(slide),
    id: slide.id,
    index: slide.index,
    widthEmu: slide.widthEmu,
    heightEmu: slide.heightEmu,
    useLayoutId: slide.useLayoutId,
    hasBackground: isRecord(slide.background),
    elementCount: elements.length,
    imageReferenceCount: imageReferenceIds.length,
    imageReferenceIds,
    chartReferenceCount: chartReferenceIds.length,
    chartReferenceIds,
    elementTypes: Object.fromEntries(elementTypes),
    notesTextPreview: summarizeNotesText(slide),
    shapeGeometryCounts: summarizeShapeGeometryCounts(slide),
    firstElements: elements.slice(0, 8).map((element) => ({
      id: element.id,
      name: element.name,
      type: element.type,
      zIndex: element.zIndex,
      bbox: element.bbox,
      geometry: asRecord(element.shape)?.geometry,
      fill: summarizeFill(asRecord(element.fill) ?? asRecord(asRecord(element.shape)?.fill)),
      line: summarizeLine(asRecord(element.line) ?? asRecord(asRecord(element.shape)?.line)),
      hasShape: isRecord(element.shape),
      hasFill: isRecord(element.fill) || isRecord(asRecord(element.shape)?.fill),
      hasLine: isRecord(element.line) || isRecord(asRecord(element.shape)?.line),
      paragraphCount: arrayOfRecords(element.paragraphs).length,
      runCount: arrayOfRecords(element.paragraphs).reduce(
        (count, paragraph) => count + arrayOfRecords(paragraph.runs).length,
        0,
      ),
      textStyleDigest: sha256Text(stableJson(summarizeElementTextStyle(element))),
      textPreview: collectTextPreview(element),
      hasImage: isRecord(element.image) || isRecord(element.imageReference),
      hasChartReference: isRecord(element.chartReference),
      hasTable: isRecord(element.table),
      connectorDigest: isRecord(element.connector) ? sha256Text(stableJson(summarizeElementConnector(element))) : "",
      tableDigest: isRecord(element.table) ? sha256Text(stableJson(summarizeElementTable(element))) : "",
      childCount: arrayOfRecords(element.children).length,
    })),
  };
}

function summarizeEquivalence(
  walnutPresentation: Record<string, unknown>,
  routaPresentation: Record<string, unknown>,
) {
  const walnutSlides = arrayOfRecords(walnutPresentation.slides);
  const routaSlides = arrayOfRecords(routaPresentation.slides);
  const walnutSummary = summarizePresentation(walnutPresentation, new Uint8Array());
  const routaSummary = summarizePresentation(routaPresentation, new Uint8Array());
  const walnutFirst = walnutSlides[0] ?? {};
  const routaFirst = routaSlides[0] ?? {};
  const walnutElements = arrayOfRecords(walnutFirst.elements);
  const routaElements = arrayOfRecords(routaFirst.elements);

  return {
    chartCountMatches: walnutSummary.chartCount === routaSummary.chartCount,
    chartReferencesResolve: routaSummary.missingChartReferenceIds.length === 0,
    elementTypeCountsMatch: JSON.stringify(walnutSummary.slides.map((slide) => slide.elementTypes)) ===
      JSON.stringify(routaSummary.slides.map((slide) => slide.elementTypes)),
    imageCountMatches: walnutSummary.imageCount === routaSummary.imageCount,
    imageDigestsMatch: stableJson(walnutSummary.imageDigests) === stableJson(routaSummary.imageDigests),
    imageReferencesResolve: routaSummary.missingImageReferenceIds.length === 0,
    layoutCountMatches: walnutSummary.layoutCount === routaSummary.layoutCount,
    slideCountMatches: walnutSlides.length === routaSlides.length,
    slideElementCountsMatch: JSON.stringify(walnutSummary.slides.map((slide) => slide.elementCount)) ===
      JSON.stringify(routaSummary.slides.map((slide) => slide.elementCount)),
    slideImageReferenceCountsMatch:
      JSON.stringify(walnutSummary.slides.map((slide) => slide.imageReferenceCount)) ===
      JSON.stringify(routaSummary.slides.map((slide) => slide.imageReferenceCount)),
    slideImageReferenceIdsMatch:
      stableJson(walnutSummary.slides.map((slide) => slide.imageReferenceIds)) ===
      stableJson(routaSummary.slides.map((slide) => slide.imageReferenceIds)),
    slideChartReferenceCountsMatch:
      JSON.stringify(walnutSummary.slides.map((slide) => slide.chartReferenceCount)) ===
      JSON.stringify(routaSummary.slides.map((slide) => slide.chartReferenceCount)),
    slideChartReferenceIdsMatch:
      stableJson(walnutSummary.slides.map((slide) => slide.chartReferenceIds)) ===
      stableJson(routaSummary.slides.map((slide) => slide.chartReferenceIds)),
    slideBboxDigestsMatch:
      slideElementSummariesMatch(walnutSlides, routaSlides, summarizeElementBboxExact),
    slideConnectorDigestsMatch:
      slideElementSummariesMatch(walnutSlides, routaSlides, summarizeElementConnectorIfPresentExact),
    slideNotesTextDigestsMatch:
      stableJson(walnutSummary.slideNotesTextDigests) === stableJson(routaSummary.slideNotesTextDigests),
    slideTextDigestsMatch:
      stableJson(walnutSummary.slideTextDigests) === stableJson(routaSummary.slideTextDigests),
    slideShapeGeometryCountsMatch:
      stableJson(walnutSummary.slideShapeGeometryCounts) === stableJson(routaSummary.slideShapeGeometryCounts),
    slideShapeStyleDigestsMatch:
      stableJson(walnutSummary.slideShapeStyleDigests) === stableJson(routaSummary.slideShapeStyleDigests),
    slideTableDigestsMatch:
      stableJson(walnutSummary.slideTableDigests) === stableJson(routaSummary.slideTableDigests),
    slideTextStyleDigestsMatch:
      stableJson(walnutSummary.slideTextStyleDigests) === stableJson(routaSummary.slideTextStyleDigests),
    themePresenceMatches: walnutSummary.hasTheme === routaSummary.hasTheme,
    firstSlideSizeMatches:
      walnutFirst.widthEmu === routaFirst.widthEmu &&
      walnutFirst.heightEmu === routaFirst.heightEmu,
    firstSlideElementCountDelta: routaElements.length - walnutElements.length,
    firstSlideBackgroundPresenceMatches: isRecord(walnutFirst.background) === isRecord(routaFirst.background),
    firstSlideHasPositionedElements: routaElements.some((element) => isRecord(element.bbox)),
    firstSlideHasTextStyles: hasRunTextStyles(routaElements) || !hasRunTextStyles(walnutElements),
  };
}

function hasRunTextStyles(elements: Record<string, unknown>[]): boolean {
  return elements.some((element) =>
    arrayOfRecords(element.paragraphs).some((paragraph) =>
      arrayOfRecords(paragraph.runs).some((run) => isRecord(run.textStyle)),
    ),
  );
}

function summarizeSemanticDiffs(
  walnutPresentation: Record<string, unknown>,
  routaPresentation: Record<string, unknown>,
  limit: number,
) {
  const walnutSlides = arrayOfRecords(walnutPresentation.slides);
  const routaSlides = arrayOfRecords(routaPresentation.slides);
  return {
    bbox: summarizeSlideElementDiffs(walnutSlides, routaSlides, summarizeElementBbox, limit),
    connectors: summarizeSlideElementDiffs(walnutSlides, routaSlides, summarizeElementConnectorIfPresent, limit),
    shapeGeometryCounts: summarizeSlideValueDiffs(walnutSlides, routaSlides, summarizeShapeGeometryCounts, limit),
    shapeStyles: summarizeSlideElementDiffs(walnutSlides, routaSlides, summarizeElementShapeStyle, limit),
    tables: summarizeSlideElementDiffs(walnutSlides, routaSlides, summarizeElementTableIfPresent, limit),
  };
}

function summarizeSlideValueDiffs(
  walnutSlides: Record<string, unknown>[],
  routaSlides: Record<string, unknown>[],
  summarize: (slide: Record<string, unknown>) => unknown,
  limit: number,
) {
  const slideCount = Math.max(walnutSlides.length, routaSlides.length);
  const slideDiffs: unknown[] = [];
  for (let slideIndex = 0; slideIndex < slideCount; slideIndex += 1) {
    const walnut = summarize(walnutSlides[slideIndex] ?? {});
    const routa = summarize(routaSlides[slideIndex] ?? {});
    if (stableJson(walnut) !== stableJson(routa)) {
      slideDiffs.push({
        routa,
        slideIndex: slideIndex + 1,
        walnut,
      });
      if (slideDiffs.length >= limit) {
        break;
      }
    }
  }

  return slideDiffs;
}

function summarizeSlideElementDiffs(
  walnutSlides: Record<string, unknown>[],
  routaSlides: Record<string, unknown>[],
  summarize: (element: Record<string, unknown>) => unknown,
  limit: number,
) {
  const slideCount = Math.max(walnutSlides.length, routaSlides.length);
  const slideDiffs: unknown[] = [];
  for (let slideIndex = 0; slideIndex < slideCount; slideIndex += 1) {
    const walnutElements = arrayOfRecords(walnutSlides[slideIndex]?.elements).map(summarize).filter(Boolean);
    const routaElements = arrayOfRecords(routaSlides[slideIndex]?.elements).map(summarize).filter(Boolean);
    const elementCount = Math.max(walnutElements.length, routaElements.length);
    const elementDiffs: unknown[] = [];
    for (let elementIndex = 0; elementIndex < elementCount; elementIndex += 1) {
      const walnut = walnutElements[elementIndex] ?? null;
      const routa = routaElements[elementIndex] ?? null;
      if (stableJson(walnut) !== stableJson(routa)) {
        elementDiffs.push({
          elementIndex,
          routa,
          walnut,
        });
        if (elementDiffs.length >= limit) {
          break;
        }
      }
    }

    if (elementDiffs.length > 0) {
      slideDiffs.push({
        diffCountShown: elementDiffs.length,
        diffs: elementDiffs,
        slideIndex: slideIndex + 1,
      });
    }
  }

  return slideDiffs;
}

function slideElementSummariesMatch(
  walnutSlides: Record<string, unknown>[],
  routaSlides: Record<string, unknown>[],
  summarize: (element: Record<string, unknown>) => unknown,
): boolean {
  const slideCount = Math.max(walnutSlides.length, routaSlides.length);
  for (let slideIndex = 0; slideIndex < slideCount; slideIndex += 1) {
    const walnutElements = arrayOfRecords(walnutSlides[slideIndex]?.elements).map(summarize).filter(Boolean);
    const routaElements = arrayOfRecords(routaSlides[slideIndex]?.elements).map(summarize).filter(Boolean);
    if (!semanticSummaryEqual(walnutElements, routaElements)) {
      return false;
    }
  }

  return true;
}

function assertEquivalence(result: ComparisonResult): void {
  const failed = requiredSemanticChecks(result.equivalence);
  if (result.equivalence.firstSlideElementCountDelta !== 0) {
    failed.push("firstSlideElementCountDelta");
  }

  if (failed.length > 0) {
    throw new Error(`${result.fixture} PPTX parity failed: ${failed.join(", ")}`);
  }
}

function summarizeParity(equivalence: ReturnType<typeof summarizeEquivalence>) {
  const checks = Object.entries(equivalence).filter(([, value]) => typeof value === "boolean");
  const failedChecks = checks.filter(([, value]) => value !== true).map(([key]) => key);
  return {
    failedChecks,
    passedChecks: checks.length - failedChecks.length,
    semanticParityPercent:
      checks.length === 0 ? 100 : Number((((checks.length - failedChecks.length) / checks.length) * 100).toFixed(2)),
    totalChecks: checks.length,
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

function summarizeProtocolDiff(
  walnutPresentation: Record<string, unknown>,
  routaPresentation: Record<string, unknown>,
  limit: number,
) {
  const diffs: ProtocolDiffEntry[] = [];
  const state = { total: 0 };
  compareProtocolValue(walnutPresentation, routaPresentation, "$", diffs, state, limit);
  return {
    shown: diffs,
    shownCount: diffs.length,
    totalCount: state.total,
  };
}

type ProtocolDiffEntry = {
  kind: "array_length" | "missing_in_routa" | "missing_in_walnut" | "type" | "value";
  path: string;
  routa: unknown;
  walnut: unknown;
};

function compareProtocolValue(
  walnut: unknown,
  routa: unknown,
  pathName: string,
  diffs: ProtocolDiffEntry[],
  state: { total: number },
  limit: number,
): void {
  if (Object.is(walnut, routa)) {
    return;
  }

  const walnutKind = protocolValueKind(walnut);
  const routaKind = protocolValueKind(routa);
  if (walnutKind !== routaKind) {
    pushProtocolDiff(diffs, state, limit, {
      kind: "type",
      path: pathName,
      routa: summarizeProtocolValue(routa),
      walnut: summarizeProtocolValue(walnut),
    });
    return;
  }

  if (Array.isArray(walnut) && Array.isArray(routa)) {
    if (walnut.length !== routa.length) {
      pushProtocolDiff(diffs, state, limit, {
        kind: "array_length",
        path: pathName,
        routa: routa.length,
        walnut: walnut.length,
      });
    }

    const length = Math.min(walnut.length, routa.length);
    for (let index = 0; index < length; index += 1) {
      compareProtocolValue(walnut[index], routa[index], `${pathName}[${index}]`, diffs, state, limit);
    }
    return;
  }

  if (isRecord(walnut) && isRecord(routa)) {
    const keys = new Set([...Object.keys(walnut), ...Object.keys(routa)]);
    for (const key of [...keys].sort()) {
      const childPath = `${pathName}.${key}`;
      const walnutHasKey = Object.prototype.hasOwnProperty.call(walnut, key);
      const routaHasKey = Object.prototype.hasOwnProperty.call(routa, key);
      if (!walnutHasKey) {
        pushProtocolDiff(diffs, state, limit, {
          kind: "missing_in_walnut",
          path: childPath,
          routa: summarizeProtocolValue(routa[key]),
          walnut: undefined,
        });
        continue;
      }

      if (!routaHasKey) {
        pushProtocolDiff(diffs, state, limit, {
          kind: "missing_in_routa",
          path: childPath,
          routa: undefined,
          walnut: summarizeProtocolValue(walnut[key]),
        });
        continue;
      }

      compareProtocolValue(walnut[key], routa[key], childPath, diffs, state, limit);
    }
    return;
  }

  pushProtocolDiff(diffs, state, limit, {
    kind: "value",
    path: pathName,
    routa,
    walnut,
  });
}

function pushProtocolDiff(
  diffs: ProtocolDiffEntry[],
  state: { total: number },
  limit: number,
  diff: ProtocolDiffEntry,
): void {
  state.total += 1;
  if (diffs.length < limit) {
    diffs.push(diff);
  }
}

function protocolValueKind(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function summarizeProtocolValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { arrayLength: value.length };
  }

  if (isRecord(value)) {
    return { keys: Object.keys(value).sort() };
  }

  return value;
}

function parseDiffLimit(args: string[]): number {
  const raw = args.find((arg) => arg.startsWith("--diff-limit="))?.slice("--diff-limit=".length);
  const parsed = raw ? Number(raw) : 80;
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 80;
}

function elementImageReferenceIds(element: Record<string, unknown>): string[] {
  const ids = [
    imageReferenceId(element.imageReference),
    imageReferenceId(asRecord(element.fill)?.imageReference),
    imageReferenceId(asRecord(asRecord(element.shape)?.fill)?.imageReference),
  ].filter(Boolean);
  return ids.concat(arrayOfRecords(element.children).flatMap(elementImageReferenceIds));
}

function elementChartReferenceIds(element: Record<string, unknown>): string[] {
  const id = chartReferenceId(element.chartReference);
  const children = arrayOfRecords(element.children).flatMap(elementChartReferenceIds);
  return id ? [id, ...children] : children;
}

function summarizeSlideDigest(
  slide: Record<string, unknown>,
  summarize: (element: Record<string, unknown>) => unknown,
): string {
  return sha256Text(stableJson(arrayOfRecords(slide.elements).map(summarize)));
}

function summarizeElementBbox(element: Record<string, unknown>) {
  const bbox = asRecord(element.bbox) ?? {};
  return {
    id: stringValue(element.id),
    name: stringValue(element.name),
    type: element.type,
    bbox: {
      heightEmu: semanticBboxEmu(bbox.heightEmu),
      rotation: numberValue(bbox.rotation),
      widthEmu: semanticBboxEmu(bbox.widthEmu),
      xEmu: semanticBboxEmu(bbox.xEmu),
      yEmu: semanticBboxEmu(bbox.yEmu),
    },
  };
}

function summarizeElementBboxExact(element: Record<string, unknown>) {
  return {
    id: stringValue(element.id),
    name: stringValue(element.name),
    type: element.type,
    bbox: summarizeBboxExact(asRecord(element.bbox)),
  };
}

function summarizeElementShapeStyle(element: Record<string, unknown>) {
  const shape = asRecord(element.shape) ?? {};
  return {
    id: stringValue(element.id),
    name: stringValue(element.name),
    type: element.type,
    geometry: numberValue(shape.geometry),
    fill: summarizeFill(asRecord(element.fill) ?? asRecord(shape.fill)),
    line: summarizeLine(asRecord(element.line) ?? asRecord(shape.line)),
    effects: summarizeEffects(element.effects),
    imageReferenceIds: elementImageReferenceIds(element),
    chartReferenceIds: elementChartReferenceIds(element),
  };
}

function summarizeElementTextStyle(element: Record<string, unknown>) {
  return {
    id: stringValue(element.id),
    name: stringValue(element.name),
    type: element.type,
    textStyle: summarizeTextStyle(asRecord(element.textStyle)),
    paragraphs: arrayOfRecords(element.paragraphs).map((paragraph) => ({
      paragraphStyle: summarizeTextStyle(mergeRecords(asRecord(paragraph.paragraphStyle), asRecord(paragraph.textStyle))),
      runCount: arrayOfRecords(paragraph.runs).length,
      runs: arrayOfRecords(paragraph.runs).map((run) => ({
        textLength: stringValue(run.text).length,
        textStyle: summarizeTextStyle(asRecord(run.textStyle)),
      })),
    })),
  };
}

function summarizeShapeGeometryCounts(slide: Record<string, unknown>): Record<string, number> {
  const counts = new Map<string, number>();
  for (const element of arrayOfRecords(slide.elements)) {
    const shape = asRecord(element.shape);
    if (!shape) continue;
    const geometry = String(numberValue(shape.geometry));
    counts.set(geometry, (counts.get(geometry) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function summarizeNotesTextDigest(slide: Record<string, unknown>): string {
  return sha256Text(summarizeNotesText(slide));
}

function summarizeNotesText(slide: Record<string, unknown>): string {
  const notesSlide = asRecord(slide.notesSlide);
  if (!notesSlide) return "";
  return collectTextPreview(notesSlide);
}

function summarizeSlideTextDigest(slide: Record<string, unknown>): string {
  return sha256Text(
    stableJson(arrayOfRecords(slide.elements).map((element) => summarizeElementVisibleText(element))),
  );
}

function summarizeElementVisibleText(element: Record<string, unknown>): unknown {
  return {
    id: stringValue(element.id),
    name: stringValue(element.name),
    type: element.type,
    text: arrayOfRecords(element.paragraphs).map(summarizeParagraphText),
    table: isRecord(element.table) ? summarizeTableVisibleText(asRecord(element.table) ?? {}) : [],
    children: arrayOfRecords(element.children).map(summarizeElementVisibleText),
  };
}

function summarizeParagraphText(paragraph: Record<string, unknown>): string {
  return arrayOfRecords(paragraph.runs).map((run) => stringValue(run.text)).join("");
}

function summarizeTableVisibleText(table: Record<string, unknown>): unknown {
  return arrayOfRecords(table.rows).map((row) =>
    arrayOfRecords(row.cells).map((cell) => ({
      text: stringValue(cell.text),
      paragraphs: arrayOfRecords(cell.paragraphs).map(summarizeParagraphText),
    })),
  );
}

function summarizeSlideConnectorDigest(slide: Record<string, unknown>): string {
  const connectors = arrayOfRecords(slide.elements)
    .filter((element) => isRecord(element.connector))
    .map(summarizeElementConnector);
  return sha256Text(stableJson(connectors));
}

function summarizeElementConnector(element: Record<string, unknown>) {
  return summarizeElementConnectorWithBbox(element, summarizeBbox);
}

function summarizeElementConnectorExact(element: Record<string, unknown>) {
  return summarizeElementConnectorWithBbox(element, summarizeBboxExact);
}

function summarizeElementConnectorWithBbox(
  element: Record<string, unknown>,
  summarizeElementBboxValue: (bbox: Record<string, unknown> | null) => ReturnType<typeof summarizeBbox>,
) {
  const connector = asRecord(element.connector) ?? {};
  const lineStyle = asRecord(connector.lineStyle) ?? {};
  return {
    id: stringValue(element.id),
    name: stringValue(element.name),
    type: element.type,
    bbox: summarizeElementBboxValue(asRecord(element.bbox)),
    shapeLine: summarizeLine(asRecord(asRecord(element.shape)?.line) ?? asRecord(element.line)),
    connector: {
      fromElementId: stringValue(connector.fromElementId ?? connector.fromId ?? connector.startElementId),
      fromIdx: numberValue(connector.fromIdx ?? connector.startIdx),
      toElementId: stringValue(connector.toElementId ?? connector.toId ?? connector.endElementId),
      toIdx: numberValue(connector.toIdx ?? connector.endIdx),
      lineStyle: {
        cap: numberValue(lineStyle.cap),
        join: numberValue(lineStyle.join),
        head: summarizeConnectorLineEnd(asRecord(lineStyle.head) ?? asRecord(lineStyle.headEnd)),
        tail: summarizeConnectorLineEnd(asRecord(lineStyle.tail) ?? asRecord(lineStyle.tailEnd)),
      },
    },
  };
}

function summarizeElementConnectorIfPresent(element: Record<string, unknown>) {
  return isRecord(element.connector) ? summarizeElementConnector(element) : null;
}

function summarizeElementConnectorIfPresentExact(element: Record<string, unknown>) {
  return isRecord(element.connector) ? summarizeElementConnectorExact(element) : null;
}

function summarizeConnectorLineEnd(end: Record<string, unknown> | null) {
  return {
    type: numberValue(end?.type),
    width: numberValue(end?.width),
    length: numberValue(end?.length),
  };
}

function summarizeSlideTableDigest(slide: Record<string, unknown>): string {
  return sha256Text(stableJson(summarizeSlideTables(slide)));
}

function summarizeSlideTables(slide: Record<string, unknown>) {
  return arrayOfRecords(slide.elements)
    .filter((element) => isRecord(element.table))
    .map(summarizeElementTable);
}

function summarizeElementTable(element: Record<string, unknown>) {
  const table = asRecord(element.table) ?? {};
  return {
    id: stringValue(element.id),
    name: stringValue(element.name),
    type: element.type,
    bbox: summarizeBbox(asRecord(element.bbox)),
    columnWidths: summarizeTableColumns(table.columns ?? table.columnWidths ?? table.gridColumns),
    properties: summarizeTableProperties(asRecord(table.properties) ?? asRecord(table.tableProperties)),
    rows: arrayOfRecords(table.rows).map(summarizeTableRow),
  };
}

function summarizeElementTableIfPresent(element: Record<string, unknown>) {
  return isRecord(element.table) ? summarizeElementTable(element) : null;
}

function summarizeTableColumns(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map((column) => {
        if (typeof column === "number") return column;
        const record = asRecord(column);
        return numberValue(record?.widthEmu ?? record?.width);
      })
    : [];
}

function summarizeTableProperties(properties: Record<string, unknown> | null) {
  return {
    fill: summarizeFill(asRecord(properties?.fill)),
    firstRow: properties?.firstRow === true,
    firstColumn: properties?.firstColumn === true,
    lastRow: properties?.lastRow === true,
    lastColumn: properties?.lastColumn === true,
    bandedRows: properties?.bandedRows === true || properties?.bandRow === true,
    bandedColumns: properties?.bandedColumns === true || properties?.bandColumn === true,
    rightToLeft: properties?.rightToLeft === true,
    styleId: stringValue(properties?.styleId),
    effects: summarizeEffects(properties?.effects),
  };
}

function summarizeTableRow(row: Record<string, unknown>) {
  return {
    heightEmu: numberValue(row.heightEmu ?? row.height),
    cells: arrayOfRecords(row.cells).map(summarizeTableCell),
  };
}

function summarizeTableCell(cell: Record<string, unknown>) {
  const properties = asRecord(cell.properties) ?? asRecord(cell.tableCellProperties);
  return {
    text: stringValue(cell.text),
    textStyle: summarizeTextStyle(asRecord(cell.textStyle)),
    paragraphs: arrayOfRecords(cell.paragraphs).map(summarizeParagraph),
    fill: summarizeFill(asRecord(cell.fill) ?? asRecord(properties?.fill)),
    lines: summarizeTableCellLines(asRecord(cell.lines) ?? asRecord(cell.borders)),
    gridSpan: numberValue(cell.gridSpan),
    rowSpan: numberValue(cell.rowSpan),
    horizontalMerge: cell.horizontalMerge === true || cell.hMerge === true,
    verticalMerge: cell.verticalMerge === true || cell.vMerge === true,
    vertical: stringValue(cell.vertical),
    leftMargin: numberValue(cell.leftMargin),
    rightMargin: numberValue(cell.rightMargin),
    topMargin: numberValue(cell.topMargin),
    bottomMargin: numberValue(cell.bottomMargin),
    anchor: stringValue(cell.anchor),
    anchorCenter: cell.anchorCenter === true,
    horizontalOverflow: stringValue(cell.horizontalOverflow),
  };
}

function summarizeParagraph(paragraph: Record<string, unknown>) {
  return {
    text: arrayOfRecords(paragraph.runs).map((run) => stringValue(run.text)).join(""),
    paragraphStyle: summarizeTextStyle(mergeRecords(asRecord(paragraph.paragraphStyle), asRecord(paragraph.textStyle))),
    runs: arrayOfRecords(paragraph.runs).map((run) => ({
      text: stringValue(run.text),
      textStyle: summarizeTextStyle(asRecord(run.textStyle)),
    })),
  };
}

function summarizeTableCellLines(lines: Record<string, unknown> | null) {
  return {
    top: summarizeLine(lineRecord(lines, ["top", "topBorder", "topLine"])),
    right: summarizeLine(lineRecord(lines, ["right", "rightBorder", "rightLine"])),
    bottom: summarizeLine(lineRecord(lines, ["bottom", "bottomBorder", "bottomLine"])),
    left: summarizeLine(lineRecord(lines, ["left", "leftBorder", "leftLine"])),
    diagonalDown: summarizeLine(lineRecord(lines, ["diagonalDown", "bottomLeftToTopRight", "diagonalDownLine"])),
    diagonalUp: summarizeLine(lineRecord(lines, ["diagonalUp", "topLeftToBottomRight", "diagonalUpLine"])),
  };
}

function lineRecord(lines: Record<string, unknown> | null, keys: string[]): Record<string, unknown> | null {
  if (!lines) return null;
  for (const key of keys) {
    const line = asRecord(lines[key]);
    if (line) return line;
  }
  return null;
}

function summarizeFill(fill: Record<string, unknown> | null) {
  return {
    type: numberValue(fill?.type),
    color: summarizeColor(asRecord(fill?.color)),
    imageReferenceId: imageReferenceId(fill?.imageReference),
    sourceRect:
      asRecord(fill?.sourceRect) ??
      asRecord(fill?.sourceRectangle) ??
      asRecord(fill?.srcRect) ??
      asRecord(fill?.stretchFillRect) ??
      null,
  };
}

function summarizeBbox(bbox: Record<string, unknown> | null) {
  return {
    heightEmu: semanticBboxEmu(bbox?.heightEmu),
    rotation: numberValue(bbox?.rotation),
    widthEmu: semanticBboxEmu(bbox?.widthEmu),
    xEmu: semanticBboxEmu(bbox?.xEmu),
    yEmu: semanticBboxEmu(bbox?.yEmu),
  };
}

function summarizeBboxExact(bbox: Record<string, unknown> | null) {
  return {
    heightEmu: numberValue(bbox?.heightEmu),
    rotation: numberValue(bbox?.rotation),
    widthEmu: numberValue(bbox?.widthEmu),
    xEmu: numberValue(bbox?.xEmu),
    yEmu: numberValue(bbox?.yEmu),
  };
}

function summarizeLine(line: Record<string, unknown> | null) {
  const fill = asRecord(line?.fill);
  return {
    color: summarizeColor(asRecord(fill?.color)),
    widthEmu: numberValue(line?.widthEmu),
    style: numberValue(line?.style),
    cap: numberValue(line?.cap),
    join: numberValue(line?.join),
    headEnd: asRecord(line?.headEnd) ?? null,
    tailEnd: asRecord(line?.tailEnd) ?? null,
  };
}

function summarizeTextStyle(style: Record<string, unknown> | null) {
  return {
    anchor: numberValue(style?.anchor),
    alignment: numberValue(style?.alignment),
    bold: style?.bold === true,
    bottomInset: numberValue(style?.bottomInset),
    fill: summarizeFill(asRecord(style?.fill)),
    fontSize: numberValue(style?.fontSize),
    italic: style?.italic === true,
    leftInset: numberValue(style?.leftInset),
    lineSpacing: numberValue(style?.lineSpacing),
    lineSpacingPercent: numberValue(style?.lineSpacingPercent),
    rightInset: numberValue(style?.rightInset),
    spaceAfter: numberValue(style?.spaceAfter),
    spaceBefore: numberValue(style?.spaceBefore),
    topInset: numberValue(style?.topInset),
    typeface: stringValue(style?.typeface),
    underline: style?.underline === true,
    wrap: numberValue(style?.wrap),
  };
}

function summarizeEffects(effects: unknown) {
  return arrayOfRecords(effects).map((effect) => {
    const shadow = asRecord(effect.shadow);
    return {
      type: numberValue(effect.type),
      shadow: shadow
        ? {
            alignment: stringValue(shadow.alignment),
            blurRadius: numberValue(shadow.blurRadius),
            color: summarizeColor(asRecord(shadow.color)),
            direction: numberValue(shadow.direction),
            distance: numberValue(shadow.distance),
            rotateWithShape: shadow.rotateWithShape === true,
          }
        : null,
    };
  });
}

function mergeRecords(
  base: Record<string, unknown> | null,
  override: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!base && !override) return null;
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  };
}

function summarizeColor(color: Record<string, unknown> | null) {
  return {
    type: numberValue(color?.type),
    value: stringValue(color?.value),
    lastColor: stringValue(color?.lastColor),
    transform: asRecord(color?.transform) ?? null,
  };
}

function imageReferenceId(value: unknown): string {
  const record = asRecord(value);
  return typeof record?.id === "string" ? record.id : "";
}

function chartReferenceId(value: unknown): string {
  const record = asRecord(value);
  return typeof record?.id === "string" ? record.id : "";
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

function semanticSummaryEqual(left: unknown, right: unknown, path: string[] = []): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  const pathName = path[path.length - 1] ?? "";
  if (
    typeof left === "number" &&
    typeof right === "number" &&
    path.includes("bbox") &&
    BBOX_EMU_KEYS.has(pathName)
  ) {
    return Math.abs(left - right) <= SEMANTIC_BBOX_TOLERANCE_EMU;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((leftItem, index) => semanticSummaryEqual(leftItem, right[index], path.concat(String(index))));
  }

  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) {
      return false;
    }

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (stableJson(leftKeys) !== stableJson(rightKeys)) {
      return false;
    }

    return leftKeys.every((key) => semanticSummaryEqual(left[key], right[key], path.concat(key)));
  }

  return false;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function semanticBboxEmu(value: unknown): number {
  const number = numberValue(value);
  // 1,000 EMU is roughly one tenth of a CSS pixel at 96 DPI, so this keeps
  // Walnut/Routa sub-pixel rounding noise out of semantic production gates.
  return Math.round(number / 1000) * 1000;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertFile(filePath: string, label: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
