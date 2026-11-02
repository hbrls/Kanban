import {
  evaluateReviewTriggers,
  loadReviewTriggerRules,
  type ReviewTriggerDiffStats,
  type ReviewTriggerReport,
} from "@/core/harness/review-triggers";

export type GitHubPullRequestFile = {
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  changes?: number;
};

const REVIEW_TRIGGER_RELEVANT_FILE_STATUSES = new Set([
  "added",
  "changed",
  "copied",
  "modified",
  "renamed",
]);

const DEFAULT_REVIEW_TRIGGER_PATH = "docs/fitness/review-triggers.yaml";

function normalizeStatus(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function clampCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : 0;
}

function truncateInline(value: string, maxLength = 180): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export function filterReviewTriggerFiles(files: GitHubPullRequestFile[]): GitHubPullRequestFile[] {
  return files.filter((file) => REVIEW_TRIGGER_RELEVANT_FILE_STATUSES.has(normalizeStatus(file.status)));
}

export function buildPullRequestDiffStats(files: GitHubPullRequestFile[]): ReviewTriggerDiffStats {
  return files.reduce<ReviewTriggerDiffStats>((stats, file) => ({
    fileCount: stats.fileCount + 1,
    addedLines: stats.addedLines + clampCount(file.additions),
    deletedLines: stats.deletedLines + clampCount(file.deletions),
  }), {
    fileCount: 0,
    addedLines: 0,
    deletedLines: 0,
  });
}

function hasReason(report: ReviewTriggerReport, pattern: RegExp): boolean {
  return report.triggers.some((trigger) => trigger.reasons.some((reason) => pattern.test(reason)));
}

function collectConfidenceThresholds(report: ReviewTriggerReport): number[] {
  return [...new Set(
    report.triggers
      .map((trigger) => trigger.confidenceThreshold)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  )].sort((a, b) => a - b);
}

export function collectReviewFocusAreas(report: ReviewTriggerReport): string[] {
  const focusAreas = new Set<string>();
  focusAreas.add("concrete bugs and behavioral regressions in the changed code");

  if (hasReason(report, /changed boundary /i)) {
    focusAreas.add("cross-boundary behavior, API parity, and integration fallout");
  }

  if (hasReason(report, /\bevidence\b/i)) {
    focusAreas.add("missing tests, fitness evidence, or contract updates for risky paths");
  }

  if (hasReason(report, /sensitive file changed/i)) {
    focusAreas.add("intentional policy, contract, and governance changes");
  }

  if (hasReason(report, /diff touched|diff added|diff deleted|directory '/i)) {
    focusAreas.add("high-risk hotspots in larger or concentrated changes");
  }

  if (report.triggers.some((trigger) => trigger.context.includes("graph_review_context"))) {
    focusAreas.add("graph impact and transitive callers/callees when changes span modules");
  }

  if (focusAreas.size === 1 && hasReason(report, /changed path:/i)) {
    focusAreas.add("state, orchestration, and runtime behavior in the touched paths");
  }

  const thresholds = collectConfidenceThresholds(report);
  if (thresholds.length > 0) {
    const label = thresholds.length === 1
      ? `${thresholds[0]}`
      : `${thresholds[0]}-${thresholds[thresholds.length - 1]}`;
    focusAreas.add(`high-confidence findings only; staged trigger thresholds escalate below confidence ${label}`);
  } else {
    focusAreas.add("high-confidence findings only; ignore lint, formatting, and style-only issues");
  }

  return [...focusAreas];
}

export function buildAutomatedReviewComment(params: {
  report: ReviewTriggerReport | null;
  configRelativePath?: string | null;
}): string {
  const lines = ["@augment review", ""];
  const configPath = params.configRelativePath ?? DEFAULT_REVIEW_TRIGGER_PATH;

  if (!params.report || params.report.triggers.length === 0) {
    lines.push("Standard review request.");
    lines.push("");
    lines.push("Focus on:");
    lines.push("- concrete bugs and behavioral regressions in the changed code");
    lines.push("- high-confidence findings only; ignore lint, formatting, and style-only issues");
    return lines.join("\n");
  }

  lines.push(`Repository review-trigger guidance matched this PR via \`${configPath}\`.`);

  if (params.report.blocked) {
    lines.push("Policy note: this change matched a blocking trigger and should receive manual scrutiny.");
  } else if (params.report.humanReviewRequired) {
    lines.push("Policy note: this change requires human review by repository policy.");
  } else if (params.report.stagedReviewRequired) {
    lines.push("Policy note: staged AI review applies here; uncertain findings should be escalated rather than guessed.");
  } else if (params.report.advisoryOnly) {
    lines.push("Policy note: these triggers are advisory, so keep findings tight and high-signal.");
  }

  lines.push("");
  lines.push("Matched triggers:");
  for (const trigger of params.report.triggers.slice(0, 5)) {
    const summary = trigger.reasons.slice(0, 2).map((reason) => truncateInline(reason)).join(" | ");
    lines.push(`- \`${trigger.name}\` (\`${trigger.action}\`, \`${trigger.severity}\`): ${summary}`);
  }
  if (params.report.triggers.length > 5) {
    lines.push(`- ${params.report.triggers.length - 5} additional trigger(s) matched`);
  }

  lines.push("");
  lines.push("Focus on:");
  for (const area of collectReviewFocusAreas(params.report)) {
    lines.push(`- ${area}`);
  }

  return lines.join("\n");
}

export async function analyzePullRequestReviewTriggers(params: {
  repoRoot: string;
  baseRef: string;
  files: GitHubPullRequestFile[];
}): Promise<{
  configRelativePath: string | null;
  report: ReviewTriggerReport | null;
}> {
  const { relativePath, rules } = await loadReviewTriggerRules(params.repoRoot);
  if (!relativePath || rules.length === 0) {
    return {
      configRelativePath: null,
      report: null,
    };
  }

  const relevantFiles = filterReviewTriggerFiles(params.files);
  const changedFiles = relevantFiles.map((file) => file.filename);
  const report = evaluateReviewTriggers({
    rules,
    changedFiles,
    diffStats: buildPullRequestDiffStats(relevantFiles),
    base: params.baseRef,
    repoRoot: params.repoRoot,
  });

  return {
    configRelativePath: relativePath,
    report,
  };
}
