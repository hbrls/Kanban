import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

import AdmZip from "adm-zip";
import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";

type ReaderMode = "routa" | "walnut";
type SharpOverlayOptions = Parameters<ReturnType<typeof sharp>["composite"]>[0][number];

type SlideDiff = {
  averageDelta: number;
  averageRgbDelta: number;
  changedPixelRatio: number;
  diffPath?: string;
  matches: boolean;
  maxDelta: number;
  referencePath: string;
  referenceSlideIndex: number;
  viewerPath: string;
  viewerSlideIndex: number;
};

type RenderComparisonResult = {
  contactSheetPath?: string;
  fixture: string;
  outputDir: string;
  parity: {
    failures: string[];
    matchingSlides: number;
    referenceSlideCount: number;
    viewerSlideCount: number;
    visibleSlideCount: number;
  };
  reader: ReaderMode;
  slides: SlideDiff[];
  visibleSlideIndices: number[];
};

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const assertMode = process.argv.includes("--assert");
const startServer = process.argv.includes("--start-server");
const verboseMode = process.argv.includes("--verbose");
const referencePowerPoint = process.argv.includes("--reference-powerpoint");
const activePowerPoint = process.argv.includes("--active-powerpoint") || process.argv.includes("--use-active-powerpoint");
const contactSheet = process.argv.includes("--contact-sheet");
const writeDiffs = contactSheet || process.argv.includes("--write-diffs");
const port = numberArg("--port") ?? 3000;
const baseUrl = stringArg("--base-url") ?? `http://127.0.0.1:${port}/debug/office-wasm-poc`;
const outputDir = path.resolve(stringArg("--output-dir") ?? "/tmp/routa-office-wasm-pptx-powerpoint-render");
const reader = readerArg("--reader") ?? "routa";
const referenceDir = stringArg("--reference-dir");
const referencePdf = stringArg("--reference-pdf");
const changedPixelRatioTolerance = numberArg("--changed-ratio") ?? 0.42;
const averageDeltaTolerance = numberArg("--average-delta") ?? 38;
const fixturePaths = positionalArgs().map((arg) => path.resolve(repoRoot, arg));
let activeBaseUrl = baseUrl;

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
      const results: RenderComparisonResult[] = [];
      for (const fixturePath of fixturePaths) {
        results.push(await compareFixture(browser, fixturePath));
      }

      if (assertMode) {
        for (const result of results) {
          if (result.parity.failures.length > 0) {
            throw new Error(`${result.fixture} PowerPoint-like render comparison failed: ${result.parity.failures.join(", ")}`);
          }
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

async function compareFixture(browser: Browser, fixturePath: string): Promise<RenderComparisonResult> {
  const fixtureLabel = safeFileLabel(fixturePath);
  const fixtureOutputDir = path.join(outputDir, fixtureLabel);
  rmSync(fixtureOutputDir, { force: true, recursive: true });
  mkdirSync(fixtureOutputDir, { recursive: true });

  const visibleSlideIndices = readVisibleSlideIndices(fixturePath);
  const referencePaths = referencePdf
    ? await renderPdfReference(referencePdf, path.join(fixtureOutputDir, "reference"))
    : referenceDir
      ? readReferenceSlides(referenceDir)
      : referencePowerPoint
        ? await renderPowerPointReference(fixturePath, path.join(fixtureOutputDir, "reference"), visibleSlideIndices)
      : await renderPowerPointLikeReference(fixturePath, path.join(fixtureOutputDir, "reference"));
  const referenceLabel = referencePdf ? "PowerPoint PDF" : referencePowerPoint ? "PowerPoint" : "PowerPoint-like";
  const viewerPaths = await renderViewerSlides(
    browser,
    fixturePath,
    fixtureLabel,
    path.join(fixtureOutputDir, "viewer"),
    visibleSlideIndices,
  );
  const slideCount = Math.min(referencePaths.length, viewerPaths.length);
  const slides: SlideDiff[] = [];
  const diffDir = path.join(fixtureOutputDir, "diff");
  if (writeDiffs) {
    mkdirSync(diffDir, { recursive: true });
  }
  for (let index = 0; index < slideCount; index++) {
    const viewer = viewerPaths[index]!;
    const diffPath = writeDiffs
      ? path.join(diffDir, `slide-${String(index + 1).padStart(2, "0")}-vs-viewer-${String(viewer.slideIndex).padStart(2, "0")}.png`)
      : undefined;
    slides.push(await compareSlideImages(referencePaths[index]!, viewer.path, index + 1, viewer.slideIndex, diffPath));
  }

  const failures: string[] = [];
  if (referencePaths.length !== viewerPaths.length) {
    failures.push(
      `visible slide count differs: ${referenceLabel}=${referencePaths.length}, viewer=${viewerPaths.length}, pptx-visible=${visibleSlideIndices.length}`,
    );
  }
  for (const slide of slides) {
    if (!slide.matches) {
      failures.push(
        `reference slide ${slide.referenceSlideIndex} vs viewer slide ${slide.viewerSlideIndex} changedRatio=${slide.changedPixelRatio.toFixed(4)}, averageDelta=${slide.averageDelta.toFixed(2)}, averageRgbDelta=${slide.averageRgbDelta.toFixed(2)}, maxDelta=${slide.maxDelta}`,
      );
    }
  }
  const failedSlides = slides.filter((slide) => !slide.matches);
  const contactSheetPath =
    contactSheet && slides.length > 0
      ? await writeContactSheet(failedSlides.length > 0 ? failedSlides : slides, path.join(fixtureOutputDir, "contact-sheet.png"))
      : undefined;

  return {
    contactSheetPath,
    fixture: path.relative(repoRoot, fixturePath),
    outputDir: fixtureOutputDir,
    parity: {
      failures,
      matchingSlides: slides.filter((slide) => slide.matches).length,
      referenceSlideCount: referencePaths.length,
      viewerSlideCount: viewerPaths.length,
      visibleSlideCount: visibleSlideIndices.length,
    },
    reader,
    slides,
    visibleSlideIndices,
  };
}

function readVisibleSlideIndices(fixturePath: string): number[] {
  const zip = new AdmZip(fixturePath);
  const orderedSlideTargets = orderedSlideTargetsFromPresentation(zip);
  const slideTargets =
    orderedSlideTargets.length > 0
      ? orderedSlideTargets
      : zip
          .getEntries()
          .map((entry) => entry.entryName)
          .filter((entryName) => /^ppt\/slides\/slide\d+\.xml$/u.test(entryName))
          .sort((left, right) => slideFileNumber(left) - slideFileNumber(right));

  return slideTargets
    .map((entryName, index) => {
      const xml = zip.readAsText(entryName);
      return isHiddenSlideXml(xml) ? null : index + 1;
    })
    .filter((index): index is number => index != null);
}

function orderedSlideTargetsFromPresentation(zip: AdmZip): string[] {
  const presentationXml = zip.readAsText("ppt/presentation.xml");
  const relsXml = zip.readAsText("ppt/_rels/presentation.xml.rels");
  if (!presentationXml || !relsXml) return [];

  const relTargets = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/gu)) {
    const id = match[1];
    const target = match[2];
    if (id && target?.startsWith("slides/")) {
      relTargets.set(id, `ppt/${target}`);
    }
  }

  const targets: string[] = [];
  for (const match of presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/gu)) {
    const target = relTargets.get(match[1] ?? "");
    if (target) targets.push(target);
  }
  return targets;
}

