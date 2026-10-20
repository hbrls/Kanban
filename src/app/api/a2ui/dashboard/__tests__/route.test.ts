import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET, POST } from "../route";

describe("/api/a2ui/dashboard route", () => {
  it("rejects dashboard reads without workspaceId", async () => {
    const response = await GET(new NextRequest("http://localhost/api/a2ui/dashboard"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "workspaceId is required" });
  });

  it("rejects custom surface writes without workspaceId", async () => {
    const response = await POST(new NextRequest("http://localhost/api/a2ui/dashboard", {
      method: "POST",
      body: JSON.stringify({
        messages: [
          {
            version: "v0.10",
            createSurface: { surfaceId: "surface-1", components: [] },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "workspaceId is required" });
  });
});
