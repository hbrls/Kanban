import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { desktopAwareFetch } = vi.hoisted(() => ({
  desktopAwareFetch: vi.fn(),
}));

const globalFetchSpy = vi.fn();

vi.mock("@/client/utils/diagnostics", () => ({
  desktopAwareFetch,
}));

vi.mock("@/client/hooks/use-workspaces", () => ({
  useWorkspaces: () => ({
    workspaces: [{ id: "default", title: "Default Workspace" }],
    loading: false,
    fetchWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    archiveWorkspace: vi.fn(),
  }),
}));

vi.mock("@/i18n", () => ({
  useTranslation: () => ({
    t: {
      common: {
        save: "Save",
        close: "Close",
        cancel: "Cancel",
        running: "Running",
      },
      workflows: {
        noSteps: "No steps",
        executionFailed: "Execution failed",
        newWorkflow: "New Workflow",
        editLabel: "Edit: ",
        selectWorkspaceFirst: "Select workspace first",
        run: "Run",
        loadingWorkflows: "Loading workflows",
        noWorkflows: "No workflows found",
        noWorkflowsHint: "Create your first workflow to get started.",
        saving: "Saving...",
      },
    },
  }),
}));

import { WorkflowPanel } from "../workflow-panel";

describe("WorkflowPanel", () => {
  beforeEach(() => {
    desktopAwareFetch.mockReset();
    desktopAwareFetch.mockImplementation(async (url: string) => {
      if (url === "/api/workflows") {
        return {
          ok: true,
          json: async () => ({
            workflows: [
              {
                id: "review-flow",
                name: "Review Flow",
                description: "Validates desktop-safe workflow fetches",
                version: "1.0",
                trigger: { type: "manual" },
                steps: [{ name: "Analyze", specialist: "reviewer" }],
                yamlContent: "name: Review Flow",
              },
            ],
          }),
        };
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    globalFetchSpy.mockReset();
    vi.stubGlobal("fetch", globalFetchSpy);
  });

  it("loads workflows via desktopAwareFetch instead of raw fetch", async () => {
    render(<WorkflowPanel />);

    await waitFor(() => {
      expect(screen.getByText("Review Flow")).not.toBeNull();
    });

    expect(desktopAwareFetch).toHaveBeenCalledWith("/api/workflows");
    expect(globalFetchSpy).not.toHaveBeenCalled();
  });
});
