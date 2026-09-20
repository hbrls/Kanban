import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import officeWasmConfig from "../../src/app/debug/office-wasm-poc/office-wasm-config";

type ReaderExports = {
  XlsxReader: {
    ExtractXlsxProto: (bytes: Uint8Array, ignoreErrors: boolean) => Uint8Array | ArrayBuffer | number[];
  };
};

type WorkbookDecoder = {
  Workbook: {
    decode: (bytes: Uint8Array) => Record<string, unknown>;
  };
};

type XlsxRenderContractResult = {
  byteComparison: ReturnType<typeof summarizeByteComparison>;
  equivalence: ReturnType<typeof summarizeRenderEquivalence>;
  fixture: string;
  gaps: RenderContractGap[];
  parity: ReturnType<typeof summarizeRenderParity>;
  routa: ReturnType<typeof summarizeWorkbookRenderOutput>;
  routaProtocol: string;
  targetProtocol: string;
  walnut: ReturnType<typeof summarizeWorkbookRenderOutput>;
};

type WorkbookRenderContract = ReturnType<typeof summarizeWorkbookRenderContract>;

type RenderContractGap = {
  actual: unknown;
  area: string;
  detail?: unknown;
  expected: unknown;
};

const repoRoot = process.cwd();
const assetDir = path.resolve(repoRoot, officeWasmConfig.OFFICE_WASM_TMP_ASSET_DIR);
const generatedBundleEntry = path.resolve(repoRoot, "public/office-wasm-reader/main.js");
const assertMode = process.argv.includes("--assert");
const verboseMode = process.argv.includes("--verbose");
const fixturePaths = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--"))
  .map((arg) => path.resolve(repoRoot, arg));

if (fixturePaths.length === 0) {
  fixturePaths.push(path.resolve(repoRoot, "tools/office-wasm-reader/fixtures/complex_excel_renderer_test.xlsx"));
}

async function main(): Promise<void> {
  assertFile(assetDir, "extracted Walnut asset directory");
  assertFile(generatedBundleEntry, "generated Routa office WASM bundle");

  const results: XlsxRenderContractResult[] = [];
  for (const fixturePath of fixturePaths) {
    assertFile(fixturePath, "XLSX fixture");
    results.push(await compareFixture(fixturePath));
  }

  if (assertMode) {
    for (const result of results) {
      assertStableRenderContract(result);
      console.log(`ok ${result.fixture}`);
    }
    return;
  }

  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
}

async function compareFixture(fixturePath: string): Promise<XlsxRenderContractResult> {
  const sourceBytes = readFileSync(fixturePath);
  const walnutProtoBytes = await extractWalnutWorkbookProto(sourceBytes);
  const walnutWorkbook = await decodeWalnutWorkbook(walnutProtoBytes);
  const routaProtoBytes = await extractRoutaWorkbookProto(sourceBytes);
  const routaWorkbook = await decodeWalnutWorkbook(routaProtoBytes);
  const walnut = summarizeWorkbookRenderContract(walnutWorkbook, walnutProtoBytes);
  const routa = summarizeWorkbookRenderContract(routaWorkbook, routaProtoBytes);
  const equivalence = summarizeRenderEquivalence(walnut, routa);

  return {
    byteComparison: summarizeByteComparison(walnutProtoBytes, routaProtoBytes),
    equivalence,
    fixture: path.relative(repoRoot, fixturePath),
    gaps: summarizeRenderGaps(walnut, routa, equivalence),
    parity: summarizeRenderParity(equivalence),
    routa: summarizeWorkbookRenderOutput(routa),
    routaProtocol: "oaiproto.coworker.spreadsheet.Workbook",
    targetProtocol: "oaiproto.coworker.spreadsheet.Workbook",
    walnut: summarizeWorkbookRenderOutput(walnut),
  };
}

async function extractWalnutWorkbookProto(sourceBytes: Uint8Array): Promise<Uint8Array> {
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
  return toUint8Array(exports.XlsxReader.ExtractXlsxProto(sourceBytes, false));
}

