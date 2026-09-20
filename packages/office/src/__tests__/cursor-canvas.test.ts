import { describe, expect, it } from "vitest";

import { buildPptxCursorCanvasPayload } from "../cursor-canvas.js";

describe("buildPptxCursorCanvasPayload", () => {
  it("decodes PPTX gradient fills for the presentation renderer payload", async () => {
    const gradientFill = message([
      int32Field(1, 2),
      bytesField(3, gradientStop(0, "8C8C8C")),
      bytesField(3, gradientStop(100_000, "404040")),
      int32Field(5, 1),
      doubleField(6, 45),
      boolField(7, true),
    ]);
    const protoBytes = message([
      bytesField(
        1,
        message([
          int32Field(1, 1),
          bytesField(
            3,
            message([
              bytesField(1, bbox(0, 0, 1_324_200, 366_300)),
              bytesField(4, message([int32Field(1, 5), bytesField(5, gradientFill)])),
              stringField(10, "Gradient box"),
              int32Field(11, 1),
            ]),
          ),
          int64Field(5, 9_144_000),
          int64Field(6, 5_143_500),
        ]),
      ),
    ]);

    const payload = await buildPptxCursorCanvasPayload(protoBytes, {
      readerVersion: "test-reader",
      sourcePath: "gradient.pptx",
      title: "Gradient",
    });
    const firstSlide = payload.slides[0] as { elements?: Array<{ shape?: { fill?: Record<string, unknown> } }> } | undefined;
    const fill = firstSlide?.elements?.[0]?.shape?.fill ?? {};

    expect(fill.type).toBe(2);
    expect(fill.gradientAngle).toBe(45);
    expect(fill.gradientScaled).toBe(true);
    expect(fill.gradientStops).toEqual([
      { color: { type: 1, value: "8C8C8C" }, position: 0 },
      { color: { type: 1, value: "404040" }, position: 100_000 },
    ]);
  });

  it("decodes PPTX table cell margins and anchoring for Cursor payloads", async () => {
    const tableCell = message([
      bytesField(3, message([bytesField(1, message([stringField(1, "Cell")]))])),
      int32Field(13, 12_345),
      int32Field(14, 23_456),
      int32Field(15, 3_456),
      int32Field(16, 4_567),
      stringField(17, "ctr"),
      boolField(18, true),
      stringField(19, "clip"),
    ]);
    const protoBytes = message([
      bytesField(
        1,
        message([
          int32Field(1, 1),
          bytesField(
            3,
            message([
              bytesField(1, bbox(0, 0, 1_000_000, 500_000)),
              stringField(10, "Table"),
              int32Field(11, 9),
              bytesField(
                21,
                message([
                  bytesField(1, message([bytesField(1, tableCell), int32Field(2, 500_000)])),
                  int32Field(2, 1_000_000),
                ]),
              ),
            ]),
          ),
          int64Field(5, 1_000_000),
          int64Field(6, 500_000),
        ]),
      ),
    ]);

    const payload = await buildPptxCursorCanvasPayload(protoBytes, {
      readerVersion: "test-reader",
      sourcePath: "table.pptx",
      title: "Table",
    });
    const firstSlide = payload.slides[0] as { elements?: Array<{ table?: { rows?: Array<{ cells?: Record<string, unknown>[] }> } }> } | undefined;
    const cell = firstSlide?.elements?.[0]?.table?.rows?.[0]?.cells?.[0] ?? {};

    expect(cell).toMatchObject({
      anchor: "ctr",
      anchorCenter: true,
      bottomMargin: 4_567,
      horizontalOverflow: "clip",
      leftMargin: 12_345,
      rightMargin: 23_456,
      topMargin: 3_456,
    });
  });

  it("emits pre-rendered Cursor rail thumbnails while using the presentation renderer payload", async () => {
    const fill = solidFill("FF3366");
    const protoBytes = message([
      bytesField(
        1,
        message([
          int32Field(1, 1),
          bytesField(
            3,
            message([
              bytesField(1, bbox(0, 0, 1_000_000, 500_000)),
              bytesField(4, message([int32Field(1, 5), bytesField(5, fill)])),
              stringField(10, "Shape"),
              int32Field(11, 1),
            ]),
          ),
          int64Field(5, 1_000_000),
          int64Field(6, 500_000),
        ]),
      ),
    ]);

    const payload = await buildPptxCursorCanvasPayload(protoBytes, {
      includeThumbnails: true,
      readerVersion: "test-reader",
      sourcePath: "shape.pptx",
      title: "Shape",
    });

    expect(payload.artifact.mode).toBe("presentation-renderer");
    const thumbnail = payload.slides[0]?.thumbnail;
    expect(thumbnail).not.toBeNull();
    expect(String(thumbnail)).toMatch(/^data:image\/(?:jpeg|svg\+xml);base64,/u);
  });

  it("preserves PPTX arrow geometry codes for Cursor renderer parity", async () => {
    const protoBytes = message([
      bytesField(
        1,
        message([
          int32Field(1, 1),
          bytesField(
            3,
            message([
              bytesField(1, bbox(0, 0, 1_000_000, 500_000)),
              bytesField(4, message([int32Field(1, 202)])),
              stringField(10, "Curved Right Arrow"),
              int32Field(11, 1),
            ]),
          ),
          bytesField(
            3,
            message([
              bytesField(1, bbox(1_000_000, 0, 1_000_000, 500_000)),
              bytesField(4, message([int32Field(1, 62)])),
              stringField(10, "Quad Arrow Callout"),
              int32Field(11, 1),
            ]),
          ),
          int64Field(5, 2_000_000),
          int64Field(6, 500_000),
        ]),
      ),
    ]);

    const payload = await buildPptxCursorCanvasPayload(protoBytes, {
      readerVersion: "test-reader",
      sourcePath: "arrows.pptx",
      title: "Arrows",
    });
    const firstSlide = payload.slides[0] as { elements?: Array<{ shape?: { geometry?: number } }> } | undefined;

    expect(firstSlide?.elements?.map((element) => element.shape?.geometry)).toEqual([202, 62]);
  });

  it("preserves PPTX preset geometry adjustments for renderer fidelity", async () => {
    const protoBytes = message([
      bytesField(
        1,
        message([
          int32Field(1, 1),
          bytesField(
            3,
            message([
              bytesField(1, bbox(0, 0, 1_000_000, 500_000)),
              bytesField(
                4,
                message([
                  int32Field(1, 40),
                  bytesField(7, message([stringField(1, "adj1"), stringField(2, "val 10800000")])),
                  bytesField(7, message([stringField(1, "adj2"), stringField(2, "val 16200000")])),
                ]),
              ),
              stringField(10, "Pie"),
              int32Field(11, 1),
            ]),
          ),
          int64Field(5, 1_000_000),
          int64Field(6, 500_000),
        ]),
      ),
    ]);

    const payload = await buildPptxCursorCanvasPayload(protoBytes, {
      readerVersion: "test-reader",
      sourcePath: "pie.pptx",
      title: "Pie",
    });
    const firstSlide = payload.slides[0] as { elements?: Array<{ shape?: { adjustmentList?: unknown[] } }> } | undefined;

    expect(firstSlide?.elements?.[0]?.shape?.adjustmentList).toEqual([
      { formula: "val 10800000", name: "adj1" },
      { formula: "val 16200000", name: "adj2" },
    ]);
  });

  it("preserves PPTX picture alpha modulation for color fidelity", async () => {
    const protoBytes = message([
      bytesField(
        1,
        message([
          int32Field(1, 1),
          bytesField(
            3,
            message([
              bytesField(1, bbox(0, 0, 1_000_000, 500_000)),
              bytesField(
                19,
                message([
                  int32Field(1, 4),
                  bytesField(11, message([stringField(1, "/ppt/media/image.jpg")])),
                  int32Field(12, 45_000),
                ]),
              ),
              stringField(10, "Picture"),
              int32Field(11, 7),
            ]),
          ),
          int64Field(5, 1_000_000),
          int64Field(6, 500_000),
        ]),
      ),
    ]);

    const payload = await buildPptxCursorCanvasPayload(protoBytes, {
      readerVersion: "test-reader",
      sourcePath: "picture.pptx",
      title: "Picture",
    });
    const firstSlide = payload.slides[0] as { elements?: Array<{ fill?: { alphaModFix?: number } }> } | undefined;

    expect(firstSlide?.elements?.[0]?.fill?.alphaModFix).toBe(45_000);
  });

  it("preserves original PPTX image media by default for Cursor color fidelity", async () => {
    const pngBytes = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l8WU7wAAAABJRU5ErkJggg==",
        "base64",
      ),
    );
    const protoBytes = message([
      bytesField(
        1,
        message([
          int32Field(1, 1),
          int64Field(5, 1_000_000),
          int64Field(6, 500_000),
        ]),
      ),
      bytesField(
        4,
        message([
          stringField(1, "image/png"),
          bytesField(2, pngBytes),
          stringField(3, "/ppt/media/red.png"),
        ]),
      ),
    ]);

    const payload = await buildPptxCursorCanvasPayload(protoBytes, {
      readerVersion: "test-reader",
      sourcePath: "image.pptx",
      title: "Image",
    });

    expect(payload.media["/ppt/media/red.png"]?.src).toBe(
      `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`,
    );
  });
});

