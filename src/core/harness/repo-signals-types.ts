export type HarnessSignalsMode = "build" | "test";
export type HarnessScriptCategory = "build" | "dev" | "bundle" | "unit" | "e2e" | "quality" | "coverage";

export type HarnessScriptSignal = {
  name: string;
  command: string;
  category: HarnessScriptCategory;
};

export type HarnessOverviewRow = {
  id: string;
  label: string;
  items: string[];
};

export type HarnessEntrypointGroup = {
  id: string;
  label: string;
  category: HarnessScriptCategory;
  scripts: HarnessScriptSignal[];
};

export type HarnessSurfaceSignals = {
  configPath: string;
  title: string;
  summary: string;
  overviewRows: HarnessOverviewRow[];
  entrypointGroups: HarnessEntrypointGroup[];
};

export type HarnessRepoSignalsResponse = {
  generatedAt: string;
  repoRoot: string;
  packageManager: string | null;
  lockfiles: string[];
  build: HarnessSurfaceSignals;
  test: HarnessSurfaceSignals;
  warnings: string[];
};
