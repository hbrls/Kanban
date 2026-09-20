import { describe, expect, it } from "vitest";
import {
  getKanbanAutoProvider,
  setKanbanAutoProvider,
} from "../board-auto-provider";

describe("board-auto-provider", () => {
  it("returns undefined when no board auto provider has been stored", () => {
    expect(getKanbanAutoProvider(undefined, "board-1")).toBeUndefined();
    expect(getKanbanAutoProvider({ unrelated: "value" }, "board-1")).toBeUndefined();
  });

  it("stores and reads a normalized board auto provider", () => {
    const metadata = setKanbanAutoProvider(
      { unrelated: "value" },
      "board-1",
      " codex ",
    );

    expect(metadata).toEqual({
      unrelated: "value",
      "kanbanAutoProvider:board-1": "codex",
    });
    expect(getKanbanAutoProvider(metadata, "board-1")).toBe("codex");
    expect(getKanbanAutoProvider(metadata, "board-2")).toBeUndefined();
  });

  it("clears the stored provider when the value is blank", () => {
    const metadata = setKanbanAutoProvider(
      {
        unrelated: "value",
        "kanbanAutoProvider:board-1": "claude",
      },
      "board-1",
      "   ",
    );

    expect(metadata).toEqual({
      unrelated: "value",
    });
    expect(getKanbanAutoProvider(metadata, "board-1")).toBeUndefined();
  });
});
