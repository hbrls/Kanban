import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { manager, proxyRustSandboxRequest } = vi.hoisted(() => ({
  manager: {
    getSandbox: vi.fn(),
    deleteSandbox: vi.fn(),
  },
  proxyRustSandboxRequest: vi.fn(),
}));

vi.mock("@/core/sandbox", () => ({
  SandboxManager: {
    getInstance: () => manager,
  },
  proxyRustSandboxRequest,
}));

import { DELETE, GET } from "../route";

describe("/api/sandboxes/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("proxies GET requests to the Rust sandbox API when available", async () => {
    proxyRustSandboxRequest.mockResolvedValue(
      new Response(JSON.stringify({ id: "rust-1", lang: "python" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/sandboxes/rust-1"),
      { params: Promise.resolve({ id: "rust-1" }) },
    );

    expect(proxyRustSandboxRequest).toHaveBeenCalledWith("/api/sandboxes/rust-1", {
      method: "GET",
    });
    expect(manager.getSandbox).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      id: "rust-1",
      lang: "python",
    });
  });

  it("falls back to the local sandbox manager for DELETE when Rust is unavailable", async () => {
    proxyRustSandboxRequest.mockResolvedValue(null);
    manager.deleteSandbox.mockResolvedValue(undefined);

    const response = await DELETE(
      new NextRequest("http://localhost/api/sandboxes/local-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "local-1" }) },
    );

    expect(proxyRustSandboxRequest).toHaveBeenCalledWith("/api/sandboxes/local-1", {
      method: "DELETE",
    });
    expect(manager.deleteSandbox).toHaveBeenCalledWith("local-1");
    await expect(response.json()).resolves.toEqual({
      message: "Sandbox local-1 deleted",
    });
  });
});
