import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceData } from "@/client/hooks/use-workspaces";

const sidebarState = vi.hoisted(() => ({
  pathname: "/workspace/default/kanban",
  push: vi.fn(),
  workspaces: [] as WorkspaceData[],
  loading: false,
  error: null as Error | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => sidebarState.pathname,
  useRouter: () => ({ push: sidebarState.push }),
}));

vi.mock("@/client/hooks/use-workspaces", () => ({
  useWorkspaces: () => ({
    workspaces: sidebarState.workspaces,
    loading: sidebarState.loading,
    error: sidebarState.error,
    fetchWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    archiveWorkspace: vi.fn(),
  }),
}));

import { DesktopSidebar } from "../desktop-sidebar";

function makeWorkspace(id: string, title: string): WorkspaceData {
  return {
    id,
    title,
    status: "active",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("DesktopSidebar", () => {
  beforeEach(() => {
    sidebarState.pathname = "/workspace/default/kanban";
    sidebarState.push.mockClear();
    sidebarState.workspaces = [];
    sidebarState.loading = false;
    sidebarState.error = null;
  });

  it("keeps Home and Kanban in the primary navigation without Sessions or Team", () => {
    render(<DesktopSidebar workspaceId="default" />);

    const links = screen.getAllByRole("link").slice(0, 2);
    expect(links.map((link) => link.textContent)).toEqual(["Home", "Kanban"]);

    expect(screen.queryByRole("link", { name: "Sessions" })).toBeNull();
    expect(screen.getByRole("link", { name: "Kanban" }).getAttribute("href")).toBe("/workspace/default/kanban");
    expect(screen.queryByRole("link", { name: "Team" })).toBeNull();
  });

  it("keeps settings in the primary navigation group and the lower group to the workspace list", () => {
    render(<DesktopSidebar workspaceId="default" />);

    expect(screen.queryByRole("link", { name: "MCP Servers" })).toBeNull();
    expect(screen.getByRole("link", { name: "Spec" }).getAttribute("href")).toBe("/workspace/default/spec");
    expect(screen.getByRole("link", { name: "Harness" }).getAttribute("href")).toBe("/settings/harness?workspaceId=default");
    expect(screen.queryByRole("link", { name: "Fluency" })).toBeNull();
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings?workspaceId=default");
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  });

  it("does not mark Settings as active when a settings tool page is active", () => {
    sidebarState.pathname = "/settings/mcp";

    render(<DesktopSidebar workspaceId="default" />);

    expect(screen.queryByRole("link", { name: "Harness" })).toBeNull();
    expect(screen.getByRole("link", { name: "Settings" }).className).not.toContain("text-desktop-accent");
  });

  it("shows a collapse icon when expanded and an expand icon when collapsed", () => {
    const { rerender } = render(<DesktopSidebar workspaceId="default" collapsed={false} />);

    const expandedToggle = screen.getByRole("button", { name: "Close sidebar" });
    expect(expandedToggle.querySelector("path")?.getAttribute("d")).toBe(
      "M13.5 4.5 6 12l7.5 7.5M18 4.5 10.5 12 18 19.5",
    );

    rerender(<DesktopSidebar workspaceId="default" collapsed />);

    const collapsedToggle = screen.getByRole("button", { name: "Open sidebar" });
    expect(collapsedToggle.querySelector("path")?.getAttribute("d")).toBe(
      "M10.5 4.5 18 12l-7.5 7.5M6 4.5 13.5 12 6 19.5",
    );
  });

  it("shows the workspace list only on kanban and vision pages", () => {
    sidebarState.workspaces = [makeWorkspace("ws-alpha", "Alpha")];

    sidebarState.pathname = "/workspace/ws-alpha/kanban";
    const { rerender } = render(<DesktopSidebar workspaceId="ws-alpha" />);
    expect(screen.getByRole("button", { name: "Alpha" })).toBeTruthy();

    sidebarState.pathname = "/workspace/ws-alpha/vision";
    rerender(<DesktopSidebar workspaceId="ws-alpha" />);
    expect(screen.getByRole("button", { name: "Alpha" })).toBeTruthy();

    sidebarState.pathname = "/";
    rerender(<DesktopSidebar workspaceId="ws-alpha" />);
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();

    sidebarState.pathname = "/settings";
    rerender(<DesktopSidebar workspaceId="ws-alpha" />);
    expect(screen.queryByRole("button", { name: "Alpha" })).toBeNull();
  });

  it("renders workspace buttons in the lower group instead of placeholders", () => {
    sidebarState.workspaces = [makeWorkspace("ws-alpha", "Alpha"), makeWorkspace("ws-beta", "Beta")];

    render(<DesktopSidebar workspaceId="ws-alpha" />);

    expect(screen.getByRole("button", { name: "Alpha" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Beta" })).toBeTruthy();
    expect(screen.queryByText("Placeholder 1")).toBeNull();
    expect(screen.queryByText("Placeholder 2")).toBeNull();
    expect(screen.queryByText("Placeholder 3")).toBeNull();
  });

  it("navigates to the workspace kanban route when clicking a non-current workspace", () => {
    sidebarState.workspaces = [makeWorkspace("ws-alpha", "Alpha"), makeWorkspace("ws-beta", "Beta")];
    sidebarState.pathname = "/workspace/ws-alpha/kanban";

    render(<DesktopSidebar workspaceId="ws-alpha" />);

    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    expect(sidebarState.push).toHaveBeenCalledWith("/workspace/ws-beta/kanban");
  });

  it("does not re-navigate when clicking the current workspace on the kanban page, but enters kanban from other pages", () => {
    sidebarState.workspaces = [makeWorkspace("ws-alpha", "Alpha"), makeWorkspace("ws-beta", "Beta")];
    sidebarState.pathname = "/workspace/ws-alpha/kanban";

    const { rerender } = render(<DesktopSidebar workspaceId="ws-alpha" />);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(sidebarState.push).not.toHaveBeenCalled();

    sidebarState.pathname = "/workspace/ws-alpha/vision";
    rerender(<DesktopSidebar workspaceId="ws-alpha" />);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(sidebarState.push).toHaveBeenCalledWith("/workspace/ws-alpha/kanban");
  });

  it("moves the pressed state and highlight to the workspace passed via workspaceId", () => {
    sidebarState.workspaces = [makeWorkspace("ws-alpha", "Alpha"), makeWorkspace("ws-beta", "Beta")];

    const { rerender } = render(<DesktopSidebar workspaceId="ws-alpha" />);

    expect(screen.getByRole("button", { name: "Alpha" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Alpha" }).className).toContain("text-desktop-accent");
    expect(screen.getByRole("button", { name: "Beta" }).getAttribute("aria-pressed")).toBe("false");

    rerender(<DesktopSidebar workspaceId="ws-beta" />);

    expect(screen.getByRole("button", { name: "Alpha" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "Beta" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Beta" }).className).toContain("text-desktop-accent");
  });

  it("shows loading, error and empty hints in the lower group", () => {
    sidebarState.loading = true;
    const { rerender } = render(<DesktopSidebar workspaceId="default" />);
    expect(screen.getByText("Loading…")).toBeTruthy();

    sidebarState.loading = false;
    sidebarState.error = new Error("boom");
    rerender(<DesktopSidebar workspaceId="default" />);
    expect(screen.getByText("Failed to load workspaces")).toBeTruthy();
    expect(screen.queryByText("No workspaces yet")).toBeNull();

    sidebarState.error = null;
    rerender(<DesktopSidebar workspaceId="default" />);
    expect(screen.getByText("No workspaces yet")).toBeTruthy();
  });

  it("keeps workspace buttons accessible and clickable when collapsed", () => {
    sidebarState.workspaces = [makeWorkspace("ws-alpha", "Alpha"), makeWorkspace("ws-beta", "Beta")];
    sidebarState.pathname = "/workspace/ws-alpha/kanban";

    render(<DesktopSidebar workspaceId="ws-alpha" collapsed />);

    expect(screen.queryByText("Alpha")).toBeNull();
    expect(screen.queryByText("Beta")).toBeNull();

    const betaButton = screen.getByRole("button", { name: "Beta" });
    fireEvent.click(betaButton);
    expect(sidebarState.push).toHaveBeenCalledWith("/workspace/ws-beta/kanban");
  });
});
