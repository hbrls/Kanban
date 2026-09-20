import { createHash } from "node:crypto";

import { loadSharp, type SharpFactory } from "./optional-sharp.js";
import { ProtoReader } from "./proto-reader.js";

export type CanvasMedia = {
  height: number;
  src: string;
  width: number;
};

export type DocumentBlock =
  | { kind: "image"; mediaId: string; path: string }
  | { kind: "paragraph"; paragraphs: DocumentParagraph[]; path: string; text: string }
  | { kind: "table"; path: string; rows: DocumentTableCell[][] };

export type DocumentParagraph = {
  align: "center" | "justify" | "left" | "right";
  indentPx?: number;
  marginBottomPx?: number;
  marginLeftPx?: number;
  marginTopPx?: number;
  runs: DocumentRun[];
};

export type DocumentRun = {
  background?: string;
  bold?: boolean;
  color?: string;
  fontSizePx?: number;
  italic?: boolean;
  text: string;
  textTransform?: "uppercase";
  typeface?: string;
  underline?: boolean;
};

export type DocumentTableCell = {
  paragraphs: DocumentParagraph[];
  text: string;
};

export type DocumentPayload = {
  artifact: {
    generatedBy: string;
    kind: "docx";
    reader: string;
    source: string;
    title: string;
  };
  blocks: DocumentBlock[];
  diagnostics: { level: string; message: string }[];
  media: Record<string, CanvasMedia>;
  page: {
    heightPx: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    widthPx: number;
  };
};

type OfficeArtifact = {
  blocks?: DocumentBlock[];
  diagnostics: { level: string; message: string }[];
  images: { bytes: Uint8Array; contentType: string; id: string; path: string }[];
  page?: { heightTwips: number; widthTwips: number };
  tables: { path: string; rows: { cells: { text: string }[] }[] }[];
  textBlocks: { path: string; text: string }[];
  title: string;
};

export type WorkbookCell = {
  address: string;
  background: string;
  bold: boolean;
  color: string;
  value: string;
};

export type WorkbookPayload = {
  artifact: {
    generatedBy: string;
    kind: "xlsx";
    reader: string;
    source: string;
    title: string;
  };
  sheets: {
    columns: { index: number; width: number }[];
    name: string;
    rows: { cells: WorkbookCell[]; height: number; index: number }[];
  }[];
};

type Workbook = {
  sheets: WorkbookSheet[];
  styles: WorkbookStyles;
};

type WorkbookSheet = {
  columns: { max: number; min: number; width: number }[];
  name: string;
  rows: { cells: WorkbookRawCell[]; height: number; index: number }[];
};

type WorkbookRawCell = {
  address: string;
  styleIndex: number;
  text: string;
};

type WorkbookStyles = {
  cellFormats: { fillId: number; fontId: number }[];
  fills: { color?: string }[];
  fonts: { bold: boolean; color?: string }[];
};

export type RenderOfficeCursorCanvasOptions = {
  maxColumns?: number;
  maxRows?: number;
  mediaQuality?: number;
  mediaWidth?: number;
  readerVersion: string;
  sourceLabel?: string;
  sourcePath?: string;
  title: string;
};

export async function renderDocxCursorCanvasSource(
  protoBytes: Uint8Array,
  options: RenderOfficeCursorCanvasOptions,
): Promise<string> {
  const payload = await buildDocxCursorCanvasPayload(protoBytes, options);
  return renderDocxCursorCanvasSourceFromPayload(payload);
}

export async function buildDocxCursorCanvasPayload(
  protoBytes: Uint8Array,
  options: RenderOfficeCursorCanvasOptions,
): Promise<DocumentPayload> {
  const document = decodeDocxDocument(protoBytes, options.title);
  const artifact =
    document.textBlocks.length > 0 ||
    document.tables.length > 0 ||
    document.images.length > 0
      ? document
      : decodeOfficeArtifact(protoBytes);
  return buildDocumentPayload(artifact, options);
}

export function renderDocxCursorCanvasSourceFromPayload(
  payload: DocumentPayload,
): string {
  return renderDocumentCanvasSource(payload);
}

export function renderXlsxCursorCanvasSource(
  protoBytes: Uint8Array,
  options: RenderOfficeCursorCanvasOptions,
): string {
  const payload = buildXlsxCursorCanvasPayload(protoBytes, options);
  return renderXlsxCursorCanvasSourceFromPayload(payload);
}

export function buildXlsxCursorCanvasPayload(
  protoBytes: Uint8Array,
  options: RenderOfficeCursorCanvasOptions,
): WorkbookPayload {
  const workbook = decodeWorkbook(protoBytes);
  return buildWorkbookPayload(workbook, options);
}

export function renderXlsxCursorCanvasSourceFromPayload(
  payload: WorkbookPayload,
): string {
  return renderWorkbookCanvasSource(payload);
}

