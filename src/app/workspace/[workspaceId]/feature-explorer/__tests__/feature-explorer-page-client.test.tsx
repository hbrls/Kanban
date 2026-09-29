import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navState = vi.hoisted(() => ({
  push: vi.fn(),
}));

const { useWorkspaces, useCodebases } = vi.hoisted(() => ({
  useWorkspaces: vi.fn(),
  useCodebases: vi.fn(),
}));

const { useFeatureExplorerData } = vi.hoisted(() => ({
  useFeatureExplorerData: vi.fn(),
}));

const localStorageMock = vi.hoisted(() => {
  let store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store = new Map<string, string>();
    }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navState.push }),
}));

vi.mock("@/client/hooks/use-workspaces", () => ({
  useWorkspaces,
  useCodebases,
}));

vi.mock("../use-feature-explorer-data", () => ({
  useFeatureExplorerData,
}));

vi.mock("@/client/components/desktop-app-shell", () => ({
  DesktopAppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="desktop-shell">{children}</div>,
}));

vi.mock("@/client/components/workspace-switcher", () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));

vi.mock("@/client/components/repo-picker", () => ({
  RepoPicker: ({
    value,
    onChange,
  }: {
    value: { name: string; path: string; branch: string } | null;
    onChange: (value: { name: string; path: string; branch: string } | null) => void;
  }) => (
    <div>
      <div data-testid="repo-picker-value">
        {value ? `${value.name}|${value.path}|${value.branch}` : "none"}
      </div>
      <button
        type="button"
        onClick={() => onChange({ name: "local-project", path: "/tmp/local-project", branch: "feature-x" })}
      >
        switch repo
      </button>
      <button type="button" onClick={() => onChange(null)}>
        clear repo
      </button>
    </div>
  ),
}));

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

import { FeatureExplorerPageClient } from "../feature-explorer-page-client";

