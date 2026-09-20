"use client";

import { asArray, asNumber, asRecord, asString, type OfficeTextStyleMaps, type RecordValue } from "../shared/office-preview-utils";
import {
  readableTextColor,
  wordFillToCss,
  type WordPageLayout,
  wordTableCellStyle,
  wordTableContainerStyle,
  wordTableRowStyle,
  wordTableStyle,
} from "./word-layout";
import { WordParagraph, wordParagraphView } from "./word-paragraph-renderer";

export function WordTable({
  element,
  numberingMarkers,
  pageLayout,
  referenceMarkers,
  reviewMarkTypes,
  styleMaps,
  table,
}: {
  element: RecordValue;
  numberingMarkers: Map<string, string>;
  pageLayout: WordPageLayout;
  referenceMarkers: Map<string, string[]>;
  reviewMarkTypes: Map<string, number>;
  styleMaps: OfficeTextStyleMaps;
  table: RecordValue;
}) {
  const rows = asArray(table.rows).map(asRecord).filter((row): row is RecordValue => row != null);
  if (rows.length === 0) return null;
  const columnWidths = asArray(table.columnWidths).map((width) => asNumber(width)).filter((width) => width > 0);
  const columnWidthTotal = columnWidths.reduce((total, width) => total + width, 0);

  return (
    <div style={wordTableContainerStyle(element, pageLayout)}>
      <table style={wordTableStyle(columnWidths.length > 0)}>
        {columnWidths.length > 0 ? (
          <colgroup>
            {columnWidths.map((width, index) => (
              <col key={`${width}-${index}`} style={{ width: `${(width / columnWidthTotal) * 100}%` }} />
            ))}
          </colgroup>
        ) : null}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={asString(row.id) || rowIndex} style={wordTableRowStyle(row)}>
              {asArray(row.cells).map((cell, cellIndex) => {
                const cellRecord = asRecord(cell) ?? {};
                const paragraphs = asArray(cellRecord.paragraphs).map((paragraph) =>
                  wordParagraphView(paragraph, styleMaps, numberingMarkers, referenceMarkers, reviewMarkTypes),
                );
                const background = wordFillToCss(cellRecord.fill) ?? (rowIndex === 0 ? "#f8fafc" : "#ffffff");
                const fallbackTextColor = readableTextColor(background);
                const gridSpan = Math.max(1, Math.floor(asNumber(cellRecord.gridSpan, 1)));
                const rowSpan = Math.max(1, Math.floor(asNumber(cellRecord.rowSpan, 1)));
                return (
                  <td
                    colSpan={gridSpan > 1 ? gridSpan : undefined}
                    key={asString(cellRecord.id) || cellIndex}
                    rowSpan={rowSpan > 1 ? rowSpan : undefined}
                    style={wordTableCellStyle(cellRecord, background, fallbackTextColor)}
                  >
                    {paragraphs.length > 0 ? (
                      paragraphs.map((paragraph, index) => (
                        <WordParagraph
                          fallbackColor={fallbackTextColor}
                          key={paragraph.id || index}
                          paragraph={paragraph}
                          variant="table"
                        />
                      ))
                    ) : (
                      asString(cellRecord.text)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
