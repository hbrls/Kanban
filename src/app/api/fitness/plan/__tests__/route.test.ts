import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const system = {
  codebaseStore: {
    get: vi.fn(),
    listByWorkspace: vi.fn(),
  },
};

vi.mock("@/core/routa-system", () => ({
  getRoutaSystem: () => system,
}));

import { GET } from "../route";

const repoRoot = process.cwd();

describe("/api/fitness/plan route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    system.codebaseStore.get.mockResolvedValue(undefined);
    system.codebaseStore.listByWorkspace.mockResolvedValue([]);
  });

  it("keeps code quality focused on code-local checks for local scope", async () => {
    const response = await GET(new NextRequest(
      `http://localhost/api/fitness/plan?repoPath=${encodeURIComponent(repoRoot)}&tier=normal&scope=local`,
    ));
    const data = await response.json();

    expect(response.status).toBe(200);

    const codeQuality = data.dimensions.find((dimension: { name: string }) => dimension.name === "code_quality");
    const governance = data.dimensions.find((dimension: { name: string }) => dimension.name === "engineering_governance");

    expect(codeQuality).toMatchObject({
      name: "code_quality",
      weight: 18,
      sourceFile: "code-quality.md",
    });
    expect(codeQuality.metrics.map((metric: { name: string }) => metric.name)).not.toEqual(expect.arrayContaining([
      "scripts_root_file_count_guard",
      "graph_blast_radius_probe",
      "markdown_external_links",
      "todo_fixme_count",
    ]));

    expect(governance).toMatchObject({
      name: "engineering_governance",
      weight: 6,
      sourceFile: "engineering-governance.md",
    });
    expect(governance.metrics.map((metric: { name: string }) => metric.name)).toEqual([
      "todo_fixme_count",
    ]);
  });

  it("surfaces governance-only CI checks under engineering governance", async () => {
    const response = await GET(new NextRequest(
      `http://localhost/api/fitness/plan?repoPath=${encodeURIComponent(repoRoot)}&tier=normal&scope=ci`,
    ));
    const data = await response.json();

    expect(response.status).toBe(200);

    const dimensionNames = data.dimensions.map((dimension: { name: string }) => dimension.name);
    expect(dimensionNames).not.toContain("code_quality");

    const governance = data.dimensions.find((dimension: { name: string }) => dimension.name === "engineering_governance");
    expect(governance.metrics.map((metric: { name: string }) => metric.name)).toEqual([
      "scripts_root_file_count_guard",
      "graph_blast_radius_probe",
      "markdown_external_links",
    ]);
  });
});
