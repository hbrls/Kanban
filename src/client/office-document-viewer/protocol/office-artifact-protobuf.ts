import {
  emptyRoutaOfficeArtifact,
  type RoutaOfficeArtifact,
  type RoutaOfficeBorderStyle,
  type RoutaOfficeCell,
  type RoutaOfficeCellFormat,
  type RoutaOfficeChart,
  type RoutaOfficeChartAnchor,
  type RoutaOfficeChartSeries,
  type RoutaOfficeColorScale,
  type RoutaOfficeColumn,
  type RoutaOfficeConditionalFormat,
  type RoutaOfficeDataBar,
  type RoutaOfficeDataValidation,
  type RoutaOfficeDiagnostic,
  type RoutaOfficeFillStyle,
  type RoutaOfficeFontStyle,
  type RoutaOfficeIconSet,
  type RoutaOfficeImageAsset,
  type RoutaOfficeMergedRange,
  type RoutaOfficeNumberFormat,
  type RoutaOfficeRow,
  type RoutaOfficeSheet,
  type RoutaOfficeSheetTable,
  type RoutaOfficeSpreadsheetShape,
  type RoutaOfficeSpreadsheetStyles,
  type RoutaOfficeSlide,
  type RoutaOfficeTable,
  type RoutaOfficeTextBlock,
} from "./office-artifact-types";

const WIRE_VARINT = 0;
const WIRE_64_BIT = 1;
const WIRE_LENGTH_DELIMITED = 2;
const textDecoder = new TextDecoder();

class ProtoReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.bytes.length;
  }

  readTag(): { fieldNumber: number; wireType: number } {
    const tag = this.readVarint();
    return {
      fieldNumber: Math.floor(tag / 8),
      wireType: tag % 8,
    };
  }

  readVarint(): number {
    let result = 0;
    let shift = 0;

    while (shift <= 49) {
      const byte = this.readByte();
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) {
        return result;
      }
      shift += 7;
    }

    throw new Error("Invalid protobuf varint");
  }

  readString(): string {
    return textDecoder.decode(this.readBytes());
  }

  readBytes(): Uint8Array {
    const length = this.readVarint();
    this.ensureAvailable(length);
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readDouble(): number {
    this.ensureAvailable(8);
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8);
    const value = view.getFloat64(0, true);
    this.offset += 8;
    return value;
  }

  skip(wireType: number): void {
    if (wireType === WIRE_VARINT) {
      this.readVarint();
      return;
    }

    if (wireType === WIRE_LENGTH_DELIMITED) {
      this.readBytes();
      return;
    }

    if (wireType === WIRE_64_BIT) {
      this.ensureAvailable(8);
      this.offset += 8;
      return;
    }

    throw new Error(`Unsupported protobuf wire type: ${wireType}`);
  }

  private readByte(): number {
    this.ensureAvailable(1);
    return this.bytes[this.offset++];
  }

  private ensureAvailable(length: number): void {
    if (length < 0 || this.offset + length > this.bytes.length) {
      throw new Error("Unexpected end of protobuf payload");
    }
  }
}

export function decodeRoutaOfficeArtifact(bytes: Uint8Array): RoutaOfficeArtifact {
  const reader = new ProtoReader(bytes);
  const artifact = emptyRoutaOfficeArtifact();

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    switch (fieldNumber) {
      case 1:
        artifact.sourceKind = readStringField(reader, wireType);
        break;
      case 2:
        artifact.title = readStringField(reader, wireType);
        break;
      case 3:
        artifact.textBlocks.push(decodeTextBlock(readMessageField(reader, wireType)));
        break;
      case 4:
        artifact.sheets.push(decodeSheet(readMessageField(reader, wireType)));
        break;
      case 5:
        artifact.slides.push(decodeSlide(readMessageField(reader, wireType)));
        break;
      case 6:
        artifact.diagnostics.push(decodeDiagnostic(readMessageField(reader, wireType)));
        break;
      case 7: {
        const [key, value] = decodeMetadata(readMessageField(reader, wireType));
        if (key) artifact.metadata[key] = value;
        break;
      }
      case 8:
        artifact.images.push(decodeImage(readMessageField(reader, wireType)));
        break;
      case 9:
        artifact.tables.push(decodeTable(readMessageField(reader, wireType)));
        break;
      case 10:
        artifact.charts.push(decodeChart(readMessageField(reader, wireType)));
        break;
      case 11:
        artifact.styles = decodeSpreadsheetStyles(readMessageField(reader, wireType));
        break;
      case 12:
        artifact.shapes.push(decodeSpreadsheetShape(readMessageField(reader, wireType)));
        break;
      default:
        reader.skip(wireType);
    }
  }

  return artifact;
}

