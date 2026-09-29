import type { RepoSelection } from "@/client/components/repo-picker";
import { loadRepoSelection } from "@/client/utils/repo-selection-storage";

export type FeatureExplorerUrlState = {
  featureId: string;
  filePath: string;
};

export function loadInitialRepoSelection(workspaceId: string): RepoSelection | null {
  return loadRepoSelection("featureExplorer", workspaceId);
}

export function readFeatureExplorerUrlState(): FeatureExplorerUrlState {
  if (typeof window === "undefined") {
    return { featureId: "", filePath: "" };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    featureId: params.get("feature") ?? "",
    filePath: params.get("file") ?? "",
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
  if (nextState.filePath) {
    params.set("file", nextState.filePath);
  } else {
    params.delete("file");
  }

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(window.history.state, "", nextUrl);
}