function decodeOfficeArtifact(bytes: Uint8Array): OfficeArtifact {
  const reader = new ProtoReader(bytes);
  const artifact: OfficeArtifact = {
    diagnostics: [],
    images: [],
    tables: [],
    textBlocks: [],
    title: "",
  };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 2) artifact.title = reader.string();
    else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      artifact.textBlocks.push(decodeTextBlock(reader.bytesField()));
    } else if (tag.fieldNumber === 6 && tag.wireType === 2) {
      artifact.diagnostics.push(decodeDiagnostic(reader.bytesField()));
    } else if (tag.fieldNumber === 8 && tag.wireType === 2) {
      artifact.images.push(decodeImageAsset(reader.bytesField()));
    } else if (tag.fieldNumber === 9 && tag.wireType === 2) {
      artifact.tables.push(decodeArtifactTable(reader.bytesField()));
    } else reader.skip(tag.wireType);
  }
  return artifact;
}

function decodeTextBlock(bytes: Uint8Array): { path: string; text: string } {
  const reader = new ProtoReader(bytes);
  const block = { path: "", text: "" };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) block.path = reader.string();
    else if (tag.fieldNumber === 2) block.text = reader.string();
    else reader.skip(tag.wireType);
  }
  return block;
}

function decodeDiagnostic(bytes: Uint8Array): { level: string; message: string } {
  const reader = new ProtoReader(bytes);
  const diagnostic = { level: "", message: "" };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) diagnostic.level = reader.string();
    else if (tag.fieldNumber === 2) diagnostic.message = reader.string();
    else reader.skip(tag.wireType);
  }
  return diagnostic;
}

function decodeImageAsset(bytes: Uint8Array): OfficeArtifact["images"][number] {
  const reader = new ProtoReader(bytes);
  const image: OfficeArtifact["images"][number] = {
    bytes: new Uint8Array(),
    contentType: "application/octet-stream",
    id: "",
    path: "",
  };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) image.id = reader.string();
    else if (tag.fieldNumber === 2) image.path = reader.string();
    else if (tag.fieldNumber === 3) image.contentType = reader.string();
    else if (tag.fieldNumber === 4) image.bytes = reader.bytesField();
    else reader.skip(tag.wireType);
  }
  return image;
}

function decodeArtifactTable(bytes: Uint8Array): OfficeArtifact["tables"][number] {
  const reader = new ProtoReader(bytes);
  const table: OfficeArtifact["tables"][number] = { path: "", rows: [] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) table.path = reader.string();
    else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      table.rows.push(decodeArtifactRow(reader.bytesField()));
    } else reader.skip(tag.wireType);
  }
  return table;
}

function decodeArtifactRow(bytes: Uint8Array): { cells: { text: string }[] } {
  const reader = new ProtoReader(bytes);
  const row = { cells: [] as { text: string }[] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      row.cells.push(decodeArtifactCell(reader.bytesField()));
    } else reader.skip(tag.wireType);
  }
  return row;
}

function decodeArtifactCell(bytes: Uint8Array): { text: string } {
  const reader = new ProtoReader(bytes);
  const cell = { text: "" };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 2) cell.text = reader.string();
    else reader.skip(tag.wireType);
  }
  return cell;
}

function decodeDocxDocument(bytes: Uint8Array, title: string): OfficeArtifact {
  const reader = new ProtoReader(bytes);
  const artifact: OfficeArtifact = {
    blocks: [],
    diagnostics: [],
    images: [],
    page: { heightTwips: 0, widthTwips: 0 },
    tables: [],
    textBlocks: [],
    title,
  };
  let elementIndex = 0;
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 3) {
      artifact.page = { ...(artifact.page ?? { heightTwips: 0, widthTwips: 0 }), widthTwips: Number(reader.int64()) };
    } else if (tag.fieldNumber === 4) {
      artifact.page = { ...(artifact.page ?? { heightTwips: 0, widthTwips: 0 }), heightTwips: Number(reader.int64()) };
    } else if (tag.fieldNumber === 5 && tag.wireType === 2) {
      const block = decodeDocxElement(reader.bytesField(), elementIndex++);
      if (block.kind === "paragraph" && block.text.trim()) {
        artifact.textBlocks.push({ path: block.path, text: block.text });
        artifact.blocks?.push({ kind: "paragraph", paragraphs: block.paragraphs, path: block.path, text: block.text });
      } else if (block.kind === "table") {
        artifact.tables.push(block.table);
        artifact.blocks?.push({ kind: "table", path: block.table.path, rows: block.table.rows.map((row) => row.cells) });
      } else if (block.kind === "image") {
        artifact.blocks?.push({ kind: "image", mediaId: block.mediaId, path: block.path });
      }
    } else if (tag.fieldNumber === 7 && tag.wireType === 2) {
      artifact.images.push(decodeDocxImage(reader.bytesField()));
    } else reader.skip(tag.wireType);
  }
  return artifact;
}

