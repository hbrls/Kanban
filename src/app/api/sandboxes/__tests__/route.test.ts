import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { manager, proxyRustSandboxRequest } = vi.hoisted(() => ({
  manager: {
    listSandboxes: vi.fn(),
    createSandbox: vi.fn(),
  },
  proxyRustSandboxRequest: vi.fn(),
}));

vi.mock("@/core/sandbox", () => ({
  SandboxManager: {
    getInstance: () => manager,
  },
  proxyRustSandboxRequest,
}));

import { GET, POST } from "../route";

describe("/api/sandboxes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("proxies GET requests to the Rust sandbox API when available", async () => {
    proxyRustSandboxRequest.mockResolvedValue(
      new Response(JSON.stringify({ sandboxes: [{ id: "rust-1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET();

    expect(proxyRustSandboxRequest).toHaveBeenCalledWith("/api/sandboxes", { method: "GET" });
    expect(manager.listSandboxes).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      sandboxes: [{ id: "rust-1" }],
    });
  });

  it("falls back to the local sandbox manager for POST when Rust is unavailable", async () => {
    proxyRustSandboxRequest.mockResolvedValue(null);
    manager.createSandbox.mockResolvedValue({
      id: "local-1",
      name: "sandbox-local-1",
      status: "running",
      lang: "python",
      createdAt: "2026-03-26T00:00:00Z",
      lastActiveAt: "2026-03-26T00:00:00Z",
    });

    const response = await POST(new NextRequest("http://localhost/api/sandboxes", {
      method: "POST",
      body: JSON.stringify({ lang: "python" }),
    }));

    expect(proxyRustSandboxRequest).toHaveBeenCalledWith("/api/sandboxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: "python" }),
    });
    expect(manager.createSandbox).toHaveBeenCalledWith({ lang: "python" });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "local-1",
      lang: "python",
    });
  });
});
