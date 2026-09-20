import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";

type ReaderMode = "routa" | "walnut";

type ViewportSampleSpec = {
  leftRatio: number;
  name: string;
  topRatio: number;
};

type ViewportSamplePosition = {
  left: number;
  name: string;
  top: number;
};

type SheetScreenshot = {
  file: string;
  index: number;
  name: string;
  sample: string;
  scrollLeft: number;
  scrollTop: number;
  stats: {
    canvasCount: number;
    previewHeight: number;
    previewWidth: number;
    viewportHeight: number;
    viewportScrollLeft: number;
    viewportScrollHeight: number;
    viewportScrollTop: number;
    viewportScrollWidth: number;
    viewportWidth: number;
  };
};

type ScreenshotComparison = {
  diffPercent: number;
  height: number;
  meanDelta: number;
  severePercent: number;
  width: number;
};

type SheetComparison = {
  comparison: ScreenshotComparison;
  name: string;
  routa: SheetScreenshot;
  walnut: SheetScreenshot;
};

type XlsxViewerScreenshotResult = {
  fixture: string;
  outputDir: string;
  parity: {
    failedSheets: string[];
    thresholdPercent: number;
  };
  sheets: SheetComparison[];
};

const repoRoot = process.cwd();
const assertMode = process.argv.includes("--assert");
const startServer = process.argv.includes("--start-server");
const verboseMode = process.argv.includes("--verbose");
const port = numberArg("--port") ?? 3000;
const baseUrl = stringArg("--base-url") ?? `http://127.0.0.1:${port}/debug/office-wasm-poc`;
let activeBaseUrl = baseUrl;
const outputDir = path.resolve(stringArg("--output-dir") ?? "/tmp/routa-office-wasm-xlsx-viewer-screenshots");
const thresholdPercent = numberArg("--threshold-percent") ?? 0.5;
const scrollSampleCount = Math.max(1, Math.floor(numberArg("--scroll-samples") ?? 3));
const scrollSamples = viewerScrollSampleSpecs(scrollSampleCount);
const fixturePaths = positionalArgs().map((arg) => path.resolve(repoRoot, arg));

if (fixturePaths.length === 0) {
  fixturePaths.push(path.resolve(repoRoot, "tools/office-wasm-reader/fixtures/complex_excel_renderer_test.xlsx"));
}

async function main(): Promise<void> {
  for (const fixturePath of fixturePaths) {
    assertFile(fixturePath, "XLSX fixture");
  }
  mkdirSync(outputDir, { recursive: true });

  const serverProcess = await ensureServer();
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const results: XlsxViewerScreenshotResult[] = [];
      for (const fixturePath of fixturePaths) {
        results.push(await compareFixture(browser, fixturePath));
      }

      if (assertMode) {
        for (const result of results) {
          assertStableViewerScreenshots(result);
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

async function compareFixture(browser: Browser, fixturePath: string): Promise<XlsxViewerScreenshotResult> {
  const fixtureLabel = safeFileLabel(fixturePath);
  const [routa, walnut] = await Promise.all([
    captureReaderSheets(browser, fixturePath, fixtureLabel, "routa"),
    captureReaderSheets(browser, fixturePath, fixtureLabel, "walnut"),
  ]);
  const sheets: SheetComparison[] = [];
  const walnutBySheetSample = new Map(walnut.map((sheet) => [sheetSampleKey(sheet), sheet]));

  for (const routaSheet of routa) {
    const walnutSheet = walnutBySheetSample.get(sheetSampleKey(routaSheet));
    if (!walnutSheet) {
      throw new Error(`Walnut viewer did not render sheet ${routaSheet.name}@${routaSheet.sample} for ${fixturePath}`);
    }
    sheets.push({
      comparison: await compareScreenshots(routaSheet.file, walnutSheet.file),
      name: sheetSampleLabel(routaSheet),
      routa: routaSheet,
      walnut: walnutSheet,
    });
  }

  return {
    fixture: path.relative(repoRoot, fixturePath),
    outputDir: path.join(outputDir, fixtureLabel),
    parity: {
      failedSheets: sheets
        .filter((sheet) => sheet.comparison.diffPercent > thresholdPercent)
        .map((sheet) => sheet.name),
      thresholdPercent,
    },
    sheets,
  };
}

async function captureReaderSheets(
  browser: Browser,
  fixturePath: string,
  fixtureLabel: string,
  reader: ReaderMode,
): Promise<SheetScreenshot[]> {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height: 1152, width: 2048 } });
  try {
    await loadWorkbook(page, fixturePath, reader);
    const tabs = await sheetTabs(page);
    const screenshots: SheetScreenshot[] = [];

    for (const tab of tabs) {
      await page.locator('[data-testid="spreadsheet-preview"] button').nth(tab.index).click();
      await page.waitForTimeout(300);
      const preview = page.getByTestId("spreadsheet-preview");
      const samplePositions = await spreadsheetViewportSamplePositions(page);

      for (const sample of samplePositions) {
        await scrollSpreadsheetViewport(page, sample);
        const file = path.join(
          outputDir,
          fixtureLabel,
          `${reader}-${String(tab.index + 1).padStart(2, "0")}-${safeFileLabel(tab.name)}-${sample.name}.png`,
        );
        mkdirSync(path.dirname(file), { recursive: true });
        await preview.screenshot({ path: file });
        screenshots.push({
          file,
          index: tab.index,
          name: tab.name,
          sample: sample.name,
          scrollLeft: sample.left,
          scrollTop: sample.top,
          stats: await spreadsheetPreviewStats(page),
        });
      }
    }

    return screenshots;
  } finally {
    await page.close();
  }
}

