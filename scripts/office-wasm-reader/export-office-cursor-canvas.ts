import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import sharp from "sharp";

import { extractDocxProto, extractXlsxProto, getReaderVersion } from "../../packages/office/src/index";
import officeWasmConfig from "../../src/app/debug/office-wasm-poc/office-wasm-config";

type RecordValue = Record<string, unknown>;

type OfficeCanvasKind = "docx" | "xlsx";

type OfficeCanvasMedia = {
  height: number;
  src: string;
  width: number;
};

type DocumentRun = {
  bold: boolean;
  color: string;
  italic: boolean;
  size: number;
  text: string;
};

type DocumentParagraph = {
  align: "center" | "left" | "right";
  runs: DocumentRun[];
};

type DocumentBlock =
  | { kind: "image"; mediaId: string }
  | { kind: "paragraph"; paragraphs: DocumentParagraph[] }
  | { kind: "table"; rows: { fill: string; paragraphs: DocumentParagraph[] }[][] };

type WorkbookCell = {
  address: string;
  background: string;
  bold: boolean;
  color: string;
  value: string;
};

type WorkbookRow = {
  cells: WorkbookCell[];
  height: number;
  index: number;
};

type WorkbookSheet = {
  columns: { index: number; width: number }[];
  name: string;
  rows: WorkbookRow[];
};

type OfficeCanvasPayload = {
  artifact: {
    generatedBy: string;
    kind: OfficeCanvasKind;
    reader: string;
    source: string;
    title: string;
  };
  document?: {
    blocks: DocumentBlock[];
  };
  media: Record<string, OfficeCanvasMedia>;
  workbook?: {
    sheets: WorkbookSheet[];
  };
};

const repoRoot = process.cwd();
const inputPath = path.resolve(
  repoRoot,
  stringArg("--input") ?? stringArg("--docx") ?? stringArg("--xlsx") ?? positionalArgs()[0] ?? "",
);
const inferredKind = inferKind(inputPath);
const kind = (stringArg("--kind") as OfficeCanvasKind | null) ?? inferredKind;
const outputPath = path.resolve(
  repoRoot,
  stringArg("--output") ??
    path.join(os.homedir(), ".cursor/projects/Users-phodal-ai-routa-js/canvases", `office-${kind}.canvas.tsx`),
);
const mediaWidth = numberArg("--media-width") ?? 1100;
const mediaQuality = numberArg("--media-quality") ?? 72;
const maxRows = numberArg("--max-rows") ?? 80;
const maxColumns = numberArg("--max-columns") ?? 18;

async function main(): Promise<void> {
  if (!kind) throw new Error("Pass --kind docx|xlsx or an input file ending in .docx/.xlsx.");
  if (!existsSync(inputPath)) throw new Error(`Input file not found: ${inputPath}`);

  const payload = kind === "docx" ? await buildDocumentPayload() : await buildWorkbookPayload();
  mkdirSync(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderCanvasSource(payload), "utf8");
  console.log(JSON.stringify({ kind, outputPath, inputPath }, null, 2));
}

async function buildDocumentPayload(): Promise<OfficeCanvasPayload> {
  const protoBytes = await extractDocxProto(new Uint8Array(readFileSync(inputPath)));
  const document = await decodeOfficeProto("document", "Document", protoBytes);
  const mediaIndex = await buildMediaIndex(asRecords(document.images));
  return {
    artifact: await artifact("docx"),
    document: { blocks: buildDocumentBlocks(asRecords(document.elements), mediaIndex.byImageId) },
    media: Object.fromEntries(mediaIndex.media),
  };
}

async function buildWorkbookPayload(): Promise<OfficeCanvasPayload> {
  const protoBytes = await extractXlsxProto(new Uint8Array(readFileSync(inputPath)));
  const workbook = await decodeOfficeProto("spreadsheet", "Workbook", protoBytes);
  return {
    artifact: await artifact("xlsx"),
    media: {},
    workbook: { sheets: buildWorkbookSheets(workbook) },
  };
}

async function artifact(kind: OfficeCanvasKind): Promise<OfficeCanvasPayload["artifact"]> {
  return {
    generatedBy: "scripts/office-wasm-reader/export-office-cursor-canvas.ts",
    kind,
    reader: await getReaderVersion(),
    source: inputPath,
    title: path.basename(inputPath),
  };
}

