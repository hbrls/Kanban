import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

test.describe("A2A Protocol API", () => {
  test("agent card discovery endpoint returns valid AgentCard", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/.well-known/agent-card.json`);
    expect(res.status()).toBe(200);

    const card = await res.json();
    expect(card).toMatchObject({
      name: expect.any(String),
      version: expect.any(String),
      skills: expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String), name: expect.any(String) }),
      ]),
    });
  });

  test("JSON-RPC method_list remains public discovery metadata", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: { jsonrpc: "2.0", id: 1, method: "method_list", params: {} },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.result?.methods).toEqual(
      expect.arrayContaining(["SendMessage", "GetTask", "ListTasks", "CancelTask"]),
    );
  });

  for (const [method, params] of [
    ["SendMessage", { message: { role: "user", parts: [{ text: "private task" }] } }],
    ["ListTasks", {}],
    ["GetTask", { id: "alice-task" }],
    ["CancelTask", { id: "alice-task" }],
  ] as const) {
    test(`JSON-RPC ${method} requires server-side session authority`, async ({ request }) => {
      const res = await request.post(`${BASE_URL}/api/a2a/rpc`, {
        data: { jsonrpc: "2.0", id: method, method, params },
      });
      expect(res.status()).toBe(401);

      const body = await res.json();
      expect(body.error?.code).toBe(-32002);
    });
  }

  test("REST task list and bare task IDs require session authority", async ({ request }) => {
    const list = await request.get(`${BASE_URL}/api/a2a/tasks`);
    expect(list.status()).toBe(401);

    const get = await request.get(`${BASE_URL}/api/a2a/tasks/alice-task`);
    expect(get.status()).toBe(401);

    const cancel = await request.post(`${BASE_URL}/api/a2a/tasks/alice-task?action=cancel`);
    expect(cancel.status()).toBe(401);
  });
});

test.describe("A2A Page UI", () => {
  test("A2A page loads and shows AgentCard info", async ({ page }) => {
    await page.goto(`${BASE_URL}/a2a`);
    await expect(page.locator("h1")).toContainText(/A2A|Agent|Routa/i);
    await expect(page.getByText("Live")).toBeVisible({ timeout: 10_000 });
  });

  test("A2A page shows Agent Card skills", async ({ page }) => {
    await page.goto(`${BASE_URL}/a2a`);
    await page.getByRole("button", { name: /skills/i }).click();
    await expect(page.getByText("agent-coordination")).toBeVisible({ timeout: 5_000 });
  });

  test("A2A page rejects an invalid session instead of creating a global task", async ({ page }) => {
    await page.goto(`${BASE_URL}/a2a`);
    await page.getByPlaceholder(/A2A session ID/i).fill("unknown-session");
    await page.getByPlaceholder(/Describe what you need/i).fill("private task");
    await page.getByRole("button", { name: /Send/i }).click();

    await expect(page.getByText("A2A session authority is invalid")).toBeVisible({
      timeout: 10_000,
    });
  });
});
