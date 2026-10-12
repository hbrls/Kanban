"use client";

import { useState, useEffect, useCallback } from "react";
import { desktopAwareFetch } from "../utils/diagnostics";

export interface WorkspaceData {
  id: string;
  title: string;
  status: "active" | "archived";
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CodebaseData {
  id: string;
  workspaceId: string;
  repoPath: string;
  branch?: string;
  label?: string;
  isDefault: boolean;
  sourceType?: "local" | "github";
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UseWorkspacesReturn {
  workspaces: WorkspaceData[];
  loading: boolean;
  error: Error | null;
  fetchWorkspaces: () => Promise<void>;
  createWorkspace: (title: string) => Promise<WorkspaceData | null>;
  archiveWorkspace: (id: string) => Promise<void>;
}

export function useWorkspaces(): UseWorkspacesReturn {
  const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([]);
  // Start with loading=true since we fetch on mount
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = "/api/workspaces?status=active";
    try {
      const res = await desktopAwareFetch(url);
      if (!res.ok) {
        setWorkspaces([]);
        setError(new Error(`${url} failed: HTTP ${res.status}`));
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data?.workspaces)) {
        setWorkspaces([]);
        setError(new Error(`${url} returned an unexpected payload: no "workspaces" array`));
        return;
      }
      setWorkspaces(data.workspaces);
    } catch (err) {
      setWorkspaces([]);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  const createWorkspace = useCallback(async (title: string): Promise<WorkspaceData | null> => {
    const res = await desktopAwareFetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await fetchWorkspaces();
    return data.workspace ?? null;
  }, [fetchWorkspaces]);

  const archiveWorkspace = useCallback(async (id: string): Promise<void> => {
    await desktopAwareFetch(`/api/workspaces/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    await fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        void fetchWorkspaces();
      }
    });
    return () => {
      active = false;
    };
  }, [fetchWorkspaces]);

  return { workspaces, loading, error, fetchWorkspaces, createWorkspace, archiveWorkspace };
}

export function useCodebases(workspaceId: string): {
  codebases: CodebaseData[];
  loading: boolean;
  error: Error | null;
  fetchCodebases: () => Promise<void>;
} {
  const [codebases, setCodebases] = useState<CodebaseData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchCodebases = useCallback(async () => {
    // Skip if workspaceId is missing or is a placeholder (static export mode)
    if (!workspaceId || workspaceId === "__placeholder__") {
      setCodebases([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const url = `/api/workspaces/${workspaceId}/codebases`;
    try {
      const res = await desktopAwareFetch(url);
      if (!res.ok) {
        setCodebases([]);
        setError(new Error(`${url} failed: HTTP ${res.status}`));
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data?.codebases)) {
        setCodebases([]);
        setError(new Error(`${url} returned an unexpected payload: no "codebases" array`));
        return;
      }
      setCodebases(data.codebases);
    } catch (err) {
      setCodebases([]);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        void fetchCodebases();
      }
    });
    return () => {
      active = false;
    };
  }, [fetchCodebases]);

  return { codebases, loading, error, fetchCodebases };
}
