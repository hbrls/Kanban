export type RecordValue = Record<string, unknown>;

export type PreviewLabels = {
  closeSlideshow: string;
  hideSpeakerNotes?: string;
  nextSlide: string;
  playSlideshow: string;
  previousSlide: string;
  showSpeakerNotes?: string;
  speakerNotes?: string;
  visualPreview: string;
  rawJson: string;
  sheet: string;
  slide: string;
  noSheets: string;
  noSlides: string;
  noDocumentBlocks: string;
  showingFirstRows: string;
  shapes: string;
  textRuns: string;
};

export type TextRunView = {
  hyperlink?: RecordValue | null;
  id: string;
  referenceMarkers?: string[];
  reviewMarkIds?: string[];
  reviewMarkTypes?: number[];
  text: string;
  style: RecordValue | null;
};

export type ParagraphView = {
  id: string;
  marker?: string;
  runs: TextRunView[];
  styleId: string;
  style: RecordValue | null;
};

export type OfficeTextStyleMaps = {
  textStyles: Map<string, RecordValue>;
  images: Map<string, string>;
};

export type CellMerge = {
  startColumn: number;
  startRow: number;
  columnSpan: number;
  rowSpan: number;
};

export const EXCEL_MAX_COLUMN_COUNT = 16_384;
export const EXCEL_MAX_ROW_COUNT = 1_048_576;

export const EMPTY_OFFICE_TEXT_STYLE_MAPS: OfficeTextStyleMaps = {
  textStyles: new Map(),
  images: new Map(),
};
