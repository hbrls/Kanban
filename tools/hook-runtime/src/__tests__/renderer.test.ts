import { describe, expect, it } from "vitest";

import { RollingLogBuffer } from "../renderer.js";

describe("RollingLogBuffer", () => {
  it("keeps only the latest configured number of lines", () => {
    const buffer = new RollingLogBuffer(3);

    buffer.append("ts_test_pass", "line-1\nline-2\n");
    buffer.append("clippy_pass", "line-3\nline-4\n");

    expect(buffer.snapshot()).toEqual([
      "[ts_test_pass] line-2",
      "[clippy_pass] line-3",
      "[clippy_pass] line-4",
    ]);
  });

  it("preserves partial chunks until the line is completed", () => {
    const buffer = new RollingLogBuffer(10);

    buffer.append("rust_test_pass", "part");
    expect(buffer.snapshot()).toEqual([]);

    buffer.append("rust_test_pass", "ial line\nnext");
    expect(buffer.snapshot()).toEqual(["[rust_test_pass] partial line"]);

    buffer.flush("rust_test_pass");
    expect(buffer.snapshot()).toEqual([
      "[rust_test_pass] partial line",
      "[rust_test_pass] next",
    ]);
  });
});
