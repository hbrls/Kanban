import cssModulesPlugin from "esbuild-plugin-css-modules";
import { readFileSync, writeFileSync } from "fs";
import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

const reactGlobalShimPlugin = (): Plugin => ({
  name: "react-global-shim",
  setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({
      namespace: "react-global-shim",
      path: "react",
    }));
    build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({
      namespace: "react-global-shim",
      path: "react/jsx-runtime",
    }));
    build.onLoad(
      { filter: /^react$/, namespace: "react-global-shim" },
      () => ({
        contents: `
const React = globalThis.React;
export const useCallback = React.useCallback;
export const useEffect = React.useEffect;
export const useMemo = React.useMemo;
export const useRef = React.useRef;
export const useState = React.useState;
export default React;
`,
        loader: "js",
      }),
    );
    build.onLoad(
      { filter: /^react\/jsx-runtime$/, namespace: "react-global-shim" },
      () => ({
        contents: `
const React = globalThis.React;
export const Fragment = React.Fragment;
export function jsx(type, props, key) {
  return React.createElement(type, key === undefined ? props : { ...props, key });
}
export const jsxs = jsx;
`,
        loader: "js",
      }),
    );
  },
});

export default defineConfig([
  // Main library bundle
  {
    entry: {
      index: "src/index.ts",
      "presentation-cursor-runtime":
        "src/presentation/cursor-canvas-runtime.tsx",
    },
    format: ["esm"],
    dts: true,
    clean: true,
    external: [
      "react",
      "react-dom",
      "react-dom/client",
      "@chenglou/pretext",
      "@chenglou/pretext/rich-inline",
    ],
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
    esbuildPlugins: [cssModulesPlugin()],
    // Inject CSS modules as runtime style tags so the package is self-contained
    injectStyle: true,
    async onSuccess() {
      // Rewrite worker URL .ts → .js in dist so npm consumers get the built
      // worker file. The source uses .ts for Next.js transpilePackages compat.
      const distFile = "dist/index.js";
      const content = readFileSync(distFile, "utf-8");
      const patched = content.replace(/spreadsheet-canvas\.worker\.ts"/g, 'spreadsheet-canvas.worker.js"');
      if (patched !== content) {
        writeFileSync(distFile, patched, "utf-8");
        console.log("✓ Patched worker URL .ts → .js in dist/index.js");
      }
    },
  },
  // Web worker — built as a separate module so `new Worker(new URL(...))` resolves correctly
  {
    entry: { "spreadsheet-canvas.worker": "src/spreadsheet/spreadsheet-canvas.worker.ts" },
    format: ["esm"],
    dts: false,
    clean: false,
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
  },
  // Cursor Canvas runtime — IIFE so generated .canvas.tsx files can inline it
  // without relying on Cursor resolving arbitrary local imports.
  {
    entry: {
      "presentation-cursor-runtime.inline":
        "src/presentation/cursor-canvas-runtime.tsx",
    },
    format: ["iife"],
    globalName: "OfficePresentationCursorRuntime",
    dts: false,
    clean: false,
    platform: "browser",
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
    esbuildPlugins: [reactGlobalShimPlugin()],
  },
]);