async function decodeWalnutWorkbook(protoBytes: Uint8Array): Promise<Record<string, unknown>> {
  const spreadsheetModule = moduleRoot(await import(
    pathToFileURL(path.join(assetDir, officeWasmConfig.OFFICE_WASM_READER_MODULES.spreadsheet)).href
  )) as WorkbookDecoder;

  if (!spreadsheetModule.Workbook?.decode) {
    throw new Error("Could not load Walnut spreadsheet Workbook decoder.");
  }

  return spreadsheetModule.Workbook.decode(protoBytes);
}

async function extractRoutaWorkbookProto(sourceBytes: Uint8Array): Promise<Uint8Array> {
  await import(pathToFileURL(generatedBundleEntry).href);
  const bridge = (globalThis as typeof globalThis & {
    RoutaOfficeWasmReader?: { exports?: ReaderExports };
  }).RoutaOfficeWasmReader;

  if (!bridge?.exports) {
    throw new Error("RoutaOfficeWasmReader exports were not initialized.");
  }

  return toUint8Array(bridge.exports.XlsxReader.ExtractXlsxProto(sourceBytes, false));
}

function summarizeWorkbookRenderContract(workbook: Record<string, unknown>, protoBytes: Uint8Array) {
  const sheets = arrayOfRecords(workbook.sheets);
  const styles = asRecord(workbook.styles) ?? {};

  return {
    proto: {
      byteLength: protoBytes.length,
      sha256: sha256(protoBytes),
    },
    protocol: "oaiproto.coworker.spreadsheet.Workbook",
    sheets: sheets.map(summarizeSheetRenderContract),
    styleContract: summarizeStyleContract(styles),
    workbookImages: arrayOfRecords(workbook.images).map(summarizeWorkbookImage),
  };
}

function summarizeWorkbookRenderOutput(contract: WorkbookRenderContract): WorkbookRenderContract | ReturnType<typeof summarizeWorkbookRenderDigest> {
  return verboseMode ? contract : summarizeWorkbookRenderDigest(contract);
}

function summarizeWorkbookRenderDigest(contract: WorkbookRenderContract) {
  return {
    proto: contract.proto,
    protocol: contract.protocol,
    sheetCount: contract.sheets.length,
    sheets: contract.sheets.map((sheet) => ({
      columnCount: sheet.columns.length,
      conditionalFormattingCount: sheet.conditionalFormattings.length,
      dataValidationCount: sheet.dataValidations.length,
      drawingSummary: sheet.drawingSummary,
      mergedCellCount: sheet.mergedCells.length,
      name: sheet.name,
      rowLayout: {
        count: sheet.rowLayout.count,
        customRowCount: sheet.rowLayout.customRows.length,
        hash: sheet.rowLayout.hash,
      },
      sparklineGroupCount: sheet.sparklineGroups.length,
      tableCount: sheet.tables.length,
    })),
    styleContract: {
      counts: contract.styleContract.counts,
      hashes: contract.styleContract.hashes,
    },
    workbookImageCount: contract.workbookImages.length,
  };
}

function summarizeSheetRenderContract(sheet: Record<string, unknown>) {
  const drawings = arrayOfRecords(sheet.drawings).map(summarizeDrawing);

  return {
    baseColWidth: numberValue(sheet.baseColWidth),
    columns: arrayOfRecords(sheet.columns).map(summarizeColumnLayout),
    conditionalFormattings: arrayOfRecords(sheet.conditionalFormattings).map(summarizeConditionalFormatting),
    dataValidations: dataValidationItems(sheet.dataValidations).map(summarizeDataValidation),
    defaultColWidth: numberValue(sheet.defaultColWidth),
    defaultRowHeight: numberValue(sheet.defaultRowHeight),
    drawings,
    drawingSummary: {
      chartCount: drawings.filter((drawing) => drawing.kind === "chart").length,
      imageCount: drawings.filter((drawing) => drawing.kind === "image").length,
      shapeCount: drawings.filter((drawing) => drawing.kind === "shape").length,
      totalCount: drawings.length,
    },
    mergedCells: arrayOfRecords(sheet.mergedCells).map(rangeTargetText),
    name: stringValue(sheet.name),
    rowLayout: summarizeRowLayoutContract(arrayOfRecords(sheet.rows)),
    showGridLines: booleanValue(sheet.showGridLines),
    sparklineGroups: summarizeSparklineGroups(sheet.sparklineGroups),
    tables: arrayOfRecords(sheet.tables).map(summarizeTable),
  };
}

