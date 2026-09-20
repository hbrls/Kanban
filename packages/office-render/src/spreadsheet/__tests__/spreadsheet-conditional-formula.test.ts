import { describe, expect, it } from "vitest";

import {
  conditionalFormulaMatches,
  conditionalFormulaValue,
  type ConditionalFormulaContext,
} from "../spreadsheet-conditional-formula";
import type { RecordValue } from "../../shared/office-preview-utils";

function formulaContext(formula = "=TRUE"): ConditionalFormulaContext {
  return {
    columnIndex: 0,
    formulas: [formula],
    range: { startColumn: 0, startRow: 1 },
    rowsByIndex: new Map(),
    rowIndex: 1,
  };
}

function worksheetContext(cells: Record<string, string>, formula = "=TRUE"): ConditionalFormulaContext {
  const rows = new Map<number, Map<number, RecordValue>>();
  for (const [address, value] of Object.entries(cells)) {
    const rowIndex = Number(address.match(/\d+/)?.[0] ?? "1");
    const columnIndex = (address.match(/[A-Z]+/)?.[0] ?? "A").split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
    rows.set(rowIndex, new Map([...(rows.get(rowIndex) ?? new Map()), [columnIndex, { value }]]));
  }
  return {
    ...formulaContext(formula),
    rowsByIndex: rows,
  };
}

describe("spreadsheet conditional formulas", () => {
  it("formats date and time values with TEXT", () => {
    const context = formulaContext();

    expect(conditionalFormulaValue("=TEXT(DATE(2026,5,1),\"yyyy-mm-dd\")", context)).toBe("2026-05-01");
    expect(conditionalFormulaValue("=TEXT(DATE(2026,5,1),\"mmm d\")", context)).toBe("May 1");
    expect(conditionalFormulaValue("=TEXT(TIME(6,30,0),\"h:mm\")", context)).toBe("6:30");
  });

  it("evaluates date and time conversion functions in conditional comparisons", () => {
    expect(conditionalFormulaMatches(formulaContext("=DATEVALUE(\"2026-05-01\")=DATE(2026,5,1)"))).toBe(true);
    expect(conditionalFormulaMatches(formulaContext("=TIMEVALUE(\"06:30:00\")=TIME(6,30,0)"))).toBe(true);
    expect(conditionalFormulaMatches(formulaContext("=TEXT(DATE(2026,5,1),\"yyyy-mm\")=\"2026-05\""))).toBe(true);
  });

  it("evaluates production text and comparison helper formulas", () => {
    const context = formulaContext();

    expect(conditionalFormulaValue("=TEXTBEFORE(TEXTAFTER(\"[workbook.xlsx]Sheet1\",\"[\"),\"]\")", context)).toBe("workbook.xlsx");
    expect(conditionalFormulaValue("=CHAR(10)", context)).toBe("\n");
    expect(conditionalFormulaMatches(formulaContext("=AND(GTE(LEN(\"answer\"),0),LTE(LEN(\"answer\"),2000))"))).toBe(true);
  });

  it("evaluates SUBTOTAL over OFFSET ranges from production defined names", () => {
    const context = worksheetContext({
      A7: "10",
      A8: "20",
      A9: "",
      A10: "40",
    });

    expect(conditionalFormulaValue("=SUBTOTAL(9,OFFSET($A$7:$A$10,0,0,COUNTA($A$7:$A$10)-1,1))", context)).toBe(30);
  });
});