function gradientStop(position: number, color: string): Uint8Array {
  return message([
    int32Field(1, position),
    bytesField(2, message([int32Field(1, 1), stringField(2, color)])),
  ]);
}

function solidFill(color: string): Uint8Array {
  return message([
    int32Field(1, 1),
    bytesField(2, message([int32Field(1, 1), stringField(2, color)])),
  ]);
}

function bbox(x: number, y: number, width: number, height: number): Uint8Array {
  return message([
    int64Field(1, x),
    int64Field(2, y),
    int64Field(3, width),
    int64Field(4, height),
  ]);
}

function boolField(fieldNumber: number, value: boolean): Uint8Array {
  return concat([tag(fieldNumber, 0), varint(value ? 1 : 0)]);
}

function bytesField(fieldNumber: number, value: Uint8Array): Uint8Array {
  return concat([tag(fieldNumber, 2), varint(value.length), value]);
}

function doubleField(fieldNumber: number, value: number): Uint8Array {
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setFloat64(0, value, true);
  return concat([tag(fieldNumber, 1), new Uint8Array(buffer)]);
}

function int32Field(fieldNumber: number, value: number): Uint8Array {
  return concat([tag(fieldNumber, 0), varint(value)]);
}

function int64Field(fieldNumber: number, value: number): Uint8Array {
  return concat([tag(fieldNumber, 0), varint(value)]);
}

function stringField(fieldNumber: number, value: string): Uint8Array {
  return bytesField(fieldNumber, new TextEncoder().encode(value));
}

function message(fields: Uint8Array[]): Uint8Array {
  return concat(fields);
}

function tag(fieldNumber: number, wireType: number): Uint8Array {
  return varint((fieldNumber << 3) | wireType);
}

function varint(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = BigInt(value);
  while (remaining >= 0x80n) {
    bytes.push(Number((remaining & 0x7fn) | 0x80n));
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return new Uint8Array(bytes);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
