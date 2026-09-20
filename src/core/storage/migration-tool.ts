/**
 * Migration Tool — Migrates legacy trace data to new ~/.routa/ storage.
 *
 * Handles:
 * 1. Copying trace files from {project}/.routa/traces/ to
 *    ~/.routa/projects/{folder-slug}/traces/
 * 2. Creating .migrated marker to avoid re-migration
 * 3. Graceful error handling (partial migration doesn't block startup)
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getTracesDir } from "./folder-slug";

const MIGRATED_MARKER = ".migrated";

export class MigrationTool {
  constructor(private projectPath: string) {}

  /** Legacy trace directory: {project}/.routa/traces */
  private get legacyDir(): string {
    return path.join(this.projectPath, ".routa", "traces");
  }

  /** New trace directory: ~/.routa/projects/{slug}/traces */
  private get newDir(): string {
    return getTracesDir(this.projectPath);
  }

  /**
   * Run migration if needed. Safe to call on every startup.
   * Returns true if migration was performed, false if skipped.
   */
  async migrateTraces(): Promise<boolean> {
    // Check if legacy directory exists
    if (!(await this.dirExists(this.legacyDir))) {
      return false;
    }

    // Check if already migrated
    const markerPath = path.join(this.legacyDir, MIGRATED_MARKER);
    if (await this.fileExists(markerPath)) {
      return false;
    }

    console.log(
      `[Migration] Migrating traces from ${this.legacyDir} to ${this.newDir}`
    );

    let migrated = 0;
    let errors = 0;

    try {
      const dayDirs = await this.listDayDirs(this.legacyDir);

      for (const dayDir of dayDirs) {
        const dayName = path.basename(dayDir);
        const targetDayDir = path.join(this.newDir, dayName);

        try {
          await fs.mkdir(targetDayDir, { recursive: true });

          const files = await fs.readdir(dayDir);
          for (const file of files) {
            if (!file.endsWith(".jsonl")) continue;

            const srcFile = path.join(dayDir, file);
            const dstFile = path.join(targetDayDir, file);

            try {
              // Copy (not move) to preserve backward compatibility
              await fs.copyFile(srcFile, dstFile);
              migrated++;
            } catch (err) {
              console.error(
                `[Migration] Failed to copy ${srcFile}: ${err}`
              );
              errors++;
            }
          }
        } catch (err) {
          console.error(
            `[Migration] Failed to process day dir ${dayDir}: ${err}`
          );
          errors++;
        }
      }

      // Write migration marker
      await fs.writeFile(
        markerPath,
        JSON.stringify({
          migratedAt: new Date().toISOString(),
          filesCount: migrated,
          errorsCount: errors,
        }),
        "utf-8"
      );

      console.log(
        `[Migration] Completed: ${migrated} files migrated, ${errors} errors`
      );
    } catch (err) {
      console.error(`[Migration] Migration failed: ${err}`);
      // Don't throw — partial migration is acceptable
    }

    return migrated > 0;
  }

  private async listDayDirs(baseDir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map((e) => path.join(baseDir, e.name));
    } catch {
      return [];
    }
  }

  private async dirExists(dir: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dir);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
