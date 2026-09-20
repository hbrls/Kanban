import { describe, expect, it } from "vitest";
import { inferToolDisplayName } from "../tool-display-name";

describe("inferToolDisplayName", () => {
  it("extracts MCP tool names from provider-prefixed titles", () => {
    expect(inferToolDisplayName("Tool: routa-coordination/update_card", undefined, {
      cardId: "123",
      description: "Updated description",
    })).toBe("update_card");
  });

  it("does not treat provider tool titles as file paths", () => {
    expect(inferToolDisplayName("Tool: routa-coordination/decompose_tasks", undefined, {
      columnId: "backlog",
      tasks: [],
    })).toBe("decompose_tasks");
  });

  it("still infers filesystem tools from real file paths", () => {
    expect(inferToolDisplayName("src/app/page.tsx", undefined, {
      filePath: "src/app/page.tsx",
    })).toBe("read-file");
  });
});
