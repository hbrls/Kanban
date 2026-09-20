"use client";

import {
  criterionShortLabel,
  humanizeToken,
  type CriterionResult,
  type FitnessBaselineEntry,
  type FitnessBaselineReport,
  type FitnessProfile,
  type FitnessProfileState,
  type FitnessReport,
  type FluencyRunMode,
} from "./fitness-analysis-types";
import type { TranslationDictionary } from "@/i18n/types";

export type FluencyHeroModel = {
  title: string;
  subtitle: string;
  currentLevel: string;
  targetLevel: string;
  capabilitySummary: string;
  confidenceSummary: string;
  baselineSummary?: string;
};

export type FluencyBaselineModel = {
  framing: string;
  summary: string;
  scoreLabel: string;
  currentReadinessLabel: string;
  overallLevel: string;
  overallLevelName: string;
  nextLevel?: string | null;
  nextLevelName?: string | null;
  autonomyBand?: string;
  autonomyRationale?: string;
  dominantGaps: string[];
  topActions: string[];
};

export type FluencyBlockerCard = {
  id: string;
  title: string;
  impactSummary: string;
  whyItMatters: string;
  evidenceHint: string;
  recommendedAction: string;
  critical: boolean;
  severityLabel: string;
};

export type FluencyRemediationItem = {
  id: string;
  title: string;
  impactSummary: string;
  startingPoint: string;
  targetLevel: string;
  critical: boolean;
};

export type FluencyScoringExplainer = Array<{
  title: string;
  description: string;
}>;

function getCapabilitySummary(levelName: string | undefined, t: TranslationDictionary["fitness"]["levels"]) {
  switch (levelName) {
    case "Awareness":
      return t.awareness;
    case "Assisted-Coding":
      return t.assistedCoding;
    case "Structured-AI-Coding":
      return t.structuredCoding;
    case "Agent-Centric":
      return t.agentCentric;
    case "Agent-First":
      return t.agentFirst;
    default:
      return t.waitingReport;
  }
}

function inferFailureMode(criterion: CriterionResult, t: TranslationDictionary["fitness"]) {
  if (criterion.dimension === "governance") {
    return t.status.noData;
  }
  if (criterion.dimension === "context") {
    return t.scoring.compareDisabled;
  }
  if (criterion.dimension === "harness") {
    return t.scoring.nonDeterministicMode;
  }
  if (criterion.dimension === "collaboration") {
    return t.scoring.fromUnknown;
  }
  if (criterion.dimension === "sdlc") {
    return t.scoring.sourceFromRun;
  }
  return `${humanizeToken(criterion.dimension)} ${t.overview.failingCriteriaLabel.toLowerCase()}`;
}

function buildImpactSummary(criterion: CriterionResult, t: TranslationDictionary["fitness"]) {
  const base = inferFailureMode(criterion, t);
  const severity = criterion.critical ? t.status.critical : t.status.priorityFix;
  return `${base} ${severity}.`;
}

function normalizePercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`;
}

function pickEntryText(entry: string | FitnessBaselineEntry | undefined): string | undefined {
  if (!entry) {
    return undefined;
  }

  if (typeof entry === "string") {
    const trimmed = entry.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  const record = entry;
  for (const key of [
    "title",
    "label",
    "capabilityGroupName",
    "action",
    "recommendation",
    "summary",
    "name",
    "reason",
    "rationale",
    "evidenceHint",
  ] as const) {
    const value = record[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return undefined;
}

function normalizeEntryList(entries: Array<string | FitnessBaselineEntry> | undefined): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  const normalized: string[] = [];
  for (const entry of entries) {
    const value = pickEntryText(entry);
    if (value && !normalized.includes(value)) {
      normalized.push(value);
    }
  }
  return normalized;
}

function buildBaselineSummary(report: FitnessReport, baseline: FitnessBaselineReport) {
  const framing = humanizeToken(report.framing ?? "fluency");
  const overallLevel = baseline.summary.overallLevel;
  const overallLevelName = baseline.summary.overallLevelName || report.overallLevelName;
  const currentReadiness = normalizePercent(baseline.summary.currentReadiness ?? report.currentLevelReadiness);
  const score = normalizePercent(baseline.summary.score);
  const nextLevelName = baseline.summary.nextLevelName ?? report.nextLevelName;
  const parts = [
    framing,
    overallLevelName,
    score,
    currentReadiness,
    nextLevelName,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  return {
    framing,
    summary: parts.join(" · "),
    scoreLabel: score ?? "n/a",
    currentReadinessLabel: currentReadiness ?? "n/a",
    overallLevel,
    overallLevelName,
    nextLevel: baseline.summary.nextLevel,
    nextLevelName,
    autonomyBand: baseline.autonomyRecommendation?.band ? humanizeToken(baseline.autonomyRecommendation.band) : undefined,
    autonomyRationale: baseline.autonomyRecommendation?.rationale,
    dominantGaps: normalizeEntryList(baseline.dominantGaps).slice(0, 3),
    topActions: normalizeEntryList(baseline.topActions).slice(0, 3),
  };
}

export function buildBaselineModel(report: FitnessReport | undefined): FluencyBaselineModel | undefined {
  if (!report?.baseline) {
    return undefined;
  }

  return buildBaselineSummary(report, report.baseline);
}

export function buildHeroModel(
  report: FitnessReport | undefined,
  profile: FitnessProfile,
  state: FitnessProfileState,
  t: TranslationDictionary["fitness"],
): FluencyHeroModel {
  if (!report) {
    return {
      title: profile === "generic" ? t.panel.genericProfile : t.panel.orchestratorProfile,
      subtitle: "",
      currentLevel: t.panel.noReport,
      targetLevel: state === "loading" ? t.panel.runningReport : t.panel.runFirstReport,
      capabilitySummary: t.levels.waitingReport,
      confidenceSummary: state === "loading" ? t.panel.statusLoading : t.panel.statusEmpty,
      baselineSummary: undefined,
    };
  }

  const confidence = `${t.panel.fit} ${Math.round(report.currentLevelReadiness * 100)}%`;
  const baseline = buildBaselineModel(report);
  return {
    title: profile === "generic" ? t.panel.genericProfile : t.panel.orchestratorProfile,
    subtitle: "",
    currentLevel: report.overallLevelName,
    targetLevel: report.nextLevelName ?? t.scoring.noLevelUnlock,
    capabilitySummary: getCapabilitySummary(report.overallLevelName, t.levels),
    confidenceSummary: confidence,
    baselineSummary: baseline?.summary,
  };
}

export function buildBlockerCards(
  report: FitnessReport | undefined,
  t: TranslationDictionary["fitness"],
): FluencyBlockerCard[] {
  if (!report) {
    return [];
  }

  return (report.blockingCriteria ?? []).slice(0, 4).map((criterion) => ({
    id: criterion.id,
    title: criterionShortLabel(criterion.id),
    impactSummary: buildImpactSummary(criterion, t),
    whyItMatters: criterion.whyItMatters,
    evidenceHint: criterion.evidenceHint,
    recommendedAction: criterion.recommendedAction,
    critical: criterion.critical,
    severityLabel: criterion.critical ? t.status.critical : t.status.priorityFix,
  }));
}

export function buildRemediationChecklist(report: FitnessReport | undefined): FluencyRemediationItem[] {
  if (!report) {
    return [];
  }

  return report.recommendations.slice(0, 5).map((item) => ({
    id: item.criterionId,
    title: item.action,
    impactSummary: item.whyItMatters,
    startingPoint: item.evidenceHint,
    targetLevel: report.nextLevelName ?? "Current max",
    critical: item.critical,
  }));
}

export function buildScoringExplainer(
  report: FitnessReport | undefined,
  runMode: FluencyRunMode,
  compareLast: boolean,
  profileState: FitnessProfileState,
  t: TranslationDictionary["fitness"],
): FluencyScoringExplainer {
  const sourceLine = report
    ? `${t.scoring.sourceFromReport} ${Math.round(report.currentLevelReadiness * 100)}%。`
    : t.scoring.noReadinessInfo;

  return [
    {
      title: t.scoring.title,
      description: sourceLine,
    },
    {
      title: t.scoring.title,
      description: report?.nextLevelName
        ? `${t.scoring.levelUnlockPrefix}${report.nextLevelName}${t.scoring.levelUnlockSuffix}`
        : t.scoring.noLevelUnlock,
    },
    {
      title: compareLast ? t.scoring.compareEnabled : t.scoring.compareDisabled,
      description: compareLast ? t.scoring.compareEnabled : t.scoring.compareDisabled,
    },
    {
      title: profileState === "ready" ? t.scoring.deterministicMode : t.scoring.nonDeterministicMode,
      description: runMode === "deterministic"
        ? t.scoring.deterministicMode
        : t.scoring.nonDeterministicMode,
    },
  ];
}

export function buildPrimaryActionLabel(report: FitnessReport | undefined, profileState: FitnessProfileState, t: TranslationDictionary["fitness"]) {
  if (profileState === "loading") {
    return t.panel.runningReport;
  }
  return report ? t.panel.rerunReport : t.panel.runFirstReport;
}
