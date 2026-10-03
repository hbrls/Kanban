import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentInstallPanel } from "../agent-install-panel";

const {
  isTauriRuntimeMock,
  desktopAwareFetchMock,
} = vi.hoisted(() => ({
  isTauriRuntimeMock: vi.fn(() => false),
  desktopAwareFetchMock: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => <div data-testid="mock-image">{props.alt ?? ""}</div>,
}));

vi.mock("@/client/utils/diagnostics", () => ({
  isTauriRuntime: isTauriRuntimeMock,
  desktopAwareFetch: desktopAwareFetchMock,
}));

vi.mock("@/i18n", () => ({
  useTranslation: () => ({
    t: {
      common: {
        loading: "Loading",
        refresh: "Refresh",
        dismiss: "Dismiss",
        unavailable: "Unavailable",
      },
      agents: {
        failedToLoad: "Failed to load",
        installFailed: "Install failed",
        uninstallFailed: "Uninstall failed",
        acpRegistryTitle: "ACP Registry",
        searchAgents: "Search agents",
        loadingFromRegistry: "Loading from registry",
        noMatchingAgents: "No matching agents",
        noAgentsAvailable: "No agents available",
        platformRegistry: "Platform {platform} registry {registry}",
        unknownPlatform: "unknown",
        installed: "Installed",
        available: "Available",
        uninstall: "Uninstall",
        installing: "Installing",
        install: "Install",
        viewRepository: "View repository",
      },
    },
  }),
}));

function registryResponse() {
  return {
    agents: [
      {
        agent: {
          id: "crafter",
          name: "Crafter",
          version: "1.0.0",
          description: "Writes code",
          repository: "https://github.com/acme/crafter",
          authors: ["Routa"],
          license: "MIT",
        },
        available: false,
        installed: false,
        uninstallable: false,
        distributionTypes: ["npx", "binary"],
      },
      {
        agent: {
          id: "reviewer",
          name: "Reviewer",
          version: "2.0.0",
          description: "Reviews code",
          authors: ["Routa"],
          license: "Apache-2.0",
        },
        available: true,
        installed: true,
        uninstallable: true,
        distributionTypes: ["uvx"],
      },
    ],
    platform: "darwin",
    runtimeAvailability: {
      npx: true,
      uvx: false,
    },
  };
}

function tauriRegistryResponse() {
  return {
    agents: [
      {
        id: "crafter",
        name: "Crafter",
        version: "1.0.0",
        description: "Writes code",
        authors: ["Routa"],
        license: "MIT",
        distribution: {
          npx: { package: "@acme/crafter" },
        },
      },
    ],
  };
}

function responseLike(data: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => data,
  } as unknown as Response;
}

describe("AgentInstallPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTauriRuntimeMock.mockReturnValue(false);
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    desktopAwareFetchMock.mockImplementation(async () => responseLike(registryResponse()));
  });

  it("loads registry agents, filters by search, and refreshes", async () => {
    render(<AgentInstallPanel />);

    expect(await screen.findByText("Crafter")).not.toBeNull();
    expect(screen.getByText("Reviewer")).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search agents"), {
      target: { value: "review" },
    });

    expect(screen.queryByText("Crafter")).toBeNull();
    expect(screen.getByText("Reviewer")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(desktopAwareFetchMock).toHaveBeenCalledWith("/api/acp/registry?refresh=true");
    });
  });

  it("installs and uninstalls agents through the web API", async () => {
    desktopAwareFetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/acp/registry")) {
        return responseLike(registryResponse());
      }
      if (url === "/api/acp/install") {
        return responseLike({ success: true });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    render(<AgentInstallPanel />);

    expect(await screen.findByText("Crafter")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => {
      expect(desktopAwareFetchMock).toHaveBeenCalledWith("/api/acp/install", expect.objectContaining({
        method: "POST",
      }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    await waitFor(() => {
      expect(desktopAwareFetchMock).toHaveBeenCalledWith("/api/acp/install", expect.objectContaining({
        method: "DELETE",
      }));
    });
  });

  it("shows registry and install errors", async () => {
    desktopAwareFetchMock.mockResolvedValueOnce(responseLike({}, { ok: false, status: 500 }));

    render(<AgentInstallPanel embedded />);

    expect(await screen.findByText("Failed to fetch registry: 500")).not.toBeNull();

    desktopAwareFetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/acp/registry")) {
        return responseLike(registryResponse());
      }
      return responseLike({ error: "Install exploded" }, { ok: false, status: 500 });
    });

    render(<AgentInstallPanel embedded />);

    fireEvent.click(await screen.findByRole("button", { name: "Install" }));

    expect(await screen.findByText("Install exploded")).not.toBeNull();
  });

  it("preserves string errors returned by Tauri invoke", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    (window as typeof window & {
      __TAURI_INTERNALS__?: { invoke: ReturnType<typeof vi.fn> };
    }).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockRejectedValue("Failed to fetch registry: proxy unavailable"),
    };

    render(<AgentInstallPanel />);

    expect(await screen.findByText("Failed to fetch registry: proxy unavailable")).not.toBeNull();
  });

  it.each([
    {
      command: "install_acp_agent",
      button: "Install",
      installedAgents: [],
      error: "Binary download failed behind proxy",
    },
    {
      command: "uninstall_acp_agent",
      button: "Uninstall",
      installedAgents: [
        {
          agentId: "crafter",
          version: "1.0.0",
          distType: "npx",
          installedAt: "2026-07-28T00:00:00Z",
          package: "@acme/crafter",
        },
      ],
      error: "Failed to remove installed agent",
    },
  ])("preserves Tauri string errors from $command", async ({
    command,
    button,
    installedAgents,
    error,
  }) => {
    isTauriRuntimeMock.mockReturnValue(true);
    (window as typeof window & {
      __TAURI_INTERNALS__?: { invoke: ReturnType<typeof vi.fn> };
    }).__TAURI_INTERNALS__ = {
      invoke: vi.fn((invokedCommand: string) => {
        if (invokedCommand === "fetch_acp_registry") {
          return Promise.resolve(tauriRegistryResponse());
        }
        if (invokedCommand === "get_installed_agents") {
          return Promise.resolve(installedAgents);
        }
        if (invokedCommand === command) {
          return Promise.reject(error);
        }
        return Promise.reject(new Error(`unexpected command: ${invokedCommand}`));
      }),
    };

    render(<AgentInstallPanel />);

    fireEvent.click(await screen.findByRole("button", { name: button }));

    expect(await screen.findByText(error)).not.toBeNull();
  });
});
