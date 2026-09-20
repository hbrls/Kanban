import { describe, expect, it } from "vitest";

import { decodeRoutaOfficeArtifact } from "../office-artifact-protobuf";

const WIRE_VARINT = 0;
const WIRE_64_BIT = 1;
const WIRE_LENGTH_DELIMITED = 2;
const encoder = new TextEncoder();

describe("decodeRoutaOfficeArtifact", () => {
  it("decodes the Routa OfficeArtifact protobuf shape", () => {
    const payload = message([
      stringField(1, "xlsx"),
      stringField(2, "Budget"),
      messageField(3, message([stringField(1, "body.paragraph[0]"), stringField(2, "Hello")])),
      messageField(
        4,
        message([
          stringField(1, "Sheet1"),
          messageField(
            2,
            message([
              varintField(2, 1),
              doubleField(3, 24),
              messageField(
                1,
                message([
                  stringField(1, "A1"),
                  stringField(2, "42"),
                  stringField(3, "SUM(A2:A3)"),
                  stringField(4, "Number"),
                  varintField(5, 3),
                  varintField(6, 1),
                ]),
              ),
            ]),
          ),
          messageField(3, message([stringField(1, "A1:C2")])),
          messageField(4, message([stringField(1, "Tasks"), stringField(2, "A1:C10"), stringField(3, "TableStyleMedium2")])),
          messageField(
            5,
            message([
              stringField(1, "list"),
              stringField(3, "\"Open,Done\""),
              stringField(5, "B2:B10"),
            ]),
          ),
          messageField(
            6,
            message([
              stringField(1, "cellIs"),
              varintField(2, 3),
              stringField(3, "C2:C10"),
              stringField(4, "greaterThan"),
              stringField(5, "0"),
              stringField(7, "DCFCE7"),
            ]),
          ),
          messageField(7, message([varintField(1, 1), varintField(2, 3), doubleField(3, 14)])),
          doubleField(8, 10),
          doubleField(9, 18),
        ]),
      ),
      messageField(
        5,
        message([
          varintField(1, 1),
          stringField(2, "Intro"),
          messageField(3, message([stringField(1, "slides[1].text[0]"), stringField(2, "Title")])),
        ]),
      ),
      messageField(6, message([stringField(1, "warning"), stringField(2, "truncated")])),
      messageField(7, message([stringField(1, "reader"), stringField(2, "routa-office-wasm-reader")])),
      messageField(
        8,
        message([
          stringField(1, "rId5"),
          stringField(2, "slides[1].image[0]"),
          stringField(3, "image/png"),
          bytesField(4, new Uint8Array([1, 2, 3])),
        ]),
      ),
      messageField(
        9,
        message([
          stringField(1, "body.table[0]"),
          messageField(2, message([messageField(1, message([stringField(2, "Cell text")]))])),
        ]),
      ),
      messageField(
        10,
        message([
          stringField(1, "rId8"),
          stringField(2, "worksheets.chart[0]"),
          stringField(3, "Velocity"),
          stringField(4, "line"),
          stringField(5, "Sheet1"),
          messageField(6, message([varintField(1, 6), varintField(2, 15), varintField(3, 12), varintField(4, 28)])),
          messageField(7, message([stringField(1, "Done"), stringField(2, "Jan"), doubleField(3, 12), stringField(4, "1F6F8B")])),
        ]),
      ),
      messageField(
        11,
        message([
          messageField(1, message([varintField(1, 200), stringField(2, "$#,##0")])),
          messageField(2, message([varintField(1, 200), varintField(2, 1), varintField(3, 2), varintField(4, 3)])),
          messageField(3, message([varintField(1, 1), doubleField(3, 12), stringField(4, "Arial"), stringField(5, "FF0000")])),
          messageField(4, message([stringField(1, "DCFCE7")])),
          messageField(5, message([stringField(1, "E5E7EB")])),
        ]),
      ),
      messageField(
        12,
        message([
          stringField(1, "shape-1"),
          stringField(2, "Sheet1"),
          varintField(3, 8),
          varintField(4, 30),
          doubleField(5, 9525),
          doubleField(6, 19050),
          doubleField(7, 3810000),
          doubleField(8, 1143000),
          stringField(9, "F0FDFA"),
          stringField(10, "14B8A6"),
          stringField(11, "Callout"),
          stringField(12, "roundRect"),
        ]),
      ),
    ]);

    const artifact = decodeRoutaOfficeArtifact(payload);

    expect(artifact.sourceKind).toBe("xlsx");
    expect(artifact.title).toBe("Budget");
    expect(artifact.textBlocks[0]).toEqual({ path: "body.paragraph[0]", text: "Hello" });
    expect(artifact.sheets[0].rows[0].cells[0]).toEqual({
      address: "A1",
      dataType: "Number",
      formula: "SUM(A2:A3)",
      hasValue: true,
      styleIndex: 3,
      text: "42",
    });
    expect(artifact.sheets[0].rows[0].index).toBe(1);
    expect(artifact.sheets[0].rows[0].height).toBe(24);
    expect(artifact.sheets[0].columns[0]).toEqual({ hidden: false, max: 3, min: 1, width: 14 });
    expect(artifact.sheets[0].defaultRowHeight).toBe(18);
    expect(artifact.slides[0].textBlocks[0].text).toBe("Title");
    expect(artifact.diagnostics[0]).toEqual({ level: "warning", message: "truncated" });
    expect(artifact.metadata.reader).toBe("routa-office-wasm-reader");
    expect(Array.from(artifact.images[0].bytes)).toEqual([1, 2, 3]);
    expect(artifact.images[0].contentType).toBe("image/png");
    expect(artifact.tables[0].rows[0].cells[0].text).toBe("Cell text");
    expect(artifact.charts[0]).toEqual({
      chartType: "line",
      anchor: {
        fromCol: 6,
        fromColOffsetEmu: 0,
        fromRow: 15,
        fromRowOffsetEmu: 0,
        toCol: 12,
        toColOffsetEmu: 0,
        toRow: 28,
        toRowOffsetEmu: 0,
      },
      id: "rId8",
      path: "worksheets.chart[0]",
      series: [{ categories: ["Jan"], color: "1F6F8B", label: "Done", values: [12] }],
      sheetName: "Sheet1",
      title: "Velocity",
    });
    expect(artifact.sheets[0].mergedRanges[0]).toEqual({ reference: "A1:C2" });
    expect(artifact.sheets[0].tables[0]).toEqual({
      name: "Tasks",
      reference: "A1:C10",
      showFilterButton: true,
      style: "TableStyleMedium2",
    });
    expect(artifact.sheets[0].dataValidations[0].ranges).toEqual(["B2:B10"]);
    expect(artifact.sheets[0].conditionalFormats[0]).toEqual({
      bold: false,
      fillColor: "DCFCE7",
      fontColor: "",
      formulas: ["0"],
      operator: "greaterThan",
      priority: 3,
      ranges: ["C2:C10"],
      text: "",
      type: "cellIs",
    });
    expect(artifact.styles.numberFormats[0]).toEqual({ formatCode: "$#,##0", id: 200 });
    expect(artifact.styles.cellXfs[0].numFmtId).toBe(200);
    expect(artifact.styles.fonts[0].typeface).toBe("Arial");
    expect(artifact.shapes[0]).toEqual({
      fillColor: "F0FDFA",
      fromCol: 8,
      fromColOffsetEmu: 9525,
      fromRow: 30,
      fromRowOffsetEmu: 19050,
      geometry: "roundRect",
      heightEmu: 1143000,
      id: "shape-1",
      lineColor: "14B8A6",
      sheetName: "Sheet1",
      text: "Callout",
      widthEmu: 3810000,
    });
  });

  it("skips unknown length-delimited fields", () => {
    const payload = message([stringField(1, "docx"), stringField(99, "future")]);

    expect(decodeRoutaOfficeArtifact(payload).sourceKind).toBe("docx");
  });
});

