import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useHarnessSettingsData } from "../use-harness-settings-data";

function okJson(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  } as Response;
}

describe("useHarnessSettingsData", () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.startsWith("/api/fitness/plan?")) {
        return okJson({
          generatedAt: "2026-03-31T00:00:00.000Z",
          repoRoot: "/repo",
          tier: "normal",
          scope: "local",
          metricCount: 31,
          hardGateCount: 13,
        });
      }

      if (url.startsWith("/api/harness/spec-sources?")) {
        return okJson({
          generatedAt: "2026-03-31T00:00:00.000Z",
          repoRoot: "/repo",
          sources: [
            {
              kind: "framework",
              system: "kiro",
              rootPath: ".kiro/specs",
              confidence: "high",
              status: "artifacts-present",
              evidence: ["found .kiro/specs"],
            },
          ],
        });
      }

      throw new Error(`Unhandled fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes sparse harness payloads before exposing panel state", async () => {
    const { result } = renderHook(() => useHarnessSettingsData({
      workspaceId: "default",
      repoPath: "/repo",
      selectedTier: "normal",
    }));

    await waitFor(() => {
      expect(result.current.specSourcesState.loading).toBe(false);
    });

    expect(result.current.planState.data?.dimensions).toEqual([]);
    expect(result.current.planState.data?.runnerCounts).toEqual({
      shell: 0,
      graph: 0,
      sarif: 0,
    });
    expect(result.current.specSourcesState.data?.sources[0]?.children).toEqual([]);
  });

  it("does not request harness instructions for the harness console", async () => {
    renderHook(() => useHarnessSettingsData({
      workspaceId: "default",
      repoPath: "/repo",
      selectedTier: "normal",
    }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/harness/spec-sources?"))).toBe(true);
    });

    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/harness/instructions"))).toBe(false);
  });
});
