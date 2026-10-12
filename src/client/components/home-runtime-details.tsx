"use client";

/**
 * HomeRuntimeDetails
 *
 * Renders the per-Provider breakdown that hangs under the Agent Runtime
 * initialization step. Pure display: the projection model has already
 * resolved which string to render for each cell.
 */

import { useSyncExternalStore } from "react";
import { Check, Circle, CircleOff, LoaderCircle, XCircle } from "lucide-react";

import type {
  HomeProviderCheck,
  HomeProviderCheckId,
  HomeProviderDisplayStatus,
  HomeProviderDetails,
  HomeRuntimeDetailsProjection,
} from "@/client/components/home-runtime-details-model";
import { useTranslation } from "@/i18n";
import type { TranslationDictionary } from "@/i18n/types";

export interface HomeRuntimeDetailsProps {
  projection: HomeRuntimeDetailsProjection;
}

function CheckStatusIcon({ status }: { status: HomeProviderDisplayStatus }) {
  switch (status) {
    case "waiting":
      return <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-desktop-accent" aria-hidden="true" />;
    case "success":
      return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />;
    case "unavailable":
      return <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />;
    case "skipped":
      return <CircleOff className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />;
    default:
      return <Circle className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />;
  }
}

const CHECK_ID_ORDER: HomeProviderCheckId[] = ["information", "environment", "startup", "handshake"];

function resolveCheckTitle(checkId: HomeProviderCheckId, t: TranslationDictionary): string {
  switch (checkId) {
    case "information":
      return t.homeInitialization.providerInformation;
    case "environment":
      return t.homeInitialization.providerEnvironment;
    case "startup":
      return t.homeInitialization.providerStartup;
    default:
      return t.homeInitialization.providerHandshake;
  }
}

function resolveCheckDetail(
  check: HomeProviderCheck,
  t: TranslationDictionary,
): { prefix: string; command?: string; suffix?: string } {
  const lookup = t.homeInitialization;
  switch (check.detailKey) {
    case "providerInformationLoaded":
      return {
        prefix: lookup.providerInformationLoaded,
        ...(check.command ? { command: ` · ${check.command}` } : {}),
      };
    case "providerInformationWaiting":
      return { prefix: lookup.providerInformationWaiting ?? lookup.providerWaitingResult };
    case "providerConfigurationLoaded":
      return {
        prefix: lookup.providerConfigurationLoaded,
        ...(check.command ? { command: ` · ${check.command}` } : {}),
      };
    case "providerEnvironmentPassed":
      return {
        prefix: lookup.providerEnvironmentPassed,
        ...(check.command ? { command: ` · ${check.command}` } : {}),
      };
    case "providerEnvironmentUnavailable":
      return {
        prefix: lookup.providerEnvironmentUnavailable,
        ...(check.reason ? { suffix: ` · ${check.reason}` } : {}),
      };
    case "providerEnvironmentWaiting":
      return { prefix: lookup.providerWaitingResult };
    case "providerWaitingInitialization":
      return { prefix: lookup.providerWaitingInitialization };
    case "providerWaitingResult":
      return { prefix: lookup.providerWaitingResult };
    case "providerCheckPassed":
      return { prefix: lookup.providerCheckPassed };
    case "providerAvailable":
      return { prefix: lookup.providerAvailable };
    case "providerUnavailable":
      return { prefix: lookup.providerUnavailable };
    case "providerConfigured":
      return { prefix: lookup.providerConfigured };
    case "providerDash":
      return { prefix: lookup.providerDash };
    case "providerNotExecuted":
      return { prefix: lookup.providerNotExecuted };
    case "providerNotChecked":
      return { prefix: lookup.providerNotChecked };
    case "providerNoCheckInformation":
      return { prefix: lookup.providerNoCheckInformation };
    case "providerNoCheckResult":
      return { prefix: lookup.providerNoCheckResult };
    default:
      return { prefix: lookup.providerDash };
  }
}

function resolveSummary(provider: HomeProviderDetails, t: TranslationDictionary): string {
  const lookup = t.homeInitialization;
  switch (provider.summaryKey) {
    case "providerAvailable":
      return lookup.providerAvailable;
    case "providerUnavailable":
      return lookup.providerUnavailable;
    case "providerWaitingResult":
      return lookup.providerWaitingResult;
    case "providerConfigured":
      return lookup.providerConfigured;
    default:
      return lookup.providerNotChecked;
  }
}

function resolveSourceLabel(provider: HomeProviderDetails, t: TranslationDictionary): string {
  const lookup = t.homeInitialization;
  switch (provider.sourceKey) {
    case "providerSourceLocal":
      return lookup.providerSourceLocal;
    case "providerSourceRegistry":
      return lookup.providerSourceRegistry;
    case "providerSourceCustom":
      return lookup.providerSourceCustom;
    default:
      return lookup.providerSourceUnknown;
  }
}

function resolveConnectionLabel(
  projection: HomeRuntimeDetailsProjection,
  t: TranslationDictionary,
): string {
  const lookup = t.homeInitialization;
  switch (projection.connection.key) {
    case "runtimeConnectionReady":
      return lookup.runtimeConnectionReady;
    case "runtimeConnectionFailed":
      return lookup.runtimeConnection;
    case "runtimeConnectionSkipped":
      return lookup.providerDash;
    default:
      return lookup.runtimeConnection;
  }
}

export function HomeRuntimeDetails({ projection }: HomeRuntimeDetailsProps) {
  const { t } = useTranslation();
  const lookup = t.homeInitialization;
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div
      className="mt-2 space-y-2 border-l border-black/6 pl-4 dark:border-white/10"
      data-testid="home-runtime-details"
    >
      <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
        <span>{lookup.runtimeConnectionTitle}</span>
        <span className="ml-auto text-slate-400 dark:text-slate-500">
          {resolveConnectionLabel(projection, t)}
        </span>
      </div>

      {isHydrated && projection.providers.length > 0 && (
        <ol className="space-y-3" data-testid="home-runtime-provider-list">
          {projection.providers.map((provider) => {
            const checksById = new Map(provider.checks.map((check) => [check.id, check]));
            return (
              <li key={provider.id} data-testid={`home-runtime-provider-${provider.id}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{provider.name}</span>
                  <span aria-hidden="true">·</span>
                  <span>{resolveSourceLabel(provider, t)}</span>
                  <span className="ml-auto text-slate-400 dark:text-slate-500">
                    {resolveSummary(provider, t)}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {CHECK_ID_ORDER.map((checkId) => {
                    const check = checksById.get(checkId);
                    if (!check) return null;
                    const detail = resolveCheckDetail(check, t);
                    return (
                      <li
                        key={checkId}
                        className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400"
                        data-testid={`home-runtime-provider-${provider.id}-${checkId}`}
                      >
                        <span className="mt-[2px]">
                          <CheckStatusIcon status={check.status} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-slate-600 dark:text-slate-300">{resolveCheckTitle(checkId, t)}</span>
                          <span className="ml-1 break-words text-slate-500 dark:text-slate-400">
                            {detail.prefix}
                            {detail.command ?? ""}
                            {detail.suffix ?? ""}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}