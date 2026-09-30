"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlanResponse, TierValue } from "@/client/components/harness-execution-plan-flow";
import { desktopAwareFetch } from "@/client/utils/diagnostics";
import type { DesignDecisionResponse } from "@/core/harness/design-decision-types";
import type { CodeownersResponse } from "@/core/harness/codeowners-types";
import type { SpecDetectionResponse } from "@/core/harness/spec-detector-types";

export type RunnerKind = "shell" | "graph" | "sarif";

export type HookMetricSummary = {
  name: string;
  command: string;
  description: string;
  hardGate: boolean;
  resolved: boolean;
  sourceFile?: string;
};

export type HookRuntimeProfileSummary = {
  name: string;
  phases: string[];
  fallbackMetrics: string[];
  metrics: HookMetricSummary[];
  hooks: string[];
};

export type ReviewTriggerBoundarySummary = {
  name: string;
  paths: string[];
};

export type ReviewTriggerLayerSummary = {
  confidenceThreshold?: number | null;
  specialistId?: string | null;
  provider?: string | null;
  model?: string | null;
  context?: string[];
  contextCount?: number;
};

export type ReviewTriggerRuleSummary = {
  name: string;
  type: string;
  severity: string;
  action: string;
  paths: string[];
  evidencePaths: string[];
  boundaries: ReviewTriggerBoundarySummary[];
  directories: string[];
  pathCount: number;
  evidencePathCount: number;
  boundaryCount: number;
  directoryCount: number;
  minBoundaries: number | null;
  maxFiles: number | null;
  maxAddedLines: number | null;
  maxDeletedLines: number | null;
  confidenceThreshold?: number | null;
  fallbackAction?: string | null;
  specialistId?: string | null;
  provider?: string | null;
  model?: string | null;
  context?: string[];
  contextCount?: number;
  reviewLayers?: ReviewTriggerLayerSummary[];
  reviewLayerCount?: number;
};

export type ReleaseTriggerRuleSummary = {
  name: string;
  type: string;
  severity: string;
  action: string;
  patterns: string[];
  applyTo: string[];
  paths: string[];
  groupBy: string[];
  baseline: string | null;
  maxGrowthPercent: number | null;
  minGrowthBytes: number | null;
  patternCount: number;
  applyToCount: number;
  pathCount: number;
};

export type HookFileSummary = {
  name: string;
  relativePath: string;
  source: string;
  triggerCommand: string;
  kind: "runtime-profile" | "shell-command";
  runtimeProfileName?: string;
  skipEnvVar?: string;
};

export type HooksResponse = {
  generatedAt: string;
  repoRoot: string;
  hooksDir: string;
  configFile: {
    relativePath: string;
    source: string;
    schema?: string;
  } | null;
  reviewTriggerFile: {
    relativePath: string;
    source: string;
    ruleCount: number;
    rules: ReviewTriggerRuleSummary[];
  } | null;
  releaseTriggerFile: {
    relativePath: string;
    source: string;
    ruleCount: number;
    rules: ReleaseTriggerRuleSummary[];
  } | null;
  hookFiles: HookFileSummary[];
  profiles: HookRuntimeProfileSummary[];
  warnings: string[];
};

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

export type AgentHookConfigSummary = {
  event: string;
  matcher?: string;
  type: string;
  command?: string;
  url?: string;
  prompt?: string;
  timeout: number;
  blocking: boolean;
  description?: string;
  source?: string;
};

export type AgentHooksResponse = {
  generatedAt: string;
  repoRoot: string;
  configFile: {
    relativePath: string;
    source: string;
    schema?: string;
  } | null;
  configFiles?: Array<{
    relativePath: string;
    source: string;
    schema?: string;
    provider?: string;
  }>;
  hooks: AgentHookConfigSummary[];
  warnings: string[];
};

export type { CodeownersResponse };

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

