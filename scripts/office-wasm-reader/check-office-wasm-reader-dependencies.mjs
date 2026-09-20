import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const packagesProps = path.join(repoRoot, "tools/office-wasm-reader/Directory.Packages.props");
const extractedAssets = path.join(repoRoot, "tmp/codex-app-analysis/extracted/webview/assets");
const generatedAssets = path.join(repoRoot, "public/office-wasm-reader/_framework");

const expectedVersions = {
  "ClosedXML": "0.105.0",
  "ClosedXML.Parser": "2.0.0",
  "DocumentFormat.OpenXml": "3.4.1",
  "DocumentFormat.OpenXml.Framework": "3.4.1",
  "ExcelNumberFormat": "1.1.0",
  "Google.Protobuf": "3.31.0",
  "Microsoft.NET.Runtime.WebAssembly.Sdk": "9.0.14",
  "RBush.Signed": "4.0.0",
  "SixLabors.Fonts": "1.0.0",
  "System.IO.Packaging": "8.0.1",
};

const expectedExtractedOnlyAssemblies = ["Walnut"];
const expectedGeneratedOnlyAssemblies = [
  "ClosedXML",
  "ClosedXML.Parser",
  "ExcelNumberFormat",
  "RBush",
  "Routa.OfficeWasmReader",
  "SixLabors.Fonts",
  "System.Drawing",
  "System.Drawing.Primitives",
  "System.IO.Compression.Brotli",
  "System.Linq.Parallel",
];
const requiredSharedAssemblies = [
  "DocumentFormat.OpenXml",
  "DocumentFormat.OpenXml.Framework",
  "Google.Protobuf",
  "System.Console",
  "System.IO.Packaging",
  "System.Security.Cryptography",
  "dotnet.native",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function readBinaryAsLatin1(filePath) {
  return readFileSync(filePath).toString("latin1");
}

function readWasmAssemblyNames(directory, normalizeName) {
  return new Set(
    readdirSync(directory)
      .filter(fileName => fileName.endsWith(".wasm"))
      .map(normalizeName),
  );
}

function normalizeExtractedWasmName(fileName) {
  const stem = path.basename(fileName, ".wasm");
  if (stem.startsWith("dotnet.native.")) {
    return "dotnet.native";
  }

  return stem.replace(/\.[a-z0-9_-]{10}$/i, "");
}

function normalizeGeneratedWasmName(fileName) {
  return path.basename(fileName, ".wasm");
}

function sortedDifference(left, right) {
  return [...left].filter(item => !right.has(item)).sort();
}

function assertSameList(actual, expected, label) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  assert(
    JSON.stringify(sortedActual) === JSON.stringify(sortedExpected),
    `${label} mismatch: expected ${sortedExpected.join(", ") || "(none)"}, got ${sortedActual.join(", ") || "(none)"}`,
  );
}

const props = readText(packagesProps);
for (const [name, version] of Object.entries(expectedVersions)) {
  assert(
    props.includes(`Include="${name}" Version="${version}"`),
    `${packagesProps} must pin ${name} ${version}`,
  );
}

const dotnetNative = readBinaryAsLatin1(path.join(extractedAssets, "dotnet.native.wfd2lrj4w6.wasm"));
assert(
  dotnetNative.includes("Microsoft.NETCore.App.Runtime.Mono.browser-wasm/9.0.14"),
  "Extracted dotnet.native.wasm should be from Microsoft.NETCore.App.Runtime.Mono.browser-wasm/9.0.14",
);

const protobuf = readBinaryAsLatin1(path.join(extractedAssets, "Google.Protobuf.ze35jf5cfr.wasm"));
assert(protobuf.includes("3.31.0.0"), "Extracted Google.Protobuf.wasm should contain 3.31.0.0 evidence");

const packaging = readBinaryAsLatin1(path.join(extractedAssets, "System.IO.Packaging.ejb20qp7p2.wasm"));
assert(packaging.includes("System.IO.Packaging"), "Extracted System.IO.Packaging.wasm evidence is missing");
assert(packaging.includes("8.0.1024.46610"), "Extracted System.IO.Packaging.wasm version evidence changed");

for (const fileName of [
  "DocumentFormat.OpenXml.Framework.kpj7t3qucf.wasm",
  "DocumentFormat.OpenXml.ie8f746kzt.wasm",
]) {
  const content = readBinaryAsLatin1(path.join(extractedAssets, fileName));
  assert(content.includes("DocumentFormat.OpenXml"), `${fileName} should contain OpenXML evidence`);
}

console.log("Office WASM reader dependency pins match extracted bundle evidence.");

if (existsSync(path.join(generatedAssets, "dotnet.native.wasm"))) {
  const generatedNative = readBinaryAsLatin1(path.join(generatedAssets, "dotnet.native.wasm"));
  assert(
    generatedNative.includes("Microsoft.NETCore.App.Runtime.Mono.browser-wasm/9.0.14"),
    "Generated dotnet.native.wasm must be built from Microsoft.NETCore.App.Runtime.Mono.browser-wasm/9.0.14",
  );
  assert(!generatedNative.includes("browser-wasm/9.0.15"), "Generated dotnet.native.wasm must not use 9.0.15 packs");

  const extractedAssemblies = readWasmAssemblyNames(extractedAssets, normalizeExtractedWasmName);
  const generatedAssemblies = readWasmAssemblyNames(generatedAssets, normalizeGeneratedWasmName);

  for (const assemblyName of requiredSharedAssemblies) {
    assert(extractedAssemblies.has(assemblyName), `Extracted bundle is missing required assembly ${assemblyName}`);
    assert(generatedAssemblies.has(assemblyName), `Generated bundle is missing required assembly ${assemblyName}`);
  }

  assertSameList(
    sortedDifference(extractedAssemblies, generatedAssemblies),
    expectedExtractedOnlyAssemblies,
    "Extracted-only assembly surface",
  );
  assertSameList(
    sortedDifference(generatedAssemblies, extractedAssemblies),
    expectedGeneratedOnlyAssemblies,
    "Generated-only assembly surface",
  );

  console.log("Generated Office WASM reader assembly surface matches extracted bundle with expected Routa and ClosedXML additions.");
}
