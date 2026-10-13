import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { desktopAwareFetchMock } = vi.hoisted(() => ({
  desktopAwareFetchMock: vi.fn(),
}));

vi.mock("@/client/utils/diagnostics", () => ({
  desktopAwareFetch: desktopAwareFetchMock,
}));

vi.mock("@/client/components/desktop-app-shell", () => ({
  DesktopAppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import WorkspacesSettingsPage from "../page";

function okJson(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  } as Response;
}

const workspaceOne = {
  id: "ws-1",
  title: "Workspace One",
  status: "active",
  metadata: { theme: "dark" },
  createdAt: "2026-10-10T08:00:00.000Z",
  updatedAt: "2026-10-11T09:30:00.000Z",
};

const workspaceTwo = {
  id: "ws-2",
  title: "Workspace Two",
  status: "archived",
  metadata: {},
  createdAt: "2026-10-01T08:00:00.000Z",
  updatedAt: "",
};

const defaultWorkspace = {
  id: "default",
  title: "Default Workspace",
  status: "active",
  metadata: {},
  createdAt: "2026-10-09T08:00:00.000Z",
  updatedAt: "",
};

function makeWorkspace(id: string, title: string, status = "active") {
  return {
    id,
    title,
    status,
    metadata: {},
    createdAt: "2026-10-12T00:00:00.000Z",
    updatedAt: "",
  };
}

type FetchHandler = (url: string, init?: RequestInit) => unknown;

function mockFetchRouter(handler: FetchHandler) {
  desktopAwareFetchMock.mockImplementation(async (input: unknown, init?: RequestInit) =>
    handler(String(input), init),
  );
}

function codebasesRouter(workspacesRef: { list: Array<{ id: string }> }) {
  return (url: string, init?: RequestInit) => {
    if (url === "/api/workspaces" && (!init || !init.method)) {
      return okJson({ workspaces: workspacesRef.list });
    }
    if (/^\/api\/workspaces\/[^/]+\/codebases$/.test(url)) {
      return okJson({ codebases: [] });
    }
    throw new Error(`Unexpected fetch: ${url} ${init?.method ?? ""}`);
  };
}

function deleteCalls() {
  return desktopAwareFetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
  );
}

function postCalls() {
  return desktopAwareFetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "POST",
  );
}

