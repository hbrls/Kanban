        import { EXCEL_MAX_COLUMN_COUNT, EXCEL_MAX_ROW_COUNT, type CellMerge, type RecordValue } from "./office-types";
        import { asArray, asNumber, asRecord, asString } from "./office-data-coerce";
        import { paragraphText } from "./office-text-styles";

        export function columnIndexFromAddress(address: string): number {
          const match = normalizedCellReference(address).match(/^\$?([A-Z]+)/i);
          if (!match) return 0;

          let index = 0;
          for (const char of (match[1] ?? "").toUpperCase()) {
            index = index * 26 + char.charCodeAt(0) - 64;
          }

          return Math.max(0, index - 1);
        }

        export function rowIndexFromAddress(address: string): number {
          const match = normalizedCellReference(address).match(/\$?(\d+)/);
          if (!match) return 1;
          return Math.max(1, Number.parseInt(match[1] ?? "1", 10));
        }

        export function parseCellRange(reference: string): CellMerge | null {
          const normalizedReference = normalizedCellReference(reference);
          const hasRangeSeparator = normalizedReference.includes(":");
          const [startRaw, endRaw = startRaw] = normalizedReference.split(":");
          if (!startRaw) return null;

          const start = parseCellRangeEndpoint(startRaw);
          const end = parseCellRangeEndpoint(endRaw);
          if (!start.hasColumn && !start.hasRow && !end.hasColumn && !end.hasRow) return null;

          const startColumn = start.columnIndex ?? 0;
          const startRow = start.rowIndex ?? 1;
          const endColumn = end.columnIndex ?? (hasRangeSeparator ? EXCEL_MAX_COLUMN_COUNT - 1 : startColumn);
          const endRow = end.rowIndex ?? (hasRangeSeparator ? EXCEL_MAX_ROW_COUNT : startRow);
          return {
            startColumn: Math.min(startColumn, endColumn),
            startRow: Math.min(startRow, endRow),
            columnSpan: Math.abs(endColumn - startColumn) + 1,
            rowSpan: Math.abs(endRow - startRow) + 1,
          };
        }

        function normalizedCellReference(reference: string): string {
          const sheetSeparator = reference.lastIndexOf("!");
          return (sheetSeparator >= 0 ? reference.slice(sheetSeparator + 1) : reference)
            .replace(/^'|'$/g, "")
            .trim();
        }

        function parseCellRangeEndpoint(reference: string): {
          columnIndex?: number;
          hasColumn: boolean;
          hasRow: boolean;
          rowIndex?: number;
        } {
          const trimmed = reference.trim();
          const columnMatch = trimmed.match(/^\$?([A-Z]+)/i);
          const rowMatch = trimmed.match(/\$?(\d+)/);
          const columnIndex = columnMatch ? columnIndexFromAddress(trimmed) : undefined;
          const rowIndex = rowMatch ? rowIndexFromAddress(trimmed) : undefined;
          return {
            ...(columnIndex != null ? { columnIndex } : {}),
            hasColumn: columnMatch != null,
            hasRow: rowMatch != null,
            ...(rowIndex != null ? { rowIndex } : {}),
          };
        }

        export function columnLabel(index: number): string {
          let value = index + 1;
          let label = "";

          while (value > 0) {
            const remainder = (value - 1) % 26;
            label = String.fromCharCode(65 + remainder) + label;
            value = Math.floor((value - 1) / 26);
          }

          return label;
        }

        export function cellText(cell: unknown): string {
          const record = asRecord(cell);
          if (record == null) return "";

          const value = asString(record.value);
          if (value) return value;

          const formula = asString(record.formula) || asString(record.formulaText);
          if (formula) return spreadsheetFormulaDisplayText(formula);

          const paragraphs = asArray(record.paragraphs);
          return paragraphs.map(paragraphText).filter(Boolean).join("\n");
        }

        function spreadsheetFormulaDisplayText(formula: string): string {
          const hyperlinkLabel = spreadsheetHyperlinkFormulaLabel(formula);
          if (hyperlinkLabel) return hyperlinkLabel;
          return `=${formula.replace(/^=/, "")}`;
        }

        function spreadsheetHyperlinkFormulaLabel(formula: string): string | null {
          const normalized = formula.trim().replace(/^=/, "");
          const openIndex = normalized.indexOf("(");
          const closeIndex = normalized.lastIndexOf(")");
          if (openIndex < 0 || closeIndex <= openIndex) return null;
          if (normalized.slice(0, openIndex).trim().toUpperCase() !== "HYPERLINK") return null;

          const args = splitSpreadsheetFormulaArgs(normalized.slice(openIndex + 1, closeIndex));
          const displayArg = args[1]?.trim() || args[0]?.trim();
          if (!displayArg) return null;
          return spreadsheetStringLiteralValue(displayArg) ?? displayArg;
        }

        function splitSpreadsheetFormulaArgs(source: string): string[] {
          const args: string[] = [];
          let current = "";
          let inString = false;

          for (let index = 0; index < source.length; index += 1) {
            const char = source[index];
            if (char === '"') {
              current += char;
              if (inString && source[index + 1] === '"') {
                current += source[index + 1];
                index += 1;
              } else {
                inString = !inString;
              }
              continue;
            }

            if (char === "," && !inString) {
              args.push(current.trim());
              current = "";
              continue;
            }

            current += char;
          }

          args.push(current.trim());
          return args;
        }

        function spreadsheetStringLiteralValue(value: string): string | null {
          const trimmed = value.trim();
          if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return null;
          return trimmed.slice(1, -1).replaceAll('""', '"');
        }

        export function styleAt(values: unknown, index: unknown): RecordValue | null {
          const styleIndex = asNumber(index, -1);
          if (styleIndex < 0) return null;
          return asRecord(asArray(values)[styleIndex]);
        }

