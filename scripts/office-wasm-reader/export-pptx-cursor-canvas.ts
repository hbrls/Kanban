import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";

type SlideBitmap = {
  dataUrl: string;
  height: number;
  index: number;
  width: number;
};

type CanvasPayload = {
  artifact: {
    dataPath: string;
    generatedBy: string;
    reader: string;
    shortTitle: string;
    source: string;
    title: string;
  };
  slides: SlideBitmap[];
};

type BitmapFormat = "jpeg" | "png" | "webp";

const repoRoot = process.cwd();
const port = numberArg("--port") ?? 3000;
const startServer = process.argv.includes("--start-server");
const activeBaseUrl = stringArg("--base-url") ?? `http://127.0.0.1:${port}/debug/office-wasm-poc`;
const pptxPath = path.resolve(
  repoRoot,
  stringArg("--pptx") ??
    positionalArgs()[0] ??
    path.join(os.homedir(), "Downloads", "agentic_ui_proactive_agent_technical_blueprint.pptx"),
);
const outputPath = path.resolve(
  repoRoot,
  stringArg("--output") ??
    path.join(
      os.homedir(),
      ".cursor/projects/Users-phodal-ai-routa-js/canvases/office-wasm-ppt-renderer.canvas.tsx",
    ),
);
const dataOutputPath = path.resolve(
  repoRoot,
  stringArg("--data-output") ?? outputPath.replace(/\.canvas\.tsx$/u, ".slides.json"),
);
const bitmapFormat = bitmapFormatArg("--bitmap-format") ?? "jpeg";
const bitmapQuality = numberArg("--bitmap-quality") ?? 82;
const bitmapWidth = numberArg("--bitmap-width") ?? 1600;

async function main(): Promise<void> {
  if (!existsSync(pptxPath)) {
    throw new Error(`PPTX not found: ${pptxPath}`);
  }

  const serverProcess = await ensureServer();
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const slides = await optimizeSlides(await exportSlides(browser));
      const payload = buildCanvasPayload(slides);
      mkdirSync(path.dirname(dataOutputPath), { recursive: true });
      await writeFile(dataOutputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      mkdirSync(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, renderCanvasSource(payload), "utf8");
      console.log(JSON.stringify({ dataOutputPath, outputPath, pptxPath, slideCount: slides.length }, null, 2));
    } finally {
      await browser.close();
    }
  } finally {
    stopServer(serverProcess);
  }
}

async function optimizeSlides(slides: SlideBitmap[]): Promise<SlideBitmap[]> {
  return Promise.all(slides.map(optimizeSlide));
}

async function optimizeSlide(slide: SlideBitmap): Promise<SlideBitmap> {
  const { buffer } = decodeDataUrl(slide.dataUrl);
  const image = sharp(buffer).resize({
    fit: "inside",
    width: bitmapWidth,
    withoutEnlargement: true,
  });

  let output: Buffer;
  let outputMime: string;
  if (bitmapFormat === "png") {
    output = await image.png({ compressionLevel: 9, effort: 10, palette: true }).toBuffer();
    outputMime = "image/png";
  } else if (bitmapFormat === "webp") {
    output = await image.flatten({ background: "#ffffff" }).webp({ effort: 5, quality: clampQuality(bitmapQuality) }).toBuffer();
    outputMime = "image/webp";
  } else {
    output = await image.flatten({ background: "#ffffff" }).jpeg({ mozjpeg: true, quality: clampQuality(bitmapQuality) }).toBuffer();
    outputMime = "image/jpeg";
  }

  const metadata = await sharp(output).metadata();
  return {
    dataUrl: `data:${outputMime};base64,${output.toString("base64")}`,
    height: metadata.height ?? slide.height,
    index: slide.index,
    width: metadata.width ?? slide.width,
  };
}