function isHiddenSlideXml(xml: string): boolean {
  return /<p:sld\b[^>]*\bshow=["']0["']/u.test(xml);
}

function slideFileNumber(entryName: string): number {
  const match = /slide(\d+)\.xml$/u.exec(entryName);
  return match ? Number(match[1]) : 0;
}

function readReferenceSlides(referenceDir: string): string[] {
  const absoluteReferenceDir = path.resolve(repoRoot, referenceDir);
  if (!existsSync(absoluteReferenceDir)) {
    throw new Error(`Missing reference directory: ${absoluteReferenceDir}`);
  }

  const slides = readdirSync(absoluteReferenceDir)
    .filter((entry) => /^slide-\d+\.png$/u.test(entry))
    .sort((left, right) => slideImageIndex(left) - slideImageIndex(right))
    .map((entry) => path.join(absoluteReferenceDir, entry));
  if (slides.length === 0) {
    throw new Error(`No slide-*.png reference images found in ${absoluteReferenceDir}`);
  }
  return slides;
}

async function renderPowerPointLikeReference(fixturePath: string, referenceDir: string): Promise<string[]> {
  mkdirSync(referenceDir, { recursive: true });
  const officeBin = commandPath("soffice") ?? commandPath("libreoffice");
  if (!officeBin) {
    throw new Error("Missing LibreOffice/soffice. Install LibreOffice or run without the PowerPoint-like visual comparison.");
  }
  const pdftoppmBin = commandPath("pdftoppm");
  if (!pdftoppmBin) {
    throw new Error("Missing pdftoppm. Install poppler to render the PowerPoint-like PDF reference.");
  }

  await execFileAsync(officeBin, ["--headless", "--convert-to", "pdf", "--outdir", referenceDir, fixturePath], {
    maxBuffer: 10 * 1024 * 1024,
  });
  const pdfPath = findConvertedPdf(referenceDir, fixturePath);
  const prefix = path.join(referenceDir, "slide");
  await execFileAsync(pdftoppmBin, ["-png", "-r", "144", pdfPath, prefix], { maxBuffer: 10 * 1024 * 1024 });
  return readdirSync(referenceDir)
    .filter((entry) => /^slide-\d+\.png$/u.test(entry))
    .sort((left, right) => slideImageIndex(left) - slideImageIndex(right))
    .map((entry) => path.join(referenceDir, entry));
}

async function renderPdfReference(pdfPath: string, referenceDir: string): Promise<string[]> {
  const absolutePdfPath = path.resolve(repoRoot, pdfPath);
  assertFile(absolutePdfPath, "PowerPoint PDF reference");
  mkdirSync(referenceDir, { recursive: true });
  const pdftoppmBin = commandPath("pdftoppm");
  if (!pdftoppmBin) {
    throw new Error("Missing pdftoppm. Install poppler to render the PowerPoint PDF reference.");
  }
  const prefix = path.join(referenceDir, "slide");
  await execFileAsync(pdftoppmBin, ["-png", "-r", "144", absolutePdfPath, prefix], { maxBuffer: 10 * 1024 * 1024 });
  return readReferenceSlides(referenceDir);
}

async function renderPowerPointReference(
  fixturePath: string,
  referenceDir: string,
  visibleSlideIndices: number[],
): Promise<string[]> {
  mkdirSync(referenceDir, { recursive: true });
  if (activePowerPoint) {
    await assertActivePowerPointPresentation(fixturePath);
  } else {
    await ensurePowerPointPresentation(fixturePath);
  }

  const selectedSlideIndices =
    visibleSlideIndices.length > 0
      ? visibleSlideIndices
      : await activePowerPointSlideIndices();
  for (const [index, slideIndex] of selectedSlideIndices.entries()) {
    await copyPowerPointSlide(fixturePath, slideIndex);
    await writePowerPointClipboardPng(path.join(referenceDir, `slide-${String(index + 1).padStart(2, "0")}.png`));
  }
  return readReferenceSlides(referenceDir);
}

async function assertActivePowerPointPresentation(fixturePath: string): Promise<void> {
  const activePath = await activePowerPointPresentationPath();
  if (activePath == null) {
    throw new Error("PowerPoint has no active presentation. Open the PPTX in PowerPoint or omit --active-powerpoint.");
  }

  if (path.resolve(activePath) !== path.resolve(fixturePath)) {
    throw new Error(
      `PowerPoint active presentation does not match the fixture. active=${activePath}, fixture=${fixturePath}`,
    );
  }
}

async function ensurePowerPointPresentation(fixturePath: string): Promise<void> {
  if (await powerPointHasPresentation(fixturePath)) return;
  try {
    await execFileAsync("osascript", [
      "-e",
      `tell application id "com.microsoft.Powerpoint" to open POSIX file ${appleScriptString(fixturePath)}`,
    ], { maxBuffer: 1024 * 1024 });
  } catch (error) {
    if (await powerPointHasPresentation(fixturePath)) return;
    throw error;
  }
  if (!(await powerPointHasPresentation(fixturePath))) {
    throw new Error(`PowerPoint did not open the requested fixture: ${fixturePath}`);
  }
}

async function activePowerPointPresentationPath(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application id "com.microsoft.Powerpoint" to get full name of active presentation',
    ], { maxBuffer: 1024 * 1024 });
    const filePath = stdout.trim();
    return filePath || null;
  } catch {
    return null;
  }
}

