import { describe, expect, it } from "vitest";

import {
  firstPromptParagraph,
  renderExecutionSummary,
  renderOverviewMarkdown,
} from "../docs/generate-specialist-docs";

describe("generate-specialist-docs", () => {
  it("ignores section headings when extracting prompt summary", () => {
    expect(firstPromptParagraph("## Title\n\nPrimary paragraph.\nStill same.\n\n## Next")).toBe(
      "Primary paragraph. Still same.",
    );
  });

  it("renders overview markdown with grouped specialist rows", () => {
    const markdown = renderOverviewMarkdown({
      groups: {
        core: [
          {
            id: "planner",
            name: "Planner",
            description: "",
            role: "PLANNER",
            modelTier: "smart",
            roleReminder: "",
            execution: {},
            systemPrompt: "",
            group: "core",
            path: "resources/specialists/core/planner.yaml",
            locales: [],
          },
        ],
      },
      totalSpecialists: 1,
      totalLocales: 0,
    });

    expect(markdown).toContain("| `planner` | Planner | `PLANNER` | `smart` | 0 |");
  });

  it("summarizes execution defaults without empty fields", () => {
    expect(
      renderExecutionSummary({
        id: "reviewer",
        name: "Reviewer",
        description: "",
        role: "",
        modelTier: "",
        roleReminder: "",
        execution: { role: "REVIEWER", provider: "opencode", modelTier: "fast" },
        systemPrompt: "",
        group: "review",
        path: "resources/specialists/review/reviewer.yaml",
        locales: [],
      }),
    ).toBe("role=REVIEWER, provider=opencode, model_tier=fast");
  });
});