async function exportSlides(browser: Browser): Promise<SlideBitmap[]> {
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { height: 1058, width: 2048 },
  });
  try {
    await loadPresentation(page);
    return await page.evaluate(`
      (async () => {
      const toDataUrl = async (url) => {
        const response = await fetch(url);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      };

      const root = document.querySelector('[data-testid="presentation-preview"]');
      const images = Array.from(root?.querySelectorAll("aside img") ?? []);
      return await Promise.all(
        images.map(async (image, index) => ({
          dataUrl: await toDataUrl(image.currentSrc || image.src),
          height: image.naturalHeight,
          index: index + 1,
          width: image.naturalWidth,
        })),
      );
      })()
    `);
  } finally {
    await page.close();
  }
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = /^data:([^;]+);base64,(.+)$/u.exec(dataUrl);
  if (!match) {
    throw new Error("Unsupported slide data URL.");
  }
  return {
    buffer: Buffer.from(match[2], "base64"),
    mime: match[1],
  };
}

async function loadPresentation(page: Page): Promise<void> {
  const url = new URL(activeBaseUrl);
  url.searchParams.set("reader", "routa");
  await page.goto(url.href, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(pptxPath);
  await page.getByTestId("presentation-preview").waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-testid="presentation-preview"]');
      const thumbnailCount = root?.querySelectorAll('[data-testid="presentation-thumbnail"]').length ?? 0;
      const bitmapCount = root?.querySelectorAll("aside img").length ?? 0;
      return thumbnailCount >= 1 && bitmapCount >= thumbnailCount;
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(1_000);
}

function buildCanvasPayload(slides: SlideBitmap[]): CanvasPayload {
  const sourceLabel = path.basename(pptxPath);
  return {
    artifact: {
      dataPath: dataOutputPath,
      generatedBy: "scripts/office-wasm-reader/export-pptx-cursor-canvas.ts",
      reader: "Routa generated",
      shortTitle: shortenFileName(sourceLabel),
      source: pptxPath,
      title: sourceLabel,
    },
    slides,
  };
}

