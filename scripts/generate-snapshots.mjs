#!/usr/bin/env node

import {
  captureSnapshot,
  createSnapshotScriptSession,
  loadRegistry,
  parseCliArgs,
  resolveWorkspacePath,
  selectSnapshotTargets,
  shouldUpdateTarget,
} from "./page-snapshot-lib.mjs";

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
      "Stop the existing server or disable fixtures before generating snapshots.",
  });

  let generated = 0;
  let skipped = 0;

  try {
    for (const target of registry) {
      const snapshotPath = resolveWorkspacePath(target.snapshotFile);
      const { context, page } = await session.createPageSession();

      try {
        if (!options.update && !shouldUpdateTarget(target)) {
          console.log(`⏭️  ${target.id}: snapshot is up-to-date`);
          skipped += 1;
          continue;
        }

        console.log(`📸 ${target.id}: capturing snapshot...`);

        await captureSnapshot({
          page,
          target,
          baseUrl: session.baseUrl,
          timeoutMs: options.timeoutMs,
          outputPath: snapshotPath,
        });

        generated += 1;
        console.log(`✅ ${target.id}: snapshot saved to ${target.snapshotFile}`);
      } catch (error) {
        console.error(`❌ ${target.id}: failed to capture snapshot`);
        console.error(error instanceof Error ? error.message : error);
      } finally {
        await page.close();
        await context.close();
      }
    }
  } finally {
    await session.close();
  }

  console.log(`\nGenerated ${generated} snapshots, skipped ${skipped}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
