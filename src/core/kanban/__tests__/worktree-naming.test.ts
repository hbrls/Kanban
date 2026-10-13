import { describe, expect, it } from "vitest";
import { buildKanbanWorktreeNaming } from "../worktree-naming";

describe("buildKanbanWorktreeNaming", () => {
  it("uses the task id instead of the task title slug", () => {
    expect(buildKanbanWorktreeNaming("cf7f1e28-011d-4d0b-98e3-0f7d9b012570")).toEqual({
      shortTaskId: "cf7f1e28",
      branch: "issue/cf7f1e28",
      label: "cf7f1e28",
    });
  });

  it("keeps short non-uuid ids stable", () => {
    expect(buildKanbanWorktreeNaming("task-1")).toEqual({
      shortTaskId: "task-1",
      branch: "issue/task-1",
      label: "task-1",
    });
  });
});