function decodeTextBlock(bytes: Uint8Array): RoutaOfficeTextBlock {
  const reader = new ProtoReader(bytes);
  const block: RoutaOfficeTextBlock = { path: "", text: "" };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) block.path = readStringField(reader, wireType);
    else if (fieldNumber === 2) block.text = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return block;
}

function decodeSheet(bytes: Uint8Array): RoutaOfficeSheet {
  const reader = new ProtoReader(bytes);
  const sheet: RoutaOfficeSheet = {
    conditionalFormats: [],
    dataValidations: [],
    defaultColWidth: 0,
    defaultRowHeight: 0,
    mergedRanges: [],
    name: "",
    rows: [],
    tables: [],
    columns: [],
  };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) sheet.name = readStringField(reader, wireType);
    else if (fieldNumber === 2) sheet.rows.push(decodeRow(readMessageField(reader, wireType)));
    else if (fieldNumber === 3) sheet.mergedRanges.push(decodeMergedRange(readMessageField(reader, wireType)));
    else if (fieldNumber === 4) sheet.tables.push(decodeSheetTable(readMessageField(reader, wireType)));
    else if (fieldNumber === 5) sheet.dataValidations.push(decodeDataValidation(readMessageField(reader, wireType)));
    else if (fieldNumber === 6) sheet.conditionalFormats.push(decodeConditionalFormat(readMessageField(reader, wireType)));
    else if (fieldNumber === 7) sheet.columns.push(decodeColumn(readMessageField(reader, wireType)));
    else if (fieldNumber === 8) sheet.defaultColWidth = readDoubleField(reader, wireType);
    else if (fieldNumber === 9) sheet.defaultRowHeight = readDoubleField(reader, wireType);
    else reader.skip(wireType);
  }

  return sheet;
}

function decodeTable(bytes: Uint8Array): RoutaOfficeTable {
  const reader = new ProtoReader(bytes);
  const table: RoutaOfficeTable = { path: "", rows: [] };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) table.path = readStringField(reader, wireType);
    else if (fieldNumber === 2) table.rows.push(decodeRow(readMessageField(reader, wireType)));
    else reader.skip(wireType);
  }

  return table;
}

function decodeRow(bytes: Uint8Array): RoutaOfficeRow {
  const reader = new ProtoReader(bytes);
  const row: RoutaOfficeRow = { cells: [], height: 0, index: 0 };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) row.cells.push(decodeCell(readMessageField(reader, wireType)));
    else if (fieldNumber === 2) row.index = readUInt32Field(reader, wireType);
    else if (fieldNumber === 3) row.height = readDoubleField(reader, wireType);
    else reader.skip(wireType);
  }

  return row;
}

function decodeCell(bytes: Uint8Array): RoutaOfficeCell {
  const reader = new ProtoReader(bytes);
  const cell: RoutaOfficeCell = {
    address: "",
    dataType: "",
    formula: "",
    hasValue: true,
    styleIndex: 0,
    text: "",
  };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) cell.address = readStringField(reader, wireType);
    else if (fieldNumber === 2) cell.text = readStringField(reader, wireType);
    else if (fieldNumber === 3) cell.formula = readStringField(reader, wireType);
    else if (fieldNumber === 4) cell.dataType = readStringField(reader, wireType);
    else if (fieldNumber === 5) cell.styleIndex = readUInt32Field(reader, wireType);
    else if (fieldNumber === 6) cell.hasValue = readBoolField(reader, wireType);
    else reader.skip(wireType);
  }

  return cell;
}

