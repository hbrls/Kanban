"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlanResponse, TierValue } from "@/client/components/harness-execution-plan-flow";
import { desktopAwareFetch } from "@/client/utils/diagnostics";

export type RunnerKind = "shell" | "graph" | "sarif";

export type QueryState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

type HarnessSettingsDataArgs = {
  workspaceId?: string;
  codebaseId?: string;
  repoPath?: string;
  selectedTier: TierValue;
};

function buildHarnessQuery(workspaceId?: string, codebaseId?: string, repoPath?: string) {
  const query = new URLSearchParams();
  if (workspaceId) {
    query.set("workspaceId", workspaceId);
  }
  if (codebaseId) {
    query.set("codebaseId", codebaseId);
  }
  if (repoPath) {
    query.set("repoPath", repoPath);
  }
  return query;
}

function emptyQueryState<T>(): QueryState<T> {
  return {
    loading: false,
    error: null,
    data: null,
  };
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function normalizePlanResponse(payload: Partial<PlanResponse> | null | undefined): PlanResponse {
  const dimensions = safeArray(payload?.dimensions).map((dimension) => ({
    ...dimension,
    metrics: safeArray(dimension.metrics),
  }));
  const metrics = dimensions.flatMap((dimension) => dimension.metrics);
  const derivedRunnerCounts = metrics.reduce<Record<RunnerKind, number>>((counts, metric) => {
    if (metric.runner === "graph" || metric.runner === "sarif") {
      counts[metric.runner] += 1;
    } else {
      counts.shell += 1;
    }
    return counts;
  }, { shell: 0, graph: 0, sarif: 0 });

  return {
    generatedAt: payload?.generatedAt ?? "",
    tier: payload?.tier ?? "normal",
    scope: payload?.scope ?? "local",
    repoRoot: payload?.repoRoot ?? "",
    dimensionCount: payload?.dimensionCount ?? dimensions.length,
    metricCount: payload?.metricCount ?? metrics.length,
    hardGateCount: payload?.hardGateCount ?? metrics.filter((metric) => metric.hardGate).length,
    runnerCounts: {
      shell: payload?.runnerCounts?.shell ?? derivedRunnerCounts.shell,
      graph: payload?.runnerCounts?.graph ?? derivedRunnerCounts.graph,
      sarif: payload?.runnerCounts?.sarif ?? derivedRunnerCounts.sarif,
    },
    dimensions,
  };
}

export function useHarnessSettingsData({
  workspaceId,
  codebaseId,
  repoPath,
  selectedTier,
}: HarnessSettingsDataArgs) {
  const hasRepoContext = Boolean(workspaceId || codebaseId || repoPath);
  const baseQuery = useMemo(() => (hasRepoContext ? buildHarnessQuery(workspaceId, codebaseId, repoPath) : null), [codebaseId, hasRepoContext, repoPath, workspaceId]);

  const [planState, setPlanState] = useState<QueryState<PlanResponse>>(emptyQueryState);

  useEffect(() => {
    if (!baseQuery) {
      setPlanState(emptyQueryState());
      return;
    }

    let cancelled = false;
    const fetchPlan = async () => {
      setPlanState({ loading: true, error: null, data: null });
      try {
        const query = new URLSearchParams(baseQuery);
        query.set("tier", selectedTier);
        query.set("scope", "local");
        const response = await desktopAwareFetch(`/api/fitness/plan?${query.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload?.details === "string" ? payload.details : "Failed to load fitness plan");
        }
        if (!cancelled) {
          setPlanState({
            loading: false,
            error: null,
            data: normalizePlanResponse(payload as Partial<PlanResponse>),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setPlanState({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            data: null,
          });
        }
      }
    };

    void fetchPlan();
    return () => {
      cancelled = true;
    };
  }, [baseQuery, selectedTier]);

  return {
    planState,
  };
}