function renderCanvasSource(payload: CanvasPayload): string {
  return `import {
  Button,
  Pill,
  Row,
  Stack,
  Text,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

type SlideBitmap = {
  dataUrl: string;
  height: number;
  index: number;
  width: number;
};

type CanvasPayload = {
  artifact: {
    dataPath: string;
    generatedBy: string;
    reader: string;
    shortTitle: string;
    source: string;
    title: string;
  };
  slides: SlideBitmap[];
};

const payload = JSON.parse(${JSON.stringify(JSON.stringify(payload))}) as CanvasPayload;
// Cursor Canvas currently requires inline data. The canonical generated data is
// written to artifact.dataPath; this snapshot keeps the canvas self-contained.
const { artifact, slides } = payload;

export default function OfficeWasmPptRenderer() {
  const theme = useHostTheme();
  const [selectedIndex, setSelectedIndex] = useCanvasState("selected-slide-index", 1);
  const [isSlideshowOpen, setIsSlideshowOpen] = useCanvasState("slideshow-open", false);
  const selectedSlide = slides.find((slide) => slide.index === selectedIndex) ?? slides[0];
  const selectedPosition = Math.max(0, slides.findIndex((slide) => slide.index === selectedSlide.index));
  const goPrevious = () => setSelectedIndex(slides[Math.max(0, selectedPosition - 1)]?.index ?? selectedSlide.index);
  const goNext = () => setSelectedIndex(slides[Math.min(slides.length - 1, selectedPosition + 1)]?.index ?? selectedSlide.index);

  return (
    <div
      style={{
        background: theme.bg.editor,
        border: \`1px solid \${theme.stroke.secondary}\`,
        borderRadius: 8,
        color: theme.text.primary,
        display: "grid",
        gridTemplateRows: "52px minmax(0, 1fr)",
        height: "min(820px, calc(100vh - 40px))",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          alignItems: "center",
          borderBottom: \`1px solid \${theme.stroke.secondary}\`,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 520px) minmax(0, 1fr)",
          padding: "0 16px",
        }}
      >
        <Row gap={12} align="center" style={{ minWidth: 0 }}>
          <Text size="small" tone="secondary" as="span">Select file</Text>
          <Pill size="sm" active tone="info">{artifact.shortTitle}</Pill>
          <Text size="small" tone="secondary" as="span">Reader</Text>
          <Pill size="sm" active>{artifact.reader}</Pill>
        </Row>
        <Row gap={8} align="center" justify="center" style={{ minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              alignItems: "center",
              background: theme.accent.primary,
              borderRadius: 5,
              color: theme.text.onAccent,
              display: "inline-flex",
              fontSize: 11,
              height: 18,
              justifyContent: "center",
              width: 18,
            }}
          >
            PPT
          </span>
          <Text size="small" weight="semibold" truncate as="span">{artifact.title}</Text>
        </Row>
        <Row gap={10} align="center" justify="end" style={{ minWidth: 0 }}>
          <Text size="small" weight="semibold" as="span">Status</Text>
          <Pill size="sm" tone="success" active>Ready</Pill>
          <Button onClick={() => setIsSlideshowOpen(true)} variant="primary">Play Slideshow</Button>
        </Row>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "clamp(156px, 13vw, 252px) minmax(0, 1fr)",
          minHeight: 0,
        }}
      >
        <aside
          style={{
            borderRight: \`1px solid \${theme.stroke.secondary}\`,
            minHeight: 0,
            overflow: "auto",
            padding: "12px 14px 48px 8px",
          }}
        >
          <Stack gap={10}>
            {slides.map((slide) => (
              <button
                key={slide.index}
                onClick={() => setSelectedIndex(slide.index)}
                style={{
                  alignItems: "flex-start",
                  background: slide.index === selectedSlide.index ? theme.fill.secondary : "transparent",
                  border: \`1px solid \${slide.index === selectedSlide.index ? theme.accent.primary : "transparent"}\`,
                  borderRadius: 8,
                  color: theme.text.primary,
                  cursor: "pointer",
                  display: "flex",
                  gap: 8,
                  padding: "7px 8px 7px 0",
                  textAlign: "left",
                  width: "100%",
                }}
                type="button"
              >
                <Text
                  size="small"
                  tone="secondary"
                  as="span"
                  style={{
                    flex: "0 0 22px",
                    lineHeight: 1,
                    paddingTop: 4,
                    textAlign: "right",
                  }}
                >
                  {slide.index}
                </Text>
                <img
                  alt=""
                  src={slide.dataUrl}
                  style={{
                    aspectRatio: \`\${slide.width} / \${slide.height}\`,
                    border: \`1px solid \${theme.stroke.secondary}\`,
                    borderRadius: 4,
                    display: "block",
                    flex: "1 1 auto",
                    minWidth: 0,
                    objectFit: "contain",
                    width: "100%",
                  }}
                />
              </button>
            ))}
          </Stack>
        </aside>

        <main
          style={{
            background: theme.fill.primary,
            minHeight: 0,
            overflow: "auto",
            padding: "16px 24px 20px",
          }}
        >
          <div style={{ margin: "0 auto", maxWidth: 1703 }}>
            <img
              alt={\`Slide \${selectedSlide.index}\`}
              src={selectedSlide.dataUrl}
              style={{
                aspectRatio: \`\${selectedSlide.width} / \${selectedSlide.height}\`,
                background: theme.bg.elevated,
                border: \`1px solid \${theme.stroke.secondary}\`,
                borderRadius: 8,
                display: "block",
                objectFit: "contain",
                width: "100%",
              }}
            />
            <div
              style={{
                background: theme.bg.editor,
                border: \`1px solid \${theme.stroke.tertiary}\`,
                borderRadius: 8,
                marginTop: 16,
                padding: "12px 14px",
              }}
            >
              <Text size="small" tone="secondary">
                Slide {selectedSlide.index} / {slides.length} · rendered by the local Office WASM POC and embedded for Cursor Canvas.
              </Text>
            </div>
          </div>
        </main>
      </div>
      {isSlideshowOpen ? (
        <div
          aria-label="Play Slideshow"
          aria-modal="true"
          role="dialog"
          style={{
            alignItems: "center",
            background: "#000000",
            color: "#f8fafc",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: 20,
            position: "fixed",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              alignItems: "center",
              background: "rgba(15, 23, 42, 0.86)",
              border: "1px solid rgba(148, 163, 184, 0.34)",
              borderRadius: 999,
              display: "flex",
              gap: 10,
              padding: "4px 5px 4px 12px",
              position: "absolute",
              right: 20,
              top: 18,
              zIndex: 2,
            }}
          >
            <Text size="small" as="span" style={{ color: "#cbd5e1", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              Slide {selectedSlide.index} / {slides.length}
            </Text>
            <button
              aria-label="Close slideshow"
              onClick={() => setIsSlideshowOpen(false)}
              style={slideshowIconButtonStyle}
              type="button"
            >
              x
            </button>
          </div>
          <button
            aria-label="Next slide"
            onClick={goNext}
            style={{
              alignItems: "center",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "flex",
              height: "100%",
              justifyContent: "center",
              minHeight: 0,
              minWidth: 0,
              overflow: "hidden",
              padding: 0,
              width: "100%",
            }}
            type="button"
          >
            <img
              alt={\`Slide \${selectedSlide.index}\`}
              src={selectedSlide.dataUrl}
              style={{
                display: "block",
                maxHeight: "100%",
                maxWidth: "100%",
                objectFit: "contain",
                userSelect: "none",
              }}
            />
          </button>
          <button
            aria-label="Previous slide"
            onClick={goPrevious}
            style={{ ...slideshowNavButtonStyle, left: 18 }}
            type="button"
          >
            {"<"}
          </button>
          <button
            aria-label="Next slide"
            onClick={goNext}
            style={{ ...slideshowNavButtonStyle, right: 18 }}
            type="button"
          >
            {">"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

const slideshowIconButtonStyle = {
  alignItems: "center",
  background: "rgba(15, 23, 42, 0.86)",
  border: "1px solid rgba(148, 163, 184, 0.34)",
  borderRadius: 6,
  color: "#f8fafc",
  cursor: "pointer",
  display: "inline-flex",
  font: "600 13px/1 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  height: 34,
  justifyContent: "center",
  width: 34,
};

const slideshowNavButtonStyle = {
  alignItems: "center",
  background: "rgba(15, 23, 42, 0.62)",
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 999,
  color: "#f8fafc",
  cursor: "pointer",
  display: "inline-flex",
  font: "500 34px/1 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  height: 46,
  justifyContent: "center",
  position: "absolute" as const,
  top: "50%",
  transform: "translateY(-50%)",
  width: 46,
  zIndex: 2,
};
`;
}

