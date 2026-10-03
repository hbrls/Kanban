/**
 * AG-UI Protocol Integration E2E Tests
 *
 * Tests the AG-UI protocol page, protocol switcher, and event inspector.
 */

import { test, expect } from "@playwright/test";

test.describe("AG-UI Protocol Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ag-ui");
  });

  test("renders AG-UI page with correct title", async ({ page }) => {
    const title = page.getByTestId("ag-ui-page-title");
    await expect(title).toBeVisible();
    await expect(title).toHaveText("AG-UI Protocol");
  });

  test("shows protocol toggle with AG-UI selected by default", async ({
    page,
  }) => {
    const aguiBtn = page.getByTestId("protocol-toggle-ag-ui");
    const acpBtn = page.getByTestId("protocol-toggle-acp");

    await expect(aguiBtn).toBeVisible();
    await expect(acpBtn).toBeVisible();

    // AG-UI should be active (indigo background)
    await expect(aguiBtn).toHaveClass(/bg-indigo-500/);
  });

  test("toggles between AG-UI and ACP protocols", async ({ page }) => {
    const aguiBtn = page.getByTestId("protocol-toggle-ag-ui");
    const acpBtn = page.getByTestId("protocol-toggle-acp");

    // Switch to ACP
    await acpBtn.click();
    await expect(acpBtn).toHaveClass(/bg-emerald-500/);

    // Input placeholder should change
    const input = page.getByTestId("ag-ui-input");
    await expect(input).toHaveAttribute(
      "placeholder",
      "Send via ACP protocol…",
    );

    // Switch back to AG-UI
    await aguiBtn.click();
    await expect(aguiBtn).toHaveClass(/bg-indigo-500/);
    await expect(input).toHaveAttribute(
      "placeholder",
      "Send via AG-UI protocol…",
    );
  });

  test("shows empty state with instructions", async ({ page }) => {
    await expect(
      page.getByText("Send a message to test the AG-UI protocol"),
    ).toBeVisible();
    await expect(
      page.getByText("Switch between protocols using the toggle above"),
    ).toBeVisible();
  });

  test("shows event inspector panel", async ({ page }) => {
    await expect(page.getByText("Event Inspector")).toBeVisible();
    await expect(page.getByTestId("event-counter")).toHaveText("0 events");
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    const sendBtn = page.getByTestId("send-button");
    await expect(sendBtn).toBeDisabled();
  });

  test("send button is enabled when input has text", async ({ page }) => {
    const input = page.getByTestId("ag-ui-input");
    await input.fill("Hello");
    const sendBtn = page.getByTestId("send-button");
    await expect(sendBtn).toBeEnabled();
  });
});
