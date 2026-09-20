import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildRepoSlideDownloadPath,
  resolveRepoSlideDeckArtifact,
} from "../deck-artifact";

const cleanupPaths = new Set<string>();

afterEach(async () => {
  await Promise.all(
    Array.from(cleanupPaths, (targetPath) => fs.rm(targetPath, { force: true, recursive: true })),
  );
  cleanupPaths.clear();
});

describe("resolveRepoSlideDeckArtifact", () => {
  it("accepts pptx files written under the system temp directory", async () => {
    const sessionDir = await fs.mkdtemp(path.join(os.tmpdir(), "reposlide-session-"));
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "reposlide-output-"));
    const deckPath = path.join(outputDir, "demo-deck.pptx");
    cleanupPaths.add(sessionDir);
    cleanupPaths.add(outputDir);
    await fs.writeFile(deckPath, "demo");

    const artifact = await resolveRepoSlideDeckArtifact(sessionDir, deckPath);

    expect(artifact?.absolutePath?.endsWith("demo-deck.pptx")).toBe(true);
    expect(artifact?.fileName).toBe("demo-deck.pptx");
  });

  it("rejects pptx paths outside the session cwd and temp roots", async () => {
    const sessionDir = await fs.mkdtemp(path.join(os.tmpdir(), "reposlide-session-"));
    const externalDir = await fs.mkdtemp(path.join(process.cwd(), ".reposlide-external-"));
    const deckPath = path.join(externalDir, "demo-deck.pptx");
    cleanupPaths.add(sessionDir);
    cleanupPaths.add(externalDir);
    await fs.writeFile(deckPath, "demo");

    const artifact = await resolveRepoSlideDeckArtifact(sessionDir, deckPath);

    expect(artifact).toBeUndefined();
  });

  it("builds the download route from the session id", () => {
    expect(buildRepoSlideDownloadPath("session-1")).toBe(
      "/api/sessions/session-1/reposlide-result/download",
    );
  });
});
