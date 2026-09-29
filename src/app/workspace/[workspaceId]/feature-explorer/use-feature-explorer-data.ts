import { useEffect, useState } from "react";
import { desktopAwareFetch } from "@/client/utils/diagnostics";
import type {
  CapabilityGroup,
  FeatureListResponse,
  FeatureSummary,
  FeatureSurfaceIndexResponse,
} from "./types";

interface UseFeatureExplorerDataOptions {
  workspaceId: string;
  repoPath?: string;
  refreshKey?: string;
}

interface UseFeatureExplorerDataResult {
  loading: boolean;
  error: string | null;
  capabilityGroups: CapabilityGroup[];
  features: FeatureSummary[];
  surfaceIndex: FeatureSurfaceIndexResponse;
}

function buildQuery(options: UseFeatureExplorerDataOptions): string {
  const params = new URLSearchParams();
  params.set("workspaceId", options.workspaceId);
  if (options.repoPath) {
    params.set("repoPath", options.repoPath);
  }
  return params.toString();
}

function emptySurfaceIndexResponse(warnings: string[] = []): FeatureSurfaceIndexResponse {
  return {
    generatedAt: "",
    pages: [],
    apis: [],
    contractApis: [],
    nextjsApis: [],
    rustApis: [],
    implementationApis: [],
    metadata: null,
    repoRoot: "",
    warnings,
  };
}

function normalizeSurfaceIndexPayload(
  payload: unknown,
  fallbackWarning: string,
): FeatureSurfaceIndexResponse {
  if (!payload || typeof payload !== "object") {
    return emptySurfaceIndexResponse([fallbackWarning]);
  }

  return {
    generatedAt: typeof (payload as { generatedAt?: unknown }).generatedAt === "string"
      ? (payload as { generatedAt: string }).generatedAt
      : "",
    pages: Array.isArray((payload as { pages?: unknown }).pages)
      ? (payload as { pages: FeatureSurfaceIndexResponse["pages"] }).pages
      : [],
    apis: Array.isArray((payload as { apis?: unknown }).apis)
      ? (payload as { apis: FeatureSurfaceIndexResponse["apis"] }).apis
      : [],
    contractApis: Array.isArray((payload as { contractApis?: unknown }).contractApis)
      ? (payload as { contractApis: FeatureSurfaceIndexResponse["contractApis"] }).contractApis
      : [],
    nextjsApis: Array.isArray((payload as { nextjsApis?: unknown }).nextjsApis)
      ? (payload as { nextjsApis: FeatureSurfaceIndexResponse["nextjsApis"] }).nextjsApis
      : [],
    rustApis: Array.isArray((payload as { rustApis?: unknown }).rustApis)
      ? (payload as { rustApis: FeatureSurfaceIndexResponse["rustApis"] }).rustApis
      : [],
    implementationApis: Array.isArray((payload as { implementationApis?: unknown }).implementationApis)
      ? (payload as { implementationApis: FeatureSurfaceIndexResponse["implementationApis"] }).implementationApis
      : [],
    metadata: typeof (payload as { metadata?: unknown }).metadata === "object"
      ? (payload as { metadata: FeatureSurfaceIndexResponse["metadata"] }).metadata
      : null,
    repoRoot: typeof (payload as { repoRoot?: unknown }).repoRoot === "string"
      ? (payload as { repoRoot: string }).repoRoot
      : "",
    warnings: Array.isArray((payload as { warnings?: unknown }).warnings)
      ? (payload as { warnings: unknown[] }).warnings.filter(
        (warning): warning is string => typeof warning === "string",
      )
      : [],
  };
}

export function useFeatureExplorerData(
  options: UseFeatureExplorerDataOptions,
): UseFeatureExplorerDataResult {
  const { workspaceId, repoPath, refreshKey } = options;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capabilityGroups, setCapabilityGroups] = useState<CapabilityGroup[]>([]);
  const [features, setFeatures] = useState<FeatureSummary[]>([]);
  const [surfaceIndex, setSurfaceIndex] = useState<FeatureSurfaceIndexResponse>(emptySurfaceIndexResponse());

  useEffect(() => {
    let cancelled = false;
    setSurfaceIndex(emptySurfaceIndexResponse());

    async function fetchFeatures() {
      setLoading(true);
      setError(null);

      try {
        const query = buildQuery({ workspaceId, repoPath, refreshKey });
        const [response, surfaceResponse] = await Promise.all([
          desktopAwareFetch(`/feature-explorer?${query}`),
          desktopAwareFetch(`/spec/surface-index?${query}`),
        ]);
        const body = await response.json().catch(() => ({}));
        const surfacePayload = await surfaceResponse.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body.details ?? body.error ?? `HTTP ${response.status}`);
        }
        const data = body as FeatureListResponse;
        if (!cancelled) {
          setCapabilityGroups(data.capabilityGroups ?? []);
          setFeatures(data.features ?? []);
          setSurfaceIndex(
            surfaceResponse.ok
              ? normalizeSurfaceIndexPayload(surfacePayload, "Feature surface index unavailable")
              : emptySurfaceIndexResponse(["Feature surface index unavailable"]),
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchFeatures();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, repoPath, refreshKey]);

  return {
    loading,
    error,
    capabilityGroups,
    features,
    surfaceIndex,
  };
}
