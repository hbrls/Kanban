import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";

type ReaderMode = "routa" | "walnut";

type ViewportContract = {
  height: number;
  name: "desktop" | "narrow";
  width: number;
};

type PreviewStats = {
  canvasCount: number;
  footnoteLength: number;
  imageCount: number;
  railWidth: number;
  slideHeight: number;
  slideWidth: number;
};

type SlideshowStats = {
  canvasCount: number;
  fullscreen: boolean;
  imageCount: number;
  nextButtonDisabled: boolean;
  previousButtonDisabled: boolean;
  slideHeight: number;
  slideWidth: number;
};

type SpeakerNotesStats = {
  found: boolean;
  previewFootnoteLength: number;
  slideIndex: number;
  slideshowNotesLength: number;
  textPreview: string;
  toggleVisible: boolean;
};

type ScreenshotEvidence = {
  path: string;
  sha256: string;
};

type ScreenshotComparison = {
  diffPixels: number;
  matches: boolean;
  maxDelta: number;
  ratio: number;
  totalPixels: number;
};

type ReaderRenderResult = {
  consoleMessages: string[];
  desktop: PreviewStats;
  desktopScreenshot: ScreenshotEvidence;
  narrow: PreviewStats;
  narrowScreenshot: ScreenshotEvidence;
  reader: ReaderMode;
  speakerNotes?: SpeakerNotesStats;
  slideshow: SlideshowStats;
  slideshowScreenshot: ScreenshotEvidence;
};

type PptxRenderContractResult = {
  fixture: string;
  outputDir: string;
  parity: {
    failures: string[];
    previewScreenshotsMatch: boolean;
    slideshowScreenshotsMatch: boolean;
    statsMatch: boolean;
  };
  routa: ReaderRenderResult;
  walnut: ReaderRenderResult;
};

const repoRoot = process.cwd();
const assertMode = process.argv.includes("--assert");
const startServer = process.argv.includes("--start-server");
const verboseMode = process.argv.includes("--verbose");
const verifySpeakerNotes = process.argv.includes("--verify-speaker-notes");
const port = numberArg("--port") ?? 3000;
const baseUrl = stringArg("--base-url") ?? `http://127.0.0.1:${port}/debug/office-wasm-poc`;
let activeBaseUrl = baseUrl;
const outputDir = path.resolve(stringArg("--output-dir") ?? "/tmp/routa-office-wasm-pptx-render");
const fixturePaths = positionalArgs().map((arg) => path.resolve(repoRoot, arg));
const SCREENSHOT_PIXEL_RATIO_TOLERANCE = 0.00002;
const SCREENSHOT_PIXEL_MAX_DELTA_TOLERANCE = 32;

const previewViewports: ViewportContract[] = [
  { height: 1058, name: "desktop", width: 2048 },
  { height: 844, name: "narrow", width: 390 },
];
const slideshowViewport = { height: 900, width: 1440 };

if (fixturePaths.length === 0) {
  fixturePaths.push(path.resolve(repoRoot, "tools/office-wasm-reader/fixtures/agentic_ui_proactive_agent_technical_blueprint.pptx"));
}

async function main(): Promise<void> {
  for (const fixturePath of fixturePaths) {
    assertFile(fixturePath, "PPTX fixture");
  }
  mkdirSync(outputDir, { recursive: true });

  const serverProcess = await ensureServer();
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const results: PptxRenderContractResult[] = [];
      for (const fixturePath of fixturePaths) {
        results.push(await compareFixture(browser, fixturePath));
      }

      if (assertMode) {
        for (const result of results) {
          assertStableRenderContract(result);
          console.log(`ok ${result.fixture}`);
        }
        return;
      }

      console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
    } finally {
      await browser.close();
    }
  } finally {
    stopServer(serverProcess);
  }
}

