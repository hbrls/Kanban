import type { RepoSelection } from "@/client/components/repo-picker";
import { loadRepoSelection } from "@/client/utils/repo-selection-storage";

export type FeatureExplorerUrlState = {
  featureId: string;
};

export function loadInitialRepoSelection(workspaceId: string): RepoSelection | null {
  return loadRepoSelection("featureExplorer", workspaceId);
}

export function readFeatureExplorerUrlState(): FeatureExplorerUrlState {
  if (typeof window === "undefined") {
    return { featureId: "" };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    featureId: params.get("feature") ?? "",
  };
}

export function replaceFeatureExplorerUrlState(nextState: FeatureExplorerUrlState): void {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (nextState.featureId) {
    params.set("feature", nextState.featureId);
  } else {
    params.delete("feature");
  }
  params.delete("file");

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(window.history.state, "", nextUrl);
}

export function formatShortDate(iso: string): string {
  if (!iso || iso === "-") return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}