function decodeDocxElement(
  bytes: Uint8Array,
  index: number,
):
  | { kind: "paragraph"; paragraphs: DocumentParagraph[]; path: string; text: string }
  | { kind: "table"; table: { path: string; rows: { cells: DocumentTableCell[] }[] } }
  | { kind: "image"; mediaId: string; path: string }
  | { kind: "empty" } {
  const reader = new ProtoReader(bytes);
  const paragraphs: DocumentParagraph[] = [];
  let imageId = "";
  let table: { path: string; rows: { cells: DocumentTableCell[] }[] } | null = null;
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 3 && tag.wireType === 2) {
      imageId = decodeDocxImageReference(reader.bytesField());
    } else if (tag.fieldNumber === 6 && tag.wireType === 2) {
      paragraphs.push(decodeDocxParagraph(reader.bytesField()));
    } else if (tag.fieldNumber === 21 && tag.wireType === 2) {
      table = decodeDocxTable(reader.bytesField(), `document/table-${index}`);
    } else reader.skip(tag.wireType);
  }
  if (table) return { kind: "table", table };
  if (imageId) return { kind: "image", mediaId: imageId, path: imageId };
  const text = paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join("\n");
  return paragraphs.length
    ? { kind: "paragraph", paragraphs, path: `document/paragraph-${index}`, text }
    : { kind: "empty" };
}

function decodeDocxImageReference(bytes: Uint8Array): string {
  const reader = new ProtoReader(bytes);
  let id = "";
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) id = reader.string();
    else reader.skip(tag.wireType);
  }
  return id;
}

function decodeDocxParagraph(bytes: Uint8Array): DocumentParagraph {
  const reader = new ProtoReader(bytes);
  const paragraph: DocumentParagraph = { align: "left", runs: [] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      paragraph.runs.push(decodeDocxRun(reader.bytesField()));
    } else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      paragraph.align = decodeDocxParagraphTextStyle(reader.bytesField()).align;
    } else if (tag.fieldNumber === 4) {
      paragraph.marginLeftPx = twipsToPx(reader.int32());
    } else if (tag.fieldNumber === 5) {
      paragraph.indentPx = twipsToPx(reader.int32());
    } else if (tag.fieldNumber === 6) {
      paragraph.marginBottomPx = Math.min(28, twipsToPx(reader.int32()));
    } else if (tag.fieldNumber === 7) {
      paragraph.marginTopPx = Math.min(32, twipsToPx(reader.int32()));
    } else if (tag.fieldNumber === 10 && tag.wireType === 2) {
      Object.assign(paragraph, decodeDocxRichParagraphStyle(reader.bytesField()));
    } else reader.skip(tag.wireType);
  }
  return paragraph;
}

function decodeDocxParagraphTextStyle(bytes: Uint8Array): Pick<DocumentParagraph, "align"> {
  const reader = new ProtoReader(bytes);
  let align: DocumentParagraph["align"] = "left";
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 8) align = paragraphAlign(reader.int32());
    else reader.skip(tag.wireType);
  }
  return { align };
}

function decodeDocxRichParagraphStyle(bytes: Uint8Array): Partial<DocumentParagraph> {
  const reader = new ProtoReader(bytes);
  const style: Partial<DocumentParagraph> = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 2) style.marginLeftPx = emuToPx(reader.int32());
    else if (tag.fieldNumber === 3) style.indentPx = emuToPx(reader.int32());
    else if (tag.fieldNumber === 5) style.marginBottomPx = Math.min(28, Math.max(0, reader.int32() / 100));
    else reader.skip(tag.wireType);
  }
  return style;
}

function decodeDocxRun(bytes: Uint8Array): DocumentRun {
  const reader = new ProtoReader(bytes);
  const run: DocumentRun = { text: "" };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) run.text = reader.string();
    else if (tag.fieldNumber === 2 && tag.wireType === 2) Object.assign(run, decodeDocxRunStyle(reader.bytesField()));
    else reader.skip(tag.wireType);
  }
  return run;
}

function decodeDocxRunStyle(bytes: Uint8Array): Partial<DocumentRun> {
  const reader = new ProtoReader(bytes);
  const style: Partial<DocumentRun> = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 4) style.bold = reader.bool();
    else if (tag.fieldNumber === 5) style.italic = reader.bool();
    else if (tag.fieldNumber === 6) style.fontSizePx = centipointsToPx(reader.int32());
    else if (tag.fieldNumber === 7 && tag.wireType === 2) style.color = decodeDocxFillColor(reader.bytesField());
    else if (tag.fieldNumber === 9) style.underline = reader.string().toLowerCase() !== "none";
    else if (tag.fieldNumber === 17) Object.assign(style, decodeDocxRunScheme(reader.string()));
    else if (tag.fieldNumber === 18) style.typeface = reader.string();
    else reader.skip(tag.wireType);
  }
  return style;
}

function decodeDocxRunScheme(scheme: string): Partial<DocumentRun> {
  const style: Partial<DocumentRun> = {};
  for (const part of scheme.split(";")) {
    if (part === "__docxCaps:true") style.textTransform = "uppercase";
    else if (part.startsWith("__docxHighlight:")) style.background = docxHighlightToCss(part.slice("__docxHighlight:".length));
    else if (part.startsWith("__docxEastAsiaTypeface:")) style.typeface ||= part.slice("__docxEastAsiaTypeface:".length);
    else if (part.startsWith("__docxComplexScriptTypeface:")) style.typeface ||= part.slice("__docxComplexScriptTypeface:".length);
  }
  return style;
}