async function compareFixture(browser: Browser, fixturePath: string): Promise<PptxRenderContractResult> {
  const fixtureLabel = safeFileLabel(fixturePath);
  const [routa, walnut] = await Promise.all([
    renderReader(browser, fixturePath, fixtureLabel, "routa"),
    renderReader(browser, fixturePath, fixtureLabel, "walnut"),
  ]);
  const desktopComparison = await compareScreenshotPixels(routa.desktopScreenshot.path, walnut.desktopScreenshot.path);
  const narrowComparison = await compareScreenshotPixels(routa.narrowScreenshot.path, walnut.narrowScreenshot.path);
  const slideshowComparison = await compareScreenshotPixels(routa.slideshowScreenshot.path, walnut.slideshowScreenshot.path);
  const failures = summarizeFailures(routa, walnut, { desktopComparison, narrowComparison, slideshowComparison });

  return {
    fixture: path.relative(repoRoot, fixturePath),
    outputDir,
    parity: {
      failures,
      previewScreenshotsMatch: desktopComparison.matches && narrowComparison.matches,
      ...(verifySpeakerNotes
        ? {
            speakerNotesMatch: stableJson(routa.speakerNotes) === stableJson(walnut.speakerNotes),
          }
        : {}),
      slideshowScreenshotsMatch: slideshowComparison.matches,
      statsMatch: stableJson(renderComparableStats(routa)) === stableJson(renderComparableStats(walnut)),
    },
    routa,
    walnut,
  };
}