async function loadWorkbook(page: Page, fixturePath: string, reader: ReaderMode): Promise<void> {
  await page.goto(`${activeBaseUrl}?reader=${reader}`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(fixturePath);
  await page.getByTestId("spreadsheet-preview").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
}

async function sheetTabs(page: Page): Promise<Array<{ index: number; name: string }>> {
  return page.locator('[data-testid="spreadsheet-preview"] button').evaluateAll((buttons) => (
    buttons.map((button, index) => ({ index, name: button.textContent?.trim() || `sheet-${index + 1}` }))
  ));
}

async function spreadsheetPreviewStats(page: Page): Promise<SheetScreenshot["stats"]> {
  return page.evaluate(() => {
    const preview = document.querySelector('[data-testid="spreadsheet-preview"]');
    const viewport = preview?.querySelector<HTMLElement>('div[tabindex="0"]');
    const previewRect = preview?.getBoundingClientRect();
    return {
      canvasCount: preview?.querySelectorAll("canvas").length ?? 0,
      previewHeight: Math.round(previewRect?.height ?? 0),
      previewWidth: Math.round(previewRect?.width ?? 0),
      viewportHeight: viewport?.clientHeight ?? 0,
      viewportScrollLeft: viewport?.scrollLeft ?? 0,
      viewportScrollHeight: viewport?.scrollHeight ?? 0,
      viewportScrollTop: viewport?.scrollTop ?? 0,
      viewportScrollWidth: viewport?.scrollWidth ?? 0,
      viewportWidth: viewport?.clientWidth ?? 0,
    };
  });
}

async function spreadsheetViewportSamplePositions(page: Page): Promise<ViewportSamplePosition[]> {
  const stats = await spreadsheetPreviewStats(page);
  const maxLeft = Math.max(0, stats.viewportScrollWidth - stats.viewportWidth);
  const maxTop = Math.max(0, stats.viewportScrollHeight - stats.viewportHeight);
  return scrollSamples.map((sample) => ({
    left: Math.round(maxLeft * sample.leftRatio),
    name: sample.name,
    top: Math.round(maxTop * sample.topRatio),
  }));
}

async function scrollSpreadsheetViewport(page: Page, sample: ViewportSamplePosition): Promise<void> {
  await page.evaluate(({ left, top }) => {
    const preview = document.querySelector('[data-testid="spreadsheet-preview"]');
    const viewport = preview?.querySelector<HTMLElement>('div[tabindex="0"]');
    if (!viewport) return;
    viewport.scrollLeft = left;
    viewport.scrollTop = top;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, sample);
  await page.waitForTimeout(350);
}

async function compareScreenshots(actualPath: string, expectedPath: string): Promise<ScreenshotComparison> {
  const actualMetadata = await sharp(actualPath).metadata();
  const expectedMetadata = await sharp(expectedPath).metadata();
  const width = Math.min(actualMetadata.width ?? 0, expectedMetadata.width ?? 0);
  const height = Math.min(actualMetadata.height ?? 0, expectedMetadata.height ?? 0);
  if (width <= 0 || height <= 0) {
    throw new Error(`Cannot compare empty screenshots: ${actualPath}, ${expectedPath}`);
  }

  const actual = await sharp(actualPath).removeAlpha().extract({ height, left: 0, top: 0, width }).raw().toBuffer();
  const expected = await sharp(expectedPath).removeAlpha().extract({ height, left: 0, top: 0, width }).raw().toBuffer();
  let diffPixels = 0;
  let severePixels = 0;
  let deltaSum = 0;
  for (let index = 0; index < actual.length; index += 3) {
    const delta = Math.abs(actual[index] - expected[index]) +
      Math.abs(actual[index + 1] - expected[index + 1]) +
      Math.abs(actual[index + 2] - expected[index + 2]);
    if (delta > 24) diffPixels += 1;
    if (delta > 96) severePixels += 1;
    deltaSum += delta;
  }

  const totalPixels = width * height;
  return {
    diffPercent: roundPercent(diffPixels / totalPixels),
    height,
    meanDelta: Math.round((deltaSum / totalPixels / 3) * 100) / 100,
    severePercent: roundPercent(severePixels / totalPixels),
    width,
  };
}

function assertStableViewerScreenshots(result: XlsxViewerScreenshotResult): void {
  if (result.parity.failedSheets.length === 0) return;
  const details = result.sheets
    .filter((sheet) => result.parity.failedSheets.includes(sheet.name))
    .map((sheet) => `${sheet.name}: ${sheet.comparison.diffPercent}%`)
    .join(", ");
  throw new Error(`${result.fixture} XLSX viewer screenshots exceeded ${thresholdPercent}% diff: ${details}`);
}

async function ensureServer(): Promise<ChildProcess | null> {
  if (await canReachDebugPage(activeBaseUrl)) {
    return null;
  }
  if (!startServer) {
    throw new Error(`Office WASM debug page is not reachable at ${activeBaseUrl}. Start the app or pass --start-server.`);
  }

  const defaultUrl = "http://127.0.0.1:3000/debug/office-wasm-poc";
  if (activeBaseUrl !== defaultUrl && (await canReachDebugPage(defaultUrl))) {
    activeBaseUrl = defaultUrl;
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

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode != null) {
      throw new Error(`Next dev server exited before ${activeBaseUrl} became reachable.`);
    }
    if (await canReachDebugPage(activeBaseUrl)) return child;
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

function safeFileLabel(filePath: string): string {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 80) || "workbook";
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
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function positionalArgs(): string[] {
  const positional: string[] = [];
  const valueOptions = new Set(["--base-url", "--output-dir", "--port", "--scroll-samples", "--threshold-percent"]);
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (valueOptions.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) continue;
    positional.push(arg);
  }
  return positional;
}

function roundPercent(ratio: number): number {
  return Math.round(ratio * 100_000) / 1_000;
}

function viewerScrollSampleSpecs(count: number): ViewportSampleSpec[] {
  const samples: ViewportSampleSpec[] = [
    { leftRatio: 0, name: "top-left", topRatio: 0 },
    { leftRatio: 0.5, name: "middle", topRatio: 0.5 },
    { leftRatio: 1, name: "bottom-right", topRatio: 1 },
    { leftRatio: 1, name: "top-right", topRatio: 0 },
    { leftRatio: 0, name: "bottom-left", topRatio: 1 },
  ];
  return samples.slice(0, Math.min(count, samples.length));
}

function sheetSampleKey(sheet: Pick<SheetScreenshot, "name" | "sample">): string {
  return `${sheet.name}\0${sheet.sample}`;
}

function sheetSampleLabel(sheet: Pick<SheetScreenshot, "name" | "sample">): string {
  return `${sheet.name}@${sheet.sample}`;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