function decodeSlide(bytes: Uint8Array): RoutaOfficeSlide {
  const reader = new ProtoReader(bytes);
  const slide: RoutaOfficeSlide = { index: 0, textBlocks: [], title: "" };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) slide.index = readUInt32Field(reader, wireType);
    else if (fieldNumber === 2) slide.title = readStringField(reader, wireType);
    else if (fieldNumber === 3) slide.textBlocks.push(decodeTextBlock(readMessageField(reader, wireType)));
    else reader.skip(wireType);
  }

  return slide;
}

function decodeDiagnostic(bytes: Uint8Array): RoutaOfficeDiagnostic {
  const reader = new ProtoReader(bytes);
  const diagnostic: RoutaOfficeDiagnostic = { level: "", message: "" };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) diagnostic.level = readStringField(reader, wireType);
    else if (fieldNumber === 2) diagnostic.message = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return diagnostic;
}

function decodeMetadata(bytes: Uint8Array): [string, string] {
  const reader = new ProtoReader(bytes);
  let key = "";
  let value = "";

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) key = readStringField(reader, wireType);
    else if (fieldNumber === 2) value = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return [key, value];
}

function decodeImage(bytes: Uint8Array): RoutaOfficeImageAsset {
  const reader = new ProtoReader(bytes);
  const image: RoutaOfficeImageAsset = { bytes: new Uint8Array(), contentType: "", id: "", path: "" };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) image.id = readStringField(reader, wireType);
    else if (fieldNumber === 2) image.path = readStringField(reader, wireType);
    else if (fieldNumber === 3) image.contentType = readStringField(reader, wireType);
    else if (fieldNumber === 4) image.bytes = readMessageField(reader, wireType);
    else reader.skip(wireType);
  }

  return image;
}

function decodeChart(bytes: Uint8Array): RoutaOfficeChart {
  const reader = new ProtoReader(bytes);
  const chart: RoutaOfficeChart = { chartType: "", id: "", path: "", series: [], sheetName: "", title: "" };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) chart.id = readStringField(reader, wireType);
    else if (fieldNumber === 2) chart.path = readStringField(reader, wireType);
    else if (fieldNumber === 3) chart.title = readStringField(reader, wireType);
    else if (fieldNumber === 4) chart.chartType = readStringField(reader, wireType);
    else if (fieldNumber === 5) chart.sheetName = readStringField(reader, wireType);
    else if (fieldNumber === 6) chart.anchor = decodeChartAnchor(readMessageField(reader, wireType));
    else if (fieldNumber === 7) chart.series.push(decodeChartSeries(readMessageField(reader, wireType)));
    else reader.skip(wireType);
  }

  return chart;
}

function decodeChartAnchor(bytes: Uint8Array): RoutaOfficeChartAnchor {
  const reader = new ProtoReader(bytes);
  const anchor: RoutaOfficeChartAnchor = {
    fromCol: 0,
    fromColOffsetEmu: 0,
    fromRow: 0,
    fromRowOffsetEmu: 0,
    toCol: 0,
    toColOffsetEmu: 0,
    toRow: 0,
    toRowOffsetEmu: 0,
  };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) anchor.fromCol = readUInt32Field(reader, wireType);
    else if (fieldNumber === 2) anchor.fromRow = readUInt32Field(reader, wireType);
    else if (fieldNumber === 3) anchor.toCol = readUInt32Field(reader, wireType);
    else if (fieldNumber === 4) anchor.toRow = readUInt32Field(reader, wireType);
    else if (fieldNumber === 5) anchor.fromColOffsetEmu = readDoubleField(reader, wireType);
    else if (fieldNumber === 6) anchor.fromRowOffsetEmu = readDoubleField(reader, wireType);
    else if (fieldNumber === 7) anchor.toColOffsetEmu = readDoubleField(reader, wireType);
    else if (fieldNumber === 8) anchor.toRowOffsetEmu = readDoubleField(reader, wireType);
    else reader.skip(wireType);
  }

  return anchor;
}

