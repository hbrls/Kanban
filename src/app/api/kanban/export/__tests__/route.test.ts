import * as yaml from "js-yaml";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureDefaultBoard, workspaceStore, kanbanBoardStore } = vi.hoisted(() => ({
  ensureDefaultBoard: vi.fn<(_: unknown, __: string) => Promise<void>>(),
  workspaceStore: {
    get: vi.fn<(_: string) => Promise<{ title?: string } | null>>(),
  },
  kanbanBoardStore: {
    listByWorkspace: vi.fn<(_: string) => Promise<Array<{
      id: string;
      name: string;
      isDefault: boolean;
      columns: Array<{
        id: string;
        name: string;
        color?: string | null;
        position: number;
        stage: string;
        automation?: Record<string, unknown>;
      }>;
    }>>>(),
  },
}));

vi.mock("@/core/kanban/boards", () => ({
  ensureDefaultBoard,
}));

vi.mock("@/core/routa-system", () => ({
  getRoutaSystem: () => ({
    workspaceStore,
    kanbanBoardStore,
  }),
}));

import { GET } from "../route";

describe("/api/kanban/export GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureDefaultBoard.mockResolvedValue(undefined);
    workspaceStore.get.mockResolvedValue({ title: "Workspace Title" });
  });

  it("normalizes legacy automation without an explicit enabled flag", async () => {
    kanbanBoardStore.listByWorkspace.mockResolvedValue([
      {
        id: "board-1",
        name: "Default Board",
        isDefault: true,
        columns: [
          {
            id: "todo",
            name: "Todo",
            position: 0,
            stage: "todo",
            automation: {
              providerId: "routa-native",
              role: "CRAFTER",
            },
          },
        ],
      },
    ]);

    const response = await GET(new NextRequest("http://localhost/api/kanban/export?workspaceId=workspace-1"));
    const exported = yaml.load(await response.text()) as {
      boards: Array<{ columns: Array<{ automation?: Record<string, unknown> }> }>;
    };

    expect(response.status).toBe(200);
    expect(exported.boards[0]?.columns[0]?.automation).toMatchObject({
      enabled: true,
      providerId: "routa-native",
      role: "CRAFTER",
    });
  });

  it("preserves explicit disabled automation in exports", async () => {
    kanbanBoardStore.listByWorkspace.mockResolvedValue([
      {
        id: "board-1",
        name: "Default Board",
        isDefault: true,
        columns: [
          {
            id: "review",
            name: "Review",
            position: 0,
            stage: "review",
            automation: {
              enabled: false,
              providerId: "routa-native",
              role: "GATE",
            },
          },
        ],
      },
    ]);

    const response = await GET(new NextRequest("http://localhost/api/kanban/export?workspaceId=workspace-1"));
    const exported = yaml.load(await response.text()) as {
      boards: Array<{ columns: Array<{ automation?: Record<string, unknown> }> }>;
    };

    expect(exported.boards[0]?.columns[0]?.automation).toMatchObject({
      enabled: false,
      providerId: "routa-native",
      role: "GATE",
    });
  });
});
