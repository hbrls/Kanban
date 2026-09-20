export type OfficeArtifactKind = "csv" | "tsv" | "docx" | "pptx" | "xlsx";

export type OfficeWasmArtifactKind = Extract<OfficeArtifactKind, "docx" | "pptx" | "xlsx">;

export interface RoutaOfficeTextBlock {
  path: string;
  text: string;
}

export interface RoutaOfficeCell {
  address: string;
  text: string;
  formula: string;
  dataType: string;
  styleIndex: number;
  hasValue: boolean;
}

export interface RoutaOfficeRow {
  cells: RoutaOfficeCell[];
  index: number;
  height: number;
}

export interface RoutaOfficeSheet {
  name: string;
  rows: RoutaOfficeRow[];
  mergedRanges: RoutaOfficeMergedRange[];
  tables: RoutaOfficeSheetTable[];
  dataValidations: RoutaOfficeDataValidation[];
  conditionalFormats: RoutaOfficeConditionalFormat[];
  columns: RoutaOfficeColumn[];
  defaultColWidth: number;
  defaultRowHeight: number;
}

export interface RoutaOfficeTable {
  path: string;
  rows: RoutaOfficeRow[];
}

export interface RoutaOfficeSlide {
  index: number;
  title: string;
  textBlocks: RoutaOfficeTextBlock[];
}

export interface RoutaOfficeDiagnostic {
  level: string;
  message: string;
}

export interface RoutaOfficeImageAsset {
  id: string;
  path: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface RoutaOfficeChart {
  id: string;
  path: string;
  title: string;
  chartType: string;
  sheetName: string;
  anchor?: RoutaOfficeChartAnchor;
  series: RoutaOfficeChartSeries[];
}

export interface RoutaOfficeChartAnchor {
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
  fromColOffsetEmu: number;
  fromRowOffsetEmu: number;
  toColOffsetEmu: number;
  toRowOffsetEmu: number;
}

export interface RoutaOfficeChartSeries {
  label: string;
  categories: string[];
  values: number[];
  color: string;
}

export interface RoutaOfficeSpreadsheetShape {
  id: string;
  sheetName: string;
  fromCol: number;
  fromRow: number;
  fromColOffsetEmu: number;
  fromRowOffsetEmu: number;
  widthEmu: number;
  heightEmu: number;
  fillColor: string;
  lineColor: string;
  text: string;
  geometry: string;
}

export interface RoutaOfficeMergedRange {
  reference: string;
}

export interface RoutaOfficeSheetTable {
  name: string;
  reference: string;
  style: string;
  showFilterButton: boolean;
}

export interface RoutaOfficeDataValidation {
  type: string;
  operator: string;
  formula1: string;
  formula2: string;
  ranges: string[];
}

export interface RoutaOfficeConditionalFormat {
  type: string;
  priority: number;
  ranges: string[];
  operator: string;
  formulas: string[];
  text: string;
  fillColor: string;
  fontColor: string;
  bold: boolean;
  colorScale?: RoutaOfficeColorScale;
  dataBar?: RoutaOfficeDataBar;
  iconSet?: RoutaOfficeIconSet;
}

export interface RoutaOfficeColumn {
  min: number;
  max: number;
  width: number;
  hidden: boolean;
}

export interface RoutaOfficeSpreadsheetStyles {
  numberFormats: RoutaOfficeNumberFormat[];
  cellXfs: RoutaOfficeCellFormat[];
  fonts: RoutaOfficeFontStyle[];
  fills: RoutaOfficeFillStyle[];
  borders: RoutaOfficeBorderStyle[];
}

export interface RoutaOfficeNumberFormat {
  id: number;
  formatCode: string;
}

export interface RoutaOfficeCellFormat {
  numFmtId: number;
  fontId: number;
  fillId: number;
  borderId: number;
  horizontalAlignment: string;
  verticalAlignment: string;
}

export interface RoutaOfficeFontStyle {
  bold: boolean;
  italic: boolean;
  fontSize: number;
  typeface: string;
  color: string;
}

export interface RoutaOfficeFillStyle {
  color: string;
}

export interface RoutaOfficeBorderStyle {
  bottomColor: string;
}

export interface RoutaOfficeColorScale {
  colors: string[];
}

export interface RoutaOfficeDataBar {
  color: string;
}

export interface RoutaOfficeIconSet {
  name: string;
  showValue: boolean;
  reverse: boolean;
}

export interface RoutaOfficeArtifact {
  sourceKind: string;
  title: string;
  textBlocks: RoutaOfficeTextBlock[];
  sheets: RoutaOfficeSheet[];
  slides: RoutaOfficeSlide[];
  diagnostics: RoutaOfficeDiagnostic[];
  metadata: Record<string, string>;
  images: RoutaOfficeImageAsset[];
  tables: RoutaOfficeTable[];
  charts: RoutaOfficeChart[];
  shapes: RoutaOfficeSpreadsheetShape[];
  styles: RoutaOfficeSpreadsheetStyles;
}

export function emptyRoutaOfficeArtifact(): RoutaOfficeArtifact {
  return {
    charts: [],
    diagnostics: [],
    images: [],
    metadata: {},
    shapes: [],
    sheets: [],
    slides: [],
    sourceKind: "",
    styles: {
      borders: [],
      cellXfs: [],
      fills: [],
      fonts: [],
      numberFormats: [],
    },
    tables: [],
    textBlocks: [],
    title: "",
  };
}