function decodeDocxFillColor(bytes: Uint8Array): string | undefined {
  const reader = new ProtoReader(bytes);
  let color: string | undefined;
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 2 && tag.wireType === 2) color = decodeDocxColor(reader.bytesField());
    else reader.skip(tag.wireType);
  }
  return color;
}

function decodeDocxColor(bytes: Uint8Array): string | undefined {
  const reader = new ProtoReader(bytes);
  let value = "";
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 2) value = reader.string();
    else reader.skip(tag.wireType);
  }
  return /^[0-9a-f]{6}$/iu.test(value) ? `#${value.slice(-6)}` : undefined;
}

function decodeDocxTable(bytes: Uint8Array, path: string): { path: string; rows: { cells: DocumentTableCell[] }[] } {
  const reader = new ProtoReader(bytes);
  const table: { path: string; rows: { cells: DocumentTableCell[] }[] } = { path, rows: [] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      table.rows.push(decodeDocxTableRow(reader.bytesField()));
    } else reader.skip(tag.wireType);
  }
  return table;
}

function decodeDocxTableRow(bytes: Uint8Array): { cells: DocumentTableCell[] } {
  const reader = new ProtoReader(bytes);
  const row = { cells: [] as DocumentTableCell[] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      row.cells.push(decodeDocxTableCell(reader.bytesField()));
    } else reader.skip(tag.wireType);
  }
  return row;
}

function decodeDocxTableCell(bytes: Uint8Array): DocumentTableCell {
  const reader = new ProtoReader(bytes);
  const cell: DocumentTableCell = { paragraphs: [], text: "" };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) cell.text = reader.string();
    else if (tag.fieldNumber === 3 && tag.wireType === 2) cell.paragraphs.push(decodeDocxParagraph(reader.bytesField()));
    else reader.skip(tag.wireType);
  }
  if (cell.paragraphs.length === 0 && cell.text) {
    cell.paragraphs.push({ align: "left", runs: [{ text: cell.text }] });
  }
  return cell;
}

function decodeDocxImage(bytes: Uint8Array): OfficeArtifact["images"][number] {
  const reader = new ProtoReader(bytes);
  const image: OfficeArtifact["images"][number] = {
    bytes: new Uint8Array(),
    contentType: "application/octet-stream",
    id: "",
    path: "",
  };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) image.contentType = reader.string();
    else if (tag.fieldNumber === 2) image.bytes = reader.bytesField();
    else if (tag.fieldNumber === 3) image.id = reader.string();
    else reader.skip(tag.wireType);
  }
  image.path = image.id;
  return image;
}

async function buildDocumentPayload(
  artifact: OfficeArtifact,
  options: RenderOfficeCursorCanvasOptions,
): Promise<DocumentPayload> {
  const media = new Map<string, CanvasMedia>();
  const sharp = await loadSharp();
  for (const image of artifact.images) {
    if (!image.bytes.length) continue;
    const encoded = await encodeImage(image.bytes, image.contentType, sharp, options);
    const id = image.id || image.path || sha256(image.bytes);
    const size = imageSize(encoded.bytes);
    media.set(id, {
      height: size.height,
      src: `data:${encoded.contentType};base64,${Buffer.from(encoded.bytes).toString("base64")}`,
      width: size.width,
    });
  }

  const blocks: DocumentBlock[] = artifact.blocks?.length
    ? artifact.blocks.filter((block) => block.kind !== "image" || media.has(block.mediaId))
    : [];
  if (blocks.length === 0) {
    for (const textBlock of artifact.textBlocks) {
      for (const paragraph of textBlock.text.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean)) {
        blocks.push({ kind: "paragraph", paragraphs: [textParagraph(paragraph)], path: textBlock.path, text: paragraph });
      }
    }
    for (const table of artifact.tables) {
      blocks.push({
        kind: "table",
        path: table.path,
        rows: table.rows.map((row) => row.cells.map((cell) => textTableCell(cell.text))),
      });
    }
    for (const image of artifact.images) {
      const mediaId = image.id || image.path || sha256(image.bytes);
      if (media.has(mediaId)) {
        blocks.push({ kind: "image", mediaId, path: image.path });
      }
    }
  }

  return {
    artifact: {
      generatedBy: "@autodev/office",
      kind: "docx",
      reader: options.readerVersion,
      source: sourceLabel(options),
      title: artifact.title || options.title,
    },
    blocks,
    diagnostics: artifact.diagnostics,
    media: Object.fromEntries(media),
    page: docxPageMetrics(artifact.page),
  };
}

function textParagraph(text: string): DocumentParagraph {
  return { align: "left", runs: [{ text }] };
}

function textTableCell(text: string): DocumentTableCell {
  return { paragraphs: text ? [textParagraph(text)] : [], text };
}

function docxPageMetrics(page?: { heightTwips: number; widthTwips: number }): DocumentPayload["page"] {
  const widthPx = twipsToPx(page?.widthTwips ?? 0);
  const heightPx = twipsToPx(page?.heightTwips ?? 0);
  return {
    heightPx: heightPx > 0 ? Math.max(680, Math.min(1400, heightPx)) : 960,
    paddingBottom: 56,
    paddingLeft: 64,
    paddingRight: 64,
    paddingTop: 56,
    widthPx: widthPx > 0 ? Math.max(480, Math.min(960, widthPx)) : 816,
  };
}