function normalizeHooksResponse(payload: Partial<HooksResponse> | null | undefined): HooksResponse {
  return {
    generatedAt: payload?.generatedAt ?? "",
    repoRoot: payload?.repoRoot ?? "",
    hooksDir: payload?.hooksDir ?? "",
    configFile: payload?.configFile ?? null,
    reviewTriggerFile: payload?.reviewTriggerFile
      ? {
        ...payload.reviewTriggerFile,
        rules: safeArray(payload.reviewTriggerFile.rules),
      }
      : null,
    releaseTriggerFile: payload?.releaseTriggerFile
      ? {
        ...payload.releaseTriggerFile,
        rules: safeArray(payload.releaseTriggerFile.rules),
      }
      : null,
    hookFiles: safeArray(payload?.hookFiles),
    profiles: safeArray(payload?.profiles),
    warnings: safeArray(payload?.warnings),
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

function normalizeAgentHooksResponse(
  payload: Partial<AgentHooksResponse> | null | undefined,
): AgentHooksResponse {
  return {
    generatedAt: payload?.generatedAt ?? "",
    repoRoot: payload?.repoRoot ?? "",
    configFile: payload?.configFile ?? null,
    configFiles: safeArray(payload?.configFiles),
    hooks: safeArray(payload?.hooks),
    warnings: safeArray(payload?.warnings),
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

function normalizeDesignDecisionResponse(
  payload: Partial<DesignDecisionResponse> | null | undefined,
): DesignDecisionResponse {
  return {
    generatedAt: payload?.generatedAt ?? "",
    repoRoot: payload?.repoRoot ?? "",
    sources: safeArray(payload?.sources).map((source) => ({
      ...source,
      artifacts: safeArray(source.artifacts),
    })),
    warnings: safeArray(payload?.warnings),
  };
}

function normalizeCodeownersResponse(
  payload: Partial<CodeownersResponse> | null | undefined,
): CodeownersResponse {
  return {
    generatedAt: payload?.generatedAt ?? "",
    repoRoot: payload?.repoRoot ?? "",
    codeownersFile: payload?.codeownersFile ?? null,
    owners: safeArray(payload?.owners),
    rules: safeArray(payload?.rules).map((rule) => ({
      ...rule,
      owners: safeArray(rule.owners),
    })),
    coverage: {
      unownedFiles: safeArray(payload?.coverage?.unownedFiles),
      overlappingFiles: safeArray(payload?.coverage?.overlappingFiles),
      sensitiveUnownedFiles: safeArray(payload?.coverage?.sensitiveUnownedFiles),
    },
    correlation: payload?.correlation
      ? {
        ...payload.correlation,
        triggerCorrelations: safeArray(payload.correlation.triggerCorrelations).map((correlation) => ({
          ...correlation,
          ownerGroups: safeArray(correlation.ownerGroups),
          unownedPaths: safeArray(correlation.unownedPaths),
          overlappingPaths: safeArray(correlation.overlappingPaths),
        })),
        hotspots: safeArray(payload.correlation.hotspots).map((hotspot) => ({
          ...hotspot,
          samplePaths: safeArray(hotspot.samplePaths),
        })),
      }
      : undefined,
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
  const [hooksState, setHooksState] = useState<QueryState<HooksResponse>>(emptyQueryState);
  const [instructionsState, setInstructionsState] = useState<QueryState<InstructionsResponse>>(emptyQueryState);
  const [agentHooksState, setAgentHooksState] = useState<QueryState<AgentHooksResponse>>(emptyQueryState);
  const [specSourcesState, setSpecSourcesState] = useState<QueryState<SpecDetectionResponse>>(emptyQueryState);
  const [designDecisionsState, setDesignDecisionsState] = useState<QueryState<DesignDecisionResponse>>(emptyQueryState);
  const [codeownersState, setCodeownersState] = useState<QueryState<CodeownersResponse>>(emptyQueryState);
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
      setHooksState(emptyQueryState());
      return;
    }

    let cancelled = false;
    const fetchHooks = async () => {
      setHooksState((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await desktopAwareFetch(`/api/harness/hooks?${baseQuery.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload?.details === "string" ? payload.details : "Failed to load hook runtime");
        }
        if (!cancelled) {
          setHooksState({
            loading: false,
            error: null,
            data: normalizeHooksResponse(payload as Partial<HooksResponse>),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setHooksState({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            data: null,
          });
        }
      }
    };

    void fetchHooks();
    return () => {
      cancelled = true;
    };
  }, [baseQuery]);

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

  useEffect(() => {
    if (!baseQuery) {
      setAgentHooksState(emptyQueryState());
      return;
    }

    let cancelled = false;
    const fetchAgentHooks = async () => {
      setAgentHooksState((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await desktopAwareFetch(`/api/harness/agent-hooks?${baseQuery.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload?.details === "string" ? payload.details : "Failed to load agent hooks");
        }
        if (!cancelled) {
          setAgentHooksState({
            loading: false,
            error: null,
            data: normalizeAgentHooksResponse(payload as Partial<AgentHooksResponse>),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setAgentHooksState({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            data: null,
          });
        }
      }
    };

    void fetchAgentHooks();
    return () => {
      cancelled = true;
    };
  }, [baseQuery]);

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

  useEffect(() => {
    if (!baseQuery) {
      setDesignDecisionsState(emptyQueryState());
      return;
    }

    let cancelled = false;
    const fetchDesignDecisions = async () => {
      setDesignDecisionsState((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await desktopAwareFetch(`/api/harness/design-decisions?${baseQuery.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload?.details === "string" ? payload.details : "Failed to load design decisions");
        }
        if (!cancelled) {
          setDesignDecisionsState({
            loading: false,
            error: null,
            data: normalizeDesignDecisionResponse(payload as Partial<DesignDecisionResponse>),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setDesignDecisionsState({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            data: null,
          });
        }
      }
    };

    void fetchDesignDecisions();
    return () => {
      cancelled = true;
    };
  }, [baseQuery]);

  useEffect(() => {
    if (!baseQuery) {
      setCodeownersState(emptyQueryState());
      return;
    }

    let cancelled = false;
    const fetchCodeowners = async () => {
      setCodeownersState((current) => ({ ...current, loading: true, error: null }));
      try {
        const response = await desktopAwareFetch(`/api/harness/codeowners?${baseQuery.toString()}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload?.details === "string" ? payload.details : "Failed to load CODEOWNERS");
        }
        if (!cancelled) {
          setCodeownersState({
            loading: false,
            error: null,
            data: normalizeCodeownersResponse(payload as Partial<CodeownersResponse>),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setCodeownersState({
            loading: false,
            error: error instanceof Error ? error.message : String(error),
            data: null,
          });
        }
      }
    };

    void fetchCodeowners();
    return () => {
      cancelled = true;
    };
  }, [baseQuery]);

  return {
    planState,
    hooksState,
    agentHooksState,
    instructionsState,
    specSourcesState,
    designDecisionsState,
    codeownersState,
    reloadInstructions,
  };
}
