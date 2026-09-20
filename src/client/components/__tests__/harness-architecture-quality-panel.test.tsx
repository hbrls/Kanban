import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HarnessArchitectureQualityPanel } from "../harness-architecture-quality-panel";

vi.mock("@/i18n", () => ({
  useTranslation: () => ({
    t: {
      common: {
        refresh: "Refresh",
        running: "Running",
        unavailable: "Unavailable",
      },
      settings: {
        harness: {
          architectureQuality: {
            navigationLabel: "Architecture",
            title: "Architecture Quality",
            description: "Live architecture scan results.",
            runScanLabel: "Run Architecture Scan",
            idleDescription: "Run an on-demand scan when you want fresh architecture results.",
            idleChecksTitle: "Scan Covers",
            idleChecksBoundaries: "Backend boundary leaks across core and API modules.",
            idleChecksCycles: "Cycle hotspots inside the backend core graph.",
            idleChecksSnapshots: "Snapshot comparison after each successful scan.",
            compareTitle: "Change Since Last Scan",
            previousScanLabel: "Previous Scan",
            snapshotPathLabel: "Snapshot",
            failedRuleDeltaLabel: "Failed Rules Δ",
            violationDeltaLabel: "Violations Δ",
            noComparison: "No comparison yet.",
            noMaterialChanges: "No material change.",
            noNewFailures: "No newly failing rules.",
            noResolvedRules: "No resolved rules yet.",
            statusLabel: "Status",
            sourceLabel: "Source",
            tsconfigLabel: "TSConfig",
            rulesLabel: "Rules",
            failedRulesLabel: "Failed Rules",
            violationsLabel: "Violations",
            notesLabel: "Notes",
            failedRulesTitle: "Failed Rules",
            boundaryLeaksTitle: "Boundary Leaks",
            cycleHotspotsTitle: "Cycle Hotspots",
            topViolationsTitle: "Top Violations",
            primaryFindingsTitle: "Primary Findings",
            executionDetailsTitle: "Execution Details",
            newFailuresTitle: "New Failures",
            resolvedRulesTitle: "Resolved Rules",
            summaryViewLabel: "Summary",
            boundariesViewLabel: "Boundary Leaks",
            cyclesViewLabel: "Cycle Hotspots",
            violationsViewLabel: "Violations",
            focusedViewLabel: "Focused View",
            clearFocusLabel: "Clear",
            openDetailsLabel: "Open details",
            noFailedRules: "No failing architecture rules.",
            noBoundaryLeaks: "No boundary leaks.",
            noCycleHotspots: "No cycle hotspots.",
            noViolations: "No violations.",
            noMatchingViolations: "No violations matched the current focus.",
            noPrimaryFindings: "No primary findings.",
            ruleColumn: "Rule",
            suiteColumn: "Suite",
            countColumn: "Count",
            summaryColumn: "Summary",
            statusPass: "Pass",
            statusFail: "Fail",
            statusSkipped: "Skipped",
            suiteBoundaries: "Boundaries",
            suiteCycles: "Cycles",
            violationDependency: "Dependency",
            violationCycle: "Cycle",
            violationEmptyTest: "Empty Test",
            violationUnknown: "Unknown",
          },
        },
      },
    },
  }),
}));