function twipsToPx(value: number): number {
  return Math.round((value / 20) * (96 / 72));
}

function emuToPx(value: number): number {
  return Math.round(value / 9_525);
}

function centipointsToPx(value: number): number {
  return Math.max(8, Math.min(72, value / 100));
}

function paragraphAlign(value: number): DocumentParagraph["align"] {
  if (value === 2) return "center";
  if (value === 3) return "right";
  if (value === 4) return "justify";
  return "left";
}

function docxHighlightToCss(value: string): string | undefined {
  const colors: Record<string, string> = {
    black: "#000000",
    blue: "#0000ff",
    cyan: "#00ffff",
    darkBlue: "#000080",
    darkCyan: "#008080",
    darkGray: "#808080",
    darkGreen: "#008000",
    darkMagenta: "#800080",
    darkRed: "#800000",
    darkYellow: "#808000",
    green: "#00ff00",
    lightGray: "#c0c0c0",
    magenta: "#ff00ff",
    red: "#ff0000",
    white: "#ffffff",
    yellow: "#ffff00",
  };
  return colors[value] ?? undefined;
}

function decodeWorkbook(bytes: Uint8Array): Workbook {
  const reader = new ProtoReader(bytes);
  const workbook: Workbook = {
    sheets: [],
    styles: { cellFormats: [], fills: [], fonts: [] },
  };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      workbook.sheets.push(decodeWorkbookSheet(reader.bytesField()));
    } else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      workbook.styles = decodeWorkbookStyles(reader.bytesField());
    } else reader.skip(tag.wireType);
  }
  return workbook;
}

function decodeWorkbookSheet(bytes: Uint8Array): WorkbookSheet {
  const reader = new ProtoReader(bytes);
  const sheet: WorkbookSheet = { columns: [], name: "Sheet", rows: [] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 2) sheet.name = reader.string();
    else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      sheet.rows.push(decodeWorkbookRow(reader.bytesField()));
    } else if (tag.fieldNumber === 6 && tag.wireType === 2) {
      sheet.columns.push(decodeWorkbookColumn(reader.bytesField()));
    } else reader.skip(tag.wireType);
  }
  return sheet;
}

function decodeWorkbookRow(bytes: Uint8Array): WorkbookSheet["rows"][number] {
  const reader = new ProtoReader(bytes);
  const row = { cells: [] as WorkbookRawCell[], height: 22, index: 0 };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) row.index = reader.int32();
    else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      row.cells.push(decodeWorkbookCell(reader.bytesField()));
    } else if (tag.fieldNumber === 3) row.height = reader.float();
    else reader.skip(tag.wireType);
  }
  return row;
}

function decodeWorkbookCell(bytes: Uint8Array): WorkbookRawCell {
  const reader = new ProtoReader(bytes);
  const cell: WorkbookRawCell = { address: "", styleIndex: 0, text: "" };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) cell.address = reader.string();
    else if (tag.fieldNumber === 2) cell.text = reader.string();
    else if (tag.fieldNumber === 5) cell.styleIndex = reader.int32();
    else reader.skip(tag.wireType);
  }
  return cell;
}

function decodeWorkbookColumn(bytes: Uint8Array): WorkbookSheet["columns"][number] {
  const reader = new ProtoReader(bytes);
  const column = { max: 0, min: 0, width: 12 };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1) column.min = reader.int32();
    else if (tag.fieldNumber === 2) column.max = reader.int32();
    else if (tag.fieldNumber === 3) column.width = reader.float();
    else reader.skip(tag.wireType);
  }
  return column;
}

function decodeWorkbookStyles(bytes: Uint8Array): WorkbookStyles {
  const reader = new ProtoReader(bytes);
  const styles: WorkbookStyles = { cellFormats: [], fills: [], fonts: [] };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 1 && tag.wireType === 2) {
      styles.fonts.push(decodeWorkbookFont(reader.bytesField()));
    } else if (tag.fieldNumber === 2 && tag.wireType === 2) {
      styles.fills.push(decodeWorkbookFill(reader.bytesField()));
    } else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      styles.cellFormats.push(decodeWorkbookCellFormat(reader.bytesField()));
    } else reader.skip(tag.wireType);
  }
  return styles;
}

function decodeWorkbookFont(bytes: Uint8Array): WorkbookStyles["fonts"][number] {
  const reader = new ProtoReader(bytes);
  const font = { bold: false, color: undefined as string | undefined };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 4) font.bold = reader.bool();
    else if (tag.fieldNumber === 7 && tag.wireType === 2) {
      font.color = fillColor(decodeWorkbookFill(reader.bytesField()));
    } else reader.skip(tag.wireType);
  }
  return font;
}

function decodeWorkbookFill(bytes: Uint8Array): WorkbookStyles["fills"][number] {
  const reader = new ProtoReader(bytes);
  const fill: { color?: string } = {};
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 2 && tag.wireType === 2) {
      fill.color = decodeColor(reader.bytesField());
    } else reader.skip(tag.wireType);
  }
  return fill;
}