describe("FeatureExplorerPageClient", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/workspace/default/feature-explorer");
    window.localStorage.clear();
    navState.push.mockReset();
    useWorkspaces.mockReturnValue({
      loading: false,
      workspaces: [{ id: "default", title: "Default Workspace" }],
      createWorkspace: vi.fn(),
    });
    useCodebases.mockReturnValue({
      codebases: [
        {
          id: "cb-default",
          workspaceId: "default",
          repoPath: "/repo/default",
          branch: "main",
          label: "routa-js",
          isDefault: true,
          createdAt: "",
          updatedAt: "",
        },
      ],
      fetchCodebases: vi.fn(),
    });
    useFeatureExplorerData.mockReturnValue({
      loading: false,
      error: null,
      capabilityGroups: [],
      features: [],
      surfaceIndex: {
        generatedAt: "",
        pages: [],
        apis: [],
        contractApis: [],
        nextjsApis: [],
        rustApis: [],
        metadata: null,
        repoRoot: "",
        warnings: [],
      },
    });
  });

  it("uses the default codebase until the user selects another local repository", async () => {
    const view = render(<FeatureExplorerPageClient workspaceId="default" />);

    expect(screen.getByTestId("repo-picker-value").textContent).toBe("routa-js|/repo/default|main");
    expect(useFeatureExplorerData).toHaveBeenLastCalledWith({
      workspaceId: "default",
      repoPath: "/repo/default",
      refreshKey: "/repo/default:main",
    });

    expect(window.localStorage.getItem("routa.repoSelection.featureExplorer.default")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "switch repo" }));

    await waitFor(() => {
      expect(screen.getByTestId("repo-picker-value").textContent).toBe(
        "local-project|/tmp/local-project|feature-x",
      );
    });

    expect(useFeatureExplorerData).toHaveBeenLastCalledWith({
      workspaceId: "default",
      repoPath: "/tmp/local-project",
      refreshKey: "/tmp/local-project:feature-x",
    });
    expect(window.localStorage.getItem("routa.repoSelection.featureExplorer.default")).toContain(
      "/tmp/local-project",
    );

    fireEvent.click(screen.getByRole("button", { name: "clear repo" }));

    await waitFor(() => {
      expect(screen.getByTestId("repo-picker-value").textContent).toBe("routa-js|/repo/default|main");
    });

    expect(useFeatureExplorerData).toHaveBeenLastCalledWith({
      workspaceId: "default",
      repoPath: "/repo/default",
      refreshKey: "/repo/default:main",
    });
    expect(window.localStorage.getItem("routa.repoSelection.featureExplorer.default")).toBeNull();
  });

  it("hydrates the last repo selection from localStorage", async () => {
    window.localStorage.setItem(
      "routa.repoSelection.featureExplorer.default",
      JSON.stringify({
        name: "persisted-repo",
        path: "/tmp/persisted-repo",
        branch: "debug-branch",
      }),
    );

    const view = render(<FeatureExplorerPageClient workspaceId="default" />);

    await waitFor(() => {
      expect(screen.getByTestId("repo-picker-value").textContent).toBe(
        "persisted-repo|/tmp/persisted-repo|debug-branch",
      );
    });

    expect(useFeatureExplorerData).toHaveBeenLastCalledWith({
      workspaceId: "default",
      repoPath: "/tmp/persisted-repo",
      refreshKey: "/tmp/persisted-repo:debug-branch",
    });
  });

  it("falls back to the workspace codebase when nothing is stored", async () => {
    window.localStorage.clear();

    const view = render(<FeatureExplorerPageClient workspaceId="default" />);

    await waitFor(() => {
      expect(screen.getByTestId("repo-picker-value").textContent).toBe(
        "routa-js|/repo/default|main",
      );
    });

    expect(useFeatureExplorerData).toHaveBeenLastCalledWith({
      workspaceId: "default",
      repoPath: "/repo/default",
      refreshKey: "/repo/default:main",
    });
    expect(window.localStorage.getItem("routa.repoSelection.featureExplorer.default")).toBeNull();
  });

  it("renders a feature-first navigation view from the feature tree index", async () => {
    useFeatureExplorerData.mockReturnValue({
      loading: false,
      error: null,
      capabilityGroups: [{ id: "execution", name: "Execution", description: "" }],
      features: [
        {
          id: "feature-a",
          name: "Feature A",
          group: "execution",
          summary: "Summary",
          status: "active",
          sessionCount: 0,
          changedFiles: 1,
          updatedAt: "-",
          sourceFileCount: 1,
          pageCount: 1,
          apiCount: 1,
        },
      ],
      surfaceIndex: {
        generatedAt: "",
        pages: [
          {
            route: "/workspace/:workspaceId/feature-explorer",
            title: "Feature Explorer",
            description: "Explore features.",
            sourceFile: "src/app/workspace/[workspaceId]/feature-explorer/page.tsx",
          },
        ],
        apis: [],
        contractApis: [
          {
            domain: "feature-explorer",
            method: "GET",
            path: "/api/feature-explorer",
            operationId: "listFeatureExplorer",
            summary: "List features",
          },
        ],
        nextjsApis: [
          {
            domain: "feature-explorer",
            method: "GET",
            path: "/api/feature-explorer",
            sourceFiles: ["src/app/api/feature-explorer/route.ts"],
          },
        ],
        rustApis: [
          {
            domain: "feature-explorer",
            method: "GET",
            path: "/api/feature-explorer",
            sourceFiles: ["crates/routa-server/src/api/feature_explorer.rs"],
          },
        ],
        metadata: {
          schemaVersion: 1,
          capabilityGroups: [],
          features: [
            {
              id: "feature-a",
              name: "Feature A",
              pages: ["/workspace/:workspaceId/feature-explorer"],
              apis: ["GET /api/feature-explorer"],
              sourceFiles: ["src/app/workspace/[workspaceId]/feature-explorer/page.tsx"],
            },
          ],
        },
        repoRoot: "/repo/default",
        warnings: [],
      },
    });

    render(<FeatureExplorerPageClient workspaceId="default" />);

    const executionGroupToggle = screen.getByRole("button", { name: /Execution/i });
    expect(screen.getAllByText("Execution").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Feature A").length).toBeGreaterThan(0);
    expect(screen.queryByText("Feature Structure")).toBeNull();
    expect(screen.getByTestId("feature-metric-pages-feature-a").textContent).toContain("1");
    expect(screen.getByTestId("feature-metric-apis-feature-a").textContent).toContain("1");
    expect(within(executionGroupToggle).getByText("1 Pages")).toBeTruthy();
    expect(within(executionGroupToggle).getByText("1 API")).toBeTruthy();
    expect(within(executionGroupToggle).getByText("1 files")).toBeTruthy();
    expect(screen.getByLabelText("Expand Feature A")).toBeTruthy();
    expect(screen.getByText("Feature taxonomy ready")).toBeTruthy();
    expect(screen.getByText("1 curated")).toBeTruthy();
    expect(screen.getByText("0 inferred")).toBeTruthy();
  });

  it("switches surface navigation to surfaces tree mode", async () => {
    useFeatureExplorerData.mockReturnValue({
      loading: false,
      error: null,
      capabilityGroups: [],
      features: [],
      surfaceIndex: {
        generatedAt: "",
        pages: [
          {
            route: "/workspace/:workspaceId/feature-explorer",
            title: "Feature Explorer",
            description: "Explore features.",
            sourceFile: "src/app/workspace/[workspaceId]/feature-explorer/page.tsx",
          },
        ],
        apis: [],
        contractApis: [],
        nextjsApis: [],
        rustApis: [],
        metadata: null,
        repoRoot: "/repo/default",
        warnings: [],
      },
    });

    render(<FeatureExplorerPageClient workspaceId="default" />);

    fireEvent.click(screen.getByRole("button", { name: "Surfaces" }));

    expect(screen.getByText("/workspace")).toBeTruthy();
    expect(screen.queryByText(":workspaceId")).toBeNull();
    expect(screen.queryByText("feature-explorer")).toBeNull();
  });

  it("shows inferred repository status when only auto-generated feature groups exist", async () => {
    useFeatureExplorerData.mockReturnValue({
      loading: false,
      error: null,
      capabilityGroups: [{ id: "inferred-surfaces", name: "Inferred Surfaces", description: "Auto-derived groups" }],
      features: [
        {
          id: "feature-explorer",
          name: "Feature Explorer",
          group: "inferred-surfaces",
          summary: "Auto-inferred from routes and APIs",
          status: "inferred",
          sessionCount: 2,
          changedFiles: 1,
          updatedAt: "-",
          sourceFileCount: 0,
          pageCount: 1,
          apiCount: 1,
        },
      ],
      surfaceIndex: {
        generatedAt: "",
        pages: [
          {
            route: "/workspace/:workspaceId/feature-explorer",
            title: "Feature Explorer",
            description: "Explore features.",
            sourceFile: "",
          },
        ],
        apis: [],
        contractApis: [
          {
            domain: "feature-explorer",
            method: "GET",
            path: "/api/feature-explorer",
            operationId: "listFeatureExplorer",
            summary: "List features",
          },
        ],
        nextjsApis: [],
        rustApis: [],
        metadata: {
          schemaVersion: 1,
          capabilityGroups: [{ id: "inferred-surfaces", name: "Inferred Surfaces", description: "Auto-derived groups" }],
          features: [
            {
              id: "feature-explorer",
              name: "Feature Explorer",
              group: "inferred-surfaces",
              summary: "Auto-inferred from routes and APIs",
              status: "inferred",
              pages: ["/workspace/:workspaceId/feature-explorer"],
              apis: ["GET /api/feature-explorer"],
              sourceFiles: [],
            },
          ],
        },
        repoRoot: "/repo/default",
        warnings: [],
      },
    });

    render(<FeatureExplorerPageClient workspaceId="default" />);

    expect(screen.getByText("Inferred feature map available")).toBeTruthy();
    expect(screen.getByText("0 curated")).toBeTruthy();
    expect(screen.getByText("1 inferred")).toBeTruthy();
    expect(screen.queryByText("Feature taxonomy missing")).toBeNull();
    expect(screen.getAllByText("Inferred Surfaces").length).toBeGreaterThan(0);
  });

  it("keeps feature navigation in the incoming source order", async () => {
    useFeatureExplorerData.mockReturnValue({
      loading: false,
      error: null,
      capabilityGroups: [{ id: "execution", name: "Execution", description: "" }],
      features: [
        {
          id: "feature-low",
          name: "Feature Low",
          group: "execution",
          summary: "Low priority",
          status: "active",
          sessionCount: 1,
          changedFiles: 10,
          updatedAt: "-",
          sourceFileCount: 1,
          pageCount: 0,
          apiCount: 0,
        },
        {
          id: "feature-high",
          name: "Feature High",
          group: "execution",
          summary: "High priority",
          status: "active",
          sessionCount: 9,
          changedFiles: 2,
          updatedAt: "-",
          sourceFileCount: 1,
          pageCount: 0,
          apiCount: 0,
        },
      ],
      surfaceIndex: {
        generatedAt: "",
        pages: [],
        apis: [],
        contractApis: [],
        nextjsApis: [],
        rustApis: [],
        metadata: null,
        repoRoot: "/repo/default",
        warnings: [],
      },
    });

    render(<FeatureExplorerPageClient workspaceId="default" />);

    const highFeature = screen.getByRole("button", { name: /Feature High/ });
    const lowFeature = screen.getByRole("button", { name: /Feature Low/ });

    expect(lowFeature.compareDocumentPosition(highFeature) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("switches to the API tree work view", async () => {
    useFeatureExplorerData.mockReturnValue({
      loading: false,
      error: null,
      capabilityGroups: [{ id: "execution", name: "Execution", description: "" }],
      features: [
        {
          id: "feature-nextjs",
          name: "Feature Next.js",
          group: "execution",
          summary: "Mapped to a Next.js API",
          status: "active",
          sessionCount: 1,
          changedFiles: 1,
          updatedAt: "-",
          sourceFileCount: 1,
          pageCount: 0,
          apiCount: 1,
        },
        {
          id: "feature-hidden",
          name: "Feature Hidden",
          group: "execution",
          summary: "No Next.js API mapping",
          status: "active",
          sessionCount: 9,
          changedFiles: 9,
          updatedAt: "-",
          sourceFileCount: 1,
          pageCount: 0,
          apiCount: 0,
        },
      ],
      surfaceIndex: {
        generatedAt: "",
        pages: [],
        apis: [],
        contractApis: [],
        nextjsApis: [
          {
            domain: "feature-explorer",
            method: "GET",
            path: "/api/feature-explorer",
            sourceFiles: ["src/app/api/feature-explorer/route.ts"],
          },
        ],
        rustApis: [],
        metadata: {
          schemaVersion: 1,
          capabilityGroups: [],
          features: [
            {
              id: "feature-nextjs",
              name: "Feature Next.js",
              pages: [],
              apis: ["GET /api/feature-explorer"],
              sourceFiles: ["src/app/api/feature-explorer/route.ts"],
            },
          ],
        },
        repoRoot: "/repo/default",
        warnings: [],
      },
    });

    render(<FeatureExplorerPageClient workspaceId="default" />);

    expect(screen.getByLabelText("Expand Feature Next.js")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Feature Hidden" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "APIs" }));

    expect(screen.getByText("/feature-explorer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Feature Next\.js/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Feature Hidden/ })).toBeNull();
  });

  it("expands capability features into concrete page and api surfaces", async () => {
    useFeatureExplorerData.mockReturnValue({
      loading: false,
      error: null,
      capabilityGroups: [{ id: "execution", name: "Execution", description: "Execution surfaces" }],
      features: [
        {
          id: "feature-explorer",
          name: "Feature Explorer",
          group: "execution",
          summary: "Inspect workspace feature surfaces.",
          status: "evolving",
          sessionCount: 7,
          changedFiles: 7,
          updatedAt: "-",
          sourceFileCount: 7,
          pageCount: 1,
          apiCount: 2,
        },
      ],
      surfaceIndex: {
        generatedAt: "",
        pages: [
          {
            route: "/workspace/:workspaceId/feature-explorer",
            title: "Feature Explorer",
            description: "Explore features.",
            sourceFile: "src/app/workspace/[workspaceId]/feature-explorer/page.tsx",
          },
        ],
        apis: [],
        contractApis: [
          {
            domain: "feature-explorer",
            method: "GET",
            path: "/api/feature-explorer",
            operationId: "listFeatureExplorer",
            summary: "List features",
          },
        ],
        nextjsApis: [
          {
            domain: "feature-explorer",
            method: "GET",
            path: "/api/feature-explorer",
            sourceFiles: ["src/app/api/feature-explorer/route.ts"],
          },
        ],
        rustApis: [],
        metadata: {
          schemaVersion: 1,
          capabilityGroups: [{ id: "execution", name: "Execution", description: "Execution surfaces" }],
          features: [
            {
              id: "feature-explorer",
              name: "Feature Explorer",
              group: "execution",
              pages: ["/workspace/:workspaceId/feature-explorer"],
              apis: ["GET /api/feature-explorer"],
              sourceFiles: ["src/app/workspace/[workspaceId]/feature-explorer/page.tsx"],
            },
          ],
        },
        repoRoot: "/repo/default",
        warnings: [],
      },
    });

    render(<FeatureExplorerPageClient workspaceId="default" />);

    expect(screen.getByLabelText("Expand Feature Explorer")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Expand Feature Explorer"));

    expect(screen.getByRole("button", { name: "Feature Explorer" })).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "/workspace/:workspaceId/feature-explorer" })).toBeTruthy();
    });
  });

});
