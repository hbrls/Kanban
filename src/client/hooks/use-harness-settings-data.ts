"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlanResponse, TierValue } from "@/client/components/harness-execution-plan-flow";
import { desktopAwareFetch } from "@/client/utils/diagnostics";
import type { SpecDetectionResponse } from "@/core/harness/spec-detector-types";

export type RunnerKind = "shell" | "graph" | "sarif";

export type InstructionsResponse = {
  generatedAt: string;
  repoRoot: string;
  fileName: string;
  relativePath: string;
  source: string;
  fallbackUsed: boolean;
  audit: {
    status: "ok" | "heuristic" | "error";
    provider: string;
    generatedAt: string;
    durationMs: number;
    totalScore: number | null;
    overall: "通过" | "有条件通过" | "不通过" | null;
    oneSentence: string | null;
    principles: {
      routing: number | null;
      protection: number | null;
      reflection: number | null;
      verification: number | null;
    };
    error?: string;
  } | null;
};

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

type InstructionRefreshState = {
  contextKey: string;
  token: number;
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

function normalizeInstructionsResponse(
  payload: Partial<InstructionsResponse> | null | undefined,
): InstructionsResponse {
  return {
    generatedAt: payload?.generatedAt ?? "",
    repoRoot: payload?.repoRoot ?? "",
    fileName: payload?.fileName ?? "",
    relativePath: payload?.relativePath ?? "",
    source: payload?.source ?? "",
    fallbackUsed: Boolean(payload?.fallbackUsed),
    audit: payload?.audit ?? null,
  };
}

function normalizeSpecDetectionResponse(
  payload: Partial<SpecDetectionResponse> | null | undefined,
): SpecDetectionResponse {
  return {
    generatedAt: payload?.generatedAt ?? "",
    repoRoot: payload?.repoRoot ?? "",
    sources: safeArray(payload?.sources).map((source) => ({
      ...source,
      evidence: safeArray(source.evidence),
      children: safeArray(source.children),
      features: Array.isArray(source.features)
        ? source.features.map((feature) => ({
          ...feature,
          documents: safeArray(feature.documents),
        }))
        : undefined,
    })),
    warnings: safeArray(payload?.warnings),
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
  const [instructionsState, setInstructionsState] = useState<QueryState<InstructionsResponse>>(emptyQueryState);
  const [specSourcesState, setSpecSourcesState] = useState<QueryState<SpecDetectionResponse>>(emptyQueryState);
  const [instructionsRefreshState, setInstructionsRefreshState] = useState<InstructionRefreshState>({ contextKey: "", token: 0 });
  const instructionsContextKey = baseQuery?.toString() ?? "";

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

  useEffect(() => {
    if (!baseQuery) {
      setInstructionsState(emptyQueryState());
      return;
    }

    let cancelled = false;
    const fetchInstructions = async () => {
      setInstructionsState((current) => ({ ...current, loading: true, error: null }));
      try {
        const query = new URLSearchParams(baseQuery);
        const includeAudit = (
          instructionsRefreshState.contextKey === instructionsContextKey &&
          instructionsRefreshState.token > 0
        );
        query.set("includeAudit", includeAudit ? "1" : "0");
        const response = await desktopAwareFetch(`/api/harness/instructions?${query.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload?.details === "string" ? payload.details : "Failed to load guidance document");
        }
        if (!cancelled) {
          setInstructionsState({
            loading: false,
            error: null,
            data: normalizeInstructionsResponse(payload as Partial<InstructionsResponse>),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setInstructionsState({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            data: null,
          });
        }
      }
    };

    void fetchInstructions();
    return () => {
      cancelled = true;
    };
  }, [baseQuery, instructionsContextKey, instructionsRefreshState]);

  const reloadInstructions = useCallback(() => {
    setInstructionsRefreshState((current) => ({
      contextKey: instructionsContextKey,
      token: current.contextKey === instructionsContextKey ? current.token + 1 : 1,
    }));
  }, [instructionsContextKey]);

  useEffect(() => {
    if (!baseQuery) {
      setSpecSourcesState(emptyQueryState());
      return;
    }

    let cancelled = false;
    const fetchSpecSources = async () => {
      setSpecSourcesState((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await desktopAwareFetch(`/api/harness/spec-sources?${baseQuery.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload?.details === "string" ? payload.details : "Failed to load spec sources");
        }
        if (!cancelled) {
          setSpecSourcesState({
            loading: false,
            error: null,
            data: normalizeSpecDetectionResponse(payload as Partial<SpecDetectionResponse>),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setSpecSourcesState({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            data: null,
          });
        }
      }
    };

    void fetchSpecSources();
    return () => {
      cancelled = true;
    };
  }, [baseQuery]);

  return {
    planState,
    instructionsState,
    specSourcesState,
    reloadInstructions,
  };
}
