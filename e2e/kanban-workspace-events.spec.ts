import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const PRIMARY_REPO_PATH = process.env.ROUTA_E2E_REPO_PATH || process.cwd();

test.describe("Kanban workspace SSE refresh", () => {
  test.use({ baseURL: BASE_URL });
  test.setTimeout(120_000);

  test("updates the board without reloading after a backend card move", async ({ page, request }) => {
    const testId = Date.now().toString();
    const title = `Kanban SSE ${testId}`;

    const workspaceResponse = await request.post("/api/workspaces", {
      data: { title: `Kanban SSE Workspace ${testId}` },
    });
    expect(workspaceResponse.ok()).toBeTruthy();
    const workspaceId = (await workspaceResponse.json()).workspace.id as string;

    try {
      const codebaseResponse = await request.post(`/api/workspaces/${workspaceId}/codebases`, {
        data: {
          repoPath: PRIMARY_REPO_PATH,
          branch: "main",
          label: "routa-main",
        },
      });
      expect(codebaseResponse.ok()).toBeTruthy();

      const boardResponse = await request.get(`/api/kanban/boards?workspaceId=${workspaceId}`);
      expect(boardResponse.ok()).toBeTruthy();
      const boardData = await boardResponse.json();
      const board = (boardData.boards as Array<{
        id: string;
        columns: Array<Record<string, unknown> & { id: string }>;
      }>)[0];

      const patchBoardResponse = await request.patch(`/api/kanban/boards/${board.id}`, {
        data: {
          columns: board.columns.map((column) => ({
            ...column,
            automation: undefined,
          })),
        },
      });
      expect(patchBoardResponse.ok()).toBeTruthy();

      const createTaskResponse = await request.post("/api/tasks", {
        data: {
          workspaceId,
          title,
          objective: "Verify workspace-scoped Kanban events refresh the board UI.",
          columnId: "backlog",
        },
      });
      expect(createTaskResponse.ok()).toBeTruthy();
      const taskId = (await createTaskResponse.json()).task.id as string;

      await page.goto(`/workspace/${workspaceId}/kanban`);
      await page.waitForLoadState("networkidle");

      const backlogColumn = page.getByTestId("kanban-column").filter({ hasText: "Backlog" }).first();
      const todoColumn = page.getByTestId("kanban-column").filter({ hasText: "Todo" }).first();
      const backlogCard = backlogColumn.getByTestId("kanban-card").filter({ hasText: title }).first();
      const todoCard = todoColumn.getByTestId("kanban-card").filter({ hasText: title }).first();

      await expect(backlogCard).toBeVisible({ timeout: 20_000 });
      await expect(todoCard).toHaveCount(0);

      const moveResponse = await request.patch(`/api/tasks/${taskId}`, {
        data: { columnId: "todo", position: 0 },
      });
      expect(moveResponse.ok()).toBeTruthy();

      await expect(todoCard).toBeVisible({ timeout: 20_000 });
      await expect(backlogCard).toHaveCount(0);
    } finally {
      await request.delete(`/api/workspaces/${workspaceId}`);
    }
  });
});