async function activePowerPointSlideIndices(): Promise<number[]> {
  const { stdout } = await execFileAsync("osascript", [
    "-e",
    'tell application id "com.microsoft.Powerpoint" to count of slides of active presentation',
  ], { maxBuffer: 1024 * 1024 });
  const slideCount = Number(stdout.trim());
  if (!Number.isFinite(slideCount) || slideCount <= 0) return [];
  return Array.from({ length: slideCount }, (_, index) => index + 1);
}

async function powerPointHasPresentation(fixturePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      powerPointPresentationLookupScript(fixturePath, "return \"1\""),
    ], { maxBuffer: 1024 * 1024 });
    return stdout.trim() === "1";
  } catch {
    return false;
  }
}

async function copyPowerPointSlide(fixturePath: string, slideIndex: number): Promise<void> {
  const script = activePowerPoint
    ? `tell application id "com.microsoft.Powerpoint" to copy object slide ${slideIndex} of active presentation`
    : powerPointPresentationLookupScript(
        fixturePath,
        `copy object slide ${slideIndex} of targetPresentation`,
      );
  await execFileAsync("osascript", ["-e", script], { maxBuffer: 1024 * 1024 });
}

function powerPointPresentationLookupScript(fixturePath: string, body: string): string {
  return [
    'tell application id "com.microsoft.Powerpoint"',
    "set targetPresentation to missing value",
    "repeat with candidatePresentation in presentations",
    `if (full name of candidatePresentation as string) is ${appleScriptString(fixturePath)} then`,
    "set targetPresentation to candidatePresentation",
    "exit repeat",
    "end if",
    "end repeat",
    "if targetPresentation is missing value then error \"PowerPoint target presentation is not open\"",
    body,
    "end tell",
  ].join("\n");
}

