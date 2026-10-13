import { describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import WorkspacePage, { generateStaticParams } from "../page";

describe("workspace root page", () => {
  it("redirects the workspace root to the kanban surface", async () => {
    await WorkspacePage({
      params: Promise.resolve({ workspaceId: "default" }),
    });

    expect(redirectMock).toHaveBeenCalledWith("/workspace/default/kanban");
  });

  it("keeps the placeholder static params for static export", async () => {
    const original = process.env.ROUTA_BUILD_STATIC;
    process.env.ROUTA_BUILD_STATIC = "1";

    try {
      await expect(generateStaticParams()).resolves.toEqual([{ workspaceId: "__placeholder__" }]);
    } finally {
      process.env.ROUTA_BUILD_STATIC = original;
    }
  });
});