function decodeWorkbookCellFormat(bytes: Uint8Array): WorkbookStyles["cellFormats"][number] {
  const reader = new ProtoReader(bytes);
  const format = { fillId: 0, fontId: 0 };
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 2) format.fontId = reader.int32();
    else if (tag.fieldNumber === 3) format.fillId = reader.int32();
    else reader.skip(tag.wireType);
  }
  return format;
}

function decodeColor(bytes: Uint8Array): string | undefined {
  const reader = new ProtoReader(bytes);
  let value = "";
  let alpha: number | undefined;
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 2) value = reader.string();
    else if (tag.fieldNumber === 3 && tag.wireType === 2) {
      alpha = decodeColorAlpha(reader.bytesField());
    } else reader.skip(tag.wireType);
  }
  if (!value || alpha === 0) return undefined;
  return /^[0-9a-f]{6}$/iu.test(value) ? `#${value}` : undefined;
}

function decodeColorAlpha(bytes: Uint8Array): number | undefined {
  const reader = new ProtoReader(bytes);
  let alpha: number | undefined;
  while (!reader.eof()) {
    const tag = reader.tag();
    if (tag.fieldNumber === 6) alpha = reader.int32();
    else reader.skip(tag.wireType);
  }
  return alpha;
}

function buildWorkbookPayload(
  workbook: Workbook,
  options: RenderOfficeCursorCanvasOptions,
): WorkbookPayload {
  const maxColumns = options.maxColumns ?? 24;
  const maxRows = options.maxRows ?? 100;
  return {
    artifact: {
      generatedBy: "@autodev/office",
      kind: "xlsx",
      reader: options.readerVersion,
      source: sourceLabel(options),
      title: options.title,
    },
    sheets: workbook.sheets.map((sheet) => ({
      columns: columnWidths(sheet.columns, maxColumns),
      name: sheet.name,
      rows: sheet.rows.slice(0, maxRows).map((row) => ({
        cells: row.cells
          .filter((cell) => columnIndex(cell.address) <= maxColumns)
          .map((cell) => workbookCell(cell, workbook.styles)),
        height: Math.max(24, Math.min(72, row.height * 1.35 || 28)),
        index: row.index,
      })),
    })),
  };
}

function workbookCell(cell: WorkbookRawCell, styles: WorkbookStyles): WorkbookCell {
  const format = styles.cellFormats[cell.styleIndex] ?? { fillId: 0, fontId: 0 };
  const fill = styles.fills[format.fillId];
  const font = styles.fonts[format.fontId];
  return {
    address: cell.address,
    background: fillColor(fill) ?? "#ffffff",
    bold: font?.bold === true,
    color: font?.color ?? "#111827",
    value: cell.text,
  };
}

function columnWidths(
  columns: WorkbookSheet["columns"],
  maxColumns: number,
): { index: number; width: number }[] {
  const widths: { index: number; width: number }[] = [];
  for (let index = 1; index <= maxColumns; index++) {
    const column = columns.find((item) => item.min <= index && index <= item.max);
    widths.push({ index, width: Math.max(56, Math.min(240, (column?.width ?? 12) * 7)) });
  }
  return widths;
}

