#!/usr/bin/env node

import {
  createSnapshotScriptSession,
  getSnapshotTargetsByIds,
  waitForSnapshotTarget,
} from "../page-snapshot-lib.mjs";

const PERFORMANCE_PAGE_IDS = ["workspace", "kanban", "traces", "session-detail"];
const BASE_URL = process.env.PAGE_SNAPSHOT_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const TIMEOUT_MS = 30_000;
const THRESHOLDS = {
  domContentLoadedMs: 5_000,
  loadMs: 10_000,
  fcpMs: 4_000,
  cssTransferKb: 400,
  longTaskCount: 8,
};

function getTargets() {
  return getSnapshotTargetsByIds(PERFORMANCE_PAGE_IDS);
}

async function waitForTarget(page, target, baseUrl) {
  await page.goto(new globalThis.URL(target.route, baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT_MS,
  });
  await waitForSnapshotTarget(page, target, TIMEOUT_MS);
}

async function main() {
  const targets = getTargets();
  const session = await createSnapshotScriptSession({
    baseUrl: BASE_URL,
    timeoutMs: TIMEOUT_MS,
    useSnapshotFixtures: true,
    managedServerConflictMessage:
      `Snapshot fixtures require an isolated dev server, but ${BASE_URL} is already in use. ` +
      "Performance smoke will use a dedicated snapshot server instead.",
  });
  const { context, page } = await session.createPageSession();

  let failed = false;

  try {
    for (const target of targets) {
      await waitForTarget(page, target, session.baseUrl);
      const metrics = await page.evaluate(() => {
        const navigation = globalThis.performance.getEntriesByType("navigation")[0];
        const resources = globalThis.performance.getEntriesByType("resource");
        const stylesheetBytes = resources
          .filter((entry) => entry.initiatorType === "css" || entry.name.endsWith(".css"))
          .reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0);

        return {
          domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
          loadMs: navigation?.loadEventEnd ?? 0,
          cssTransferKb: stylesheetBytes / 1024,
          longTaskCount: globalThis.__routaPerf?.longTasks ?? 0,
          fcpMs: globalThis.__routaPerf?.fcp ?? 0,
        };
      });

      const failures = [];
      for (const [metric, threshold] of Object.entries(THRESHOLDS)) {
        const value = metrics[metric];
        if (typeof value === "number" && value > threshold) {
          failures.push(`${metric}=${value.toFixed(1)} > ${threshold}`);
        }
      }

      if (failures.length > 0) {
        console.error(`❌ ${target.id}: ${failures.join(", ")}`);
        failed = true;
      } else {
        console.log(
          `✅ ${target.id}: dcl=${metrics.domContentLoadedMs.toFixed(0)}ms, load=${metrics.loadMs.toFixed(0)}ms, fcp=${metrics.fcpMs.toFixed(0)}ms, css=${metrics.cssTransferKb.toFixed(1)}kb, longtasks=${metrics.longTaskCount}`,
        );
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
