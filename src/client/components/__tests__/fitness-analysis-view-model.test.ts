import { describe, expect, it } from "vitest";

import { buildBaselineModel } from "../fitness-analysis-view-model";
import type { FitnessReport } from "../fitness-analysis-types";

const reportWithoutBaseline = {
  modelVersion: 2,
  modelPath: "/tmp/model.yaml",
  profile: "generic",
  mode: "deterministic",
  repoRoot: "/tmp/repo",
  generatedAt: "2026-03-29T04:50:58.741337+00:00",
  snapshotPath: "/tmp/report.json",
  overallLevel: "agent_centric",
  overallLevelName: "Agent-Centric",
  currentLevelReadiness: 1,
  nextLevel: "agent_first",
  nextLevelName: "Agent-First",
  nextLevelReadiness: 0,
  blockingTargetLevel: "agent_first",
  blockingTargetLevelName: "Agent-First",
  dimensions: {},
  cells: [],
  criteria: [],
  recommendations: [],
  blockingCriteria: [],
  evidencePacks: [],
} as FitnessReport;

describe("buildBaselineModel", () => {
  it("keeps older reports backward compatible when baseline is absent", () => {
    expect(buildBaselineModel(reportWithoutBaseline)).toBeUndefined();
  });
});
