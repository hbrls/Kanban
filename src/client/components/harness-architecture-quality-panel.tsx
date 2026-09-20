"use client";

import { useMemo, useState } from "react";
import { HarnessSectionCard, HarnessSectionStateFrame } from "@/client/components/harness-section-card";
import { HarnessUnsupportedState } from "@/client/components/harness-support-state";
import { HarnessModuleGraphView } from "@/client/components/harness-module-graph-view";
import type {
  ArchitectureQualityResponse,
  ArchitectureRuleResult,
  ArchitectureSuiteName,
  ArchitectureViolation,
} from "@/client/hooks/use-harness-settings-data";
import { useTranslation } from "@/i18n";

type HarnessArchitectureQualityPanelProps = {
  repoLabel: string;
  unsupportedMessage?: string | null;
  data?: ArchitectureQualityResponse | null;
  loading?: boolean;
  error?: string | null;
  embedded?: boolean;
  onRefresh?: () => void;
};

type FlattenedViolation = {
  suite: ArchitectureSuiteName;
  ruleId: string;
  ruleTitle: string;
  count: number;
  summary: string;
  kindLabel: string;
};

type ArchitectureCluster = {
  label: string;
  count: number;
  sample: string;
};

type ArchitectureDetailView = "summary" | "boundaries" | "cycles" | "violations" | "graph";

type PrimaryFinding = {
  id: string;
  eyebrow: string;
  title: string;
  metric: string;
  summary: string;
};

type ArchitectureDrilldown =
  | {
    kind: "rule";
    label: string;
    ruleId: string;
  }
  | {
    kind: "boundary-cluster";
    label: string;
    clusterLabel: string;
  }
  | {
    kind: "cycle-cluster";
    label: string;
    clusterLabel: string;
  };

function formatSignedDelta(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  return `${value}`;
}