async function writePowerPointClipboardPng(outputPath: string): Promise<void> {
  await execFileAsync("osascript", [
    "-e",
    `set outPath to POSIX file ${appleScriptString(outputPath)}`,
    "-e",
    "set pngData to the clipboard as «class PNGf»",
    "-e",
    "set fh to open for access outPath with write permission",
    "-e",
    "set eof fh to 0",
    "-e",
    "write pngData to fh",
    "-e",
    "close access fh",
  ], { maxBuffer: 1024 * 1024 });
}

async function renderViewerSlides(
  browser: Browser,
  fixturePath: string,
  fixtureLabel: string,
  viewerDir: string,
  visibleSlideIndices: number[],
): Promise<Array<{ path: string; slideIndex: number }>> {
  mkdirSync(viewerDir, { recursive: true });
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height: 1058, width: 2048 } });
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
    const slideCount = await page.getByTestId("presentation-thumbnail").count();
    const selectedSlideIndices =
      visibleSlideIndices.length > 0
        ? visibleSlideIndices
        : Array.from({ length: slideCount }, (_, index) => index + 1);
    const screenshots: Array<{ path: string; slideIndex: number }> = [];
    for (const slideIndex of selectedSlideIndices) {
      const thumbnail = page.locator(
        `[data-testid="presentation-thumbnail"][data-slide-index="${slideIndex}"]`,
      );
      if ((await thumbnail.count()) === 0) continue;
      await thumbnail.click();
      await page.waitForTimeout(300);
      await page.getByTestId("presentation-slide-canvas").waitFor({ timeout: 15_000 });
      const screenshotPath = path.join(viewerDir, `${fixtureLabel}-${reader}-slide-${String(slideIndex).padStart(2, "0")}.png`);
      await writeSlideCanvasBitmap(page, screenshotPath);
      screenshots.push({ path: screenshotPath, slideIndex });
    }

    if (consoleMessages.length > 0) {
      throw new Error(`viewer console errors: ${consoleMessages.join("; ")}`);
    }
    return screenshots;
  } finally {
    await page.close();
  }
}