function decodeChartSeries(bytes: Uint8Array): RoutaOfficeChartSeries {
  const reader = new ProtoReader(bytes);
  const series: RoutaOfficeChartSeries = { categories: [], color: "", label: "", values: [] };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) series.label = readStringField(reader, wireType);
    else if (fieldNumber === 2) series.categories.push(readStringField(reader, wireType));
    else if (fieldNumber === 3) series.values.push(readDoubleField(reader, wireType));
    else if (fieldNumber === 4) series.color = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return series;
}

function decodeSpreadsheetShape(bytes: Uint8Array): RoutaOfficeSpreadsheetShape {
  const reader = new ProtoReader(bytes);
  const shape: RoutaOfficeSpreadsheetShape = {
    fillColor: "",
    fromCol: 0,
    fromColOffsetEmu: 0,
    fromRow: 0,
    fromRowOffsetEmu: 0,
    geometry: "",
    heightEmu: 0,
    id: "",
    lineColor: "",
    sheetName: "",
    text: "",
    widthEmu: 0,
  };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) shape.id = readStringField(reader, wireType);
    else if (fieldNumber === 2) shape.sheetName = readStringField(reader, wireType);
    else if (fieldNumber === 3) shape.fromCol = readUInt32Field(reader, wireType);
    else if (fieldNumber === 4) shape.fromRow = readUInt32Field(reader, wireType);
    else if (fieldNumber === 5) shape.fromColOffsetEmu = readDoubleField(reader, wireType);
    else if (fieldNumber === 6) shape.fromRowOffsetEmu = readDoubleField(reader, wireType);
    else if (fieldNumber === 7) shape.widthEmu = readDoubleField(reader, wireType);
    else if (fieldNumber === 8) shape.heightEmu = readDoubleField(reader, wireType);
    else if (fieldNumber === 9) shape.fillColor = readStringField(reader, wireType);
    else if (fieldNumber === 10) shape.lineColor = readStringField(reader, wireType);
    else if (fieldNumber === 11) shape.text = readStringField(reader, wireType);
    else if (fieldNumber === 12) shape.geometry = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return shape;
}

function decodeMergedRange(bytes: Uint8Array): RoutaOfficeMergedRange {
  const reader = new ProtoReader(bytes);
  const range: RoutaOfficeMergedRange = { reference: "" };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) range.reference = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return range;
}

function decodeSheetTable(bytes: Uint8Array): RoutaOfficeSheetTable {
  const reader = new ProtoReader(bytes);
  const table: RoutaOfficeSheetTable = { name: "", reference: "", showFilterButton: true, style: "" };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) table.name = readStringField(reader, wireType);
    else if (fieldNumber === 2) table.reference = readStringField(reader, wireType);
    else if (fieldNumber === 3) table.style = readStringField(reader, wireType);
    else if (fieldNumber === 4) table.showFilterButton = readBoolField(reader, wireType);
    else reader.skip(wireType);
  }

  return table;
}

function decodeDataValidation(bytes: Uint8Array): RoutaOfficeDataValidation {
  const reader = new ProtoReader(bytes);
  const validation: RoutaOfficeDataValidation = {
    formula1: "",
    formula2: "",
    operator: "",
    ranges: [],
    type: "",
  };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) validation.type = readStringField(reader, wireType);
    else if (fieldNumber === 2) validation.operator = readStringField(reader, wireType);
    else if (fieldNumber === 3) validation.formula1 = readStringField(reader, wireType);
    else if (fieldNumber === 4) validation.formula2 = readStringField(reader, wireType);
    else if (fieldNumber === 5) validation.ranges.push(readStringField(reader, wireType));
    else reader.skip(wireType);
  }

  return validation;
}