describe("WorkspacesSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders every workspace with all fields, sorted by createdAt desc, and linked repositories", async () => {
    desktopAwareFetchMock.mockImplementation(async (input: string) => {
      const url = String(input);
      // Return older workspace first to prove the page sorts client-side.
      if (url === "/api/workspaces") return okJson({ workspaces: [workspaceTwo, workspaceOne] });
      if (url === "/api/workspaces/ws-1/codebases") {
        return okJson({
          codebases: [
            {
              id: "cb-2",
              workspaceId: "ws-1",
              repoPath: "/projects/backend",
              branch: "develop",
              isDefault: false,
              createdAt: "",
              updatedAt: "",
            },
            {
              id: "cb-1",
              workspaceId: "ws-1",
              repoPath: "/projects/frontend",
              branch: "main",
              label: "frontend",
              isDefault: true,
              createdAt: "",
              updatedAt: "",
            },
          ],
        });
      }
      if (url === "/api/workspaces/ws-2/codebases") return okJson({ codebases: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<WorkspacesSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Workspace One")).toBeTruthy();
      expect(screen.getByText("Workspace Two")).toBeTruthy();
    });

    // The workspace list must be requested without a status filter.
    expect(desktopAwareFetchMock).toHaveBeenCalledWith("/api/workspaces");

    // Newest workspace first.
    const rows = screen.getAllByRole("row");
    expect(rows[1].textContent).toContain("Workspace One");
    expect(rows[2].textContent).toContain("Workspace Two");

    // Workspace fields are visible.
    expect(screen.getAllByText("active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("archived").length).toBeGreaterThan(0);
    expect(rows[1].textContent).toContain("theme");
    expect(rows[2].textContent).toContain("{}");

    // Repositories load per workspace; default repo first with badge.
    await waitFor(() => {
      expect(screen.getByText("/projects/frontend · main")).toBeTruthy();
      expect(screen.getByText("/projects/backend · develop")).toBeTruthy();
    });
    const repoItems = screen.getAllByRole("listitem");
    expect(repoItems[0].textContent).toContain("frontend");
    expect(repoItems[0].textContent).toContain("default");
    expect(repoItems[1].textContent).toContain("backend");
    expect(repoItems[1].textContent).not.toContain("default");

    // Workspace without repositories shows the empty state, not an error.
    expect(screen.getByText("No linked repositories")).toBeTruthy();
  });

  it("keeps other rows visible when one workspace's repository request fails", async () => {
    desktopAwareFetchMock.mockImplementation(async (input: string) => {
      const url = String(input);
      if (url === "/api/workspaces") return okJson({ workspaces: [workspaceOne, workspaceTwo] });
      if (url === "/api/workspaces/ws-1/codebases") return { ok: false, status: 500 } as Response;
      if (url === "/api/workspaces/ws-2/codebases") {
        return okJson({
          codebases: [
            {
              id: "cb-9",
              workspaceId: "ws-2",
              repoPath: "/projects/only",
              branch: "main",
              isDefault: true,
              createdAt: "",
              updatedAt: "",
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<WorkspacesSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load repositories")).toBeTruthy();
      expect(screen.getByText("/projects/only · main")).toBeTruthy();
    });

    expect(screen.getByText("Workspace One")).toBeTruthy();
    expect(screen.getByText("Workspace Two")).toBeTruthy();
  });

  it("shows an error state instead of an empty table when the workspace list fails", async () => {
    desktopAwareFetchMock.mockImplementation(async (input: string) => {
      const url = String(input);
      if (url === "/api/workspaces") return { ok: false, status: 500 } as Response;
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<WorkspacesSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load workspaces")).toBeTruthy();
    });
    expect(screen.queryByText("No workspaces found.")).toBeNull();
  });

  it("shows the empty state when there are no workspaces", async () => {
    desktopAwareFetchMock.mockImplementation(async (input: string) => {
      const url = String(input);
      if (url === "/api/workspaces") return okJson({ workspaces: [] });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<WorkspacesSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("No workspaces found.")).toBeTruthy();
    });
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the create entry visible for normal, empty, and failed list states", async () => {
    const state = { list: [makeWorkspace("ws-1", "Workspace One")] };
    mockFetchRouter(codebasesRouter(state));

    const { unmount } = render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Workspace One")).toBeTruthy());
    expect(screen.getByRole("button", { name: "New workspace" })).toBeTruthy();
    unmount();

    state.list = [];
    const { unmount: unmountEmpty } = render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("No workspaces found.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "New workspace" })).toBeTruthy();
    unmountEmpty();

    mockFetchRouter(() => ({ ok: false, status: 500 }));
    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Failed to load workspaces")).toBeTruthy());
    expect(screen.getByRole("button", { name: "New workspace" })).toBeTruthy();
  });

  it("creates a workspace with a trimmed title, closes the dialog, and refreshes the list", async () => {
    const state = { list: [defaultWorkspace] };
    let postedTitle: string | null = null;
    mockFetchRouter((url, init) => {
      if (url === "/api/workspaces" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { title: string };
        postedTitle = body.title;
        const created = makeWorkspace("ws-new", body.title);
        state.list = [created, ...state.list];
        return okJson({ workspace: created });
      }
      return codebasesRouter(state)(url, init);
    });

    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Default Workspace")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "New workspace" }));

    const input = screen.getByLabelText("Name");
    expect(document.activeElement).toBe(input);

    const submit = screen.getByRole("button", { name: "Create" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "  Project Alpha  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(postedTitle).toBe("Project Alpha");
    await waitFor(() => expect(screen.getByText("Project Alpha")).toBeTruthy());

    const countPill = screen.getByText("Workspaces:").parentElement;
    expect(countPill?.textContent).toContain("2");
  });

  it("keeps the dialog open with the draft and error when creation fails", async () => {
    const state = { list: [defaultWorkspace] };
    mockFetchRouter((url, init) => {
      if (url === "/api/workspaces" && init?.method === "POST") {
        return { ok: false, status: 500 };
      }
      return codebasesRouter(state)(url, init);
    });

    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Default Workspace")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Broken WS" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Failed to create workspace"));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Broken WS");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("sends only one POST on rapid repeated submissions", async () => {
    const state = { list: [defaultWorkspace] };
    let resolvePost: ((value: unknown) => void) | null = null;
    mockFetchRouter((url, init) => {
      if (url === "/api/workspaces" && init?.method === "POST") {
        return new Promise((resolve) => {
          resolvePost = resolve;
        });
      }
      return codebasesRouter(state)(url, init);
    });

    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Default Workspace")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
    const input = screen.getByLabelText("Name");
    fireEvent.change(input, { target: { value: "Once Only" } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.submit(input.closest("form")!);
    fireEvent.submit(input.closest("form")!);

    expect(postCalls()).toHaveLength(1);

    const created = makeWorkspace("ws-once", "Once Only");
    state.list = [created, ...state.list];
    resolvePost!(okJson({ workspace: created }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("cancel and Escape close the create dialog without sending a request", async () => {
    const state = { list: [defaultWorkspace] };
    mockFetchRouter(codebasesRouter(state));

    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Default Workspace")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(postCalls()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
    const dialog = screen.getByRole("dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(postCalls()).toHaveLength(0);
  });

  it("deletes active and archived workspaces after confirmation and removes their rows", async () => {
    const archived = makeWorkspace("ws-archived", "Old Project", "archived");
    const state = { list: [defaultWorkspace, makeWorkspace("ws-a", "Project A"), archived] };
    mockFetchRouter((url, init) => {
      if (init?.method === "DELETE") {
        const id = url.split("/").pop()!;
        state.list = state.list.filter((ws) => ws.id !== id);
        return okJson({ deleted: true });
      }
      return codebasesRouter(state)(url, init);
    });

    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Project A")).toBeTruthy());

    // Opening the dialog does not send the request yet.
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace Project A" }));
    expect(screen.getByRole("dialog").textContent).toContain("Project A");
    expect(screen.getByRole("dialog").textContent).toContain("ws-a");
    expect(deleteCalls()).toHaveLength(0);

    // Cancel keeps the row and sends nothing.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deleteCalls()).toHaveLength(0);
    expect(screen.getByText("Project A")).toBeTruthy();

    // Confirm deletes the active workspace.
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace Project A" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));
    await waitFor(() => expect(screen.queryByText("Project A")).toBeNull());
    expect(deleteCalls()).toHaveLength(1);

    // The archived workspace can be deleted as well.
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace Old Project" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));
    await waitFor(() => expect(screen.queryByText("Old Project")).toBeNull());
    expect(deleteCalls()).toHaveLength(2);
  });

  it("keeps the dialog and row when deletion fails", async () => {
    const state = { list: [defaultWorkspace, makeWorkspace("ws-a", "Project A")] };
    mockFetchRouter((url, init) => {
      if (init?.method === "DELETE") return { ok: false, status: 500 };
      return codebasesRouter(state)(url, init);
    });

    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Project A")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Delete workspace Project A" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Failed to delete workspace"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Project A")).toBeTruthy();
  });

  it("maps a 409 delete response to the default-workspace protection message", async () => {
    const state = { list: [defaultWorkspace, makeWorkspace("ws-a", "Project A")] };
    mockFetchRouter((url, init) => {
      if (init?.method === "DELETE") return { ok: false, status: 409 };
      return codebasesRouter(state)(url, init);
    });

    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Project A")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Delete workspace Project A" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("The default workspace cannot be deleted"),
    );
    expect(screen.getByText("Project A")).toBeTruthy();
  });

  it("disables deletion for the default workspace and never sends DELETE for it", async () => {
    const renamedArchivedDefault = { ...defaultWorkspace, title: "Renamed Hub", status: "archived" };
    const state = { list: [renamedArchivedDefault] };
    mockFetchRouter((url, init) => {
      if (init?.method === "DELETE") return okJson({ deleted: true });
      return codebasesRouter(state)(url, init);
    });

    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Renamed Hub")).toBeTruthy());

    const defaultDelete = screen.getByRole("button", {
      name: "Delete workspace Renamed Hub",
    }) as HTMLButtonElement;
    expect(defaultDelete.disabled).toBe(true);
    expect(screen.getByText("The default workspace cannot be deleted.")).toBeTruthy();

    fireEvent.click(defaultDelete);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteCalls()).toHaveLength(0);
  });

  it("allows deleting a normal workspace named Default Workspace", async () => {
    const sameNamed = makeWorkspace("ws-named-default", "Default Workspace");
    const state = { list: [defaultWorkspace, sameNamed] };
    mockFetchRouter((url, init) => {
      if (init?.method === "DELETE") {
        const id = url.split("/").pop()!;
        state.list = state.list.filter((ws) => ws.id !== id);
        return okJson({ deleted: true });
      }
      return codebasesRouter(state)(url, init);
    });

    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getAllByText("Default Workspace").length).toBe(2));

    const buttons = screen.getAllByRole("button", { name: "Delete workspace Default Workspace" });
    expect(buttons).toHaveLength(2);
    const normalButton = buttons.find((button) => !(button as HTMLButtonElement).disabled)!;
    fireEvent.click(normalButton);
    expect(screen.getByRole("dialog").textContent).toContain("ws-named-default");
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));

    await waitFor(() => expect(screen.getAllByText("Default Workspace").length).toBe(1));
    expect(deleteCalls()).toHaveLength(1);
    expect(String(deleteCalls()[0][0])).toBe("/api/workspaces/ws-named-default");
  });

  it("sends only one DELETE on rapid repeated confirmations", async () => {
    const state = { list: [defaultWorkspace, makeWorkspace("ws-a", "Project A")] };
    let resolveDelete: ((value: unknown) => void) | null = null;
    mockFetchRouter((url, init) => {
      if (init?.method === "DELETE") {
        return new Promise((resolve) => {
          resolveDelete = resolve;
        });
      }
      return codebasesRouter(state)(url, init);
    });

    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Project A")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Delete workspace Project A" }));
    const confirm = screen.getByRole("button", { name: "Delete workspace" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(deleteCalls()).toHaveLength(1);

    state.list = state.list.filter((ws) => ws.id !== "ws-a");
    resolveDelete!(okJson({ deleted: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.queryByText("Project A")).toBeNull());
  });

  it("shows a list error and retries with GET only when refresh fails after a successful delete", async () => {
    const state = { list: [makeWorkspace("ws-a", "Project A")] };
    let deleted = false;
    let refreshFailedOnce = false;
    mockFetchRouter((url, init) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return okJson({ deleted: true });
      }
      if (url === "/api/workspaces" && (!init || !init.method)) {
        if (deleted && !refreshFailedOnce) {
          refreshFailedOnce = true;
          return { ok: false, status: 500 };
        }
        return okJson({ workspaces: deleted ? [] : state.list });
      }
      return codebasesRouter(state)(url, init);
    });

    render(<WorkspacesSettingsPage />);
    await waitFor(() => expect(screen.getByText("Project A")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Delete workspace Project A" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));

    await waitFor(() => expect(screen.getByText("Failed to load workspaces")).toBeTruthy());
    expect(screen.queryByRole("dialog")).toBeNull();

    const before = desktopAwareFetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Retry loading" }));

    await waitFor(() => expect(screen.getByText("No workspaces found.")).toBeTruthy());
    const retryCalls = desktopAwareFetchMock.mock.calls.slice(before);
    expect(retryCalls).toHaveLength(1);
    expect(String(retryCalls[0][0])).toBe("/api/workspaces");
    expect((retryCalls[0][1] as RequestInit | undefined)?.method).toBeUndefined();
  });
});