const sampleData = {
  generatedAt: "2026-04-03T11:20:00.000Z",
  repoRoot: "/repo",
  summaryStatus: "fail" as const,
  archUnitSource: "/Users/phodal/test/ArchUnitTS",
  tsconfigPath: "tsconfig.json",
  snapshotPath: "docs/fitness/reports/backend-architecture-latest.json",
  suiteCount: 2,
  ruleCount: 4,
  failedRuleCount: 2,
  violationCount: 59,
  reports: [
    {
      generatedAt: "2026-04-03T11:20:00.000Z",
      repoRoot: "/repo",
      suite: "boundaries" as const,
      summaryStatus: "fail" as const,
      archUnitSource: "/Users/phodal/test/ArchUnitTS",
      tsconfigPath: "tsconfig.json",
      ruleCount: 2,
      failedRuleCount: 1,
      notes: [],
      results: [
        {
          id: "boundary-core-client",
          title: "Core must not depend on client modules",
          suite: "boundaries" as const,
          status: "fail" as const,
          violationCount: 2,
          message: "Core imports client modules.",
          violations: [
            {
              kind: "dependency" as const,
              source: "src/core/session-transcript.ts",
              target: "src/client/components/chat-panel/chat-panel.tsx",
              edgeCount: 1,
              summary: "src/core/session-transcript.ts -> src/client/components/chat-panel/chat-panel.tsx",
            },
            {
              kind: "dependency" as const,
              source: "src/core/session-transcript.ts",
              target: "src/client/components/chat-panel/chat-input.tsx",
              edgeCount: 1,
              summary: "src/core/session-transcript.ts -> src/client/components/chat-panel/chat-input.tsx",
            },
          ],
        },
      ],
    },
    {
      generatedAt: "2026-04-03T11:20:00.000Z",
      repoRoot: "/repo",
      suite: "cycles" as const,
      summaryStatus: "fail" as const,
      archUnitSource: "/Users/phodal/test/ArchUnitTS",
      tsconfigPath: "tsconfig.json",
      ruleCount: 2,
      failedRuleCount: 1,
      notes: [],
      results: [
        {
          id: "cycle-core-graph",
          title: "Backend core modules should stay acyclic",
          suite: "cycles" as const,
          status: "fail" as const,
          violationCount: 57,
          message: "Cycles found in backend core modules.",
          violations: [
            {
              kind: "cycle" as const,
              path: [
                "src/core/acp/service.ts -> src/core/kanban/store.ts",
                "src/core/kanban/store.ts -> src/core/acp/service.ts",
              ],
              edgeCount: 2,
              summary: "src/core/acp/service.ts -> src/core/kanban/store.ts -> src/core/acp/service.ts",
            },
          ],
        },
      ],
    },
  ],
  notes: ["Scan completed."],
  comparison: {
    previousGeneratedAt: "2026-04-03T10:15:00.000Z",
    previousSummaryStatus: "fail" as const,
    currentSummaryStatus: "fail" as const,
    ruleDelta: 0,
    failedRuleDelta: 0,
    violationDelta: -5,
    changedRules: [],
    newFailingRules: [],
    resolvedRules: [],
  },
};

describe("HarnessArchitectureQualityPanel", () => {
  it("shows a guided idle state before any scan results exist", () => {
    render(
      <HarnessArchitectureQualityPanel
        repoLabel="repo"
        data={null}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("Run an on-demand scan when you want fresh architecture results.")).not.toBeNull();
    expect(screen.getByTestId("architecture-idle-highlights")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Run Architecture Scan" })).not.toBeNull();
  });

  it("defaults to summary view and switches between architecture detail tabs", () => {
    render(
      <HarnessArchitectureQualityPanel
        repoLabel="repo"
        data={sampleData}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByTestId("architecture-view-summary")).not.toBeNull();
    expect(screen.getByText("Primary Findings")).not.toBeNull();
    expect(screen.getByText("src/core/session-transcript.ts -> src/client/components")).not.toBeNull();
    expect(screen.getByTestId("architecture-execution-details")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Boundary Leaks" }));
    expect(screen.getByTestId("architecture-view-boundaries")).not.toBeNull();
    expect(screen.getByText("Core must not depend on client modules")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cycle Hotspots" }));
    expect(screen.getByTestId("architecture-view-cycles")).not.toBeNull();
    expect(screen.getByText("src/core/acp")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Violations" }));
    expect(screen.getByTestId("architecture-view-violations")).not.toBeNull();
    expect(screen.getByText("Backend core modules should stay acyclic")).not.toBeNull();
  });

  it("drills into focused violations from summary findings", () => {
    render(
      <HarnessArchitectureQualityPanel
        repoLabel="repo"
        data={sampleData}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );

    const boundaryFinding = screen.getByText("src/core/session-transcript.ts -> src/client/components").closest("button");
    expect(boundaryFinding).not.toBeNull();

    fireEvent.click(boundaryFinding!);

    expect(screen.getByTestId("architecture-view-violations")).not.toBeNull();
    expect(screen.getByTestId("architecture-violations-focus")).not.toBeNull();
    expect(screen.getByText(/Focused View:/)).not.toBeNull();
    expect(screen.getAllByText("Core must not depend on client modules")).toHaveLength(2);
    expect(screen.queryByText("Backend core modules should stay acyclic")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("Backend core modules should stay acyclic")).not.toBeNull();
  });
});