function decodeConditionalFormat(bytes: Uint8Array): RoutaOfficeConditionalFormat {
  const reader = new ProtoReader(bytes);
  const format: RoutaOfficeConditionalFormat = {
    bold: false,
    fillColor: "",
    fontColor: "",
    formulas: [],
    operator: "",
    priority: 0,
    ranges: [],
    text: "",
    type: "",
  };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) format.type = readStringField(reader, wireType);
    else if (fieldNumber === 2) format.priority = readUInt32Field(reader, wireType);
    else if (fieldNumber === 3) format.ranges.push(readStringField(reader, wireType));
    else if (fieldNumber === 4) format.operator = readStringField(reader, wireType);
    else if (fieldNumber === 5) format.formulas.push(readStringField(reader, wireType));
    else if (fieldNumber === 6) format.text = readStringField(reader, wireType);
    else if (fieldNumber === 7) format.fillColor = readStringField(reader, wireType);
    else if (fieldNumber === 8) format.fontColor = readStringField(reader, wireType);
    else if (fieldNumber === 9) format.bold = readBoolField(reader, wireType);
    else if (fieldNumber === 10) format.colorScale = decodeColorScale(readMessageField(reader, wireType));
    else if (fieldNumber === 11) format.dataBar = decodeDataBar(readMessageField(reader, wireType));
    else if (fieldNumber === 12) format.iconSet = decodeIconSet(readMessageField(reader, wireType));
    else reader.skip(wireType);
  }

  return format;
}

function decodeColumn(bytes: Uint8Array): RoutaOfficeColumn {
  const reader = new ProtoReader(bytes);
  const column: RoutaOfficeColumn = { hidden: false, max: 0, min: 0, width: 0 };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) column.min = readUInt32Field(reader, wireType);
    else if (fieldNumber === 2) column.max = readUInt32Field(reader, wireType);
    else if (fieldNumber === 3) column.width = readDoubleField(reader, wireType);
    else if (fieldNumber === 4) column.hidden = readBoolField(reader, wireType);
    else reader.skip(wireType);
  }

  return column;
}

function decodeSpreadsheetStyles(bytes: Uint8Array): RoutaOfficeSpreadsheetStyles {
  const reader = new ProtoReader(bytes);
  const styles: RoutaOfficeSpreadsheetStyles = {
    borders: [],
    cellXfs: [],
    fills: [],
    fonts: [],
    numberFormats: [],
  };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) styles.numberFormats.push(decodeNumberFormat(readMessageField(reader, wireType)));
    else if (fieldNumber === 2) styles.cellXfs.push(decodeCellFormat(readMessageField(reader, wireType)));
    else if (fieldNumber === 3) styles.fonts.push(decodeFontStyle(readMessageField(reader, wireType)));
    else if (fieldNumber === 4) styles.fills.push(decodeFillStyle(readMessageField(reader, wireType)));
    else if (fieldNumber === 5) styles.borders.push(decodeBorderStyle(readMessageField(reader, wireType)));
    else reader.skip(wireType);
  }

  return styles;
}

function decodeNumberFormat(bytes: Uint8Array): RoutaOfficeNumberFormat {
  const reader = new ProtoReader(bytes);
  const format: RoutaOfficeNumberFormat = { formatCode: "", id: 0 };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) format.id = readUInt32Field(reader, wireType);
    else if (fieldNumber === 2) format.formatCode = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return format;
}