function summarizeColumnLayout(column: Record<string, unknown>) {
  return {
    customWidth: flagValue(column.customWidth),
    hidden: flagValue(column.hidden),
    max: numberValue(column.max),
    min: numberValue(column.min),
    styleIndex: nullableNumberValue(column.styleIndex),
    width: numberValue(column.width),
  };
}

function summarizeRowLayout(row: Record<string, unknown>) {
  return {
    customHeight: flagValue(row.customHeight),
    height: numberValue(row.height),
    hidden: flagValue(row.hidden),
    index: numberValue(row.index),
    styleIndex: nullableNumberValue(row.styleIndex),
  };
}

function summarizeRowLayoutContract(rows: Array<Record<string, unknown>>) {
  const rowLayouts = rows.map(summarizeRowLayout);

  return {
    count: rowLayouts.length,
    customRows: rowLayouts.filter((row) => row.customHeight || row.hidden || row.styleIndex !== null),
    hash: jsonHash(rowLayouts),
    samples: sampleEdges(rowLayouts),
  };
}

function summarizeTable(table: Record<string, unknown>) {
  const style = asRecord(table.style) ?? {};

  return {
    autoFilter: summarizeAutoFilter(table.autoFilter),
    columns: arrayOfRecords(table.columns).map((column) => ({
      dataDxfId: nullableNumberValue(column.dataDxfId),
      id: numberValue(column.id),
      name: stringValue(column.name),
      totalsRowFunction: stringValue(column.totalsRowFunction),
      totalsRowLabel: stringValue(column.totalsRowLabel),
    })),
    dataDxfId: nullableNumberValue(table.dataDxfId),
    displayName: stringValue(table.displayName),
    headerRowCellStyle: stringValue(table.headerRowCellStyle),
    headerRowCount: nullableNumberValue(table.headerRowCount),
    id: numberValue(table.id),
    name: stringValue(table.name),
    ref: stringValue(table.ref),
    style: {
      name: stringValue(style.name),
      showColumnStripes: flagValue(style.showColumnStripes),
      showFirstColumn: flagValue(style.showFirstColumn),
      showLastColumn: flagValue(style.showLastColumn),
      showRowStripes: flagValue(style.showRowStripes),
    },
    totalsRowCount: nullableNumberValue(table.totalsRowCount),
    totalsRowShown: booleanValue(table.totalsRowShown),
  };
}

function summarizeAutoFilter(value: unknown) {
  const autoFilter = asRecord(value);
  if (!autoFilter) {
    return null;
  }

  return {
    ref: stringValue(autoFilter.ref),
  };
}

function summarizeConditionalFormatting(group: Record<string, unknown>) {
  return {
    ranges: arrayOfRecords(group.ranges).map(rangeTargetText),
    rules: arrayOfRecords(group.rules).map(summarizeConditionalRule),
  };
}

function summarizeConditionalRule(rule: Record<string, unknown>) {
  return {
    aboveAverage: booleanValue(rule.aboveAverage),
    bottom: booleanValue(rule.bottom),
    colorScale: summarizeColorScale(rule.colorScale),
    dataBar: summarizeDataBar(rule.dataBar),
    dxfId: nullableNumberValue(rule.dxfId),
    equalAverage: booleanValue(rule.equalAverage),
    formula: arrayOfPrimitiveValues(rule.formula),
    iconSet: summarizeIconSet(rule.iconSet),
    operator: stringValue(rule.operator),
    percent: booleanValue(rule.percent),
    priority: nullableNumberValue(rule.priority),
    rank: nullableNumberValue(rule.rank),
    stdDev: nullableNumberValue(rule.stdDev),
    stopIfTrue: booleanValue(rule.stopIfTrue),
    text: stringValue(rule.text),
    timePeriod: stringValue(rule.timePeriod),
    type: stringValue(rule.type),
  };
}

function summarizeColorScale(value: unknown) {
  const colorScale = asRecord(value);
  if (!colorScale) {
    return null;
  }

  return {
    cfvos: arrayOfRecords(colorScale.cfvos).map(summarizeCfvo),
    colors: arrayOfRecords(colorScale.colors).map(summarizeColor),
  };
}