async function decodeOfficeProto(moduleName: "document" | "spreadsheet", symbol: "Document" | "Workbook", bytes: Uint8Array): Promise<RecordValue> {
  const modulePath = path.join(repoRoot, officeWasmConfig.OFFICE_WASM_TMP_ASSET_DIR, officeWasmConfig.OFFICE_WASM_READER_MODULES[moduleName]);
  type DecoderMap = Record<string, { decode?: (bytes: Uint8Array) => RecordValue } | undefined>;
  const imported = await import(pathToFileURL(modulePath).href) as DecoderMap & { default?: DecoderMap; "module.exports"?: DecoderMap };
  const namespace = imported[symbol] ?? imported.default?.[symbol] ?? imported["module.exports"]?.[symbol];
  if (typeof namespace?.decode !== "function") {
    throw new Error(`${symbol} decoder not found: ${modulePath}`);
  }
  return namespace.decode(bytes);
}

type MediaIndex = {
  byImageId: Map<string, string>;
  media: Map<string, OfficeCanvasMedia>;
};

async function buildMediaIndex(images: RecordValue[]): Promise<MediaIndex> {
  const byImageId = new Map<string, string>();
  const media = new Map<string, OfficeCanvasMedia>();
  for (const image of images) {
    const id = asString(image.id);
    const bytes = bytesFromUnknown(image.data);
    if (!id || bytes.length === 0) continue;
    const compressed = await sharp(bytes)
      .resize({ fit: "inside", width: mediaWidth, withoutEnlargement: true })
      .jpeg({ mozjpeg: true, quality: clampQuality(mediaQuality) })
      .toBuffer();
    const metadata = await sharp(compressed).metadata();
    byImageId.set(id, id);
    media.set(id, {
      height: metadata.height ?? 1,
      src: `data:image/jpeg;base64,${compressed.toString("base64")}`,
      width: metadata.width ?? 1,
    });
  }
  return { byImageId, media };
}

function buildDocumentBlocks(elements: RecordValue[], byImageId: Map<string, string>): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  for (const element of elements) {
    const table = asRecord(element.table);
    if (table) {
      blocks.push({
        kind: "table",
        rows: asRecords(table.rows).map((row) =>
          asRecords(row.cells).map((cell) => ({
            fill: fillToCss(cell.fill) ?? "#ffffff",
            paragraphs: paragraphsFromElement(cell),
          })),
        ),
      });
      continue;
    }
    const imageId = imageReferenceId(element.imageReference);
    const mediaId = imageId ? byImageId.get(imageId) : null;
    if (mediaId) {
      blocks.push({ kind: "image", mediaId });
      continue;
    }
    const paragraphs = paragraphsFromElement(element);
    if (paragraphs.some((paragraph) => paragraph.runs.some((run) => run.text.trim()))) {
      blocks.push({ kind: "paragraph", paragraphs });
    }
  }
  return blocks;
}

function paragraphsFromElement(element: RecordValue): DocumentParagraph[] {
  return asRecords(element.paragraphs).map((paragraph) => {
    const alignment = asNumber(asRecord(paragraph.textStyle)?.alignment, 1);
    return {
      align: alignment === 2 ? "center" : alignment === 3 ? "right" : "left",
      runs: asRecords(paragraph.runs).map((run) => {
        const style = asRecord(run.textStyle) ?? {};
        return {
          bold: asBoolean(style.bold),
          color: fillToCss(style.fill) ?? "#1f2937",
          italic: asBoolean(style.italic),
          size: Math.max(11, Math.min(32, asNumber(style.fontSize, 1000) / 100)),
          text: asString(run.text),
        };
      }),
    };
  });
}

function buildWorkbookSheets(workbook: RecordValue): WorkbookSheet[] {
  const styles = asRecord(workbook.styles) ?? {};
  const fonts = asRecords(styles.fonts);
  const fills = asRecords(styles.fills);
  const cellXfs = asRecords(styles.cellXfs);
  return asRecords(workbook.sheets).map((sheet) => {
    const columns = columnWidths(asRecords(sheet.columns));
    return {
      columns,
      name: asString(sheet.name) || "Sheet",
      rows: asRecords(sheet.rows).slice(0, maxRows).map((row) => ({
        cells: asRecords(row.cells).slice(0, maxColumns).map((cell) => workbookCell(cell, cellXfs, fonts, fills)),
        height: Math.max(24, Math.min(64, asNumber(row.height, 22) * 1.3)),
        index: asNumber(row.index, 0),
      })),
    };
  });
}

