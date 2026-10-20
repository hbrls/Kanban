import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { manager, proxyRustSandboxRequest } = vi.hoisted(() => ({
  manager: {
    executeInSandbox: vi.fn(),
  },
  proxyRustSandboxRequest: vi.fn(),
}));

vi.mock("@/core/sandbox", () => ({
  SandboxManager: {
    getInstance: () => manager,
  },
  proxyRustSandboxRequest,
}));

import { POST } from "../route";

describe("/api/sandboxes/[id]/execute route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("proxies execution to the Rust sandbox API when available", async () => {
    proxyRustSandboxRequest.mockResolvedValue(
      new Response("{\"text\":\"hello from rust\"}\n", {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/sandboxes/rust-1/execute", {
        method: "POST",
        body: JSON.stringify({ code: "print('hello')" }),
      }),
      { params: Promise.resolve({ id: "rust-1" }) },
    );

    expect(proxyRustSandboxRequest).toHaveBeenCalledWith("/api/sandboxes/rust-1/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "print('hello')" }),
    });
    expect(manager.executeInSandbox).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("hello from rust");
  });

  it("falls back to the local sandbox manager when Rust is unavailable", async () => {
    proxyRustSandboxRequest.mockResolvedValue(null);
    manager.executeInSandbox.mockResolvedValue(
      new Response("{\"text\":\"hello from local\"}\n", {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/sandboxes/local-1/execute", {
        method: "POST",
        body: JSON.stringify({ code: "print('hello')" }),
      }),
      { params: Promise.resolve({ id: "local-1" }) },
    );

    expect(manager.executeInSandbox).toHaveBeenCalledWith("local-1", {
      code: "print('hello')",
    });
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("hello from local");
  });
});