function summarizeDataBar(value: unknown) {
  const dataBar = asRecord(value);
  if (!dataBar) {
    return null;
  }

  return {
    axisColor: summarizeColor(dataBar.axisColor),
    axisPosition: stringValue(dataBar.axisPosition),
    border: booleanValue(dataBar.border),
    borderColor: summarizeColor(dataBar.borderColor),
    cfvos: arrayOfRecords(dataBar.cfvos).map(summarizeCfvo),
    color: summarizeColor(dataBar.color),
    direction: stringValue(dataBar.direction),
    gradient: booleanValue(dataBar.gradient),
    maxLength: nullableNumberValue(dataBar.maxLength),
    minLength: nullableNumberValue(dataBar.minLength),
    negativeBarBorderColorSameAsPositive: booleanValue(dataBar.negativeBarBorderColorSameAsPositive),
    negativeBarColorSameAsPositive: booleanValue(dataBar.negativeBarColorSameAsPositive),
    negativeBorderColor: summarizeColor(dataBar.negativeBorderColor),
    negativeFillColor: summarizeColor(dataBar.negativeFillColor),
    showValue: booleanValue(dataBar.showValue),
  };
}

function summarizeIconSet(value: unknown) {
  const iconSet = asRecord(value);
  if (!iconSet) {
    return null;
  }

  return {
    cfvos: arrayOfRecords(iconSet.cfvos).map(summarizeCfvo),
    custom: booleanValue(iconSet.custom),
    iconSet: stringValue(iconSet.iconSet),
    percent: booleanValue(iconSet.percent),
    reverse: booleanValue(iconSet.reverse),
    showValue: booleanValue(iconSet.showValue),
  };
}

function summarizeCfvo(cfvo: Record<string, unknown>) {
  return {
    gte: booleanValue(cfvo.gte),
    type: stringValue(cfvo.type),
    val: stringValue(cfvo.val),
  };
}

function summarizeDataValidation(validation: Record<string, unknown>) {
  return {
    allowBlank: booleanValue(validation.allowBlank),
    error: stringValue(validation.error),
    errorStyle: stringValue(validation.errorStyle),
    errorTitle: stringValue(validation.errorTitle),
    formula1: stringValue(validation.formula1),
    formula2: stringValue(validation.formula2),
    operator: stringValue(validation.operator),
    prompt: stringValue(validation.prompt),
    promptTitle: stringValue(validation.promptTitle),
    ranges: arrayOfRecords(validation.ranges).map(rangeTargetText),
    showDropDown: booleanValue(validation.showDropDown),
    type: stringValue(validation.type),
  };
}

function summarizeSparklineGroups(value: unknown) {
  const record = asRecord(value);
  const groups = record ? arrayOfRecords(record.groups) : arrayOfRecords(value);

  return groups.map((group) => ({
    axisColor: summarizeColor(group.axisColor),
    dateAxis: booleanValue(group.dateAxis),
    displayEmptyCellsAs: nullableNumberValue(group.displayEmptyCellsAs),
    displayHidden: booleanValue(group.displayHidden),
    displayXAxis: booleanValue(group.displayXAxis),
    first: booleanValue(group.first),
    firstMarkerColor: summarizeColor(group.firstMarkerColor),
    formula: stringValue(group.formula),
    high: booleanValue(group.high),
    highMarkerColor: summarizeColor(group.highMarkerColor),
    last: booleanValue(group.last),
    lastMarkerColor: summarizeColor(group.lastMarkerColor),
    lineWeight: nullableNumberValue(group.lineWeight),
    low: booleanValue(group.low),
    lowMarkerColor: summarizeColor(group.lowMarkerColor),
    manualMax: nullableNumberValue(group.manualMax),
    manualMin: nullableNumberValue(group.manualMin),
    markers: booleanValue(group.markers),
    markersColor: summarizeColor(group.markersColor),
    maxAxisType: nullableNumberValue(group.maxAxisType),
    minAxisType: nullableNumberValue(group.minAxisType),
    negative: booleanValue(group.negative),
    negativeColor: summarizeColor(group.negativeColor),
    rightToLeft: booleanValue(group.rightToLeft),
    seriesColor: summarizeColor(group.seriesColor),
    sparklines: arrayOfRecords(group.sparklines).map((sparkline) => ({
      formula: stringValue(sparkline.formula),
      reference: stringValue(sparkline.reference),
    })),
    type: nullableNumberValue(group.type),
    uid: stringValue(group.uid),
  }));
}

