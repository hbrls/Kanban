/**
 * Pure projection for the Home Agent Runtime details panel.
 *
 * Maps the live ACP snapshot onto a stable, Home-only display model.
 * It does not fetch, mutate localStorage, schedule timers, or talk to the
 * registry. The component layer is responsible for translating the returned
 * string keys.
 */

import type { AcpProviderInfo } from "@/client/acp-client";
import type { HomeInitializationStep } from "@/client/hooks/use-home-initialization";

export type HomeProviderKind = "local" | "unknown";

export type HomeProviderCheckId = "information" | "environment" | "startup" | "handshake";

export type HomeProviderDisplayStatus = "pending" | "waiting" | "success" | "unavailable" | "skipped";

/** Keys the projection returns. Resolved to localized strings by the component. */
export type HomeProviderDetailKey =
  | "providerInformationLoaded"
  | "providerInformationWaiting"
  | "providerEnvironmentPassed"
  | "providerEnvironmentUnavailable"
  | "providerEnvironmentWaiting"
  | "providerWaitingInitialization"
  | "providerWaitingResult"
  | "providerCheckPassed"
  | "providerAvailable"
  | "providerUnavailable"
  | "providerNotExecuted"
  | "providerNotChecked"
  | "providerNoCheckInformation"
  | "providerNoCheckResult";

export type HomeProviderSummaryKey =
  | "providerAvailable"
  | "providerUnavailable"
  | "providerWaitingResult"
  | "providerNotChecked";

export type HomeProviderSourceKey =
  | "providerSourceLocal"
  | "providerSourceUnknown";

export type HomeRuntimeConnectionKey =
  | "runtimeConnection"
  | "runtimeConnectionReady"
  | "runtimeConnectionFailed"
  | "runtimeConnectionSkipped";

export interface HomeProviderCheck {
  id: HomeProviderCheckId;
  status: HomeProviderDisplayStatus;
  detailKey: HomeProviderDetailKey;
  command?: string;
  reason?: string;
}

export interface HomeProviderDetails {
  id: string;
  name: string;
  kind: HomeProviderKind;
  sourceKey: HomeProviderSourceKey;
  summaryKey: HomeProviderSummaryKey;
  checks: HomeProviderCheck[];
}

export interface HomeRuntimeConnection {
  key: HomeRuntimeConnectionKey;
}

export interface HomeRuntimeDetailsProjection {
  connection: HomeRuntimeConnection;
  providers: HomeProviderDetails[];
}

export interface BuildHomeRuntimeDetailsOptions {
  runtimeStep: HomeInitializationStep;
  providers: readonly AcpProviderInfo[];
  acpConnected: boolean;
  /** True when the runtime step has reached a terminal status. */
  runtimeSettled: boolean;
  /** True when the runtime step is in the upstream-skipped state. */
  runtimeSkipped: boolean;
  /** True when the runtime step is in the error state. */
  runtimeErrored: boolean;
}

function resolveKind(provider: AcpProviderInfo): HomeProviderKind {
  // The provider catalog is bundled and never goes through a remote registry;
  // every entry from the backend is a fixed local preset by definition.
  if (provider.source === "registry") {
    // Defensive only — backend no longer emits this discriminator, but
    // legacy/localStorage entries might still carry it.
    return "unknown";
  }
  return "local";
}

function isTruthyCheck(value: string | undefined | null): value is string {
  return typeof value === "string" && value.length > 0;
}

function buildLocalOrRegistryChecks(
  kind: HomeProviderKind,
  provider: AcpProviderInfo,
  context: { runtimeSettled: boolean; runtimeSkipped: boolean; acpConnected: boolean },
): HomeProviderCheck[] {
  const hasCommand = isTruthyCheck(provider.command);
  const status = provider.status ?? "";

  const information: HomeProviderCheck = context.runtimeSettled || context.acpConnected
    ? {
        id: "information",
        status: "success",
        detailKey: "providerInformationLoaded",
        ...(hasCommand ? { command: provider.command } : {}),
      }
    : {
        id: "information",
        status: "pending",
        detailKey: "providerInformationWaiting",
      };

  const environment = buildEnvironmentCheck(kind, provider, context, status);
  const startup: HomeProviderCheck = {
    id: "startup",
    status: context.runtimeSkipped ? "skipped" : "pending",
    detailKey: "providerNotExecuted",
  };
  const handshake: HomeProviderCheck = {
    id: "handshake",
    status: context.runtimeSkipped ? "skipped" : "pending",
    detailKey: "providerNotExecuted",
  };

  return [information, environment, startup, handshake];
}

