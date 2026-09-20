import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FitnessAnalysisDashboard } from "../fitness-analysis-dashboard";

const report = {
  modelVersion: 2,
  modelPath: "/tmp/model.yaml",
  profile: "generic" as const,
  mode: "deterministic",
  repoRoot: "/tmp/repo",
  generatedAt: "2026-03-29T04:50:58.741337+00:00",
  snapshotPath: "/tmp/report.json",
  overallLevel: "structured_ai_coding",
  overallLevelName: "Structured AI Coding",
  currentLevelReadiness: 0.83,
  nextLevel: "agent_centric",
  nextLevelName: "Agent-Centric",
  nextLevelReadiness: 0.6,
  blockingTargetLevel: "agent_centric",
  blockingTargetLevelName: "Agent-Centric",
  dimensions: {
    collaboration: {
      dimension: "collaboration",
      name: "Human-AI Collaboration",
      level: "structured_ai_coding",
      levelName: "Structured AI Coding",
      levelIndex: 2,
      score: 0.83,
      nextLevel: "agent_centric",
      nextLevelName: "Agent-Centric",
      nextLevelProgress: 0.6,
    },
    governance: {
      dimension: "governance",
      name: "Governance & Quality",
      level: "awareness",
      levelName: "Awareness",
      levelIndex: 0,
      score: 0.4,
      nextLevel: "assisted_coding",
      nextLevelName: "Assisted Coding",
      nextLevelProgress: 0.2,
    },
  },
  cells: [
    {
      id: "collaboration.structured_ai_coding",
      level: "structured_ai_coding",
      levelName: "Structured AI Coding",
      dimension: "collaboration",
      dimensionName: "Human-AI Collaboration",
      score: 0.83,
      passed: false,
      passedWeight: 5,
      applicableWeight: 6,
      criteria: [],
    },
    {
      id: "governance.awareness",
      level: "awareness",
      levelName: "Awareness",
      dimension: "governance",
      dimensionName: "Governance & Quality",
      score: 0.4,
      passed: false,
      passedWeight: 2,
      applicableWeight: 5,
      criteria: [],
    },
  ],
  criteria: [
    {
      id: "governance.awareness.basic_guardrails",
      level: "awareness",
      dimension: "governance",
      weight: 1,
      critical: false,
      status: "pass" as const,
      detectorType: "all_of",
      detail: "present",
      evidence: [],
      whyItMatters: "baseline",
      recommendedAction: "none",
      evidenceHint: "docs",
    },
  ],
  recommendations: [],
  comparison: {
    previousGeneratedAt: "2026-03-28T04:50:58.741337+00:00",
    previousOverallLevel: "assisted_coding",
    overallChange: "up" as const,
    dimensionChanges: [],
    criteriaChanges: [],
  },
  blockingCriteria: [],
  evidencePacks: [],
};

describe("FitnessAnalysisDashboard", () => {
  it("renders missing heatmap combinations as unavailable instead of zero scores", () => {
    render(<FitnessAnalysisDashboard report={report} />);

    const heatmap = screen.getByRole("table", { name: "Fluency heatmap" });

    expect(within(heatmap).getByText("83%")).toBeTruthy();
    expect(within(heatmap).getByText("5/6")).toBeTruthy();
    expect(within(heatmap).getAllByText("N/A").length).toBeGreaterThan(0);
    expect(within(heatmap).queryByText("0/0")).toBeNull();
  });
});
