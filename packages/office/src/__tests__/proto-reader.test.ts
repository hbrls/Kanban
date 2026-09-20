import { describe, expect, it } from "vitest";

import { ProtoReader } from "../proto-reader.js";

function varint(value: bigint): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= 0x80n) {
    bytes.push(Number((remaining & 0x7fn) | 0x80n));
    remaining >>= 7n;
  }
  bytes.push(Number(remaining));
  return new Uint8Array(bytes);
}

describe("ProtoReader", () => {
  it("decodes signed int64 varints with protobuf two's-complement semantics", () => {
    const value = BigInt.asUintN(64, -1_815_167n);
    expect(new ProtoReader(varint(value)).int64()).toBe(-1_815_167);
  });

  it("decodes signed int32 varints with protobuf two's-complement semantics", () => {
    const value = BigInt.asUintN(64, -42n);
    expect(new ProtoReader(varint(value)).int32()).toBe(-42);
  });
});
