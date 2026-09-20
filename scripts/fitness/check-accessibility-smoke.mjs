#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  captureSnapshot,
  createSnapshotScriptSession,
  getSnapshotTargetsByIds,
  resolveWorkspacePath,
} from "../page-snapshot-lib.mjs";

const ACCESSIBILITY_PAGE_IDS = ["workspace", "kanban", "traces", "session-detail"];
const BASE_URL = process.env.PAGE_SNAPSHOT_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const TIMEOUT_MS = 30_000;

function extractAccessibilitySignature(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  const count = (pattern) => lines.filter((line) => pattern.test(line)).length;

  return {
    banner: count(/^- banner:/),
    complementary: count(/^- complementary:/),
    main: count(/^- main:/),
    navigation: count(/^- navigation:/),
    headings: count(/^- heading "/),
  };
}

function getTargets() {
  return getSnapshotTargetsByIds(ACCESSIBILITY_PAGE_IDS);
}

async function collectAccessibilityIssues(page, targetId) {
  return await page.evaluate((currentTargetId) => {
    function textFromIds(ids) {
      return ids
        .split(/\s+/)
        .map((id) => globalThis.document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ")
        .trim();
    }

    function getAccessibleName(element) {
      const ariaLabel = element.getAttribute("aria-label")?.trim();
      if (ariaLabel) return ariaLabel;

      const labelledBy = element.getAttribute("aria-labelledby")?.trim();
      if (labelledBy) {
        const label = textFromIds(labelledBy);
        if (label) return label;
      }

      if (element instanceof globalThis.HTMLInputElement) {
        const labels = Array.from(element.labels ?? [])
          .map((label) => label.textContent?.trim() ?? "")
          .join(" ")
          .trim();
        if (labels) return labels;
        const placeholder = element.getAttribute("placeholder")?.trim();
        if (placeholder) return placeholder;
        const value = element.value?.trim();
        if (value) return value;
      }

      if (element instanceof globalThis.HTMLTextAreaElement || element instanceof globalThis.HTMLSelectElement) {
        const labels = Array.from(element.labels ?? [])
          .map((label) => label.textContent?.trim() ?? "")
          .join(" ")
          .trim();
        if (labels) return labels;
      }

      const alt = element.getAttribute("alt")?.trim();
      if (alt) return alt;

      const title = element.getAttribute("title")?.trim();
      if (title) return title;

      const text = element.textContent?.replace(/\s+/g, " ").trim();
      return text ?? "";
    }

    const issues = [];
    const mainCount = globalThis.document.querySelectorAll("main").length;
    if (mainCount !== 1) {
      issues.push(`expected exactly 1 <main>, found ${mainCount}`);
    }

    const headingCount = globalThis.document.querySelectorAll("h1, h2").length;
    const bannerText = globalThis.document.querySelector("header")?.textContent?.trim() ?? "";
    const allowBannerOnly = currentTargetId === "session-detail";
    if (headingCount === 0 && !(allowBannerOnly && bannerText.length > 0)) {
      issues.push("expected at least one h1/h2 heading");
    }

    const interactiveElements = Array.from(
      globalThis.document.querySelectorAll("button, a[href], input:not([type='hidden']), select, textarea"),
    );

    const unnamed = interactiveElements
      .filter((element) => !element.hasAttribute("disabled"))
      .filter((element) => {
        const name = getAccessibleName(element);
        return !name;
      })
      .slice(0, 8)
      .map((element) => element.outerHTML.slice(0, 140));

    if (unnamed.length > 0) {
      issues.push(`interactive elements without accessible name: ${unnamed.join(" | ")}`);
    }

    return issues;
  }, targetId);
}

async function main() {
  const targets = getTargets();
  const session = await createSnapshotScriptSession({
    baseUrl: BASE_URL,
    timeoutMs: TIMEOUT_MS,
    useSnapshotFixtures: true,
    managedServerConflictMessage:
      `Snapshot fixtures require an isolated dev server, but ${BASE_URL} is already in use. ` +
      "Accessibility smoke will use a dedicated snapshot server instead.",
  });
  const { context, page } = await session.createPageSession();

  let failed = false;

  try {
    for (const target of targets) {
      const snapshotPath = resolveWorkspacePath(target.snapshotFile);
      if (!fs.existsSync(snapshotPath)) {
        console.error(`❌ ${target.id}: missing baseline snapshot ${target.snapshotFile}`);
        failed = true;
        continue;
      }

      const tempPath = `${snapshotPath}.a11y.tmp`;
      try {
        fs.mkdirSync(path.dirname(tempPath), { recursive: true });
        await captureSnapshot({
          page,
          target,
          baseUrl: session.baseUrl,
          timeoutMs: TIMEOUT_MS,
          outputPath: tempPath,
        });

        const actual = extractAccessibilitySignature(fs.readFileSync(tempPath, "utf-8"));
        const expectedSignature = extractAccessibilitySignature(fs.readFileSync(snapshotPath, "utf-8"));
        const issues = await collectAccessibilityIssues(page, target.id);

        if (JSON.stringify(expectedSignature) !== JSON.stringify(actual)) {
          console.error(
            `❌ ${target.id}: landmark signature drift ${JSON.stringify(actual)} != ${JSON.stringify(expectedSignature)}`,
          );
          failed = true;
        } else if (issues.length > 0) {
          console.error(`❌ ${target.id}: ${issues.join("; ")}`);
          failed = true;
        } else {
          console.log(`✅ ${target.id}: accessibility smoke passed (${JSON.stringify(actual)})`);
        }
      } finally {
        if (fs.existsSync(tempPath)) {
          fs.rmSync(tempPath, { force: true });
        }
      }
    }
  } finally {
    await page.close();
    await context.close();
    await session.close();
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