function deltaTone(value: number, mode: "risk" | "recovery" = "risk") {
  if (value === 0) {
    return "border-desktop-border bg-desktop-bg-primary text-desktop-text-secondary";
  }
  const positiveIsBad = mode === "risk";
  const isBad = positiveIsBad ? value > 0 : value < 0;
  return isBad
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatSuiteLabel(
  suite: ArchitectureSuiteName,
  labels: { suiteBoundaries: string; suiteCycles: string },
): string {
  return suite === "cycles" ? labels.suiteCycles : labels.suiteBoundaries;
}

function buildViolationSummary(violation: ArchitectureViolation): string {
  switch (violation.kind) {
    case "dependency":
      return `${violation.source} -> ${violation.target}`;
    case "cycle":
      return violation.path.join(" | ");
    case "empty-test":
      return violation.message;
    case "unknown":
    default:
      return violation.summary;
  }
}

function buildViolationKindLabel(
  violation: ArchitectureViolation,
  labels: {
    violationDependency: string;
    violationCycle: string;
    violationEmptyTest: string;
    violationUnknown: string;
  },
): string {
  switch (violation.kind) {
    case "dependency":
      return labels.violationDependency;
    case "cycle":
      return labels.violationCycle;
    case "empty-test":
      return labels.violationEmptyTest;
    case "unknown":
    default:
      return labels.violationUnknown;
  }
}

function buildViolationCount(violation: ArchitectureViolation): number {
  if (violation.kind === "dependency" || violation.kind === "cycle") {
    return violation.edgeCount;
  }
  return 1;
}

function normalizeModuleBucket(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").trim();
  const parts = normalized.split("/").filter(Boolean);
  if (parts[0] !== "src") {
    return normalized;
  }
  if (parts[1] === "app" && parts[2] === "api") {
    return parts.slice(0, Math.min(parts.length, 4)).join("/");
  }
  return parts.slice(0, Math.min(parts.length, 3)).join("/");
}

function buildBoundaryLeakClusters(rules: ArchitectureRuleResult[]): ArchitectureCluster[] {
  const clusters = new Map<string, ArchitectureCluster>();

  for (const rule of rules) {
    for (const violation of rule.violations) {
      if (violation.kind !== "dependency") {
        continue;
      }
      const label = `${normalizeModuleBucket(violation.source)} -> ${normalizeModuleBucket(violation.target)}`;
      const current = clusters.get(label);
      if (current) {
        current.count += 1;
      } else {
        clusters.set(label, {
          label,
          count: 1,
          sample: `${violation.source} -> ${violation.target}`,
        });
      }
    }
  }

  return [...clusters.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildCycleHotspotClusters(rules: ArchitectureRuleResult[]): ArchitectureCluster[] {
  const clusters = new Map<string, ArchitectureCluster>();

  for (const rule of rules) {
    for (const violation of rule.violations) {
      if (violation.kind !== "cycle") {
        continue;
      }

      for (const edge of violation.path) {
        const [source, target] = edge.split(" -> ");
        for (const bucket of [normalizeModuleBucket(source ?? ""), normalizeModuleBucket(target ?? "")]) {
          if (!bucket) {
            continue;
          }
          const current = clusters.get(bucket);
          if (current) {
            current.count += 1;
          } else {
            clusters.set(bucket, {
              label: bucket,
              count: 1,
              sample: edge,
            });
          }
        }
      }
    }
  }

  return [...clusters.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function statusTone(status: "pass" | "fail" | "skipped") {
  if (status === "fail") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "skipped") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function summarizeRule(rule: ArchitectureRuleResult): string {
  const first = rule.violations[0];
  if (!first) {
    return "";
  }
  return buildViolationSummary(first);
}

function summarizeComparison(copy: {
  noComparison: string;
  noMaterialChanges: string;
  failedRuleDeltaLabel: string;
  violationDeltaLabel: string;
  newFailuresTitle: string;
  resolvedRulesTitle: string;
}, comparison: ArchitectureQualityResponse["comparison"]): string {
  if (!comparison) {
    return copy.noComparison;
  }
  if (
    comparison.failedRuleDelta === 0
    && comparison.violationDelta === 0
    && comparison.newFailingRules.length === 0
    && comparison.resolvedRules.length === 0
  ) {
    return copy.noMaterialChanges;
  }

  return [
    `${copy.failedRuleDeltaLabel} ${formatSignedDelta(comparison.failedRuleDelta)}`,
    `${copy.violationDeltaLabel} ${formatSignedDelta(comparison.violationDelta)}`,
    `${copy.newFailuresTitle} ${comparison.newFailingRules.length}`,
    `${copy.resolvedRulesTitle} ${comparison.resolvedRules.length}`,
  ].join(" · ");
}

function matchesBoundaryCluster(summary: string, clusterLabel: string): boolean {
  const [sourceBucket, targetBucket] = clusterLabel.split(" -> ");
  return Boolean(sourceBucket && targetBucket && summary.includes(sourceBucket) && summary.includes(targetBucket));
}

function matchesDrilldown(violation: FlattenedViolation, drilldown: ArchitectureDrilldown | null): boolean {
  if (!drilldown) {
    return true;
  }
  if (drilldown.kind === "rule") {
    return violation.ruleId === drilldown.ruleId;
  }
  if (drilldown.kind === "boundary-cluster") {
    return violation.suite === "boundaries" && matchesBoundaryCluster(violation.summary, drilldown.clusterLabel);
  }
  return violation.suite === "cycles" && violation.summary.includes(drilldown.clusterLabel);
}

export function HarnessArchitectureQualityPanel({
  repoLabel: _repoLabel,
  unsupportedMessage,
  data,
  loading = false,
  error = null,
  embedded = false,
  onRefresh,
}: HarnessArchitectureQualityPanelProps) {
  const { t } = useTranslation();
  const copy = t.settings.harness.architectureQuality;
  const actionLabel = data ? t.common.refresh : copy.runScanLabel;
  const [detailView, setDetailView] = useState<ArchitectureDetailView>("summary");
  const [drilldown, setDrilldown] = useState<ArchitectureDrilldown | null>(null);

  const failedRules = useMemo(
    () => (data?.reports ?? []).flatMap((report) => report.results.filter((result) => result.status === "fail")),
    [data?.reports],
  );
  const flattenedViolations = useMemo<FlattenedViolation[]>(
    () => failedRules.flatMap((rule) => rule.violations.slice(0, 8).map((violation) => ({
      suite: rule.suite,
      ruleId: rule.id,
      ruleTitle: rule.title,
      count: buildViolationCount(violation),
      summary: buildViolationSummary(violation),
      kindLabel: buildViolationKindLabel(violation, copy),
    }))),
    [copy, failedRules],
  );
  const boundaryLeakClusters = useMemo(
    () => buildBoundaryLeakClusters(failedRules.filter((rule) => rule.suite === "boundaries")),
    [failedRules],
  );
  const cycleHotspotClusters = useMemo(
    () => buildCycleHotspotClusters(failedRules.filter((rule) => rule.suite === "cycles")),
    [failedRules],
  );
  const primaryFindings = useMemo<PrimaryFinding[]>(() => {
    const findings: PrimaryFinding[] = [];
    const topBoundaryLeak = boundaryLeakClusters[0];
    const topCycleHotspot = cycleHotspotClusters[0];
    const topFailedRule = failedRules[0];

    if (topBoundaryLeak) {
      findings.push({
        id: "boundary-leak",
        eyebrow: copy.boundaryLeaksTitle,
        title: topBoundaryLeak.label,
        metric: `${topBoundaryLeak.count}`,
        summary: topBoundaryLeak.sample,
      });
    }

    if (topCycleHotspot) {
      findings.push({
        id: "cycle-hotspot",
        eyebrow: copy.cycleHotspotsTitle,
        title: topCycleHotspot.label,
        metric: `${topCycleHotspot.count}`,
        summary: topCycleHotspot.sample,
      });
    }

    if (topFailedRule) {
      findings.push({
        id: "failed-rule",
        eyebrow: copy.failedRulesTitle,
        title: topFailedRule.title,
        metric: `${topFailedRule.violationCount}`,
        summary: summarizeRule(topFailedRule),
      });
    }

    return findings.slice(0, 3);
  }, [boundaryLeakClusters, copy.boundaryLeaksTitle, copy.cycleHotspotsTitle, copy.failedRulesTitle, cycleHotspotClusters, failedRules]);
  const boundaryFailedRules = useMemo(
    () => failedRules.filter((rule) => rule.suite === "boundaries"),
    [failedRules],
  );
  const cycleFailedRules = useMemo(
    () => failedRules.filter((rule) => rule.suite === "cycles"),
    [failedRules],
  );
  const comparisonSummary = useMemo(
    () => summarizeComparison(copy, data?.comparison ?? null),
    [copy, data?.comparison],
  );
  const filteredViolations = useMemo(
    () => flattenedViolations.filter((violation) => matchesDrilldown(violation, drilldown)),
    [drilldown, flattenedViolations],
  );
  const detailViews = useMemo(() => ([
    { id: "summary", label: copy.summaryViewLabel },
    { id: "boundaries", label: copy.boundariesViewLabel },
    { id: "cycles", label: copy.cyclesViewLabel },
    { id: "violations", label: copy.violationsViewLabel },
    { id: "graph", label: copy.graphViewLabel },
  ] satisfies Array<{ id: ArchitectureDetailView; label: string }>), [copy]);

  const statusLabel = data?.summaryStatus === "fail"
    ? copy.statusFail
    : data?.summaryStatus === "skipped"
      ? copy.statusSkipped
      : copy.statusPass;

  const openViolationDrilldown = (nextDrilldown: ArchitectureDrilldown) => {
    setDrilldown(nextDrilldown);
    setDetailView("violations");
  };

  const content = (
    <>
      {loading ? (
        <HarnessSectionStateFrame tone="warning">{t.common.running}</HarnessSectionStateFrame>
      ) : null}

      {unsupportedMessage ? (
        <HarnessUnsupportedState className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-4 text-[11px] text-amber-800" />
      ) : null}

      {error && !unsupportedMessage ? (
        <HarnessSectionStateFrame tone="error">{error}</HarnessSectionStateFrame>
      ) : null}

      {!loading && !error && !unsupportedMessage && !data ? (
        <HarnessSectionStateFrame>
          <div className="space-y-4">
            <div className="space-y-1">
              <div>{copy.idleDescription}</div>
              <div className="text-[11px] text-desktop-text-secondary">{copy.idleChecksTitle}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3" data-testid="architecture-idle-highlights">
              {[copy.idleChecksBoundaries, copy.idleChecksCycles, copy.idleChecksSnapshots].map((item) => (
                <div
                  key={item}
                  className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3 text-[11px] text-desktop-text-secondary"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </HarnessSectionStateFrame>
      ) : null}

      {!loading && !error && !unsupportedMessage && data ? (
        <div className="space-y-4">
          <div className={`rounded-sm border px-4 py-3 ${statusTone(data.summaryStatus)}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em]">{copy.statusLabel}</div>
                <div className="text-[16px] font-semibold">{statusLabel}</div>
                <div className="text-[11px] opacity-90">
                  {copy.failedRulesLabel}: {data.failedRuleCount} · {copy.violationsLabel}: {data.violationCount} · {copy.rulesLabel}: {data.ruleCount}
                </div>
              </div>
              {data.comparison ? (
                <div className="max-w-[32rem] text-[11px] opacity-90">
                  {copy.previousScanLabel}: {data.comparison.previousGeneratedAt}
                  <div className="mt-1">{comparisonSummary}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.statusLabel}</div>
              <div className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(data.summaryStatus)}`}>
                {statusLabel}
              </div>
            </div>
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.rulesLabel}</div>
              <div className="mt-2 text-[18px] font-semibold text-desktop-text-primary">{data.ruleCount}</div>
            </div>
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.failedRulesLabel}</div>
              <div className="mt-2 text-[18px] font-semibold text-desktop-text-primary">{data.failedRuleCount}</div>
            </div>
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.violationsLabel}</div>
              <div className="mt-2 text-[18px] font-semibold text-desktop-text-primary">{data.violationCount}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" data-testid="architecture-detail-tabs">
            {detailViews.map((view) => {
              const active = detailView === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setDetailView(view.id)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-desktop-accent bg-desktop-bg-active text-desktop-text-primary"
                      : "border-desktop-border bg-desktop-bg-primary/80 text-desktop-text-secondary hover:text-desktop-text-primary"
                  }`}
                >
                  {view.label}
                </button>
              );
            })}
          </div>

          {detailView === "summary" ? (
            <div className="space-y-4" data-testid="architecture-view-summary">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.primaryFindingsTitle}</div>
                  {primaryFindings.length > 0 ? (
                    <div className="mt-2 grid gap-2 xl:grid-cols-3">
                      {primaryFindings.map((finding) => {
                        const onOpen = finding.id === "boundary-leak"
                          ? () => openViolationDrilldown({
                            kind: "boundary-cluster",
                            label: `${copy.boundaryLeaksTitle}: ${finding.title}`,
                            clusterLabel: finding.title,
                          })
                          : finding.id === "cycle-hotspot"
                            ? () => openViolationDrilldown({
                              kind: "cycle-cluster",
                              label: `${copy.cycleHotspotsTitle}: ${finding.title}`,
                              clusterLabel: finding.title,
                            })
                            : () => openViolationDrilldown({
                              kind: "rule",
                              label: `${copy.failedRulesTitle}: ${finding.title}`,
                              ruleId: failedRules[0]?.id ?? "",
                            });

                        return (
                          <button
                            key={finding.id}
                            type="button"
                            onClick={onOpen}
                            className="rounded-sm border border-desktop-border bg-desktop-bg-secondary/40 px-3 py-3 text-left transition-colors hover:border-desktop-accent/60 hover:bg-desktop-bg-active/60"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{finding.eyebrow}</div>
                              <div className="rounded-full border border-desktop-border bg-desktop-bg-primary px-2 py-0.5 text-[10px] font-semibold text-desktop-text-primary">{finding.metric}</div>
                            </div>
                            <div className="mt-2 text-[12px] font-semibold text-desktop-text-primary" title={finding.title}>{finding.title}</div>
                            <div className="mt-1 truncate font-mono text-[10px] text-desktop-text-secondary" title={finding.summary}>{finding.summary}</div>
                            <div className="mt-2 text-[10px] font-medium text-desktop-accent">{copy.openDetailsLabel}</div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                      {copy.noPrimaryFindings}
                    </div>
                  )}
                </div>

                <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.compareTitle}</div>
                  <div className="mt-2 text-[11px] text-desktop-text-secondary">
                    {data.comparison
                      ? `${copy.previousScanLabel}: ${data.comparison.previousGeneratedAt}`
                      : copy.noComparison}
                  </div>
                  {data.comparison ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className={`rounded-sm border px-3 py-2 ${deltaTone(data.comparison.failedRuleDelta)}`}>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">{copy.failedRuleDeltaLabel}</div>
                        <div className="mt-2 text-[18px] font-semibold">{formatSignedDelta(data.comparison.failedRuleDelta)}</div>
                      </div>
                      <div className={`rounded-sm border px-3 py-2 ${deltaTone(data.comparison.violationDelta)}`}>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.12em]">{copy.violationDeltaLabel}</div>
                        <div className="mt-2 text-[18px] font-semibold">{formatSignedDelta(data.comparison.violationDelta)}</div>
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 rounded-sm border border-dashed border-desktop-border px-3 py-3 text-[11px] text-desktop-text-secondary">
                    {comparisonSummary}
                  </div>
                </div>
              </div>

              <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.failedRulesTitle}</div>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-desktop-accent hover:underline"
                    onClick={() => {
                      setDrilldown(null);
                      setDetailView("violations");
                    }}
                  >
                    {copy.violationsViewLabel}
                  </button>
                </div>
                {failedRules.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {failedRules.map((rule) => (
                      <button
                        key={rule.id}
                        type="button"
                        onClick={() => openViolationDrilldown({
                          kind: "rule",
                          label: `${copy.failedRulesTitle}: ${rule.title}`,
                          ruleId: rule.id,
                        })}
                        className="w-full rounded-sm border border-desktop-border bg-desktop-bg-secondary/40 px-3 py-2 text-left transition-colors hover:border-desktop-accent/60 hover:bg-desktop-bg-active/60"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-desktop-text-primary">{rule.title}</span>
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">
                            {formatSuiteLabel(rule.suite, copy)}
                          </span>
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">
                            {rule.violationCount}
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-desktop-text-secondary" title={summarizeRule(rule)}>
                          {summarizeRule(rule)}
                        </div>
                        <div className="mt-2 text-[10px] font-medium text-desktop-accent">{copy.openDetailsLabel}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                    {copy.noFailedRules}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {detailView === "boundaries" ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]" data-testid="architecture-view-boundaries">
              <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.boundaryLeaksTitle}</div>
                {boundaryLeakClusters.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {boundaryLeakClusters.slice(0, 10).map((cluster) => (
                      <button
                        key={cluster.label}
                        type="button"
                        onClick={() => openViolationDrilldown({
                          kind: "boundary-cluster",
                          label: `${copy.boundaryLeaksTitle}: ${cluster.label}`,
                          clusterLabel: cluster.label,
                        })}
                        className="w-full rounded-sm border border-desktop-border bg-desktop-bg-secondary/40 px-3 py-2 text-left transition-colors hover:border-desktop-accent/60 hover:bg-desktop-bg-active/60"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-desktop-text-primary">{cluster.label}</span>
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">
                            {cluster.count}
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-desktop-text-secondary" title={cluster.sample}>
                          {cluster.sample}
                        </div>
                        <div className="mt-2 text-[10px] font-medium text-desktop-accent">{copy.openDetailsLabel}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                    {copy.noBoundaryLeaks}
                  </div>
                )}
              </div>

              <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.failedRulesTitle}</div>
                {boundaryFailedRules.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {boundaryFailedRules.map((rule) => (
                      <button
                        key={rule.id}
                        type="button"
                        onClick={() => openViolationDrilldown({
                          kind: "rule",
                          label: `${copy.failedRulesTitle}: ${rule.title}`,
                          ruleId: rule.id,
                        })}
                        className="w-full rounded-sm border border-desktop-border bg-desktop-bg-secondary/40 px-3 py-2 text-left transition-colors hover:border-desktop-accent/60 hover:bg-desktop-bg-active/60"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-desktop-text-primary">{rule.title}</span>
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">
                            {rule.violationCount}
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-desktop-text-secondary" title={summarizeRule(rule)}>
                          {summarizeRule(rule)}
                        </div>
                        <div className="mt-2 text-[10px] font-medium text-desktop-accent">{copy.openDetailsLabel}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                    {copy.noFailedRules}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {detailView === "cycles" ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]" data-testid="architecture-view-cycles">
              <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.cycleHotspotsTitle}</div>
                {cycleHotspotClusters.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {cycleHotspotClusters.slice(0, 10).map((cluster) => (
                      <button
                        key={cluster.label}
                        type="button"
                        onClick={() => openViolationDrilldown({
                          kind: "cycle-cluster",
                          label: `${copy.cycleHotspotsTitle}: ${cluster.label}`,
                          clusterLabel: cluster.label,
                        })}
                        className="w-full rounded-sm border border-desktop-border bg-desktop-bg-secondary/40 px-3 py-2 text-left transition-colors hover:border-desktop-accent/60 hover:bg-desktop-bg-active/60"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-desktop-text-primary">{cluster.label}</span>
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">
                            {cluster.count}
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-desktop-text-secondary" title={cluster.sample}>
                          {cluster.sample}
                        </div>
                        <div className="mt-2 text-[10px] font-medium text-desktop-accent">{copy.openDetailsLabel}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                    {copy.noCycleHotspots}
                  </div>
                )}
              </div>

              <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.failedRulesTitle}</div>
                {cycleFailedRules.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {cycleFailedRules.map((rule) => (
                      <button
                        key={rule.id}
                        type="button"
                        onClick={() => openViolationDrilldown({
                          kind: "rule",
                          label: `${copy.failedRulesTitle}: ${rule.title}`,
                          ruleId: rule.id,
                        })}
                        className="w-full rounded-sm border border-desktop-border bg-desktop-bg-secondary/40 px-3 py-2 text-left transition-colors hover:border-desktop-accent/60 hover:bg-desktop-bg-active/60"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-desktop-text-primary">{rule.title}</span>
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">
                            {rule.violationCount}
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[10px] text-desktop-text-secondary" title={summarizeRule(rule)}>
                          {summarizeRule(rule)}
                        </div>
                        <div className="mt-2 text-[10px] font-medium text-desktop-accent">{copy.openDetailsLabel}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                    {copy.noFailedRules}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {detailView === "violations" ? (
            <div className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3" data-testid="architecture-view-violations">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">{copy.topViolationsTitle}</div>
                {drilldown ? (
                  <div className="flex flex-wrap items-center gap-2" data-testid="architecture-violations-focus">
                    <span className="rounded-full border border-desktop-accent/30 bg-desktop-bg-active px-2 py-0.5 text-[10px] font-medium text-desktop-text-primary">
                      {copy.focusedViewLabel}: {drilldown.label}
                    </span>
                    <button
                      type="button"
                      className="text-[10px] font-medium text-desktop-accent hover:underline"
                      onClick={() => setDrilldown(null)}
                    >
                      {copy.clearFocusLabel}
                    </button>
                  </div>
                ) : null}
              </div>
              {filteredViolations.length > 0 ? (
                <div className="mt-2 overflow-x-auto overflow-y-auto rounded-sm border border-desktop-border desktop-scrollbar-thin">
                  <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-desktop-border bg-desktop-bg-secondary/60">
                        <th className="px-3 py-2 font-semibold text-desktop-text-secondary">{copy.ruleColumn}</th>
                        <th className="px-3 py-2 font-semibold text-desktop-text-secondary">{copy.suiteColumn}</th>
                        <th className="px-3 py-2 font-semibold text-desktop-text-secondary">{copy.countColumn}</th>
                        <th className="px-3 py-2 font-semibold text-desktop-text-secondary">{copy.summaryColumn}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredViolations.slice(0, 24).map((violation, index) => (
                        <tr key={`${violation.ruleId}-${violation.kindLabel}-${index}`} className="border-b border-desktop-border/70">
                          <td className="px-3 py-2 text-desktop-text-primary">
                            <div className="font-medium">{violation.ruleTitle}</div>
                            <div className="text-[10px] text-desktop-text-secondary">{violation.kindLabel}</div>
                          </td>
                          <td className="px-3 py-2 text-desktop-text-secondary">{formatSuiteLabel(violation.suite, copy)}</td>
                          <td className="px-3 py-2 text-desktop-text-secondary">{violation.count}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-desktop-text-primary">
                            <div className="truncate max-w-[38rem]" title={violation.summary}>{violation.summary}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-2 rounded-sm border border-dashed border-desktop-border px-3 py-4 text-[11px] text-desktop-text-secondary">
                  {drilldown ? copy.noMatchingViolations : copy.noViolations}
                </div>
              )}
            </div>
          ) : null}

          {detailView === "graph" ? (
            <div data-testid="architecture-view-graph">
              <HarnessModuleGraphView repoRoot={data.repoRoot} />
            </div>
          ) : null}

          <details className="rounded-sm border border-desktop-border bg-desktop-bg-primary/80 px-3 py-3" data-testid="architecture-execution-details">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.12em] text-desktop-text-secondary">
              {copy.executionDetailsTitle}
            </summary>
            <div className="mt-3 space-y-2 text-[11px] text-desktop-text-secondary">
              <div className="truncate" title={data.archUnitSource ?? ""}>{copy.sourceLabel}: {data.archUnitSource ?? t.common.unavailable}</div>
              <div className="truncate" title={data.tsconfigPath}>{copy.tsconfigLabel}: {data.tsconfigPath || t.common.unavailable}</div>
              <div className="truncate" title={data.snapshotPath}>{copy.snapshotPathLabel}: {data.snapshotPath || t.common.unavailable}</div>
              {(data.notes ?? []).length > 0 ? (
                <ul className="list-inside list-disc space-y-1">
                  {data.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <HarnessSectionCard
        title={copy.title}
        description={copy.description}
        actions={onRefresh ? (
          <button type="button" className="desktop-btn desktop-btn-secondary" onClick={onRefresh}>
            {actionLabel}
          </button>
        ) : null}
      >
        {content}
      </HarnessSectionCard>
    );
  }

  return (
    <HarnessSectionCard
      title={copy.title}
      description={copy.description}
      actions={onRefresh ? (
        <button type="button" className="desktop-btn desktop-btn-secondary" onClick={onRefresh}>
          {actionLabel}
        </button>
      ) : null}
    >
      {content}
    </HarnessSectionCard>
  );
}
