import { describe, expect, it } from "vitest";

import {
  buildSpreadsheetCommentVisuals,
  buildSpreadsheetSparklineVisuals,
  buildSpreadsheetValidationVisuals,
} from "../spreadsheet-cell-overlays";
import { spreadsheetCellStyle } from "../spreadsheet-cell-styles";
import { spreadsheetSheetTabColor } from "../spreadsheet-data-access";
import {
  spreadsheetCellText,
  spreadsheetNumberFormatCode,
} from "../spreadsheet-number-format";

describe("spreadsheet cell formatting", () => {
  it("uses Excel built-in number formats when no custom number format is present", () => {
    const styles = {
      cellXfs: [
        { numFmtId: 14 },
        { numFmtId: 9 },
        { numFmtId: 4 },
        { numFmtId: 5 },
        { numFmtId: 11 },
        { numFmtId: 12 },
        { numFmtId: 18 },
        { numFmtId: 46 },
      ],
    };

    expect(spreadsheetNumberFormatCode(styles, 14)).toBe("m/d/yy");
    expect(spreadsheetCellText({ address: "A1", styleIndex: 0, value: 46023 }, styles)).toBe("Jan 01, 2026");
    expect(spreadsheetCellText({ address: "A2", styleIndex: 1, value: 0.42 }, styles)).toBe("42%");
    expect(spreadsheetCellText({ address: "A3", styleIndex: 2, value: 1234.5 }, styles)).toBe("1,234.50");
    expect(spreadsheetCellText({ address: "A4", styleIndex: 3, value: 1234.5 }, styles)).toBe("$1,235");
    expect(spreadsheetCellText({ address: "A5", styleIndex: 4, value: 12345 }, styles)).toBe("1.23E+04");
    expect(spreadsheetCellText({ address: "A6", styleIndex: 5, value: 1.25 }, styles)).toBe("1 1/4");
    expect(spreadsheetCellText({ address: "A7", styleIndex: 6, value: 0.5625 }, styles)).toBe("1:30 PM");
    expect(spreadsheetCellText({ address: "A8", styleIndex: 7, value: 1.5 }, styles)).toBe("36:00:00");
  });

  it("prefers custom number formats over built-in ids", () => {
    const styles = {
      cellXfs: [{ numFmtId: 165 }],
      numberFormats: [{ formatCode: "0.00%", id: 165 }],
    };

    expect(spreadsheetNumberFormatCode(styles, 165)).toBe("0.00%");
    expect(spreadsheetCellText({ address: "B1", styleIndex: 0, value: 0.125 }, styles)).toBe("12.50%");
  });

  it("renders ISO date custom formats like Excel", () => {
    const styles = {
      cellXfs: [{ numFmtId: 201 }],
      numberFormats: [{ formatCode: "yyyy-mm-dd", id: 201 }],
    };

    expect(spreadsheetCellText({ address: "G5", styleIndex: 0, value: 46115 }, styles)).toBe("2026-04-03");
  });

  it("uses negative sections for built-in numeric and currency formats", () => {
    const styles = {
      cellXfs: [
        { numFmtId: 5 },
        { numFmtId: 39 },
      ],
    };

    expect(spreadsheetCellText({ address: "C1", styleIndex: 0, value: -1234.5 }, styles)).toBe("($1,235)");
    expect(spreadsheetCellText({ address: "C2", styleIndex: 1, value: -1234.5 }, styles)).toBe("(1,234.50)");
  });

  it("does not format blank dashboard cells as zero values", () => {
    expect(spreadsheetCellText({ address: "C5", styleIndex: 0 }, null, "01_Dashboard")).toBe("");
    expect(spreadsheetCellText({ address: "D5", styleIndex: 0 }, null, "01_Dashboard")).toBe("");
    expect(spreadsheetCellText({ address: "C5", value: 0 }, null, "01_Dashboard")).toBe("0%");
    expect(spreadsheetCellText({ address: "D5", value: 0 }, null, "01_Dashboard")).toBe("$0");
  });

  it("suppresses fallback gridlines without hiding explicit borders", () => {
    const explicitBorderStyles = {
      borders: [
        {
          bottom: { color: { value: "FF00AA00" } },
          right: { color: { value: "FFFF0000" }, style: "mediumDashed" },
        },
      ],
      cellXfs: [{ borderId: 0 }],
    };

    expect(spreadsheetCellStyle(null, null, undefined, undefined, null, false).borderBottomColor).toBe("transparent");
    expect(spreadsheetCellStyle(null, null, undefined, undefined, null, true).borderBottomColor).toBe("#e2e8f0");
    expect(spreadsheetCellStyle({ styleIndex: 0 }, explicitBorderStyles, undefined, undefined, 0, false)).toMatchObject({
      borderBottomColor: "#00AA00",
      borderRightColor: "#FF0000",
      borderRightStyle: "dashed",
      borderRightWidth: 2,
    });
  });

  it("maps Excel alignment flags into viewport cell styles", () => {
    const styles = {
      cellXfs: [
        {
          alignment: {
            horizontal: "centerContinuous",
            indent: 2,
            shrinkToFit: true,
            vertical: "bottom",
            wrapText: false,
          },
          fontId: 0,
        },
      ],
      fonts: [{ fontSize: 20 }],
    };

    expect(spreadsheetCellStyle({ styleIndex: 0 }, styles, undefined, undefined, 0)).toMatchObject({
      alignItems: "flex-end",
      fontSize: 17.6,
      justifyContent: "center",
      paddingLeft: 33,
      textAlign: "center",
      textOverflow: "ellipsis",
      verticalAlign: "bottom",
      whiteSpace: "nowrap",
    });
  });

  it("right-aligns numeric cells by default like Excel", () => {
    expect(spreadsheetCellStyle({ address: "A1", value: 42 }, null)).toMatchObject({
      justifyContent: "flex-end",
      textAlign: "right",
    });
    expect(spreadsheetCellStyle({ address: "A2", value: "text" }, null)).toMatchObject({
      justifyContent: "flex-start",
    });
  });

  it("right-aligns RTL text by default like Excel", () => {
    expect(spreadsheetCellStyle({ address: "K7", value: "مرحبا بالعالم" }, null)).toMatchObject({
      direction: "rtl",
      justifyContent: "flex-end",
      textAlign: "right",
    });
  });

  it("uses an Excel-like default spreadsheet font stack", () => {
    expect(spreadsheetCellStyle({ address: "A1", value: "Task" }, null).fontFamily).toBe("Aptos, Calibri, Arial, Helvetica, sans-serif");
  });

  it("styles HYPERLINK formulas like Excel hyperlink cells", () => {
    expect(spreadsheetCellStyle(
      { address: "B13", formula: 'HYPERLINK("https://example.com","open external")' },
      null,
    )).toMatchObject({
      color: "#0563c1",
      cursor: "pointer",
      textDecorationLine: "underline",
    });
  });

  it("keeps icon-only conditional formats left aligned", () => {
    expect(spreadsheetCellStyle(
      { address: "N5", value: 3 },
      null,
      { iconSet: { color: "#16638a", iconSet: "5Rating", level: 4, levelCount: 5, showValue: false } },
    )).toMatchObject({
      justifyContent: "flex-start",
      textAlign: "left",
    });
  });

  it("lets direct cell fills override table backgrounds while preserving conditional fills", () => {
    const styles = {
      cellXfs: [{ fillId: 0 }],
      fills: [{ color: { value: "EAFBF1" }, type: 1 }],
    };

    expect(spreadsheetCellStyle(
      { address: "A4", styleIndex: 0 },
      styles,
      { background: "#c0d8e5", backgroundSource: "table" },
      "02_Tasks_Table",
      0,
    ).background).toBe("#EAFBF1");

    expect(spreadsheetCellStyle(
      { address: "A4", styleIndex: 0 },
      styles,
      { background: "#fee2e2", backgroundSource: "conditional" },
      "02_Tasks_Table",
      0,
    ).background).toBe("#fee2e2");
  });

  it("builds visible sparkline cells from sheet sparkline groups", () => {
    const sheet = {
      rows: [
        { cells: [{ address: "A1", value: 1 }, { address: "B1", value: 2 }, { address: "C1", value: 3 }], index: 1 },
      ],
      sparklineGroups: {
        groups: [
          {
            lineWeight: 2,
            markers: true,
            seriesColor: { value: "FF00AA00" },
            sparklines: [{ formula: "A1:C1", reference: "D1" }],
            type: 1,
          },
        ],
      },
    };

    expect(buildSpreadsheetSparklineVisuals(sheet).get("1:3")).toEqual({
      color: "#00AA00",
      lineWeight: 2,
      markers: true,
      type: "line",
      values: [1, 2, 3],
    });
  });

  it("builds comment indicators from note and threaded comment targets", () => {
    const root = {
      notes: [{ target: { cell: { address: "B2", sheetName: "Comments" } } }],
      threads: [{ target: { cell: { address: "C3", sheetName: "Other" } } }],
    };

    expect([...buildSpreadsheetCommentVisuals(root, { name: "Comments" })]).toEqual(["2:1"]);
  });

  it("builds validation indicators for list dropdown ranges", () => {
    const sheet = {
      dataValidations: {
        items: [
          {
            formula1: "\"Open,Closed\"",
            prompt: "Pick a status",
            ranges: [{ endAddress: "B3", startAddress: "B2" }],
            showDropDown: false,
            type: 4,
          },
        ],
      },
    };

    const visuals = buildSpreadsheetValidationVisuals(sheet);

    expect(visuals.get("2:1")).toEqual({ formula: "\"Open,Closed\"", prompt: "Pick a status", type: "dropdown" });
    expect(visuals.get("3:1")).toEqual({ formula: "\"Open,Closed\"", prompt: "Pick a status", type: "dropdown" });
    expect(visuals.get("4:1")).toBeUndefined();
  });

  it("resolves large validation ranges lazily for viewport cells", () => {
    const visuals = buildSpreadsheetValidationVisuals({
      dataValidations: {
        items: [
          {
            formula1: "\"Yes,No\"",
            ranges: ["A:A"],
            showDropDown: false,
            type: 4,
          },
        ],
      },
    });

    expect(visuals.get("1:0")).toEqual({ formula: "\"Yes,No\"", prompt: "", type: "dropdown" });
    expect(visuals.get("1048576:0")).toEqual({ formula: "\"Yes,No\"", prompt: "", type: "dropdown" });
    expect(visuals.get("1:1")).toBeUndefined();
  });

  it("maps sheet tab colors into CSS colors", () => {
    expect(spreadsheetSheetTabColor({ tabColor: { type: 1, value: "FF00AA00" } })).toBe("#00AA00");
  });
});
