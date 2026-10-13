import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { desktopAwareFetchMock } = vi.hoisted(() => ({
  desktopAwareFetchMock: vi.fn(),
}));

vi.mock("../../utils/diagnostics", () => ({
  desktopAwareFetch: desktopAwareFetchMock,
}));

import { useCodebases, useWorkspaces, WorkspaceMutationError } from "../use-workspaces";

function okJson(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  } as Response;
}

describe("useWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads active workspaces on mount and toggles loading", async () => {
    desktopAwareFetchMock.mockResolvedValueOnce(okJson({
      workspaces: [
        { id: "ws-1", title: "Workspace One", status: "active", metadata: {}, createdAt: "", updatedAt: "" },
      ],
    }));

    const { result } = renderHook(() => useWorkspaces());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.workspaces).toHaveLength(1);
    });

    expect(desktopAwareFetchMock).toHaveBeenCalledWith("/api/workspaces?status=active");
  });

  it("omits the status param when the all filter is selected", async () => {
    desktopAwareFetchMock.mockResolvedValueOnce(okJson({
      workspaces: [
        { id: "ws-1", title: "Workspace One", status: "active", metadata: {}, createdAt: "", updatedAt: "" },
        { id: "ws-2", title: "Workspace Two", status: "archived", metadata: {}, createdAt: "", updatedAt: "" },
      ],
    }));

    const { result } = renderHook(() => useWorkspaces({ status: "all" }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.workspaces).toHaveLength(2);
    });

    expect(desktopAwareFetchMock).toHaveBeenCalledWith("/api/workspaces");
    expect(desktopAwareFetchMock).not.toHaveBeenCalledWith(expect.stringContaining("status="));
  });

  it("requests archived workspaces when the archived filter is selected", async () => {
    desktopAwareFetchMock.mockResolvedValueOnce(okJson({ workspaces: [] }));

    const { result } = renderHook(() => useWorkspaces({ status: "archived" }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(desktopAwareFetchMock).toHaveBeenCalledWith("/api/workspaces?status=archived");
  });

  it("creates and archives workspaces then refreshes the list", async () => {
    desktopAwareFetchMock
      .mockResolvedValueOnce(okJson({ workspaces: [] }))
      .mockResolvedValueOnce(okJson({
        workspace: { id: "ws-1", title: "Workspace One", status: "active", metadata: {}, createdAt: "", updatedAt: "" },
      }))
      .mockResolvedValueOnce(okJson({
        workspaces: [
          { id: "ws-1", title: "Workspace One", status: "active", metadata: {}, createdAt: "", updatedAt: "" },
        ],
      }))
      .mockResolvedValueOnce(okJson({ success: true }))
      .mockResolvedValueOnce(okJson({ workspaces: [] }));

    const { result } = renderHook(() => useWorkspaces());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const workspace = await result.current.createWorkspace("Workspace One");
      expect(workspace?.id).toBe("ws-1");
    });

    expect(result.current.workspaces).toEqual([
      { id: "ws-1", title: "Workspace One", status: "active", metadata: {}, createdAt: "", updatedAt: "" },
    ]);

    await act(async () => {
      await result.current.archiveWorkspace("ws-1");
    });

    expect(result.current.workspaces).toEqual([]);
    expect(desktopAwareFetchMock).toHaveBeenCalledWith("/api/workspaces", expect.objectContaining({
      method: "POST",
    }));
    expect(desktopAwareFetchMock).toHaveBeenCalledWith("/api/workspaces/ws-1/archive", expect.objectContaining({
      method: "POST",
    }));
  });

  it("returns null when workspace creation fails", async () => {
    desktopAwareFetchMock
      .mockResolvedValueOnce(okJson({ workspaces: [] }))
      .mockResolvedValueOnce({ ok: false });

    const { result } = renderHook(() => useWorkspaces());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const created = await result.current.createWorkspace("Broken");
      expect(created).toBeNull();
    });
  });

  it("returns null without refreshing when the create response has no valid workspace", async () => {
    desktopAwareFetchMock
      .mockResolvedValueOnce(okJson({ workspaces: [] }))
      .mockResolvedValueOnce(okJson({ workspace: null }));

    const { result } = renderHook(() => useWorkspaces());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const created = await result.current.createWorkspace("Broken Payload");
      expect(created).toBeNull();
    });

    // Only the initial GET and the POST ran; no refresh GET after an invalid payload.
    expect(desktopAwareFetchMock).toHaveBeenCalledTimes(2);
  });

  it("deletes a workspace then refreshes the list", async () => {
    desktopAwareFetchMock
      .mockResolvedValueOnce(okJson({
        workspaces: [
          { id: "ws-1", title: "Workspace One", status: "active", metadata: {}, createdAt: "", updatedAt: "" },
        ],
      }))
      .mockResolvedValueOnce(okJson({ deleted: true }))
      .mockResolvedValueOnce(okJson({ workspaces: [] }));

    const { result } = renderHook(() => useWorkspaces({ status: "all" }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.workspaces).toHaveLength(1);
    });

    await act(async () => {
      await result.current.deleteWorkspace("ws-1");
    });

    expect(result.current.workspaces).toEqual([]);
    expect(desktopAwareFetchMock).toHaveBeenCalledWith("/api/workspaces/ws-1", expect.objectContaining({
      method: "DELETE",
    }));
  });

  it("rejects deleting the default workspace without sending a request", async () => {
    desktopAwareFetchMock.mockResolvedValueOnce(okJson({ workspaces: [] }));

    const { result } = renderHook(() => useWorkspaces({ status: "all" }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await expect(result.current.deleteWorkspace("default")).rejects.toMatchObject({
        name: "WorkspaceMutationError",
        status: 409,
      });
    });

    // Only the initial GET ran; no DELETE was issued.
    expect(desktopAwareFetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a recognizable error when delete fails over HTTP", async () => {
    desktopAwareFetchMock
      .mockResolvedValueOnce(okJson({ workspaces: [] }))
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useWorkspaces({ status: "all" }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      try {
        await result.current.deleteWorkspace("ws-9");
        throw new Error("expected deleteWorkspace to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(WorkspaceMutationError);
        expect((err as WorkspaceMutationError).status).toBe(500);
      }
    });
  });

  it("throws when the delete response is missing deleted: true", async () => {
    desktopAwareFetchMock
      .mockResolvedValueOnce(okJson({ workspaces: [] }))
      .mockResolvedValueOnce(okJson({ deleted: false }));

    const { result } = renderHook(() => useWorkspaces({ status: "all" }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await expect(result.current.deleteWorkspace("ws-9")).rejects.toBeInstanceOf(
        WorkspaceMutationError,
      );
    });

    // No refresh GET after a malformed delete payload.
    expect(desktopAwareFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("useCodebases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips placeholder workspaces and loads codebases for real workspaces", async () => {
    desktopAwareFetchMock.mockResolvedValueOnce(okJson({
      codebases: [
        { id: "cb-1", workspaceId: "ws-1", repoPath: "/repo/main", isDefault: true, createdAt: "", updatedAt: "" },
      ],
    }));

    const placeholder = renderHook(() => useCodebases("__placeholder__"));
    await act(async () => {
      await placeholder.result.current.fetchCodebases();
    });
    expect(desktopAwareFetchMock).not.toHaveBeenCalled();

    const real = renderHook(() => useCodebases("ws-1"));

    await waitFor(() => {
      expect(real.result.current.codebases).toHaveLength(1);
    });

    expect(desktopAwareFetchMock).toHaveBeenCalledWith("/api/workspaces/ws-1/codebases");
  });
});