function renderDocumentCanvasSource(payload: DocumentPayload): string {
  return `import { Pill, Row, Stack, Text, useHostTheme } from "cursor/canvas";

type DocumentBlock =
  | { kind: "image"; mediaId: string; path: string }
  | { kind: "paragraph"; paragraphs: DocumentParagraph[]; path: string; text: string }
  | { kind: "table"; path: string; rows: DocumentTableCell[][] };
type CanvasMedia = { height: number; src: string; width: number };
type DocumentParagraph = { align: "center" | "justify" | "left" | "right"; indentPx?: number; marginBottomPx?: number; marginLeftPx?: number; marginTopPx?: number; runs: DocumentRun[] };
type DocumentRun = { background?: string; bold?: boolean; color?: string; fontSizePx?: number; italic?: boolean; text: string; textTransform?: "uppercase"; typeface?: string; underline?: boolean };
type DocumentTableCell = { paragraphs: DocumentParagraph[]; text: string };

const payload = JSON.parse(${JSON.stringify(JSON.stringify(payload))}) as {
  artifact: { generatedBy: string; kind: "docx"; reader: string; source: string; title: string };
  blocks: DocumentBlock[];
  diagnostics: { level: string; message: string }[];
  media: Record<string, CanvasMedia>;
  page: { heightPx: number; paddingBottom: number; paddingLeft: number; paddingRight: number; paddingTop: number; widthPx: number };
};

export default function OfficeDocumentCanvas() {
  const theme = useHostTheme();
  return (
    <div style={{ background: "#ffffff", border: \`1px solid \${theme.stroke.secondary}\`, borderRadius: 8, color: theme.text.primary, height: "calc(100vh - 16px)", minHeight: 520, overflow: "hidden" }}>
      <Row align="center" justify="between" style={{ borderBottom: \`1px solid \${theme.stroke.secondary}\`, height: 52, padding: "0 16px" }}>
        <Row align="center" gap={8} style={{ minWidth: 0 }}>
          <Pill active size="sm" tone="info">docx</Pill>
          <Text as="span" size="small" tone="secondary" truncate>{payload.artifact.reader}</Text>
        </Row>
        <Text as="span" size="small" weight="semibold" truncate>{payload.artifact.title}</Text>
      </Row>
      <main style={{ background: "#f8fafc", height: "calc(100% - 52px)", overflow: "auto", padding: "20px 24px 32px" }}>
        <article style={{ background: "#ffffff", border: "1px solid #d8e0ea", borderRadius: 8, boxShadow: "0 12px 28px rgba(15, 23, 42, 0.10)", boxSizing: "border-box", color: "#0f172a", margin: "0 auto", maxWidth: "100%", minHeight: payload.page.heightPx, paddingBottom: payload.page.paddingBottom, paddingLeft: payload.page.paddingLeft, paddingRight: payload.page.paddingRight, paddingTop: payload.page.paddingTop, width: payload.page.widthPx }}>
          <Stack gap={18}>
            {payload.diagnostics.map((diagnostic, index) => (
              <div key={index} style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, color: "#9a3412", padding: "10px 12px" }}>{diagnostic.level}: {diagnostic.message}</div>
            ))}
            {payload.blocks.map((block, index) => <DocumentBlockView block={block} key={index} />)}
          </Stack>
        </article>
      </main>
    </div>
  );
}

function DocumentBlockView({ block }: { block: DocumentBlock }) {
  if (block.kind === "paragraph") {
    return <DocumentParagraphs paragraphs={block.paragraphs} />;
  }
  if (block.kind === "image") {
    const media = payload.media[block.mediaId];
    if (!media) return null;
    return <img alt={block.path} src={media.src} style={{ display: "block", height: media.height > 0 ? "auto" : undefined, margin: "12px 0 18px", maxHeight: 520, maxWidth: "100%", objectFit: "contain", width: media.width > 0 ? Math.min(media.width, 680) : "100%" }} />;
  }
  return (
    <div style={{ margin: "12px 0 18px", overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", font: "400 12px/1.45 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", minWidth: "70%", tableLayout: "fixed", width: "100%" }}>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex} style={{ border: "1px solid #cbd5e1", padding: "6px 8px", verticalAlign: "top", whiteSpace: "pre-wrap" }}><DocumentParagraphs compact paragraphs={cell.paragraphs} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocumentParagraphs({ compact = false, paragraphs }: { compact?: boolean; paragraphs: DocumentParagraph[] }) {
  return (
    <>
      {paragraphs.map((paragraph, paragraphIndex) => (
        <p key={paragraphIndex} style={{
          font: \`\${paragraph.runs.some((run) => run.bold) ? 700 : 400} \${compact ? 12 : 14}px/1.58 -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif\`,
          margin: 0,
          marginBottom: paragraph.marginBottomPx ?? (compact ? 2 : 8),
          marginLeft: paragraph.marginLeftPx,
          marginTop: paragraph.marginTopPx,
          textAlign: paragraph.align === "left" ? undefined : paragraph.align,
          textIndent: paragraph.indentPx,
          whiteSpace: "pre-wrap",
        }}>
          {paragraph.runs.length > 0 ? paragraph.runs.map((run, runIndex) => (
            <span key={runIndex} style={{
              backgroundColor: run.background,
              color: run.color,
              fontFamily: fontStack(run.typeface),
              fontSize: run.fontSizePx,
              fontStyle: run.italic ? "italic" : undefined,
              fontWeight: run.bold ? 700 : undefined,
              textDecoration: run.underline ? "underline" : undefined,
              textTransform: run.textTransform,
            }}>{run.text}</span>
          )) : null}
        </p>
      ))}
    </>
  );
}

function fontStack(typeface?: string) {
  const fallback = "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif";
  return typeface ? \`\${JSON.stringify(typeface)}, \${fallback}\` : fallback;
}
`;
}

