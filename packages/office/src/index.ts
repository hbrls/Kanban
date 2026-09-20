/**
 * @autodev/office
 *
 * Node.js wrapper for the Routa Office WASM reader.
 * The WASM bundle ships inside this package under `wasm/` and is loaded
 * on first call — no install-time build step required.
 *
 * Supported formats: DOCX, PPTX, XLSX
 * Output: raw protobuf bytes (routa.office.v1.OfficeArtifact)
 *
 * Usage:
 *   import { extractDocxProto } from '@autodev/office';
 *   const proto = await extractDocxProto(fileBytes);
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** Raw exports surfaced by the .NET [JSExport] methods. */
export interface OfficeReaderExports {
  DocxReader: {
    ExtractDocxProto: (
      bytes: Uint8Array,
      ignoreErrors: boolean,
    ) => Uint8Array | ArrayBuffer | number[];
  };
  PptxReader: {
    ExtractSlidesProto: (
      bytes: Uint8Array,
      ignoreErrors: boolean,
    ) => Uint8Array | ArrayBuffer | number[];
  };
  XlsxReader: {
    ExtractXlsxProto: (
      bytes: Uint8Array,
      ignoreErrors: boolean,
    ) => Uint8Array | ArrayBuffer | number[];
  };
  ReaderInfo?: {
    GetReaderVersion: () => string;
  };
}

// ─── Loader ─────────────────────────────────────────────────────────────────

/** Cache — the WASM module initialises once per process. */
let cachedReader: Promise<OfficeReaderExports> | null = null;

/**
 * Initialise and return the underlying WASM exports.
 * Subsequent calls return the same cached instance.
 */
export async function loadOfficeReader(): Promise<OfficeReaderExports> {
  if (!cachedReader) {
    cachedReader = initReader().catch((err: unknown) => {
      cachedReader = null;
      throw err;
    });
  }
  return cachedReader;
}

/** Reset the cached reader instance (mainly useful in tests). */
export function resetOfficeReaderCache(): void {
  cachedReader = null;
}

async function initReader(): Promise<OfficeReaderExports> {
  // Resolve wasm/main.js relative to this compiled file so the path
  // works both in node_modules and during local development.
  const mainJsUrl = new URL("../wasm/main.js", import.meta.url);

  // Side-effect import: main.js sets globalThis.RoutaOfficeWasmReader.
  // Node.js module cache guarantees this runs at most once per process.
  await import(mainJsUrl.href);

  const bridge = (
    globalThis as typeof globalThis & {
      RoutaOfficeWasmReader?: { exports?: OfficeReaderExports };
    }
  ).RoutaOfficeWasmReader;

  if (!bridge?.exports) {
    throw new Error(
      "@autodev/office: WASM reader exports not initialised. " +
        "Make sure the package was built with `npm run build:office-package`.",
    );
  }

  return bridge.exports;
}

// ─── High-level API ─────────────────────────────────────────────────────────

/**
 * Parse a DOCX file and return serialised OfficeArtifact protobuf bytes.
 *
 * @param bytes       Raw bytes of the .docx file.
 * @param ignoreErrors  When true, reader exceptions are swallowed and an
 *                      empty Uint8Array is returned instead of throwing.
 */
export async function extractDocxProto(
  bytes: Uint8Array,
  ignoreErrors = false,
): Promise<Uint8Array> {
  const reader = await loadOfficeReader();
  return toUint8Array(reader.DocxReader.ExtractDocxProto(bytes, ignoreErrors));
}

/**
 * Parse a PPTX file and return serialised Presentation protobuf bytes.
 *
 * @param bytes       Raw bytes of the .pptx file.
 * @param ignoreErrors  When true, reader exceptions are swallowed and an
 *                      empty Uint8Array is returned instead of throwing.
 */
export async function extractPptxProto(
  bytes: Uint8Array,
  ignoreErrors = false,
): Promise<Uint8Array> {
  const reader = await loadOfficeReader();
  return toUint8Array(
    reader.PptxReader.ExtractSlidesProto(bytes, ignoreErrors),
  );
}

/**
 * Parse an XLSX file and return serialised Workbook protobuf bytes.
 *
 * @param bytes       Raw bytes of the .xlsx file.
 * @param ignoreErrors  When true, reader exceptions are swallowed and an
 *                      empty Uint8Array is returned instead of throwing.
 */
export async function extractXlsxProto(
  bytes: Uint8Array,
  ignoreErrors = false,
): Promise<Uint8Array> {
  const reader = await loadOfficeReader();
  return toUint8Array(reader.XlsxReader.ExtractXlsxProto(bytes, ignoreErrors));
}

/**
 * Return the reader version string embedded in the WASM assembly
 * (e.g. `"routa-office-wasm-reader/<version>"`).
 */
export async function getReaderVersion(): Promise<string> {
  const reader = await loadOfficeReader();
  return reader.ReaderInfo?.GetReaderVersion() ?? "unknown";
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function toUint8Array(value: Uint8Array | ArrayBuffer | number[]): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value);
}
