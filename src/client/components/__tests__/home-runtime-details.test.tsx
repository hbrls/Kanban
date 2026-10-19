import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AcpProviderInfo } from "@/client/acp-client";
import { HomeRuntimeDetails } from "@/client/components/home-runtime-details";
import {
  buildHomeRuntimeDetails,
  type HomeRuntimeDetailsProjection,
} from "@/client/components/home-runtime-details-model";
import type { HomeInitializationStep } from "@/client/hooks/use-home-initialization";

const I18N = {
  runtimeConnectionTitle: "ACP service connection & provider initialization",
  runtimeConnection: "Connecting & initializing",
  runtimeConnectionReady: "Connected & initialized",
  providerSourceLocal: "Local",
  providerSourceRegistry: "Registry",
  providerSourceUnknown: "Unspecified",
  providerInformation: "Provider information",
  providerEnvironment: "Runtime environment check",
  providerStartup: "Agent startup",
  providerHandshake: "Protocol handshake",
  providerInformationLoaded: "Information loaded",
  providerInformationWaiting: "Waiting for information",
  providerEnvironmentPassed: "Passed",
  providerEnvironmentUnavailable: "Unavailable",
  providerWaitingInitialization: "Waiting for initialization",
  providerWaitingResult: "Waiting for result",
  providerCheckPassed: "Check passed",
  providerAvailable: "Available",
  providerUnavailable: "Unavailable",
  providerDash: "—",
  providerNotExecuted: "Not executed",
  providerNotChecked: "Not checked",
  providerNoCheckInformation: "No check information",
  providerNoCheckResult: "No check result",
  runtimeNoProviders: "Connected, but no provider is available",
} as const;

vi.mock("@/i18n", () => ({
  useTranslation: () => ({
    t: {
      homeInitialization: I18N,
    },
  }),
}));

function runtimeStep(status: HomeInitializationStep["status"]): HomeInitializationStep {
  return { id: "runtime", status };
}

function kimiProvider(): AcpProviderInfo {
  return {
    id: "kimi",
    name: "Kimi",
    description: "Kimi CLI",
    command: "kimi",
    status: "available",
    source: "static",
  };
}

function claudeProvider(): AcpProviderInfo {
  return {
    id: "claude",
    name: "Claude Code",
    description: "Anthropic Claude Code",
    command: "claude",
    status: "unavailable",
    source: "static",
    unavailableReason: "CLI not found in PATH",
  };
}

function buildProjection(options: {
  stepStatus: HomeInitializationStep["status"];
  providers: AcpProviderInfo[];
  acpConnected?: boolean;
  runtimeSettled?: boolean;
}) {
  const step = runtimeStep(options.stepStatus);
  return buildHomeRuntimeDetails({
    runtimeStep: step,
    providers: options.providers,
    acpConnected: options.acpConnected ?? true,
    runtimeSettled: options.runtimeSettled ?? true,
    runtimeSkipped: options.stepStatus === "skipped",
    runtimeErrored: options.stepStatus === "error",
  });
}

describe("HomeRuntimeDetails", () => {
  it("renders the shared ACP connection row once", () => {
    const projection = buildProjection({
      stepStatus: "success",
      providers: [kimiProvider()],
    });

    render(<HomeRuntimeDetails projection={projection} />);

    expect(screen.getByText(I18N.runtimeConnectionTitle)).toBeTruthy();
    expect(screen.getAllByText(I18N.runtimeConnectionReady)).toHaveLength(1);
  });

  it("shows local providers with command, environment status, and dash for startup/handshake", () => {
    const projection = buildProjection({
      stepStatus: "success",
      providers: [kimiProvider(), claudeProvider()],
    });

    render(<HomeRuntimeDetails projection={projection} />);

    const kimiEnvironment = screen.getByTestId("home-runtime-provider-kimi-environment");
    expect(kimiEnvironment.textContent).toContain(I18N.providerEnvironmentPassed);
    expect(kimiEnvironment.textContent).toContain("kimi");
    expect(screen.getByTestId("home-runtime-provider-kimi-startup").textContent).toContain(
      I18N.providerNotExecuted,
    );
    expect(screen.getByTestId("home-runtime-provider-kimi-handshake").textContent).toContain(
      I18N.providerNotExecuted,
    );

    const claudeEnvironment = screen.getByTestId("home-runtime-provider-claude-environment");
    expect(claudeEnvironment.textContent).toContain(I18N.providerEnvironmentUnavailable);
    expect(claudeEnvironment.textContent).toContain("CLI not found in PATH");
  });

  it("renders unknown-source providers with explicit dash and no fake check result", () => {
    const projection = buildProjection({
      stepStatus: "success",
      providers: [
        {
          id: "mystery",
          name: "Mystery",
          description: "Unknown source",
          command: "mystery",
        },
      ],
    });

    render(<HomeRuntimeDetails projection={projection} />);

    const environment = screen.getByTestId("home-runtime-provider-mystery-environment");
    expect(environment.textContent).toContain(I18N.providerNoCheckInformation);
    expect(environment.textContent).not.toContain(I18N.providerEnvironmentPassed);
  });

  it("uses 'Checking' semantics without claiming per-provider sequencing", () => {
    const projection = buildProjection({
      stepStatus: "running",
      providers: [
        { ...kimiProvider(), status: "checking" },
        { ...claudeProvider(), status: "checking" },
      ],
      runtimeSettled: false,
      acpConnected: false,
    });

    render(<HomeRuntimeDetails projection={projection} />);

    expect(screen.getByText(I18N.runtimeConnection)).toBeTruthy();
    const kimiEnvironment = screen.getByTestId("home-runtime-provider-kimi-environment");
    expect(kimiEnvironment.textContent).toContain(I18N.providerWaitingInitialization);
  });

  it("classifies providers by server-reported source even for IDs that used to be custom", () => {
    const projection = buildProjection({
      stepStatus: "success",
      providers: [
        {
          id: "my-agent",
          name: "My Agent",
          description: "Legacy custom agent",
          command: "my-agent",
          status: "available",
          source: "static",
        },
      ],
    });

    render(<HomeRuntimeDetails projection={projection} />);

    expect(screen.getByTestId("home-runtime-provider-my-agent").textContent).toContain(
      I18N.providerSourceLocal,
    );
    expect(screen.getByTestId("home-runtime-provider-my-agent").textContent).toContain(
      I18N.providerAvailable,
    );
    expect(screen.getByTestId("home-runtime-provider-my-agent-environment").textContent).toContain(
      I18N.providerEnvironmentPassed,
    );
    expect(screen.getByTestId("home-runtime-provider-my-agent").textContent).not.toContain(
      I18N.providerSourceUnknown,
    );
  });

  it("hides provider rows when runtime is skipped and renders dash for the connection row", () => {
    const projection: HomeRuntimeDetailsProjection = {
      connection: { key: "runtimeConnectionSkipped" },
      providers: [],
    };

    render(<HomeRuntimeDetails projection={projection} />);

    expect(screen.queryByTestId("home-runtime-provider-list")).toBeNull();
    expect(screen.getByText(I18N.providerDash)).toBeTruthy();
  });

  it("falls back to the dash information state when source/command are missing", () => {
    const projection = buildProjection({
      stepStatus: "success",
      providers: [
        {
          id: "blank",
          name: "Blank",
          description: "",
          command: "",
          source: "static",
        },
      ],
    });

    render(<HomeRuntimeDetails projection={projection} />);

    const environment = screen.getByTestId("home-runtime-provider-blank-environment");
    expect(environment.textContent).toContain(I18N.providerNoCheckInformation);
  });
});