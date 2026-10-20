import { describe, expect, it } from "vitest";

import { parseArgs, splitToolModel, summarize } from "../coauthor-stats";

describe("coauthor-stats", () => {
  it("parses range and output mode flags", () => {
    expect(parseArgs(["--range", "origin/main..HEAD", "--json"])).toEqual({
      includeMerges: false,
      json: true,
      table: false,
      range: "origin/main..HEAD",
    });
  });

  it("splits tool and model names from co-author display names", () => {
    expect(splitToolModel("GitHub Copilot Agent (GPT 5.4)")).toEqual({
      tool: "GitHub Copilot Agent",
      model: "GPT 5.4",
    });
  });

  it("aggregates top tool and model counts", () => {
    const summary = summarize([
      { commit: "a", tool: "Copilot", model: "GPT 5.4", email: "a@example.com", rawName: "Copilot" },
      { commit: "b", tool: "Copilot", model: "GPT 5.4", email: "a@example.com", rawName: "Copilot" },
      { commit: "b", tool: "Claude", model: "Sonnet", email: "b@example.com", rawName: "Claude" },
    ]);

    expect(summary.commitsWithCoAuthor).toBe(2);
    expect(summary.topTools[0]).toEqual({ name: "Copilot", count: 2 });
    expect(summary.topModels[0]).toEqual({ name: "GPT 5.4", count: 2 });
  });
});