function columnWidths(columns: RecordValue[]): { index: number; width: number }[] {
  const widths: { index: number; width: number }[] = [];
  for (let index = 1; index <= maxColumns; index++) {
    const column = columns.find((item) => asNumber(item.min, -1) <= index && index <= asNumber(item.max, -1));
    widths.push({ index, width: Math.max(46, Math.min(220, asNumber(column?.width, 12) * 7)) });
  }
  return widths;
}

function workbookCell(cell: RecordValue, cellXfs: RecordValue[], fonts: RecordValue[], fills: RecordValue[]): WorkbookCell {
  const xf = cellXfs[asNumber(cell.styleIndex, 0)] ?? {};
  const font = fonts[asNumber(xf.fontId, 0)] ?? {};
  const fill = fills[asNumber(xf.fillId, 0)] ?? {};
  return {
    address: asString(cell.address),
    background: spreadsheetFillToCss(fill) ?? "#ffffff",
    bold: asBoolean(font.bold),
    color: fillToCss(font.fill) ?? "#111827",
    value: asString(cell.value),
  };
}

function renderCanvasSource(payload: OfficeCanvasPayload): string {
  return `import { Button, Pill, Row, Stack, Text, useCanvasState, useHostTheme } from "cursor/canvas";

type OfficeCanvasPayload = ${JSON.stringify(payloadTypeShape())};

const payload = JSON.parse(${JSON.stringify(JSON.stringify(payload))}) as any;
const { artifact, media } = payload;

export default function OfficeCanvas() {
  const theme = useHostTheme();
  return (
    <div style={{ background: theme.bg.editor, border: \`1px solid \${theme.stroke.secondary}\`, borderRadius: 8, color: theme.text.primary, display: "grid", gridTemplateRows: "52px minmax(0, 1fr)", height: "min(820px, calc(100vh - 40px))", overflow: "hidden" }}>
      <header style={{ alignItems: "center", borderBottom: \`1px solid \${theme.stroke.secondary}\`, display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, padding: "0 16px" }}>
        <Row gap={8} align="center"><Pill active size="sm" tone="info">{artifact.kind}</Pill><Text as="span" size="small" tone="secondary" truncate>{artifact.reader}</Text></Row>
        <Text as="span" size="small" weight="semibold" truncate>{artifact.title}</Text>
        <Text as="span" size="small" tone="secondary" truncate style={{ textAlign: "right" }}>{artifact.generatedBy}</Text>
      </header>
      {artifact.kind === "docx" ? <DocumentView /> : <WorkbookView />}
    </div>
  );
}

function DocumentView() {
  return (
    <main style={{ background: "#eef2f7", overflow: "auto", padding: "24px" }}>
      <article style={{ background: "#ffffff", boxShadow: "0 16px 36px rgba(15, 23, 42, 0.13)", margin: "0 auto", maxWidth: 860, minHeight: 980, padding: "64px 72px" }}>
        <Stack gap={14}>
          {payload.document.blocks.map((block: any, index: number) => <DocumentBlock block={block} key={index} />)}
        </Stack>
      </article>
    </main>
  );
}

function DocumentBlock({ block }: { block: any }) {
  if (block.kind === "image") {
    const image = media[block.mediaId];
    if (!image) return null;
    return <img alt="" src={image.src} style={{ display: "block", maxWidth: "100%", margin: "8px auto", border: "1px solid #d1d5db" }} />;
  }
  if (block.kind === "table") {
    return (
      <table style={{ borderCollapse: "collapse", fontSize: 13, width: "100%" }}>
        <tbody>
          {block.rows.map((row: any[], rowIndex: number) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={{ background: cell.fill, border: "1px solid #cbd5e1", padding: "9px 10px", verticalAlign: "top" }}>
                  {cell.paragraphs.map((paragraph: any, index: number) => <DocumentParagraph paragraph={paragraph} key={index} />)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <>{block.paragraphs.map((paragraph: any, index: number) => <DocumentParagraph paragraph={paragraph} key={index} />)}</>;
}

function DocumentParagraph({ paragraph }: { paragraph: any }) {
  return (
    <p style={{ lineHeight: 1.72, margin: "0 0 8px", textAlign: paragraph.align }}>
      {paragraph.runs.map((run: any, index: number) => (
        <span key={index} style={{ color: run.color, fontSize: run.size, fontStyle: run.italic ? "italic" : "normal", fontWeight: run.bold ? 700 : 400, whiteSpace: "pre-wrap" }}>{run.text}</span>
      ))}
    </p>
  );
}

function WorkbookView() {
  const [sheetIndex, setSheetIndex] = useCanvasState("active-sheet-index", 0);
  const sheets = payload.workbook.sheets;
  const sheet = sheets[Math.max(0, Math.min(sheets.length - 1, sheetIndex))] ?? sheets[0];
  return (
    <div style={{ display: "grid", gridTemplateRows: "42px minmax(0, 1fr)", minHeight: 0 }}>
      <nav style={{ alignItems: "center", borderBottom: "1px solid #d1d5db", display: "flex", gap: 6, overflowX: "auto", padding: "6px 10px" }}>
        {sheets.map((item: any, index: number) => <Button key={item.name} onClick={() => setSheetIndex(index)} size="sm" variant={index === sheetIndex ? "primary" : "secondary"}>{item.name}</Button>)}
      </nav>
      <main style={{ background: "#f8fafc", overflow: "auto", padding: 16 }}>
        <table style={{ background: "#ffffff", borderCollapse: "collapse", font: "12px/1.35 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" }}>
          <thead>
            <tr>
              <th style={headerCellStyle}></th>
              {sheet.columns.map((column: any) => <th key={column.index} style={{ ...headerCellStyle, minWidth: column.width, width: column.width }}>{columnName(column.index)}</th>)}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row: any) => (
              <tr key={row.index} style={{ height: row.height }}>
                <th style={headerCellStyle}>{row.index}</th>
                {sheet.columns.map((column: any) => {
                  const cell = row.cells[column.index - 1] ?? {};
                  return <td key={column.index} title={cell.address} style={{ background: cell.background || "#ffffff", border: "1px solid #d9e2ec", color: cell.color || "#111827", fontWeight: cell.bold ? 700 : 400, maxWidth: column.width, minWidth: column.width, overflow: "hidden", padding: "4px 6px", textOverflow: "ellipsis", whiteSpace: "nowrap", width: column.width }}>{cell.value}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}

function columnName(index: number) {
  let name = "";
  let value = index;
  while (value > 0) {
    const rem = (value - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

const headerCellStyle = { background: "#eef2f7", border: "1px solid #cbd5e1", color: "#475569", fontWeight: 600, minWidth: 42, padding: "4px 6px", position: "sticky" as const, top: 0, zIndex: 1 };
`;
}