function decodeCellFormat(bytes: Uint8Array): RoutaOfficeCellFormat {
  const reader = new ProtoReader(bytes);
  const format: RoutaOfficeCellFormat = {
    borderId: 0,
    fillId: 0,
    fontId: 0,
    horizontalAlignment: "",
    numFmtId: 0,
    verticalAlignment: "",
  };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) format.numFmtId = readUInt32Field(reader, wireType);
    else if (fieldNumber === 2) format.fontId = readUInt32Field(reader, wireType);
    else if (fieldNumber === 3) format.fillId = readUInt32Field(reader, wireType);
    else if (fieldNumber === 4) format.borderId = readUInt32Field(reader, wireType);
    else if (fieldNumber === 5) format.horizontalAlignment = readStringField(reader, wireType);
    else if (fieldNumber === 6) format.verticalAlignment = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return format;
}

function decodeFontStyle(bytes: Uint8Array): RoutaOfficeFontStyle {
  const reader = new ProtoReader(bytes);
  const font: RoutaOfficeFontStyle = { bold: false, color: "", fontSize: 0, italic: false, typeface: "" };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) font.bold = readBoolField(reader, wireType);
    else if (fieldNumber === 2) font.italic = readBoolField(reader, wireType);
    else if (fieldNumber === 3) font.fontSize = readDoubleField(reader, wireType);
    else if (fieldNumber === 4) font.typeface = readStringField(reader, wireType);
    else if (fieldNumber === 5) font.color = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return font;
}

function decodeFillStyle(bytes: Uint8Array): RoutaOfficeFillStyle {
  const reader = new ProtoReader(bytes);
  const fill: RoutaOfficeFillStyle = { color: "" };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) fill.color = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return fill;
}

function decodeBorderStyle(bytes: Uint8Array): RoutaOfficeBorderStyle {
  const reader = new ProtoReader(bytes);
  const border: RoutaOfficeBorderStyle = { bottomColor: "" };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) border.bottomColor = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return border;
}

function decodeColorScale(bytes: Uint8Array): RoutaOfficeColorScale {
  const reader = new ProtoReader(bytes);
  const colorScale: RoutaOfficeColorScale = { colors: [] };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) colorScale.colors.push(readStringField(reader, wireType));
    else reader.skip(wireType);
  }

  return colorScale;
}

function decodeDataBar(bytes: Uint8Array): RoutaOfficeDataBar {
  const reader = new ProtoReader(bytes);
  const dataBar: RoutaOfficeDataBar = { color: "" };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) dataBar.color = readStringField(reader, wireType);
    else reader.skip(wireType);
  }

  return dataBar;
}

function decodeIconSet(bytes: Uint8Array): RoutaOfficeIconSet {
  const reader = new ProtoReader(bytes);
  const iconSet: RoutaOfficeIconSet = { name: "", reverse: false, showValue: true };

  while (!reader.done) {
    const { fieldNumber, wireType } = reader.readTag();
    if (fieldNumber === 1) iconSet.name = readStringField(reader, wireType);
    else if (fieldNumber === 2) iconSet.showValue = readBoolField(reader, wireType);
    else if (fieldNumber === 3) iconSet.reverse = readBoolField(reader, wireType);
    else reader.skip(wireType);
  }

  return iconSet;
}

function readStringField(reader: ProtoReader, wireType: number): string {
  expectWireType(wireType, WIRE_LENGTH_DELIMITED);
  return reader.readString();
}

function readMessageField(reader: ProtoReader, wireType: number): Uint8Array {
  expectWireType(wireType, WIRE_LENGTH_DELIMITED);
  return reader.readBytes();
}

function readUInt32Field(reader: ProtoReader, wireType: number): number {
  expectWireType(wireType, WIRE_VARINT);
  return reader.readVarint();
}

function readBoolField(reader: ProtoReader, wireType: number): boolean {
  expectWireType(wireType, WIRE_VARINT);
  return reader.readVarint() !== 0;
}

function readDoubleField(reader: ProtoReader, wireType: number): number {
  expectWireType(wireType, WIRE_64_BIT);
  return reader.readDouble();
}

function expectWireType(actual: number, expected: number): void {
  if (actual !== expected) {
    throw new Error(`Invalid protobuf wire type: expected ${expected}, got ${actual}`);
  }
}