function message(fields: Uint8Array[]): Uint8Array {
  return concat(fields);
}

function stringField(fieldNumber: number, value: string): Uint8Array {
  const bytes = encoder.encode(value);
  return concat([tag(fieldNumber, WIRE_LENGTH_DELIMITED), varint(bytes.length), bytes]);
}

function messageField(fieldNumber: number, value: Uint8Array): Uint8Array {
  return concat([tag(fieldNumber, WIRE_LENGTH_DELIMITED), varint(value.length), value]);
}

function bytesField(fieldNumber: number, value: Uint8Array): Uint8Array {
  return concat([tag(fieldNumber, WIRE_LENGTH_DELIMITED), varint(value.length), value]);
}

function varintField(fieldNumber: number, value: number): Uint8Array {
  return concat([tag(fieldNumber, WIRE_VARINT), varint(value)]);
}

function doubleField(fieldNumber: number, value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, true);
  return concat([tag(fieldNumber, WIRE_64_BIT), bytes]);
}

function tag(fieldNumber: number, wireType: number): Uint8Array {
  return varint(fieldNumber * 8 + wireType);
}

function varint(value: number): Uint8Array {
  const bytes: number[] = [];
  let next = value;
  while (next >= 0x80) {
    bytes.push((next & 0x7f) | 0x80);
    next = Math.floor(next / 0x80);
  }
  bytes.push(next);
  return new Uint8Array(bytes);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
