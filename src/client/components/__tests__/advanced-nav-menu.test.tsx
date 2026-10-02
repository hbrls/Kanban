import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace/default/kanban",
}));

import { AdvancedNavMenu } from "../advanced-nav-menu";

describe("AdvancedNavMenu", () => {
  it("does not render a Harness entry or an empty Metric group", () => {
    render(<AdvancedNavMenu workspaceId="default" />);

    expect(screen.queryByRole("link", { name: "Harness" })).toBeNull();
    expect(screen.queryByText("Metric")).toBeNull();
  });

  it("keeps shared advanced navigation entries", () => {
    render(<AdvancedNavMenu workspaceId="default" />);

    expect(screen.getByRole("link", { name: "Workflows" }).getAttribute("href")).toBe("/settings/workflows");
    expect(screen.getByRole("link", { name: "Specialists" }).getAttribute("href")).toBe("/settings/specialists");
    expect(screen.getByRole("link", { name: "MCP Servers" }).getAttribute("href")).toBe("/settings/mcp");
    expect(screen.getByRole("link", { name: "Schedules" }).getAttribute("href")).toBe("/settings/schedules");
    expect(screen.getByRole("link", { name: "Debug" }).getAttribute("href")).toBe("/traces");
  });

  it("keeps group labels for the remaining sections", () => {
    render(<AdvancedNavMenu workspaceId="default" />);

    expect(screen.getByText("Customize")).toBeTruthy();
    expect(screen.getByText("Tools")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
  });
});
