export type ProtoField = {
  fieldNumber: number;
  wireType: number;
};

export class ProtoReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  eof(): boolean {
    return this.offset >= this.bytes.length;
  }

  tag(): ProtoField {
    const tag = Number(this.varint());
    return {
      fieldNumber: tag >>> 3,
      wireType: tag & 7,
    };
  }

  bool(): boolean {
    return this.varint() !== 0n;
  }

  bytesField(): Uint8Array {
    const length = Number(this.varint());
    const start = this.offset;
    this.offset += length;
    return this.bytes.subarray(start, this.offset);
  }

  double(): number {
    const view = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset + this.offset,
      8,
    );
    const value = view.getFloat64(0, true);
    this.offset += 8;
    return value;
  }

  float(): number {
    const view = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset + this.offset,
      4,
    );
    const value = view.getFloat32(0, true);
    this.offset += 4;
    return value;
  }

  int32(): number {
    return Number(BigInt.asIntN(32, this.varint()));
  }

  int64(): number {
    return Number(BigInt.asIntN(64, this.varint()));
  }

  skip(wireType: number): void {
    if (wireType === 0) {
      this.varint();
      return;
    }
    if (wireType === 1) {
      this.offset += 8;
      return;
    }
    if (wireType === 2) {
      const length = Number(this.varint());
      this.offset += length;
      return;
    }
    if (wireType === 5) {
      this.offset += 4;
      return;
    }
    throw new Error(`Unsupported protobuf wire type ${wireType}`);
  }

  string(): string {
    return new TextDecoder().decode(this.bytesField());
  }

  uint32(): number {
    return Number(this.varint());
  }

  uint64(): number {
    return Number(this.varint());
  }

  private varint(): bigint {
    let shift = 0n;
    let result = 0n;
    for (;;) {
      if (this.offset >= this.bytes.length) {
        throw new Error("Unexpected end of protobuf varint");
      }
      const byte = BigInt(this.bytes[this.offset++]);
      result |= (byte & 0x7fn) << shift;
      if ((byte & 0x80n) === 0n) return result;
      shift += 7n;
      if (shift > 70n) {
        throw new Error("Invalid protobuf varint");
      }
    }
  }
}