function shortenFileName(fileName: string): string {
  if (fileName.length <= 24) return fileName;
  const extension = path.extname(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length);
  return `${stem.slice(0, 14)}...${extension}`;
}

async function ensureServer(): Promise<ChildProcess | null> {
  if (await canReachDebugPage(activeBaseUrl)) {
    return null;
  }

  if (!startServer) {
    throw new Error(`Office WASM debug page is not reachable at ${activeBaseUrl}. Start the app or pass --start-server.`);
  }

  const child = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: repoRoot,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });

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

function numberArg(name: string): number | null {
  const value = stringArg(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bitmapFormatArg(name: string): BitmapFormat | null {
  const value = stringArg(name);
  if (value === "jpeg" || value === "png" || value === "webp") {
    return value;
  }
  if (value) {
    throw new Error(`Unsupported ${name}: ${value}. Use jpeg, png, or webp.`);
  }
  return null;
}

function clampQuality(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
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
    if (arg === "--base-url" ||
      arg === "--bitmap-format" ||
      arg === "--bitmap-quality" ||
      arg === "--bitmap-width" ||
      arg === "--data-output" ||
      arg === "--output" ||
      arg === "--port" ||
      arg === "--pptx") {
      index++;
      continue;
    }
    if (!arg?.startsWith("--")) {
      values.push(arg);
    }
  }
  return values;
}

void main();
