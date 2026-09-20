import { asArray, asNumber, asRecord, asString, type RecordValue } from "../shared/office-preview-utils";

type WordTableHeightContext = {
  contentWidth?: number;
  paragraphHeight: (paragraph: unknown) => number;
  tableParagraphHeight?: (paragraph: unknown, contentWidth: number) => number;
};

export function wordSplitOversizedTableElements(
  elements: unknown[],
  capacity: number,
  context: WordTableHeightContext,
): unknown[] {
  return elements.flatMap((element) => wordSplitOversizedTableElement(element, capacity, context));
}

export function wordTableElementEstimatedHeight(table: RecordValue, context: WordTableHeightContext): number {
  const rowHeights = asArray(table.rows)
    .map(asRecord)
    .filter((row): row is RecordValue => row != null)
    .map((row) => wordTableRowEstimatedHeight(row, context));
  return Math.max(36, Math.min(900, wordTableEstimatedHeight(rowHeights)));
}

function wordSplitOversizedTableElement(
  element: unknown,
  capacity: number,
  context: WordTableHeightContext,
): unknown[] {
  const record = asRecord(element);
  const table = asRecord(record?.table);
  const rows = asArray(table?.rows).map(asRecord).filter((row): row is RecordValue => row != null);
  if (!record || !table || rows.length <= 1 || capacity <= 0) return [element];

  const rowHeights = rows.map((row) => wordTableRowEstimatedHeight(row, context));
  if (wordTableEstimatedHeight(rowHeights) <= capacity * 0.92) return [element];

  const chunks: unknown[] = [];
  let chunkRows: RecordValue[] = [];
  let chunkHeight = 0;
  const pushChunk = () => {
    if (chunkRows.length === 0) return;
    chunks.push({
      ...record,
      id: `${asString(record.id) || "table"}-chunk-${chunks.length + 1}`,
      table: { ...table, rows: chunkRows },
    });
    chunkRows = [];
    chunkHeight = 0;
  };

  rows.forEach((row, index) => {
    const rowHeight = rowHeights[index] ?? WORD_ESTIMATED_TABLE_ROW_HEIGHT;
    if (chunkRows.length > 0 && chunkHeight + rowHeight > Math.max(80, capacity * 1.18)) pushChunk();
    chunkRows.push(row);
    chunkHeight += rowHeight;
  });
  pushChunk();
  return chunks;
}

function wordTableEstimatedHeight(rowHeights: number[]): number {
  return rowHeights.reduce((total, rowHeight) => total + rowHeight, 0) + 24;
}

function wordTableRowEstimatedHeight(row: RecordValue, context: WordTableHeightContext): number {
  const explicitHeight = emuToPx(row.heightEmu ?? row.height);
  const cells = asArray(row.cells).map(asRecord).filter((cell): cell is RecordValue => cell != null);
  const cellContentWidth = context.contentWidth == null
    ? undefined
    : Math.max(72, (context.contentWidth / Math.max(1, cells.length)) - 10);
  const contentHeight = cells.reduce<number>((maxHeight, cell) => {
    const paragraphHeight = asArray(cell.paragraphs)
      .reduce<number>((total, paragraph) => {
        const height = cellContentWidth == null || context.tableParagraphHeight == null
          ? context.paragraphHeight(paragraph)
          : context.tableParagraphHeight(paragraph, cellContentWidth);
        return total + height;
      }, 0);
    return Math.max(maxHeight, paragraphHeight + tableCellPaddingPx(cell.marginTop, 3) + tableCellPaddingPx(cell.marginBottom, 3));
  }, 0);
  return Math.max(WORD_ESTIMATED_TABLE_ROW_HEIGHT, explicitHeight, contentHeight);
}

function tableCellPaddingPx(value: unknown, fallback: number): number {
  const emu = asNumber(value);
  if (emu <= 0) return fallback;
  return Math.max(2, Math.min(28, emuToPx(emu)));
}

function emuToPx(value: unknown): number {
  return asNumber(value) / 9_525;
}

const WORD_ESTIMATED_TABLE_ROW_HEIGHT = 20;