function buildEnvironmentCheck(
  kind: HomeProviderKind,
  provider: AcpProviderInfo,
  context: { runtimeSettled: boolean; runtimeSkipped: boolean; acpConnected: boolean },
  status: string,
): HomeProviderCheck {
  if (context.runtimeSkipped) {
    return {
      id: "environment",
      status: "skipped",
      detailKey: "providerNoCheckResult",
    };
  }

  if (status === "available") {
    const base: HomeProviderCheck = {
      id: "environment",
      status: "success",
      detailKey: "providerEnvironmentPassed",
    };
    if (kind === "local" && provider.command) {
      return { ...base, command: provider.command };
    }
    return base;
  }

  if (status === "unavailable") {
    return {
      id: "environment",
      status: "unavailable",
      detailKey: "providerEnvironmentUnavailable",
      ...(provider.unavailableReason ? { reason: provider.unavailableReason } : {}),
    };
  }

  if (status === "checking") {
    return {
      id: "environment",
      status: "waiting",
      detailKey: context.runtimeSettled ? "providerWaitingResult" : "providerWaitingInitialization",
    };
  }

  if (!context.runtimeSettled) {
    return {
      id: "environment",
      status: "pending",
      detailKey: "providerWaitingInitialization",
    };
  }

  return {
    id: "environment",
    status: "skipped",
    detailKey: "providerNoCheckInformation",
  };
}

function buildUnknownChecks(provider: AcpProviderInfo): HomeProviderCheck[] {
  return [
    {
      id: "information",
      status: "success",
      detailKey: "providerInformationLoaded",
      command: provider.command,
    },
    { id: "environment", status: "skipped", detailKey: "providerNoCheckInformation" },
    { id: "startup", status: "skipped", detailKey: "providerNotExecuted" },
    { id: "handshake", status: "skipped", detailKey: "providerNotExecuted" },
  ];
}

function buildSummaryKey(
  provider: AcpProviderInfo,
  context: { runtimeSkipped: boolean; acpConnected: boolean },
): HomeProviderSummaryKey {
  if (context.runtimeSkipped) {
    return "providerNotChecked";
  }
  const status = provider.status ?? "";
  if (status === "available") return "providerAvailable";
  if (status === "unavailable") return "providerUnavailable";
  if (status === "checking") return "providerWaitingResult";
  if (!context.acpConnected) return "providerNotChecked";
  return "providerNotChecked";
}

function buildSourceKey(kind: HomeProviderKind): HomeProviderSourceKey {
  switch (kind) {
    case "local":
      return "providerSourceLocal";
    default:
      return "providerSourceUnknown";
  }
}

function buildConnectionKey(options: BuildHomeRuntimeDetailsOptions): HomeRuntimeConnectionKey {
  if (options.runtimeSkipped) {
    return "runtimeConnectionSkipped";
  }
  if (options.runtimeErrored && !options.acpConnected) {
    return "runtimeConnectionFailed";
  }
  if (options.acpConnected) {
    return "runtimeConnectionReady";
  }
  return "runtimeConnection";
}

export function buildHomeRuntimeDetails(
  options: BuildHomeRuntimeDetailsOptions,
): HomeRuntimeDetailsProjection {
  const context = {
    runtimeSettled: options.runtimeSettled,
    runtimeSkipped: options.runtimeSkipped,
    acpConnected: options.acpConnected,
  };

  const providers = options.providers.map<HomeProviderDetails>((provider) => {
    const kind = resolveKind(provider);
    const sourceKey = buildSourceKey(kind);
    const summaryKey = buildSummaryKey(provider, context);

    let checks: HomeProviderCheck[];
    if (kind === "unknown") {
      checks = buildUnknownChecks(provider);
    } else {
      checks = buildLocalOrRegistryChecks(kind, provider, context);
    }

    return {
      id: provider.id,
      name: provider.name,
      kind,
      sourceKey,
      summaryKey,
      checks,
    };
  });

  return {
    connection: { key: buildConnectionKey(options) },
    providers,
  };
}