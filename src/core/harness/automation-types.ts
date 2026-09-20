export type HarnessAutomationSourceType = "finding" | "schedule" | "review-signal" | "external-event";
export type HarnessAutomationTargetType = "specialist" | "workflow" | "background-task";
export type HarnessAutomationRuntimeStatus = "active" | "paused" | "idle" | "pending" | "clear" | "definition-only";
export type HarnessAutomationSeverity = "low" | "medium" | "high";

export type HarnessAutomationDefinitionSummary = {
  id: string;
  name: string;
  description: string;
  sourceType: HarnessAutomationSourceType;
  sourceLabel: string;
  targetType: HarnessAutomationTargetType;
  targetLabel: string;
  runtimeStatus: HarnessAutomationRuntimeStatus;
  pendingCount: number;
  configPath: string;
  runtimeBinding?: string;
  cronExpr?: string;
  nextRunAt?: string;
  lastRunAt?: string;
};

export type HarnessAutomationPendingSignal = {
  id: string;
  automationId: string;
  automationName: string;
  signalType: string;
  title: string;
  summary: string;
  severity: HarnessAutomationSeverity;
  relativePath?: string;
  lineCount?: number;
  budgetLimit?: number;
  excessLines?: number;
  deferUntilCron?: string;
};

export type HarnessAutomationRecentRun = {
  automationId: string;
  automationName: string;
  sourceType: HarnessAutomationSourceType;
  runtimeBinding: string;
  status: Exclude<HarnessAutomationRuntimeStatus, "pending" | "clear" | "definition-only">;
  cronExpr?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastTaskId?: string;
};

export type HarnessAutomationResponse = {
  generatedAt: string;
  repoRoot: string;
  configFile: {
    relativePath: string;
    source: string;
    schema?: string;
  } | null;
  definitions: HarnessAutomationDefinitionSummary[];
  pendingSignals: HarnessAutomationPendingSignal[];
  recentRuns: HarnessAutomationRecentRun[];
  warnings: string[];
};
