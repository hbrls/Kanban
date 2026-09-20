import { describe, expect, it } from "vitest";
import {
  getDefaultKanbanSessionConcurrencyLimit,
  getKanbanSessionConcurrencyLimit,
  setKanbanSessionConcurrencyLimit,
} from "../board-session-limits";

describe("board-session-limits", () => {
  it("falls back to the default limit for missing or invalid metadata", () => {
    expect(getKanbanSessionConcurrencyLimit(undefined, "board-1")).toBe(
      getDefaultKanbanSessionConcurrencyLimit(),
    );
    expect(getKanbanSessionConcurrencyLimit({ "kanbanSessionConcurrencyLimit:board-1": "0" }, "board-1")).toBe(1);
    expect(getKanbanSessionConcurrencyLimit({ "kanbanSessionConcurrencyLimit:board-1": "nope" }, "board-1")).toBe(1);
  });

  it("stores and reads a normalized per-board limit", () => {
    const metadata = setKanbanSessionConcurrencyLimit(
      { unrelated: "value" },
      "board-1",
      2.9,
    );

    expect(metadata).toEqual({
      unrelated: "value",
      "kanbanSessionConcurrencyLimit:board-1": "2",
    });
    expect(getKanbanSessionConcurrencyLimit(metadata, "board-1")).toBe(2);
    expect(getKanbanSessionConcurrencyLimit(metadata, "board-2")).toBe(1);
  });
});