function summarizeDrawing(drawing: Record<string, unknown>) {
  const base = {
    extentCx: stringValue(drawing.extentCx),
    extentCy: stringValue(drawing.extentCy),
    fromAnchor: summarizeAnchor(drawing.fromAnchor),
    toAnchor: summarizeAnchor(drawing.toAnchor),
  };
  const chart = asRecord(drawing.chart);
  if (chart) {
    return {
      ...base,
      chart: summarizeChart(chart),
      kind: "chart",
    };
  }

  const shape = asRecord(drawing.shape);
  if (shape) {
    return {
      ...base,
      kind: "shape",
      shape: summarizeShape(shape),
    };
  }

  const imageReference = asRecord(drawing.imageReference);
  if (imageReference) {
    return {
      ...base,
      imageReference: summarizeImageReference(imageReference),
      kind: "image",
    };
  }

  return {
    ...base,
    kind: "unknown",
  };
}

function summarizeAnchor(value: unknown) {
  const anchor = asRecord(value) ?? {};

  return {
    colId: stringValue(anchor.colId),
    colOffset: stringValue(anchor.colOffset),
    rowId: stringValue(anchor.rowId),
    rowOffset: stringValue(anchor.rowOffset),
  };
}

function summarizeChart(chart: Record<string, unknown>) {
  return {
    barOptions: summarizeBarOptions(chart.barOptions),
    legend: summarizeLegend(chart.legend),
    series: arrayOfRecords(chart.series).map(summarizeChartSeries),
    title: stringValue(chart.title),
    type: nullableNumberValue(chart.type),
    xAxis: summarizeAxis(chart.xAxis),
    yAxis: summarizeAxis(chart.yAxis),
  };
}

function summarizeBarOptions(value: unknown) {
  const options = asRecord(value);
  if (!options) {
    return null;
  }

  return {
    gapWidth: nullableNumberValue(options.gapWidth),
    grouping: nullableNumberValue(options.grouping),
    overlap: nullableNumberValue(options.overlap),
    varyColors: booleanValue(options.varyColors),
  };
}

function summarizeChartSeries(series: Record<string, unknown>) {
  return {
    categories: arrayOfPrimitiveValues(series.categories),
    name: stringValue(series.name),
    values: arrayOfPrimitiveValues(series.values),
  };
}

function summarizeLegend(value: unknown) {
  const legend = asRecord(value);
  if (!legend) {
    return null;
  }

  return {
    overlay: booleanValue(legend.overlay),
    position: stringValue(legend.position),
  };
}

function summarizeAxis(value: unknown) {
  const axis = asRecord(value);
  if (!axis) {
    return null;
  }

  const scaling = asRecord(axis.scaling) ?? {};

  return {
    crossesAt: primitiveValue(axis.crossesAt ?? scaling.crossesAt),
    majorGridLines: isRecord(axis.majorGridLines),
    majorUnit: primitiveValue(axis.majorUnit ?? scaling.majorUnit),
    maximum: primitiveValue(axis.maximum ?? axis.max ?? scaling.maximum ?? scaling.max),
    minimum: primitiveValue(axis.minimum ?? axis.min ?? scaling.minimum ?? scaling.min),
    numberFormat: stringValue(axis.numberFormat),
    position: stringValue(axis.position ?? axis.axisPosition),
  };
}

function summarizeShape(shapeElement: Record<string, unknown>) {
  const shape = asRecord(shapeElement.shape) ?? {};
  const line = asRecord(shape.line) ?? {};
  const lineFill = asRecord(line.fill);
  const bbox = asRecord(shapeElement.bbox) ?? {};

  return {
    fillColor: nestedColorValue(shape.fill),
    geometry: nullableNumberValue(shape.geometry),
    heightEmu: numberValue(bbox.heightEmu),
    id: stringValue(shapeElement.id),
    lineColor: nestedColorValue(lineFill),
    lineWidthEmu: numberValue(line.widthEmu),
    name: stringValue(shapeElement.name),
    type: nullableNumberValue(shapeElement.type),
    widthEmu: numberValue(bbox.widthEmu),
  };
}

