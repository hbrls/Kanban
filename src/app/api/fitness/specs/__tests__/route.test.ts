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

describe("/api/fitness/specs route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    system.codebaseStore.get.mockResolvedValue(undefined);
    system.codebaseStore.listByWorkspace.mockResolvedValue([]);
  });

  it("includes the engineering governance document in manifest order", async () => {
    const response = await GET(new NextRequest(
      `http://localhost/api/fitness/specs?repoPath=${encodeURIComponent(repoRoot)}`,
    ));
    const data = await response.json();

    expect(response.status).toBe(200);

    expect(data.files.slice(0, 5).map((file: { name: string }) => file.name)).toEqual([
      "README.md",
      "manifest.yaml",
      "backend-architecture.md",
      "code-quality.md",
      "engineering-governance.md",
    ]);

    const codeQuality = data.files.find((file: { dimension?: string }) => file.dimension === "code_quality");
    const governance = data.files.find((file: { dimension?: string }) => file.dimension === "engineering_governance");

    expect(codeQuality).toMatchObject({
      name: "code-quality.md",
      weight: 18,
      metricCount: 15,
    });
    expect(codeQuality.metrics.map((metric: { name: string }) => metric.name)).not.toEqual(expect.arrayContaining([
      "scripts_root_file_count_guard",
      "graph_blast_radius_probe",
      "markdown_external_links",
      "todo_fixme_count",
    ]));

    expect(governance).toMatchObject({
      name: "engineering-governance.md",
      weight: 6,
      metricCount: 4,
    });
    expect(governance.metrics.map((metric: { name: string }) => metric.name)).toEqual([
      "scripts_root_file_count_guard",
      "graph_blast_radius_probe",
      "markdown_external_links",
      "todo_fixme_count",
    ]);
  });
});
