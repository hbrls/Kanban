import { act, renderHook, waitFor } from "@testing-library/react";
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

      if (url.startsWith("/api/harness/hooks?")) {
        return okJson({
          generatedAt: "2026-03-31T00:00:00.000Z",
          repoRoot: "/repo",
          hooksDir: "/repo/.husky",
          configFile: null,
          reviewTriggerFile: {
            relativePath: "docs/fitness/review-triggers.yaml",
            source: "review_triggers: []",
            ruleCount: 0,
          },
          releaseTriggerFile: null,
        });
      }

      if (url.startsWith("/api/harness/instructions?")) {
        const includeAudit = new URL(`http://localhost${url}`).searchParams.get("includeAudit");
        return okJson({
          generatedAt: "2026-03-31T00:00:00.000Z",
          repoRoot: "/repo",
          fileName: "AGENTS.md",
          relativePath: "AGENTS.md",
          source: "# AGENTS",
          fallbackUsed: true,
          audit: includeAudit === "1"
            ? {
              status: "heuristic",
              provider: "codex",
              generatedAt: "2026-03-31T00:00:01.000Z",
              durationMs: 200,
              totalScore: 12,
              overall: "有条件通过",
              oneSentence: "heuristic",
              principles: {
                routing: 3,
                protection: 3,
                reflection: 3,
                verification: 3,
              },
            }
            : null,
        });
      }

      if (url.startsWith("/api/harness/github-actions?")) {
        return okJson({
          generatedAt: "2026-03-31T00:00:00.000Z",
          repoRoot: "/repo",
          workflowsDir: "/repo/.github/workflows",
          flows: [
            {
              id: "ci",
              name: "CI",
              event: "push",
              yaml: "name: CI",
            },
          ],
        });
      }

      if (url.startsWith("/api/harness/agent-hooks?")) {
        return okJson({
          generatedAt: "2026-03-31T00:00:00.000Z",
          repoRoot: "/repo",
          configFile: null,
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

      if (url.startsWith("/api/harness/design-decisions?")) {
        return okJson({
          generatedAt: "2026-03-31T00:00:00.000Z",
          repoRoot: "/repo",
          sources: [
            {
              kind: "canonical-doc",
              label: "Architecture",
              rootPath: "docs",
              confidence: "high",
              status: "documents-present",
            },
          ],
        });
      }

      if (url.startsWith("/api/harness/codeowners?")) {
        return okJson({
          generatedAt: "2026-03-31T00:00:00.000Z",
          repoRoot: "/repo",
          codeownersFile: "CODEOWNERS",
        });
      }

      if (url.startsWith("/api/harness/automations?")) {
        return okJson({
          generatedAt: "2026-03-31T00:00:00.000Z",
          repoRoot: "/repo",
          configFile: {
            relativePath: "docs/harness/automations.yml",
            source: "schema: harness-automation-v1",
            schema: "harness-automation-v1",
          },
        });
      }

      throw new Error(`Unhandled fetch url: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-runs instructions with audit enabled without reloading hook runtime", async () => {
    const { result } = renderHook(() => useHarnessSettingsData({
      workspaceId: "default",
      repoPath: "/repo",
      selectedTier: "normal",
    }));

    await waitFor(() => {
      expect(result.current.instructionsState.loading).toBe(false);
      expect(result.current.instructionsState.data?.audit).toBeNull();
    });

    const initialHookCalls = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/harness/hooks?")).length;
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/harness/instructions?") && String(url).includes("includeAudit=0"))).toBe(true);

    act(() => {
      result.current.reloadInstructions();
    });

    await waitFor(() => {
      expect(result.current.instructionsState.data?.audit?.status).toBe("heuristic");
    });

    const hookCallsAfterRerun = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/harness/hooks?")).length;
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/harness/instructions?") && String(url).includes("includeAudit=1"))).toBe(true);
    expect(hookCallsAfterRerun).toBe(initialHookCalls);
  });

  it("fetches automation data when repoPath is the only available context", async () => {
    const { result } = renderHook(() => useHarnessSettingsData({
      repoPath: "/repo",
      selectedTier: "normal",
    }));

    await waitFor(() => {
      expect(result.current.automationsState.loading).toBe(false);
      expect(result.current.automationsState.data?.configFile?.relativePath).toBe("docs/harness/automations.yml");
    });

    expect(fetchMock.mock.calls.some(([url]) => (
      String(url).startsWith("/api/harness/automations?")
      && String(url).includes("repoPath=%2Frepo")
      && !String(url).includes("workspaceId=")
    ))).toBe(true);
  });

  it("normalizes sparse harness payloads before exposing panel state", async () => {
    const { result } = renderHook(() => useHarnessSettingsData({
      workspaceId: "default",
      repoPath: "/repo",
      selectedTier: "normal",
    }));

    await waitFor(() => {
      expect(result.current.automationsState.loading).toBe(false);
      expect(result.current.codeownersState.loading).toBe(false);
    });

    expect(result.current.planState.data?.dimensions).toEqual([]);
    expect(result.current.planState.data?.runnerCounts).toEqual({
      shell: 0,
      graph: 0,
      sarif: 0,
    });
    expect(result.current.hooksState.data?.hookFiles).toEqual([]);
    expect(result.current.hooksState.data?.profiles).toEqual([]);
    expect(result.current.hooksState.data?.reviewTriggerFile?.rules).toEqual([]);
    expect(result.current.githubActionsState.data?.flows[0]?.jobs).toEqual([]);
    expect(result.current.agentHooksState.data?.hooks).toEqual([]);
    expect(result.current.specSourcesState.data?.sources[0]?.children).toEqual([]);
    expect(result.current.designDecisionsState.data?.sources[0]?.artifacts).toEqual([]);
    expect(result.current.codeownersState.data?.owners).toEqual([]);
    expect(result.current.codeownersState.data?.rules).toEqual([]);
    expect(result.current.codeownersState.data?.coverage).toEqual({
      unownedFiles: [],
      overlappingFiles: [],
      sensitiveUnownedFiles: [],
    });
    expect(result.current.automationsState.data?.definitions).toEqual([]);
    expect(result.current.automationsState.data?.pendingSignals).toEqual([]);
    expect(result.current.automationsState.data?.recentRuns).toEqual([]);
  });
});