function summarizeImageReference(imageReference: Record<string, unknown>) {
  return {
    id: stringValue(imageReference.id),
    relationshipId: stringValue(imageReference.relationshipId),
  };
}

function summarizeWorkbookImage(image: Record<string, unknown>) {
  return {
    contentType: stringValue(image.contentType),
    height: numberValue(image.height),
    id: stringValue(image.id),
    name: stringValue(image.name),
    relationshipId: stringValue(image.relationshipId),
    width: numberValue(image.width),
  };
}

function summarizeStyleContract(styles: Record<string, unknown>) {
  const fonts = arrayOfRecords(styles.fonts);
  const fills = arrayOfRecords(styles.fills);
  const borders = arrayOfRecords(styles.borders);
  const cellXfs = arrayOfRecords(styles.cellXfs);
  const numberFormats = arrayOfRecords(styles.numberFormats);

  return {
    counts: {
      borderCount: borders.length,
      cellFormatCount: cellXfs.length,
      fillCount: fills.length,
      fontCount: fonts.length,
      numberFormatCount: numberFormats.length,
    },
    hashes: {
      borders: jsonHash(borders),
      cellXfs: jsonHash(cellXfs),
      fills: jsonHash(fills),
      fonts: jsonHash(fonts),
      numberFormats: jsonHash(numberFormats),
    },
  };
}

function summarizeColor(value: unknown) {
  const color = asRecord(value);
  if (!color) {
    return null;
  }

  return {
    lastColor: stringValue(color.lastColor),
    transform: stringValue(color.transform),
    type: nullableNumberValue(color.type),
    value: stringValue(color.value),
  };
}

function summarizeRenderEquivalence(walnut: WorkbookRenderContract, routa: WorkbookRenderContract) {
  return {
    byteProtoExactMatch: walnut.proto.byteLength === routa.proto.byteLength && walnut.proto.sha256 === routa.proto.sha256,
    chartRenderContractMatch: stableJson(sheetDrawingProjection(walnut, "chart")) === stableJson(sheetDrawingProjection(routa, "chart")),
    conditionalRenderContractMatch:
      stableJson(walnut.sheets.map((sheet) => ({ name: sheet.name, conditionalFormattings: sheet.conditionalFormattings }))) ===
      stableJson(routa.sheets.map((sheet) => ({ name: sheet.name, conditionalFormattings: sheet.conditionalFormattings }))),
    dataValidationContractMatch:
      stableJson(walnut.sheets.map((sheet) => ({ name: sheet.name, dataValidations: sheet.dataValidations }))) ===
      stableJson(routa.sheets.map((sheet) => ({ name: sheet.name, dataValidations: sheet.dataValidations }))),
    drawingRenderContractMatch:
      stableJson(walnut.sheets.map((sheet) => ({ name: sheet.name, drawings: sheet.drawings }))) ===
      stableJson(routa.sheets.map((sheet) => ({ name: sheet.name, drawings: sheet.drawings }))),
    imageRenderContractMatch:
      stableJson(walnut.workbookImages) === stableJson(routa.workbookImages) &&
      stableJson(sheetDrawingProjection(walnut, "image")) === stableJson(sheetDrawingProjection(routa, "image")),
    layoutColumnsMatch:
      stableJson(walnut.sheets.map((sheet) => ({ name: sheet.name, columns: sheet.columns }))) ===
      stableJson(routa.sheets.map((sheet) => ({ name: sheet.name, columns: sheet.columns }))),
    layoutRowsMatch:
      stableJson(walnut.sheets.map((sheet) => ({ name: sheet.name, rowLayout: sheet.rowLayout }))) ===
      stableJson(routa.sheets.map((sheet) => ({ name: sheet.name, rowLayout: sheet.rowLayout }))),
    mergedCellsMatch:
      stableJson(walnut.sheets.map((sheet) => ({ name: sheet.name, mergedCells: sheet.mergedCells }))) ===
      stableJson(routa.sheets.map((sheet) => ({ name: sheet.name, mergedCells: sheet.mergedCells }))),
    sameTopLevelProtocol: walnut.protocol === routa.protocol,
    shapeRenderContractMatch: stableJson(sheetDrawingProjection(walnut, "shape")) === stableJson(sheetDrawingProjection(routa, "shape")),
    sheetNamesMatch: stableJson(walnut.sheets.map((sheet) => sheet.name)) === stableJson(routa.sheets.map((sheet) => sheet.name)),
    sparklineRenderContractMatch:
      stableJson(walnut.sheets.map((sheet) => ({ name: sheet.name, sparklineGroups: sheet.sparklineGroups }))) ===
      stableJson(routa.sheets.map((sheet) => ({ name: sheet.name, sparklineGroups: sheet.sparklineGroups }))),
    styleRenderContractMatch: stableJson(walnut.styleContract) === stableJson(routa.styleContract),
    tableRenderContractMatch:
      stableJson(walnut.sheets.map((sheet) => ({ name: sheet.name, tables: sheet.tables }))) ===
      stableJson(routa.sheets.map((sheet) => ({ name: sheet.name, tables: sheet.tables }))),
  };
}