async function renderReader(
  browser: Browser,
  fixturePath: string,
  fixtureLabel: string,
  reader: ReaderMode,
): Promise<ReaderRenderResult> {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: previewViewports[0] });
  const consoleMessages: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (!isIgnoredConsoleMessage(text)) {
      consoleMessages.push(`${message.type()}: ${text}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleMessages.push(`pageerror: ${error.message}`);
  });

  try {
    await loadPresentation(page, fixturePath, reader);
    const desktop = await capturePreviewViewport(page, fixtureLabel, reader, "desktop");

    await page.setViewportSize(previewViewports[1]);
    await page.waitForTimeout(500);
    const narrow = await capturePreviewViewport(page, fixtureLabel, reader, "narrow");

    await page.setViewportSize(slideshowViewport);
    await page.waitForTimeout(500);
    const slideshow = await captureSlideshow(page, fixtureLabel, reader);
    const speakerNotes = verifySpeakerNotes ? await captureSpeakerNotes(page) : undefined;

    return {
      consoleMessages,
      desktop: desktop.stats,
      desktopScreenshot: desktop.screenshot,
      narrow: narrow.stats,
      narrowScreenshot: narrow.screenshot,
      reader,
      ...(speakerNotes ? { speakerNotes } : {}),
      slideshow: slideshow.stats,
      slideshowScreenshot: slideshow.screenshot,
    };
  } finally {
    await page.close();
  }
}

async function loadPresentation(page: Page, fixturePath: string, reader: ReaderMode): Promise<void> {
  const url = new URL(activeBaseUrl);
  url.searchParams.set("reader", reader);
  await page.goto(url.href, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(fixturePath);
  await page.getByTestId("presentation-preview").waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-testid="presentation-preview"]');
      return (root?.querySelectorAll("img").length ?? 0) >= 2 && (root?.querySelectorAll("canvas").length ?? 0) === 1;
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(1_000);
}

async function capturePreviewViewport(
  page: Page,
  fixtureLabel: string,
  reader: ReaderMode,
  viewportName: ViewportContract["name"],
): Promise<{ screenshot: ScreenshotEvidence; stats: PreviewStats }> {
  const stats = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="presentation-preview"]');
    const slide = document.querySelector('[class*="slideCanvas"]');
    const rail = document.querySelector("aside");
    const footnote = document.querySelector('[data-testid="presentation-footnote"]');
    return {
      canvasCount: root?.querySelectorAll("canvas").length ?? 0,
      footnoteLength: footnote?.textContent?.trim().length ?? 0,
      imageCount: root?.querySelectorAll("img").length ?? 0,
      railWidth: Math.round(rail?.getBoundingClientRect().width ?? 0),
      slideHeight: Math.round(slide?.getBoundingClientRect().height ?? 0),
      slideWidth: Math.round(slide?.getBoundingClientRect().width ?? 0),
    };
  });
  const screenshot = await captureLocatorScreenshot(
    page.getByTestId("presentation-preview"),
    `${fixtureLabel}-${reader}-${viewportName}.png`,
  );
  return { screenshot, stats };
}

async function captureSpeakerNotes(page: Page): Promise<SpeakerNotesStats> {
  const thumbnailCount = await page.getByTestId("presentation-thumbnail").count();
  for (let index = 1; index <= thumbnailCount; index++) {
    await page.locator(`[data-testid="presentation-thumbnail"][data-slide-index="${index}"]`).click();
    await page.waitForTimeout(200);
    const previewFootnote = await page
      .getByTestId("presentation-footnote")
      .textContent({ timeout: 500 })
      .catch(() => "");
    const trimmedPreviewFootnote = previewFootnote?.trim() ?? "";
    if (!trimmedPreviewFootnote) {
      continue;
    }

    await page.getByRole("button", { name: /播放|Play|slideshow/i }).click();
    await page.getByTestId("presentation-slideshow").waitFor({ timeout: 10_000 });
    const notesToggle = page.getByTestId("presentation-speaker-notes-toggle");
    const toggleVisible = await notesToggle.isVisible().catch(() => false);
    if (toggleVisible) {
      await notesToggle.click();
    }
    const slideshowNotes = await page
      .locator('[data-testid="presentation-speaker-notes"] pre')
      .textContent({ timeout: 5_000 })
      .catch(() => "");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    const normalizedSlideshowNotes = slideshowNotes?.trim() ?? "";
    return {
      found: true,
      previewFootnoteLength: trimmedPreviewFootnote.length,
      slideIndex: index,
      slideshowNotesLength: normalizedSlideshowNotes.length,
      textPreview: normalizedSlideshowNotes.slice(0, 120),
      toggleVisible,
    };
  }

  return {
    found: false,
    previewFootnoteLength: 0,
    slideIndex: 0,
    slideshowNotesLength: 0,
    textPreview: "",
    toggleVisible: false,
  };
}

async function captureSlideshow(
  page: Page,
  fixtureLabel: string,
  reader: ReaderMode,
): Promise<{ screenshot: ScreenshotEvidence; stats: SlideshowStats }> {
  await page.getByRole("button", { name: /播放|Play|slideshow/i }).click();
  await page.getByTestId("presentation-slideshow").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1_000);
  const stats = await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="presentation-slideshow"]');
    const slide = overlay?.querySelector('[class*="slideshowCanvas"]');
    return {
      canvasCount: overlay?.querySelectorAll("canvas").length ?? 0,
      fullscreen: Boolean(document.fullscreenElement),
      imageCount: overlay?.querySelectorAll("img").length ?? 0,
      nextButtonDisabled: Boolean(
        overlay?.querySelector<HTMLButtonElement>('[data-testid="presentation-slideshow-next"]')?.disabled,
      ),
      previousButtonDisabled: Boolean(
        overlay?.querySelector<HTMLButtonElement>('[data-testid="presentation-slideshow-previous"]')?.disabled,
      ),
      slideHeight: Math.round(slide?.getBoundingClientRect().height ?? 0),
      slideWidth: Math.round(slide?.getBoundingClientRect().width ?? 0),
    };
  });
  const screenshot = await captureLocatorScreenshot(
    page.getByTestId("presentation-slideshow"),
    `${fixtureLabel}-${reader}-slideshow.png`,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return { screenshot, stats };
}

async function captureLocatorScreenshot(
  locator: ReturnType<Page["locator"]>,
  fileName: string,
): Promise<ScreenshotEvidence> {
  const screenshotPath = path.join(outputDir, fileName);
  const bytes = await locator.screenshot({ path: screenshotPath });
  return {
    path: screenshotPath,
    sha256: await screenshotPixelSha256(bytes),
  };
}

function summarizeFailures(
  routa: ReaderRenderResult,
  walnut: ReaderRenderResult,
  {
    desktopComparison,
    narrowComparison,
    slideshowComparison,
  }: {
    desktopComparison: ScreenshotComparison;
    narrowComparison: ScreenshotComparison;
    slideshowComparison: ScreenshotComparison;
  },
): string[] {
  const failures: string[] = [];
  for (const result of [routa, walnut]) {
    if (result.consoleMessages.length > 0) {
      failures.push(`${result.reader}: console ${result.consoleMessages.join("; ")}`);
    }
    failures.push(...previewStatsFailures(result.reader, "desktop", result.desktop));
    failures.push(...previewStatsFailures(result.reader, "narrow", result.narrow));
    if (result.slideshow.imageCount !== 0 || result.slideshow.canvasCount !== 1) {
      failures.push(`${result.reader}: slideshow did not use a single canvas surface`);
    }
    if (!result.slideshow.fullscreen) {
      failures.push(`${result.reader}: slideshow did not enter fullscreen`);
    }
    if (!result.slideshow.previousButtonDisabled) {
      failures.push(`${result.reader}: first slideshow slide should disable previous navigation`);
    }
    if (verifySpeakerNotes && (routa.speakerNotes?.found || walnut.speakerNotes?.found)) {
      failures.push(...speakerNotesFailures(result.reader, result.speakerNotes));
    }
  }

  if (!desktopComparison.matches) {
    failures.push(`desktop preview screenshots differ between Routa and Walnut readers (${screenshotDiffSummary(desktopComparison)})`);
  }
  if (!narrowComparison.matches) {
    failures.push(`narrow preview screenshots differ between Routa and Walnut readers (${screenshotDiffSummary(narrowComparison)})`);
  }
  if (!slideshowComparison.matches) {
    failures.push(`slideshow screenshots differ between Routa and Walnut readers (${screenshotDiffSummary(slideshowComparison)})`);
  }
  if (stableJson(renderComparableStats(routa)) !== stableJson(renderComparableStats(walnut))) {
    failures.push("layout stats differ between Routa and Walnut readers");
  }
  if (
    verifySpeakerNotes &&
    stableJson(routa.speakerNotes) !== stableJson(walnut.speakerNotes)
  ) {
    failures.push("speaker notes verification differs between Routa and Walnut readers");
  }

  return failures;
}

function speakerNotesFailures(reader: ReaderMode, stats: SpeakerNotesStats | undefined): string[] {
  const failures: string[] = [];
  if (!stats?.found) {
    failures.push(`${reader}: no slide with speaker notes was found`);
    return failures;
  }
  if (!stats.toggleVisible) {
    failures.push(`${reader}: speaker notes toggle was not visible in slideshow`);
  }
  if (stats.slideshowNotesLength <= 0) {
    failures.push(`${reader}: speaker notes panel did not render text`);
  }
  if (stats.previewFootnoteLength !== stats.slideshowNotesLength) {
    failures.push(`${reader}: speaker notes panel text length does not match preview footnote`);
  }
  return failures;
}

function previewStatsFailures(reader: ReaderMode, viewportName: string, stats: PreviewStats): string[] {
  const failures: string[] = [];
  if (stats.imageCount < 2 || stats.canvasCount !== 1) {
    failures.push(`${reader}: ${viewportName} preview did not use one live canvas surface plus thumbnail bitmaps`);
  }
  if (stats.slideWidth <= 0 || stats.slideHeight <= 0) {
    failures.push(`${reader}: ${viewportName} slide has invalid dimensions`);
  }
  return failures;
}

function assertStableRenderContract(result: PptxRenderContractResult): void {
  if (result.parity.failures.length > 0) {
    throw new Error(`${result.fixture} PPTX render contract failed: ${result.parity.failures.join(", ")}`);
  }
}

function renderComparableStats(result: ReaderRenderResult) {
  return {
    desktop: result.desktop,
    narrow: result.narrow,
    ...(result.speakerNotes ? { speakerNotes: result.speakerNotes } : {}),
    slideshow: result.slideshow,
  };
}

async function ensureServer(): Promise<ChildProcess | null> {
  if (await canReachDebugPage(activeBaseUrl)) {
    return null;
  }

  if (!startServer) {
    throw new Error(`Office WASM debug page is not reachable at ${activeBaseUrl}. Start the app or pass --start-server.`);
  }

  const existingDefaultUrl = "http://127.0.0.1:3000/debug/office-wasm-poc";
  if (activeBaseUrl !== existingDefaultUrl && (await canReachDebugPage(existingDefaultUrl))) {
    activeBaseUrl = existingDefaultUrl;
    return null;
  }

  const child = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: repoRoot,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (verboseMode) {
    child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  }

  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode != null) {
      throw new Error(`Next dev server exited before ${activeBaseUrl} became reachable.`);
    }
    if (await canReachDebugPage(activeBaseUrl)) {
      return child;
    }
    await delay(1_000);
  }

  stopServer(child);
  throw new Error(`Timed out waiting for ${activeBaseUrl}.`);
}

async function canReachDebugPage(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

function stopServer(child: ChildProcess | null): void {
  if (!child || child.exitCode != null) return;
  child.kill("SIGTERM");
}

function isIgnoredConsoleMessage(text: string): boolean {
  return (
    text === "[HMR] connected" ||
    text === "[Fast Refresh] rebuilding" ||
    /^Last route changed in \d+ms$/u.test(text) ||
    /^\[Fast Refresh\] done in \d+ms$/u.test(text) ||
    text.includes("Download the React DevTools")
  );
}

function safeFileLabel(filePath: string): string {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 80) || "presentation";
}

function assertFile(filePath: string, label: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function numberArg(name: string): number | null {
  const value = stringArg(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function positionalArgs(): string[] {
  const args = process.argv.slice(2);
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--base-url" || arg === "--output-dir" || arg === "--port") {
      index++;
      continue;
    }
    if (!arg?.startsWith("--")) {
      values.push(arg);
    }
  }
  return values;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function screenshotPixelSha256(bytes: Uint8Array): Promise<string> {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const header = Buffer.from(`${info.width}x${info.height}x${info.channels}:`);
  return sha256(Buffer.concat([header, data]));
}

async function compareScreenshotPixels(leftPath: string, rightPath: string): Promise<ScreenshotComparison> {
  const [left, right] = await Promise.all([decodeScreenshotPixels(leftPath), decodeScreenshotPixels(rightPath)]);
  const totalPixels = Math.max(left.info.width * left.info.height, right.info.width * right.info.height);
  if (
    left.info.width !== right.info.width ||
    left.info.height !== right.info.height ||
    left.info.channels !== right.info.channels
  ) {
    return {
      diffPixels: totalPixels,
      matches: false,
      maxDelta: 255,
      ratio: 1,
      totalPixels,
    };
  }

  let diffPixels = 0;
  let maxDelta = 0;
  for (let index = 0; index < left.data.length; index += left.info.channels) {
    let pixelDelta = 0;
    for (let channel = 0; channel < left.info.channels; channel++) {
      pixelDelta = Math.max(pixelDelta, Math.abs(left.data[index + channel] - right.data[index + channel]));
    }
    if (pixelDelta > 0) {
      diffPixels += 1;
      maxDelta = Math.max(maxDelta, pixelDelta);
    }
  }

  const ratio = totalPixels > 0 ? diffPixels / totalPixels : 0;
  return {
    diffPixels,
    matches:
      diffPixels === 0 ||
      (ratio <= SCREENSHOT_PIXEL_RATIO_TOLERANCE && maxDelta <= SCREENSHOT_PIXEL_MAX_DELTA_TOLERANCE),
    maxDelta,
    ratio,
    totalPixels,
  };
}

async function decodeScreenshotPixels(pathname: string) {
  return sharp(pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function screenshotDiffSummary(comparison: ScreenshotComparison): string {
  return `${comparison.diffPixels}/${comparison.totalPixels} pixels, max delta ${comparison.maxDelta}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(flattenKeys(value)).sort());
}

function flattenKeys(value: unknown, keys: Record<string, true> = {}): Record<string, true> {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenKeys(item, keys);
    }
    return keys;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys[key] = true;
      flattenKeys(child, keys);
    }
  }
  return keys;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
