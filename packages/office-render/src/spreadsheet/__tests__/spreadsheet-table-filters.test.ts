import { describe, expect, it } from "vitest";

import {
  buildSpreadsheetTableFilterTargets,
  spreadsheetTableFilterActiveKeys,
  spreadsheetTableFilterRowHeightOverrides,
  spreadsheetTableFilterSelectionForToggle,
  spreadsheetTableFilterTargetAt,
  spreadsheetTableFilterValues,
} from "../spreadsheet-table-filters";

describe("spreadsheet table filters", () => {
  const sheet = {
    rows: [
      { cells: [{ address: "A1", value: "Status" }, { address: "B1", value: "Owner" }], index: 1 },
      { cells: [{ address: "A2", value: "Open" }, { address: "B2", value: "Ada" }], index: 2 },
      { cells: [{ address: "A3", value: "Closed" }, { address: "B3", value: "Ben" }], index: 3 },
      { cells: [{ address: "A4", value: "Open" }, { address: "B4", value: "Ada" }], index: 4 },
    ],
    tables: [
      {
        autoFilter: {},
        columns: [{ name: "Status" }, { name: "Owner" }],
        displayName: "Tasks",
        headerRowCount: 1,
        reference: "A1:B4",
      },
    ],
  };

  it("builds filter targets from table headers and columns", () => {
    const targets = buildSpreadsheetTableFilterTargets(sheet);

    expect(targets).toMatchObject([
      { bodyEndRow: 5, bodyStartRow: 2, columnIndex: 0, columnName: "Status", headerRowIndex: 1, tableName: "Tasks" },
      { bodyEndRow: 5, bodyStartRow: 2, columnIndex: 1, columnName: "Owner", headerRowIndex: 1, tableName: "Tasks" },
    ]);
    expect(spreadsheetTableFilterTargetAt(targets, 1, 1)?.columnName).toBe("Owner");
  });

  it("collects source-order unique values with counts", () => {
    const target = buildSpreadsheetTableFilterTargets(sheet)[0]!;

    expect(spreadsheetTableFilterValues(sheet, target)).toEqual([
      { count: 2, label: "Open", value: "Open" },
      { count: 1, label: "Closed", value: "Closed" },
    ]);
  });

  it("projects active filter selections into row-height overrides", () => {
    const target = buildSpreadsheetTableFilterTargets(sheet)[0]!;

    expect(spreadsheetTableFilterRowHeightOverrides(sheet, { [target.id]: ["Open"] })).toEqual({
      2: 0,
    });
  });

  it("clears state when every value is selected again", () => {
    expect(spreadsheetTableFilterSelectionForToggle(undefined, ["Open", "Closed"], "Closed")).toEqual(["Open"]);
    expect(spreadsheetTableFilterSelectionForToggle(["Open"], ["Open", "Closed"], "Closed")).toBeUndefined();
  });

  it("returns active header keys for filtered columns", () => {
    const target = buildSpreadsheetTableFilterTargets(sheet)[0]!;

    expect(Array.from(spreadsheetTableFilterActiveKeys([target], { [target.id]: ["Open"] }))).toEqual(["1:0"]);
  });
});
