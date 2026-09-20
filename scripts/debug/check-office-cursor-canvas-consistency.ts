import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const files = {
  cursorGenerator: "packages/office/src/cursor-canvas.ts",
  cursorRuntime:
    "packages/office-render/src/presentation/cursor-canvas-runtime.tsx",
  officeRenderPackage: "packages/office-render/package.json",
  presentationPreview:
    "packages/office-render/src/presentation/presentation-preview.tsx",
  presentationRenderer:
    "packages/office-render/src/presentation/presentation-renderer.ts",
  tsupConfig: "packages/office-render/tsup.config.ts",
};

const failures: string[] = [];

function source(filePath: string): string {
  return readFileSync(path.join(repoRoot, filePath), "utf8");
}

function fail(message: string): void {
  failures.push(message);
}

function assertIncludes(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    fail(`Missing ${label}: ${needle}`);
  }
}

function assertNotIncludes(
  haystack: string,
  needle: string,
  label: string,
): void {
  if (haystack.includes(needle)) {
    fail(`Unexpected ${label}: ${needle}`);
  }
}

const cursorRuntime = source(files.cursorRuntime);
const cursorGenerator = source(files.cursorGenerator);
const presentationPreview = source(files.presentationPreview);
const presentationRenderer = source(files.presentationRenderer);
const tsupConfig = source(files.tsupConfig);
const officeRenderPackage = source(files.officeRenderPackage);

assertIncludes(
  presentationRenderer,
  "export function renderPresentationSlide",
  "shared presentation renderer export",
);
assertIncludes(
  cursorRuntime,
  "renderPresentationSlide({",
  "Cursor runtime renderPresentationSlide call",
);
assertIncludes(
  cursorRuntime,
  "prewarmOfficeFonts(collectPresentationTypefaces(slides, layouts))",
  "Cursor runtime font prewarm parity with Web preview",
);
assertIncludes(
  presentationPreview,
  "prewarmOfficeFonts(collectPresentationTypefaces(slides, layouts))",
  "Web preview font prewarm",
);
assertIncludes(
  cursorRuntime,
  "computePresentationFit(size, frame, { padding: 24 })",
  "Cursor stage fit padding matching Web preview",
);
assertIncludes(
  cursorRuntime,
  "theme={theme}",
  "Cursor runtime theme propagation",
);
assertIncludes(
  presentationPreview,
  "computePresentationFit(\n    {\n      height: viewportSize.height,\n      width: viewportSize.width,\n    },\n    frame,\n    { padding: 24 },\n  )",
  "Web stage fit padding",
);
assertIncludes(
  cursorGenerator,
  'rendererImport: "inline:@autodev/office-render/presentation-cursor-runtime"',
  "inline runtime marker in generated payload",
);
assertIncludes(
  cursorGenerator,
  "officeRenderPresentationRuntimeInline()",
  "runtime inlining in Cursor generator",
);
assertIncludes(
  cursorGenerator,
  "rect.rotation = reader.int32()",
  "Cursor generator bbox rotation decode",
);
assertIncludes(
  cursorGenerator,
  "style.autoFit = decodeTextAutoFit",
  "Cursor generator text autofit decode",
);
assertIncludes(
  cursorGenerator,
  "theme: presentation.theme",
  "Cursor renderer payload theme propagation",
);
assertIncludes(
  cursorGenerator,
  "globalThis.React = React;",
  "React global shim in generated source",
);
assertIncludes(
  cursorGenerator,
  "const { PresentationCursorCanvas } = OfficePresentationCursorRuntime;",
  "generated source runtime global lookup",
);
assertIncludes(
  tsupConfig,
  '"presentation-cursor-runtime.inline"',
  "office-render inline Cursor runtime tsup entry",
);
assertIncludes(
  tsupConfig,
  'globalName: "OfficePresentationCursorRuntime"',
  "office-render inline runtime global name",
);
assertIncludes(
  officeRenderPackage,
  '"./presentation-cursor-runtime"',
  "office-render runtime package export",
);
assertIncludes(
  presentationRenderer,
  "presentationThemeColorMap(theme)",
  "shared renderer theme color resolution",
);

for (const [label, content] of [
  ["Cursor runtime", cursorRuntime],
  ["presentation preview", presentationPreview],
  ["office-render package", officeRenderPackage],
] as const) {
  assertNotIncludes(content, "lucide-react", `${label} lucide dependency`);
}