function payloadTypeShape(): unknown {
  return {};
}

function inferKind(filePath: string): OfficeCanvasKind | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".docx") return "docx";
  if (ext === ".xlsx") return "xlsx";
  return null;
}

function imageReferenceId(value: unknown): string {
  return asString(asRecord(value)?.id);
}

function colorToCss(value: unknown): string | undefined {
  const raw = asString(asRecord(value)?.value);
  if (/^[0-9a-f]{8}$/i.test(raw)) return `#${raw.slice(2)}`;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  return undefined;
}

function fillToCss(fill: unknown): string | undefined {
  const record = asRecord(fill);
  if (!record) return undefined;
  return colorToCss(record.color);
}

function spreadsheetFillToCss(fill: unknown): string | undefined {
  const record = asRecord(fill);
  if (!record) return undefined;
  return fillToCss(record) ?? colorToCss(record.color) ?? colorToCss(asRecord(record.pattern)?.foregroundColor) ?? colorToCss(asRecord(record.pattern)?.backgroundColor);
}

function bytesFromUnknown(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value && typeof value === "object") {
    return new Uint8Array(Object.values(value as Record<string, number>));
  }
  return new Uint8Array();
}

function asRecords(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(asRecord).filter((record): record is RecordValue => record != null) : [];
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" ? value as RecordValue : null;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function clampQuality(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function numberArg(name: string): number | null {
  const value = stringArg(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function positionalArgs(): string[] {
  const args = process.argv.slice(2);
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (
      arg === "--docx" ||
      arg === "--input" ||
      arg === "--kind" ||
      arg === "--max-columns" ||
      arg === "--max-rows" ||
      arg === "--media-quality" ||
      arg === "--media-width" ||
      arg === "--output" ||
      arg === "--xlsx"
    ) {
      index++;
      continue;
    }
    if (!arg?.startsWith("--")) values.push(arg);
  }
  return values;
}

void main();
