import { describe, expect, it } from "vitest";

import {
  evaluateVolatileFormula,
  spreadsheetSheetWithVolatileFormulaValues,
} from "../spreadsheet-formula-values";
import type { RecordValue } from "../../shared/office-preview-utils";

function workbookSheet(name: string, cells: Record<string, { formula?: string; value: string }>): RecordValue {
  const rows = new Map<number, RecordValue[]>();
  for (const [address, cell] of Object.entries(cells)) {
    const rowIndex = Number(address.match(/\d+/)?.[0] ?? "1");
    rows.set(rowIndex, [
      ...(rows.get(rowIndex) ?? []),
      {
        address,
        formula: cell.formula ?? "",
        value: cell.value,
      },
    ]);
  }
  return {
    name,
    rows: Array.from(rows.entries()).map(([index, rowCells]) => ({
      cells: rowCells,
      index,
    })),
  };
}

describe("spreadsheet volatile formula values", () => {
  it("refreshes same-row TODAY date deltas for visible Excel parity", () => {
    const sheet = workbookSheet("02_Tasks_Table", {
      H5: { value: "46121" },
      I5: { formula: "H5-TODAY()", value: "-22" },
    });

    const next = spreadsheetSheetWithVolatileFormulaValues(sheet, [sheet], new Date(2026, 4, 5));
    const row = (next?.rows as RecordValue[])[0];
    const cells = row.cells as RecordValue[];

    expect(cells.find((cell) => cell.address === "I5")?.value).toBe("-26");
  });

  it("evaluates COUNTIFS criteria that compare a date range with TODAY", () => {
    const tasks = workbookSheet("02_Tasks_Table", {
      E5: { value: "Review" },
      E6: { value: "Done" },
      E7: { value: "Backlog" },
      H5: { value: "46121" },
      H6: { value: "46118" },
      H7: { value: "46165" },
    });
    const workbook = new Map<string, Map<string, RecordValue>>([
      ["02_Tasks_Table", new Map([
        ["E5", { value: "Review" }],
        ["E6", { value: "Done" }],
        ["E7", { value: "Backlog" }],
        ["H5", { value: "46121" }],
        ["H6", { value: "46118" }],
        ["H7", { value: "46165" }],
      ])],
    ]);

    expect(tasks.name).toBe("02_Tasks_Table");
    expect(evaluateVolatileFormula(
      'COUNTIFS(\'02_Tasks_Table\'!H5:H7,"<"&TODAY(),\'02_Tasks_Table\'!E5:E7,"<>Done")',
      "01_Dashboard",
      workbook,
      new Date(2026, 4, 5),
    )).toBe("1");
  });

  it("fills empty cached formula values through the shared formula evaluator", () => {
    const summary = workbookSheet("01_Dashboard", {
      A1: { formula: "COUNTA('02_Tasks_Table'!A5:A6)", value: "" },
      B1: { formula: "COUNTIF('02_Tasks_Table'!E5:E6,\"Done\")", value: "" },
    });
    const tasks = workbookSheet("02_Tasks_Table", {
      A5: { value: "RTA-1001" },
      A6: { value: "RTA-1002" },
      E5: { value: "Done" },
      E6: { value: "Review" },
    });

    const next = spreadsheetSheetWithVolatileFormulaValues(summary, [summary, tasks], new Date(2026, 4, 5));
    const cells = ((next?.rows as RecordValue[])[0].cells as RecordValue[]);

    expect(cells.find((cell) => cell.address === "A1")?.value).toBe("2");
    expect(cells.find((cell) => cell.address === "B1")?.value).toBe("1");
  });

  it("uses the uploaded workbook name for CELL filename formulas that cannot be evaluated in wasm", () => {
    const sheet = workbookSheet("Industry Partners", {
      G4: {
        formula: 'TEXTBEFORE(TEXTBEFORE(TEXTAFTER(CELL("filename"),"["),"]"),".")',
        value: "#NAME?",
      },
    });

    const next = spreadsheetSheetWithVolatileFormulaValues(
      sheet,
      [sheet],
      new Date(2026, 4, 5),
      "Thoughtworks Response DTA Cloud Marketplace Part B Attachment A - Category Capability and Experience.xlsx",
    );
    const row = (next?.rows as RecordValue[])[0];
    const cells = row.cells as RecordValue[];

    expect(cells.find((cell) => cell.address === "G4")?.value)
      .toBe("Thoughtworks Response DTA Cloud Marketplace Part B Attachment A - Category Capability and Experience");
  });
});