async function writeSlideCanvasBitmap(page: Page, screenshotPath: string): Promise<void> {
  const dataUrl = await page.getByTestId("presentation-slide-canvas").evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) {
      throw new Error("presentation-slide-canvas is not a canvas element");
    }
    return element.toDataURL("image/png");
  });
  const base64 = dataUrl.replace(/^data:image\/png;base64,/u, "");
  writeFileSync(screenshotPath, Buffer.from(base64, "base64"));
}

async function loadPresentation(page: Page, fixturePath: string, mode: ReaderMode): Promise<void> {
  const url = new URL(activeBaseUrl);
  url.searchParams.set("reader", mode);
  await page.goto(url.href, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(fixturePath);
  await page.getByTestId("presentation-preview").waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    () => (document.querySelectorAll('[data-testid="presentation-thumbnail"]').length ?? 0) > 0,
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(1_000);
}

async function compareSlideImages(
  referencePath: string,
  viewerPath: string,
  referenceSlideIndex: number,
  viewerSlideIndex: number,
  diffPath?: string,
): Promise<SlideDiff> {
  const [reference, viewer] = await Promise.all([
    normalizedPixels(referencePath),
    normalizedPixels(viewerPath),
  ]);
  let changedPixels = 0;
  let totalDelta = 0;
  let totalRgbDelta = 0;
  let maxDelta = 0;
  const channels = reference.info.channels;
  for (let index = 0; index < reference.data.length; index += channels) {
    let pixelDelta = 0;
    for (let channel = 0; channel < 3; channel++) {
      const channelDelta = Math.abs(reference.data[index + channel] - viewer.data[index + channel]);
      pixelDelta = Math.max(pixelDelta, channelDelta);
      totalRgbDelta += channelDelta;
    }
    totalDelta += pixelDelta;
    if (pixelDelta > 35) {
      changedPixels += 1;
    }
    maxDelta = Math.max(maxDelta, pixelDelta);
  }

  const totalPixels = reference.info.width * reference.info.height;
  const averageDelta = totalDelta / totalPixels;
  const changedPixelRatio = changedPixels / totalPixels;
  if (diffPath) {
    await writeSlideDiffImage(reference, viewer, diffPath);
  }
  return {
    averageDelta,
    averageRgbDelta: totalRgbDelta / (totalPixels * 3),
    changedPixelRatio,
    diffPath,
    matches: changedPixelRatio <= changedPixelRatioTolerance && averageDelta <= averageDeltaTolerance,
    maxDelta,
    referencePath,
    referenceSlideIndex,
    viewerPath,
    viewerSlideIndex,
  };
}

async function normalizedPixels(filePath: string) {
  return sharp(filePath)
    .resize({ background: "#ffffff", fit: "fill", height: 720, width: 1280 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

type NormalizedPixels = Awaited<ReturnType<typeof normalizedPixels>>;

async function writeSlideDiffImage(reference: NormalizedPixels, viewer: NormalizedPixels, diffPath: string): Promise<void> {
  const width = reference.info.width;
  const height = reference.info.height;
  const channels = reference.info.channels;
  const output = Buffer.alloc(width * height * 3);
  for (let source = 0, target = 0; source < reference.data.length; source += channels, target += 3) {
    const redDelta = Math.abs(reference.data[source] - viewer.data[source]);
    const greenDelta = Math.abs(reference.data[source + 1] - viewer.data[source + 1]);
    const blueDelta = Math.abs(reference.data[source + 2] - viewer.data[source + 2]);
    const pixelDelta = Math.max(redDelta, greenDelta, blueDelta);
    if (pixelDelta <= 35) {
      output[target] = 248;
      output[target + 1] = 250;
      output[target + 2] = 252;
    } else {
      output[target] = 255;
      output[target + 1] = Math.max(0, 220 - pixelDelta);
      output[target + 2] = Math.max(0, 220 - pixelDelta);
    }
  }
  await sharp(output, { raw: { channels: 3, height, width } }).png().toFile(diffPath);
}

async function writeContactSheet(slides: SlideDiff[], outputPath: string): Promise<string> {
  const cellWidth = 426;
  const cellHeight = 240;
  const labelHeight = 30;
  const gap = 8;
  const rowHeight = labelHeight + cellHeight;
  const width = cellWidth * 3 + gap * 2;
  const height = rowHeight * slides.length;
  const composites: SharpOverlayOptions[] = [];

  for (const [index, slide] of slides.entries()) {
    const top = index * rowHeight;
    const referenceLabel = `PowerPoint slide ${slide.referenceSlideIndex}`;
    const viewerLabel = `Viewer slide ${slide.viewerSlideIndex}`;
    const diffLabel =
      `Diff changed=${slide.changedPixelRatio.toFixed(4)} avg=${slide.averageDelta.toFixed(2)}`;
    composites.push({ input: labelSvg(referenceLabel, cellWidth, labelHeight), left: 0, top });
    composites.push({ input: labelSvg(viewerLabel, cellWidth, labelHeight), left: cellWidth + gap, top });
    composites.push({ input: labelSvg(diffLabel, cellWidth, labelHeight), left: (cellWidth + gap) * 2, top });
    composites.push({ input: await contactSheetImage(slide.referencePath, cellWidth, cellHeight), left: 0, top: top + labelHeight });
    composites.push({ input: await contactSheetImage(slide.viewerPath, cellWidth, cellHeight), left: cellWidth + gap, top: top + labelHeight });
    composites.push({
      input: await contactSheetImage(slide.diffPath ?? slide.viewerPath, cellWidth, cellHeight),
      left: (cellWidth + gap) * 2,
      top: top + labelHeight,
    });
  }

  await sharp({
    create: {
      background: "#f8fafc",
      channels: 3,
      height,
      width,
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
  return outputPath;
}

async function contactSheetImage(filePath: string, width: number, height: number): Promise<Buffer> {
  return sharp(filePath)
    .resize({ background: "#ffffff", fit: "fill", height, width })
    .png()
    .toBuffer();
}

function labelSvg(label: string, width: number, height: number): Buffer {
  const escapedLabel = label
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#111827"/><text x="8" y="20" font-family="Arial, sans-serif" font-size="14" fill="#ffffff">${escapedLabel}</text></svg>`,
  );
}

async function ensureServer() {
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

  const child = (await import("node:child_process")).spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: repoRoot,
      env: { ...process.env, BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
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

function stopServer(child: { exitCode: number | null; kill: (signal: NodeJS.Signals) => void } | null): void {
  if (!child || child.exitCode != null) return;
  child.kill("SIGTERM");
}

function commandPath(command: string): string | null {
  const candidates = [
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`,
    `/usr/bin/${command}`,
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return command;
}

function findConvertedPdf(referenceDir: string, fixturePath: string): string {
  const expected = path.join(referenceDir, `${path.basename(fixturePath, path.extname(fixturePath))}.pdf`);
  if (existsSync(expected)) return expected;
  const pdfs = readdirSync(referenceDir).filter((entry) => entry.toLowerCase().endsWith(".pdf"));
  if (pdfs.length === 1) return path.join(referenceDir, pdfs[0]!);
  throw new Error(`Could not find converted PDF for ${fixturePath} in ${referenceDir}`);
}

function slideImageIndex(fileName: string): number {
  const match = /-(\d+)\.png$/u.exec(fileName);
  return match ? Number(match[1]) : 0;
}

function readerArg(name: string): ReaderMode | null {
  const value = stringArg(name);
  return value === "walnut" || value === "routa" ? value : null;
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
    if (
      arg === "--average-delta" ||
      arg === "--base-url" ||
      arg === "--changed-ratio" ||
      arg === "--output-dir" ||
      arg === "--port" ||
      arg === "--reference-dir" ||
      arg === "--reference-pdf" ||
      arg === "--reader"
    ) {
      index++;
      continue;
    }
    if (!arg?.startsWith("--")) {
      values.push(arg);
    }
  }
  return values;
}

function appleScriptString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function safeFileLabel(filePath: string): string {
  return (
    path
      .basename(filePath, path.extname(filePath))
      .replace(/[^a-z0-9._-]+/giu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, 80) || shortHash(filePath)
  );
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function assertFile(filePath: string, label: string): void {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
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

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
