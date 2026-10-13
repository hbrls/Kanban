#!/usr/bin/env node

import fs from "node:fs";

import {
  calculateSimilarity,
  captureSnapshot,
  createSnapshotScriptSession,
  loadRegistry,
  normalizeComparableSnapshot,
  parseCliArgs,
  resolveWorkspacePath,
  selectSnapshotTargets,
  summarizeDiff,
  writeReport,
} from "../page-snapshot-lib.mjs";

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const registry = selectSnapshotTargets(loadRegistry(), options);

  if (registry.length === 0) {
    console.error(`No page snapshot target matched --page=${options.page}`);
    process.exit(1);
  }

  const session = await createSnapshotScriptSession({
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    headed: options.headed,
    useSnapshotFixtures: true,
    managedServerConflictMessage:
      `Snapshot fixtures require an isolated dev server, but ${options.baseUrl} is already in use. ` +
      "Stop the existing server or disable fixtures before running snapshot validation.",
  });

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: session.baseUrl,
    similarityThreshold: options.similarityThreshold,
    validated: 0,
    matched: 0,
    mismatched: 0,
    updated: 0,
    missing: 0,
    diffs: [],
  };

  try {
    for (const target of registry) {
      report.validated += 1;
      const snapshotPath = resolveWorkspacePath(target.snapshotFile);

      if (!fs.existsSync(snapshotPath)) {
        report.missing += 1;
        report.diffs.push({ target: target.id, reason: "missing snapshot" });
        console.log(`❌ ${target.id}: missing snapshot`);
        continue;
      }

      const tempPath = `${snapshotPath}.tmp`;
      const { context, page } = await session.createPageSession();

      try {
        await captureSnapshot({
          page,
          target,
          baseUrl: session.baseUrl,
          timeoutMs: options.timeoutMs,
          outputPath: tempPath,
        });

        const expected = normalizeComparableSnapshot(fs.readFileSync(snapshotPath, "utf-8"));
        const actual = normalizeComparableSnapshot(fs.readFileSync(tempPath, "utf-8"));

        const similarity = calculateSimilarity(expected, actual);
        const effectiveThreshold = typeof target.similarityThreshold === "number"
          ? target.similarityThreshold
          : options.similarityThreshold;
        const similarityPercent = (similarity * 100).toFixed(1);

        if (similarity >= effectiveThreshold) {
          report.matched += 1;
          if (similarity === 1.0) {
            console.log(`✅ ${target.id}: snapshot matches (100%)`);
          } else {
            console.log(`✅ ${target.id}: snapshot similar enough (${similarityPercent}%)`);
          }
        } else {
          report.mismatched += 1;
          const diff = summarizeDiff(expected, actual);
          report.diffs.push({
            target: target.id,
            reason: "content mismatch",
            similarity: similarityPercent,
            threshold: (effectiveThreshold * 100).toFixed(1),
            diff
          });
          console.log(`❌ ${target.id}: snapshot mismatch (${similarityPercent}% similar, threshold: ${(effectiveThreshold * 100).toFixed(0)}%)`);

          if (options.update) {
            fs.renameSync(tempPath, snapshotPath);
            report.updated += 1;
            console.log(`📝 ${target.id}: snapshot updated`);
            continue;
          }
        }
      } finally {
        await page.close();
        await context.close();
        if (fs.existsSync(tempPath)) {
          fs.rmSync(tempPath, { force: true });
        }
      }
    }
  } finally {
    await session.close();
    writeReport(report);
  }

  console.log(`\nValidated ${report.validated} snapshots, matched ${report.matched}, mismatched ${report.mismatched}, updated ${report.updated}, missing ${report.missing}.`);
  console.log(`Similarity threshold: ${(options.similarityThreshold * 100).toFixed(0)}%`);

  if (report.mismatched > 0 || report.missing > 0) {
    process.exit(options.update ? 0 : 1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