for (const needle of [
  "cursor/canvas",
  ".module.css",
  "next/",
  "new Worker(",
]) {
  assertNotIncludes(cursorRuntime, needle, `Cursor runtime dependency ${needle}`);
}

const generatedCanvasPath =
  process.env.OFFICE_CURSOR_CANVAS_CHECK_FILE ??
  "/Users/phodal/.cursor/projects/Users-phodal-code-codex/canvases/qoder-powerpoint-canvas.canvas.tsx";

if (existsSync(generatedCanvasPath)) {
  const generatedCanvas = readFileSync(generatedCanvasPath, "utf8");
  assertIncludes(
    generatedCanvas,
    "var OfficePresentationCursorRuntime",
    "generated Canvas inline runtime",
  );
  assertNotIncludes(
    generatedCanvas,
    "PresentationCursorCanvas } from",
    "generated Canvas runtime import",
  );
  const payloadMatch = generatedCanvas.match(
    /const payload = JSON\.parse\((.*)\);/s,
  );
  if (!payloadMatch) {
    fail("Could not find generated Canvas JSON payload");
  } else {
    const payload = JSON.parse(JSON.parse(payloadMatch[1])) as {
      artifact?: { mode?: string };
      layouts?: Array<{
        bodyLevelStyles?: unknown[];
        elements?: Array<{ levelsStyles?: unknown[] }>;
        otherLevelStyles?: unknown[];
        titleLevelStyles?: unknown[];
      }>;
      media?: Record<string, { src?: string }>;
      slides?: Array<{
        elements?: Array<{
          bbox?: { rotation?: number };
          textStyle?: { autoFit?: unknown };
        }>;
        thumbnail?: string | null;
      }>;
      theme?: { colors?: Record<string, string> };
    };
    if (payload.artifact?.mode !== "presentation-renderer") {
      fail(
        `Generated Canvas payload mode is ${String(payload.artifact?.mode)}, expected presentation-renderer`,
      );
    }
    const masterLevelStyleCount = (payload.layouts ?? []).reduce(
      (count, layout) =>
        count +
        (layout.bodyLevelStyles?.length ?? 0) +
        (layout.titleLevelStyles?.length ?? 0) +
        (layout.otherLevelStyles?.length ?? 0),
      0,
    );
    const placeholderLevelStyleCount = (payload.layouts ?? []).reduce(
      (count, layout) =>
        count +
        (layout.elements ?? []).reduce(
          (elementCount, element) =>
            elementCount + (element.levelsStyles?.length ?? 0),
          0,
        ),
      0,
    );
    if (masterLevelStyleCount === 0) {
      fail("Generated Canvas payload is missing master paragraph level styles");
    }
    if (placeholderLevelStyleCount === 0) {
      fail("Generated Canvas payload is missing placeholder paragraph level styles");
    }
    const mediaContentTypes = new Set(
      Object.values(payload.media ?? {})
        .map((entry) => /^data:([^;]+);/u.exec(entry.src ?? "")?.[1])
        .filter(Boolean),
    );
    if (!mediaContentTypes.has("image/png")) {
      fail("Generated Canvas payload is missing PNG media needed for transparent image overlays");
    }
    if (!payload.theme?.colors || Object.keys(payload.theme.colors).length === 0) {
      fail("Generated Canvas payload is missing theme colors for scheme fills");
    }
    const thumbnailCount = (payload.slides ?? []).filter((slide) =>
      /^data:image\/(?:jpeg|png);base64,/u.test(slide.thumbnail ?? ""),
    ).length;
    if (thumbnailCount === 0) {
      fail("Generated Canvas payload is missing pre-rendered slide thumbnails for the Cursor rail");
    }
    const allElements = (payload.slides ?? []).flatMap((slide) => slide.elements ?? []);
    if (!allElements.some((element) => typeof element.bbox?.rotation === "number")) {
      fail("Generated Canvas payload is missing rotated element bounding boxes");
    }
    if (!allElements.some((element) => element.textStyle?.autoFit != null)) {
      fail("Generated Canvas payload is missing text autofit body properties");
    }
  }
}

if (failures.length > 0) {
  console.error("Office Cursor Canvas consistency check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Office Cursor Canvas consistency check passed.");
