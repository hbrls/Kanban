import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HarnessRepoSignalsPanel } from "../harness-repo-signals-panel";

describe("HarnessRepoSignalsPanel", () => {
  it("uses the repository signals header for test mode", () => {
    render(
      <HarnessRepoSignalsPanel
        workspaceId=""
        repoLabel="phodal/routa"
        mode="test"
      />,
    );

    expect(screen.getByRole("heading", { name: "Test Feedback" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Repository Signals" })).toBeNull();
  });
});
