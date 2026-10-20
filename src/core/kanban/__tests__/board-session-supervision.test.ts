import { describe, expect, it } from "vitest";
import {
  getDefaultKanbanDevSessionSupervision,
  getKanbanDevSessionSupervision,
  setKanbanDevSessionSupervision,
} from "../board-session-supervision";

describe("board-session-supervision", () => {
  it("falls back to defaults for missing or invalid metadata", () => {
    expect(getKanbanDevSessionSupervision(undefined, "board-1")).toEqual(
      getDefaultKanbanDevSessionSupervision(),
    );
    expect(getKanbanDevSessionSupervision({
      "kanbanDevSessionSupervision:board-1": "{\"mode\":\"unknown\",\"inactivityTimeoutMinutes\":0}",
    }, "board-1")).toEqual({
      mode: "watchdog_retry",
      inactivityTimeoutMinutes: 1,
      maxRecoveryAttempts: 1,
      completionRequirement: "turn_complete",
    });
    expect(getKanbanDevSessionSupervision({
      "kanbanDevSessionSupervision:board-1": "not-json",
    }, "board-1")).toEqual(getDefaultKanbanDevSessionSupervision());
  });

  it("stores and reads normalized dev session supervision per board", () => {
    const metadata = setKanbanDevSessionSupervision(
      { unrelated: "value" },
      "board-1",
      {
        mode: "ralph_loop",
        inactivityTimeoutMinutes: 12.8,
        maxRecoveryAttempts: 2.9,
        completionRequirement: "completion_summary",
      },
    );

    expect(metadata.unrelated).toBe("value");
    expect(getKanbanDevSessionSupervision(metadata, "board-1")).toEqual({
      mode: "ralph_loop",
      inactivityTimeoutMinutes: 12,
      maxRecoveryAttempts: 2,
      completionRequirement: "completion_summary",
    });
    expect(getKanbanDevSessionSupervision(metadata, "board-2")).toEqual(
      getDefaultKanbanDevSessionSupervision(),
    );
  });
});