function summarizeRenderGaps(
  walnut: WorkbookRenderContract,
  routa: WorkbookRenderContract,
  equivalence: ReturnType<typeof summarizeRenderEquivalence>,
): RenderContractGap[] {
  const gaps: RenderContractGap[] = [];
  if (!equivalence.byteProtoExactMatch) {
    gaps.push({
      actual: routa.proto,
      area: "protoBytes",
      expected: walnut.proto,
    });
  }

  if (!equivalence.styleRenderContractMatch) {
    gaps.push({
      actual: routa.styleContract.counts,
      area: "styles",
      detail: {
        routaHashes: routa.styleContract.hashes,
        walnutHashes: walnut.styleContract.hashes,
      },
      expected: walnut.styleContract.counts,
    });
  }

  for (const walnutSheet of walnut.sheets) {
    const routaSheet = routa.sheets.find((sheet) => sheet.name === walnutSheet.name);
    if (!routaSheet) {
      gaps.push({
        actual: null,
        area: `sheet:${walnutSheet.name}`,
        expected: "present",
      });
      continue;
    }

    addSheetGap(gaps, walnutSheet.name, "columns", walnutSheet.columns, routaSheet.columns);
    addSheetGap(gaps, walnutSheet.name, "rowLayout", walnutSheet.rowLayout, routaSheet.rowLayout);
    addSheetGap(gaps, walnutSheet.name, "mergedCells", walnutSheet.mergedCells, routaSheet.mergedCells);
    addSheetGap(gaps, walnutSheet.name, "tables", walnutSheet.tables, routaSheet.tables);
    addSheetGap(
      gaps,
      walnutSheet.name,
      "conditionalFormattings",
      walnutSheet.conditionalFormattings,
      routaSheet.conditionalFormattings,
    );
    addSheetGap(gaps, walnutSheet.name, "dataValidations", walnutSheet.dataValidations, routaSheet.dataValidations);
    addSheetGap(gaps, walnutSheet.name, "sparklineGroups", walnutSheet.sparklineGroups, routaSheet.sparklineGroups);
    addSheetGap(gaps, walnutSheet.name, "drawings", walnutSheet.drawings, routaSheet.drawings, {
      routaSummary: routaSheet.drawingSummary,
      walnutSummary: walnutSheet.drawingSummary,
    });
  }

  return gaps;
}

function addSheetGap(
  gaps: RenderContractGap[],
  sheetName: string,
  area: string,
  expected: unknown,
  actual: unknown,
  detail?: unknown,
): void {
  if (stableJson(expected) === stableJson(actual)) {
    return;
  }

  gaps.push({
    actual: summarizeGapPayload(actual),
    area: `sheet:${sheetName}:${area}`,
    detail: {
      ...(isRecord(detail) ? detail : {}),
      firstDiff: firstDiff(expected, actual),
    },
    expected: summarizeGapPayload(expected),
  });
}

function summarizeGapPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return {
      count: value.length,
      hash: jsonHash(value),
      samples: sampleEdges(value),
    };
  }

  if (!isRecord(value)) {
    return value;
  }

  const serialized = stableJson(value);
  if (serialized.length <= 2000) {
    return value;
  }

  return {
    hash: jsonHash(value),
    keys: Object.keys(value).sort(),
  };
}