function renderWorkbookCanvasSource(payload: WorkbookPayload): string {
  return `import { Button, Pill, Row, Text, useCanvasState, useHostTheme } from "cursor/canvas";

type WorkbookCell = { address: string; background: string; bold: boolean; color: string; value: string };
type WorkbookSheet = { columns: { index: number; width: number }[]; name: string; rows: { cells: WorkbookCell[]; height: number; index: number }[] };

const payload = JSON.parse(${JSON.stringify(JSON.stringify(payload))}) as {
  artifact: { generatedBy: string; kind: "xlsx"; reader: string; source: string; title: string };
  sheets: WorkbookSheet[];
};

export default function OfficeWorkbookCanvas() {
  const theme = useHostTheme();
  const [selectedSheet, setSelectedSheet] = useCanvasState("selected-sheet", payload.sheets[0]?.name ?? "");
  const sheet = payload.sheets.find((item) => item.name === selectedSheet) ?? payload.sheets[0];
  return (
    <div style={{ background: theme.bg.editor, border: \`1px solid \${theme.stroke.secondary}\`, borderRadius: 8, color: theme.text.primary, display: "grid", gridTemplateRows: "52px 42px minmax(0, 1fr)", height: "min(820px, calc(100vh - 40px))", overflow: "hidden" }}>
      <Row align="center" justify="between" style={{ borderBottom: \`1px solid \${theme.stroke.secondary}\`, padding: "0 16px" }}>
        <Row align="center" gap={8} style={{ minWidth: 0 }}>
          <Pill active size="sm" tone="info">xlsx</Pill>
          <Text as="span" size="small" tone="secondary" truncate>{payload.artifact.reader}</Text>
        </Row>
        <Text as="span" size="small" weight="semibold" truncate>{payload.artifact.title}</Text>
      </Row>
      <Row align="center" gap={8} style={{ borderBottom: \`1px solid \${theme.stroke.secondary}\`, overflowX: "auto", padding: "0 12px" }}>
        {payload.sheets.map((item) => <Button key={item.name} onClick={() => setSelectedSheet(item.name)} size="sm" variant={item.name === sheet.name ? "primary" : "secondary"}>{item.name}</Button>)}
      </Row>
      <main style={{ background: theme.fill.primary, minHeight: 0, overflow: "auto", padding: 14 }}>
        {sheet ? <SheetGrid sheet={sheet} /> : null}
      </main>
    </div>
  );
}

function SheetGrid({ sheet }: { sheet: WorkbookSheet }) {
  const widths = ["48px", ...sheet.columns.map((column) => \`\${column.width}px\`)].join(" ");
  return (
    <div style={{ background: "#ffffff", border: "1px solid #cbd5e1", color: "#111827", display: "inline-grid", gridTemplateColumns: widths, minWidth: "100%" }}>
      <div style={headerCellStyle} />
      {sheet.columns.map((column) => <div key={column.index} style={headerCellStyle}>{columnName(column.index)}</div>)}
      {sheet.rows.map((row) => {
        const byColumn = new Map(row.cells.map((cell) => [columnIndex(cell.address), cell]));
        return [
          <div key={\`r-\${row.index}\`} style={{ ...headerCellStyle, height: row.height }}>{row.index}</div>,
          ...sheet.columns.map((column) => {
            const cell = byColumn.get(column.index);
            return <div key={\`\${row.index}-\${column.index}\`} title={cell?.address} style={{ alignItems: "center", background: cell?.background ?? "#ffffff", borderBottom: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0", boxSizing: "border-box", color: cell?.color ?? "#111827", display: "flex", font: \`\${cell?.bold ? 700 : 400} 12px/1.35 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif\`, height: row.height, minWidth: 0, overflow: "hidden", padding: "0 8px", whiteSpace: "nowrap" }}>{cell?.value ?? ""}</div>;
          }),
        ];
      })}
    </div>
  );
}

const headerCellStyle = {
  alignItems: "center",
  background: "#f8fafc",
  borderBottom: "1px solid #cbd5e1",
  borderRight: "1px solid #cbd5e1",
  boxSizing: "border-box" as const,
  color: "#475569",
  display: "flex",
  font: "600 12px/1 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  height: 28,
  justifyContent: "center",
};

function columnName(index: number): string {
  let value = "";
  let current = index;
  while (current > 0) {
    current -= 1;
    value = String.fromCharCode(65 + (current % 26)) + value;
    current = Math.floor(current / 26);
  }
  return value;
}

function columnIndex(address: string): number {
  const letters = address.match(/^[A-Z]+/iu)?.[0]?.toUpperCase() ?? "";
  let index = 0;
  for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64;
  return index;
}
`;
}

async function encodeImage(
  bytes: Uint8Array,
  contentType: string,
  sharp: SharpFactory | null,
  options: RenderOfficeCursorCanvasOptions,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!sharp) return { bytes, contentType };
  const buffer = await sharp(bytes)
    .resize({ fit: "inside", width: options.mediaWidth ?? 1280, withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ mozjpeg: true, quality: clampQuality(options.mediaQuality ?? 72) })
    .toBuffer();
  return { bytes: new Uint8Array(buffer), contentType: "image/jpeg" };
}

function fillColor(fill?: { color?: string }): string | undefined {
  return fill?.color && fill.color !== "#000000" ? fill.color : undefined;
}

function sourceLabel(options: RenderOfficeCursorCanvasOptions): string {
  return options.sourceLabel ?? basename(options.sourcePath) ?? options.title;
}

function basename(value?: string): string | undefined {
  const parts = value?.split(/[\\/]+/u).filter(Boolean);
  return parts?.[parts.length - 1];
}

function columnIndex(address: string): number {
  const letters = address.match(/^[A-Z]+/iu)?.[0]?.toUpperCase() ?? "";
  let index = 0;
  for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64;
  return index;
}

function imageSize(bytes: Uint8Array): { height: number; width: number } {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { height: readUint32BE(bytes, 20), width: readUint32BE(bytes, 16) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: (bytes[offset + 5] << 8) + bytes[offset + 6],
          width: (bytes[offset + 7] << 8) + bytes[offset + 8],
        };
      }
      offset += 2 + length;
    }
  }
  return { height: 1, width: 1 };
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

function clampQuality(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}