function firstDiff(expected: unknown, actual: unknown, pathLabel = "$"): unknown {
  if (stableJson(expected) === stableJson(actual)) {
    return null;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const maxLength = Math.max(expected.length, actual.length);
    for (let index = 0; index < maxLength; index++) {
      const diff = firstDiff(expected[index], actual[index], `${pathLabel}[${index}]`);
      if (diff) {
        return diff;
      }
    }
  }

  if (isRecord(expected) && isRecord(actual)) {
    const keys = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort();
    for (const key of keys) {
      const diff = firstDiff(expected[key], actual[key], `${pathLabel}.${key}`);
      if (diff) {
        return diff;
      }
    }
  }

  return {
    actual,
    expected,
    path: pathLabel,
  };
}

function summarizeRenderParity(equivalence: ReturnType<typeof summarizeRenderEquivalence>) {
  const checks = Object.entries(equivalence).filter(([, value]) => typeof value === "boolean");
  const failedChecks = checks.filter(([, value]) => value !== true).map(([key]) => key);

  return {
    failedChecks,
    passedChecks: checks.length - failedChecks.length,
    renderParityPercent: checks.length === 0 ? 100 : Number((((checks.length - failedChecks.length) / checks.length) * 100).toFixed(2)),
    totalChecks: checks.length,
  };
}

function assertStableRenderContract(result: XlsxRenderContractResult): void {
  const requiredChecks: Array<keyof XlsxRenderContractResult["equivalence"]> = [
    "sameTopLevelProtocol",
    "sheetNamesMatch",
    "layoutColumnsMatch",
    "layoutRowsMatch",
    "mergedCellsMatch",
    "tableRenderContractMatch",
    "conditionalRenderContractMatch",
    "dataValidationContractMatch",
    "sparklineRenderContractMatch",
    "drawingRenderContractMatch",
    "imageRenderContractMatch",
    "shapeRenderContractMatch",
    "chartRenderContractMatch",
    "styleRenderContractMatch",
  ];
  const failures = requiredChecks.filter((key) => result.equivalence[key] !== true);
  if (failures.length > 0) {
    throw new Error(`XLSX render contract failed for ${result.fixture}: ${failures.join(", ")}`);
  }
}

function sheetDrawingProjection(workbook: WorkbookRenderContract, kind: "chart" | "image" | "shape") {
  return workbook.sheets.map((sheet) => ({
    drawings: sheet.drawings.filter((drawing) => drawing.kind === kind),
    name: sheet.name,
  }));
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

function sampleEdges<T>(values: T[]): T[] {
  if (values.length <= 4) {
    return values;
  }

  return [values[0], values[1], values[values.length - 2], values[values.length - 1]];
}

function rangeTargetText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const range = asRecord(value);
  if (!range) {
    return "";
  }

  const startAddress = stringValue(range.startAddress);
  const endAddress = stringValue(range.endAddress);
  if (!startAddress) {
    return "";
  }

  return endAddress && endAddress !== startAddress ? `${startAddress}:${endAddress}` : startAddress;
}

function nestedColorValue(value: unknown): string {
  const record = asRecord(value);
  return stringValue(asRecord(record?.color)?.value);
}

function moduleWithExport(moduleValue: unknown, exportName: string): unknown {
  const root = moduleRoot(moduleValue);
  if (isRecord(root) && exportName in root) {
    return root;
  }

  if (isRecord(moduleValue) && exportName in moduleValue) {
    return moduleValue;
  }

  throw new Error(`Could not load ${exportName} export.`);
}

function moduleRoot(moduleValue: unknown): unknown {
  if (!isRecord(moduleValue)) {
    return moduleValue;
  }

  return moduleValue.default ?? moduleValue["module.exports"] ?? moduleValue;
}

function assertFile(filePath: string, label: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function flagValue(value: unknown): boolean {
  return value === true;
}

function primitiveValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return value == null ? null : String(value);
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function dataValidationItems(value: unknown): Array<Record<string, unknown>> {
  const record = asRecord(value);
  return record ? arrayOfRecords(record.items) : arrayOfRecords(value);
}

function arrayOfPrimitiveValues(value: unknown): Array<string | number | boolean | null> {
  return Array.isArray(value) ? value.map(primitiveValue) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toUint8Array(value: Uint8Array | ArrayBuffer | number[]): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return Uint8Array.from(value);
}

function jsonHash(value: unknown): string {
  return sha256(Buffer.from(stableJson(value)));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
