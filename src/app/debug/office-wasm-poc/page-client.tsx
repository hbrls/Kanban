"use client";

import { FileText } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { compileCanvasTsx } from "@/client/canvas-runtime";
import { resolveApiPath } from "@/client/config/backend";
import type { OfficeWasmArtifactKind } from "@/client/office-document-viewer/protocol/office-artifact-types";
import {
  extractOfficeArtifactProto,
  loadRoutaOfficeWasmReader,
} from "@/client/office-document-viewer/protocol/routa-office-wasm-reader";
import { toErrorMessage } from "@/client/utils/diagnostics";
import { useTranslation } from "@/i18n";

import {
  OFFICE_WASM_ASSET_ROUTE,
  OFFICE_WASM_DOTNET_RUNTIME_CONFIG,
  OFFICE_WASM_READER_MODULES,
} from "./office-wasm-config";
import {
  PRESENTATION_HEADER_ACTIONS_ID,
  PresentationPreview,
  type PreviewLabels,
  SpreadsheetPreview,
  WordPreview,
} from "@autodev/office-render";

type ArtifactKind = "csv" | "tsv" | "docx" | "pptx" | "xlsx";
type ParseStage = "idle" | "initializing" | "parsing" | "ready" | "error";
type ReaderMode = "walnut" | "routa";

type GeneratedWasmSummary = {
  chartCount: number;
  elementCount?: number;
  imageCount: number;
  metadata: Record<string, string>;
  protocol?: string;
  sheetCount: number;
  slideCount: number;
  sourceKind: string;
  tableCount: number;
  textBlockCount: number;
  title: string;
  wasmProtoByteLength: number;
  wasmProtoSha256: string;
};

type ParsedArtifact = {
  kind: "document" | "presentation" | "spreadsheet";
  generatedSummary?: GeneratedWasmSummary;
  rawProto?: unknown;
  readerMode: ReaderMode;
  sourceKind: ArtifactKind;
  proto: unknown;
};

type WalnutReader = {
  DocxReader: {
    ExtractDocxProto: (bytes: Uint8Array, ignoreErrors: boolean) => unknown;
  };
  PptxReader: {
    ExtractSlidesProto: (bytes: Uint8Array, ignoreErrors: boolean) => unknown;
  };
  XlsxReader: {
    ExtractXlsxProto: (bytes: Uint8Array, ignoreErrors: boolean) => unknown;
  };
};

const ASSET_BASE_URL = resolveApiPath(OFFICE_WASM_ASSET_ROUTE);
const WORKBOOK_MODULE = `${ASSET_BASE_URL}/${OFFICE_WASM_READER_MODULES.workbook}`;
const DOCUMENT_MODULE = `${ASSET_BASE_URL}/${OFFICE_WASM_READER_MODULES.document}`;
const PRESENTATION_MODULE = `${ASSET_BASE_URL}/${OFFICE_WASM_READER_MODULES.presentation}`;
const SPREADSHEET_MODULE = `${ASSET_BASE_URL}/${OFFICE_WASM_READER_MODULES.spreadsheet}`;
const DOTNET_JS = `${ASSET_BASE_URL}/${OFFICE_WASM_READER_MODULES.dotnet}`;

let cachedWalnutRuntime: Promise<WalnutReader> | null = null;

function initialReaderMode(): ReaderMode {
  if (typeof window === "undefined") return "routa";
  const value = new URLSearchParams(window.location.search).get("reader");
  return value === "walnut" ? "walnut" : "routa";
}

async function getWalnutReader(): Promise<WalnutReader> {
  if (!cachedWalnutRuntime) {
    cachedWalnutRuntime = (async () => {
      const dotnet = await import(
        /* webpackIgnore: true */ `${DOTNET_JS}?v=walnut-runtime`
      );
      const runtime = await dotnet.dotnet
        .withConfig({
          ...OFFICE_WASM_DOTNET_RUNTIME_CONFIG,
          resources: {
            ...OFFICE_WASM_DOTNET_RUNTIME_CONFIG.resources,
          },
        })
        .withResourceLoader((resourceType: string, _name: string, defaultUri: string, integrity: string) => {
          if (resourceType === "dotnetjs") {
            return defaultUri;
          }

          const url = new URL(defaultUri, window.location.href);
          if (url.origin === window.location.origin) {
            return url.href;
          }

          return fetch(url.href, { credentials: "omit", integrity });
        })
        .create();

      return runtime.getAssemblyExports("Walnut") as Promise<WalnutReader>;
    })().catch((error: unknown) => {
      cachedWalnutRuntime = null;
      throw new Error(`Walnut runtime init failed: ${toErrorMessage(error)}`);
    });
  }

  return cachedWalnutRuntime;
}

function detectFileKind(fileName: string): ArtifactKind | null {
  const extension = fileName.trim().toLowerCase().split(".").pop();
  if (extension === "csv") return "csv";
  if (extension === "tsv") return "tsv";
  if (extension === "docx") return "docx";
  if (extension === "pptx") return "pptx";
  if (extension === "xlsx") return "xlsx";
  return null;
}

async function parseSpreadsheetFromCsv(file: File, separator?: string): Promise<ParsedArtifact> {
  const { Workbook } = (await import(
    /* webpackIgnore: true */ `${WORKBOOK_MODULE}?v=workbook`
  )) as {
    Workbook: {
      fromCSV: (text: string, options?: { separator?: string }) => {
        toProto: () => unknown;
      };
    };
  };
  const fileBytes = await file.arrayBuffer();
  const asText = new TextDecoder().decode(fileBytes);
  const workbook = await Workbook.fromCSV(asText, separator ? { separator } : undefined);
  return {
    kind: "spreadsheet",
    proto: workbook.toProto(),
    readerMode: "walnut",
    sourceKind: file.name.endsWith(".tsv") ? "tsv" : "csv",
  };
}

async function parseDocument(file: File, kind: "docx" | "pptx" | "xlsx"): Promise<ParsedArtifact> {
  const walnut = await getWalnutReader();
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  if (kind === "docx") {
    const { Document } = (await import(
      /* webpackIgnore: true */ `${DOCUMENT_MODULE}?v=document`
    )) as { Document: { decode: (value: unknown) => unknown } };
    const proto = Document.decode(walnut.DocxReader.ExtractDocxProto(bytes, false));
    return { kind: "document", proto, readerMode: "walnut", sourceKind: "docx" };
  }

  if (kind === "pptx") {
    const { Presentation } = (await import(
      /* webpackIgnore: true */ `${PRESENTATION_MODULE}?v=presentation`
    )) as { Presentation: { decode: (value: unknown) => unknown } };
    const proto = Presentation.decode(walnut.PptxReader.ExtractSlidesProto(bytes, false));
    return { kind: "presentation", proto, readerMode: "walnut", sourceKind: "pptx" };
  }

  const { Workbook } = (await import(
    /* webpackIgnore: true */ `${SPREADSHEET_MODULE}?v=spreadsheet`
  )) as { Workbook: { decode: (value: unknown) => unknown } };
  const proto = Workbook.decode(walnut.XlsxReader.ExtractXlsxProto(bytes, false));
  return {
    kind: "spreadsheet",
    proto: {
      ...(proto && typeof proto === "object" ? proto as Record<string, unknown> : {}),
      sourceName: file.name,
    },
    readerMode: "walnut",
    sourceKind: "xlsx",
  };
}

async function parseDocumentWithGeneratedReader(file: File, kind: OfficeWasmArtifactKind): Promise<ParsedArtifact> {
  const reader = await loadRoutaOfficeWasmReader();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const protoBytes = extractOfficeArtifactProto(reader, bytes, kind, false);

  if (kind === "docx") {
    const proto = await decodeDocumentProto(protoBytes);
    return {
      generatedSummary: await summarizeGeneratedDocumentProto(proto, protoBytes),
      kind: "document",
      proto,
      rawProto: proto,
      readerMode: "routa",
      sourceKind: kind,
    };
  }

  if (kind === "pptx") {
    const proto = await decodePresentationProto(protoBytes);
    return {
      generatedSummary: await summarizeGeneratedPresentationProto(proto, protoBytes),
      kind: "presentation",
      proto,
      rawProto: proto,
      readerMode: "routa",
      sourceKind: kind,
    };
  }

  const proto = await decodeWorkbookProto(protoBytes);

  return {
    generatedSummary: await summarizeGeneratedWorkbookProto(proto, protoBytes),
    kind: "spreadsheet",
    proto: {
      ...(proto && typeof proto === "object" ? proto as Record<string, unknown> : {}),
      sourceName: file.name,
    },
    rawProto: proto,
    readerMode: "routa",
    sourceKind: kind,
  };
}

async function decodeDocumentProto(protoBytes: Uint8Array): Promise<unknown> {
  const { Document } = (await import(
    /* webpackIgnore: true */ `${DOCUMENT_MODULE}?v=generated-document`
  )) as { Document: { decode: (value: unknown) => unknown } };
  return Document.decode(protoBytes);
}

async function decodePresentationProto(protoBytes: Uint8Array): Promise<unknown> {
  const { Presentation } = (await import(
    /* webpackIgnore: true */ `${PRESENTATION_MODULE}?v=generated-presentation`
  )) as { Presentation: { decode: (value: unknown) => unknown } };
  return Presentation.decode(protoBytes);
}

async function decodeWorkbookProto(protoBytes: Uint8Array): Promise<unknown> {
  const { Workbook } = (await import(
    /* webpackIgnore: true */ `${SPREADSHEET_MODULE}?v=generated-spreadsheet`
  )) as { Workbook: { decode: (value: unknown) => unknown } };
  return Workbook.decode(protoBytes);
}

async function summarizeGeneratedDocumentProto(
  proto: unknown,
  protoBytes: Uint8Array,
): Promise<GeneratedWasmSummary> {
  const root = proto && typeof proto === "object" ? proto as Record<string, unknown> : {};
  const elements = Array.isArray(root.elements) ? root.elements : [];
  const tables = elements.filter((element) => {
    if (element == null || typeof element !== "object") return false;
    const table = (element as Record<string, unknown>).table;
    return table != null && typeof table === "object";
  });

  return {
    chartCount: Array.isArray(root.charts) ? root.charts.length : 0,
    elementCount: elements.length,
    imageCount: Array.isArray(root.images) ? root.images.length : 0,
    metadata: {},
    protocol: "oaiproto.coworker.docx.Document",
    sheetCount: 0,
    slideCount: 0,
    sourceKind: "docx",
    tableCount: tables.length,
    textBlockCount: elements.length - tables.length,
    title: typeof root.name === "string" ? root.name : "",
    wasmProtoByteLength: protoBytes.length,
    wasmProtoSha256: await sha256Hex(protoBytes),
  };
}

async function summarizeGeneratedPresentationProto(
  proto: unknown,
  protoBytes: Uint8Array,
): Promise<GeneratedWasmSummary> {
  const root = proto && typeof proto === "object" ? proto as Record<string, unknown> : {};
  const slides = Array.isArray(root.slides) ? root.slides : [];
  const elementCount = slides.reduce((count, slide) => {
    if (slide == null || typeof slide !== "object") return count;
    const elements = (slide as Record<string, unknown>).elements;
    return count + (Array.isArray(elements) ? elements.length : 0);
  }, 0);

  return {
    chartCount: Array.isArray(root.charts) ? root.charts.length : 0,
    elementCount,
    imageCount: Array.isArray(root.images) ? root.images.length : 0,
    metadata: {},
    protocol: "oaiproto.coworker.presentation.Presentation",
    sheetCount: 0,
    slideCount: slides.length,
    sourceKind: "pptx",
    tableCount: 0,
    textBlockCount: 0,
    title: "",
    wasmProtoByteLength: protoBytes.length,
    wasmProtoSha256: await sha256Hex(protoBytes),
  };
}

async function summarizeGeneratedWorkbookProto(
  proto: unknown,
  protoBytes: Uint8Array,
): Promise<GeneratedWasmSummary> {
  const root = proto && typeof proto === "object" ? proto as Record<string, unknown> : {};
  const sheets = Array.isArray(root.sheets) ? root.sheets.filter((sheet): sheet is Record<string, unknown> => (
    sheet != null && typeof sheet === "object" && !Array.isArray(sheet)
  )) : [];
  const drawingCount = sheets.reduce((count, sheet) => {
    const drawings = sheet.drawings;
    return count + (Array.isArray(drawings) ? drawings.length : 0);
  }, 0);
  const chartCount = sheets.reduce((count, sheet) => {
    const drawings = Array.isArray(sheet.drawings) ? sheet.drawings : [];
    return count + drawings.filter((drawing) => (
      drawing != null && typeof drawing === "object" && "chart" in drawing
    )).length;
  }, 0);
  const tableCount = sheets.reduce((count, sheet) => {
    const tables = sheet.tables;
    return count + (Array.isArray(tables) ? tables.length : 0);
  }, 0);
  const cellCount = sheets.reduce((count, sheet) => {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    return count + rows.reduce((rowCount, row) => {
      if (row == null || typeof row !== "object" || Array.isArray(row)) return rowCount;
      const cells = (row as Record<string, unknown>).cells;
      return rowCount + (Array.isArray(cells) ? cells.length : 0);
    }, 0);
  }, 0);

  return {
    chartCount,
    elementCount: cellCount + drawingCount,
    imageCount: Array.isArray(root.images) ? root.images.length : 0,
    metadata: {},
    protocol: "oaiproto.coworker.spreadsheet.Workbook",
    sheetCount: sheets.length,
    slideCount: 0,
    sourceKind: "xlsx",
    tableCount,
    textBlockCount: 0,
    title: "",
    wasmProtoByteLength: protoBytes.length,
    wasmProtoSha256: await sha256Hex(protoBytes),
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const payload = new Uint8Array(bytes.byteLength);
  payload.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function truncateJson(rawJson: string): string {
  const maxLength = 50_000;
  if (rawJson.length <= maxLength) return rawJson;
  return `${rawJson.slice(0, maxLength)}\n... (truncated)`;
}

function OfficeDirectPreview({
  artifact,
  labels,
}: {
  artifact: ParsedArtifact;
  labels: PreviewLabels;
}) {
  if (artifact.kind === "spreadsheet") {
    return <SpreadsheetPreview labels={labels} proto={artifact.proto} />;
  }

  if (artifact.kind === "presentation") {
    return <PresentationPreview labels={labels} proto={artifact.proto} />;
  }

  return <WordPreview labels={labels} proto={artifact.proto} />;
}

const OFFICE_PREVIEW_CANVAS_SOURCE = `
import { OfficePreview as RenderOfficePreview } from "routa/office-preview";

export default function OfficeCanvasPreview() {
  return <RenderOfficePreview />;
}
`;

function OfficePreview({
  artifact,
  labels,
}: {
  artifact: ParsedArtifact;
  labels: PreviewLabels;
}) {
  const compiled = useMemo(() => compileCanvasTsx(OFFICE_PREVIEW_CANVAS_SOURCE, {
    modules: {
      "routa/office-preview": {
        OfficePreview() {
          return <OfficeDirectPreview artifact={artifact} labels={labels} />;
        },
      },
    },
  }), [artifact, labels]);

  if (compiled.ok) {
    const CompiledOfficePreview = compiled.Component;
    return <CompiledOfficePreview />;
  }

  return <OfficeDirectPreview artifact={artifact} labels={labels} />;
}

function statusLabel(t: ReturnType<typeof useTranslation>["t"], status: ParseStage): string {
  switch (status) {
    case "idle":
      return t.debug.officeWasmPocStatusIdle;
    case "initializing":
      return t.debug.officeWasmPocStatusInitializing;
    case "parsing":
      return t.debug.officeWasmPocStatusParsing;
    case "ready":
      return t.debug.officeWasmPocStatusReady;
    case "error":
      return t.debug.officeWasmPocStatusError;
  }
}

export function OfficeWasmPocPageClient() {
  const { t } = useTranslation();
  const [selectedFileName, setSelectedFileName] = useState("");
  const [artifact, setArtifact] = useState<ParsedArtifact | null>(null);
  const [readerMode, setReaderMode] = useState<ReaderMode>(initialReaderMode);
  const [status, setStatus] = useState<ParseStage>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [lastBytes, setLastBytes] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setReaderMode(initialReaderMode());
  }, []);

  const reset = useCallback(() => {
    setSelectedFileName("");
    setArtifact(null);
    setErrorMessage(null);
    setStatus("idle");
    setLastBytes(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const changeReaderMode = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextMode: ReaderMode = event.target.value === "routa" ? "routa" : "walnut";
      setReaderMode(nextMode);
      setArtifact(null);
      setErrorMessage(null);
      setStatus("idle");
      setLastBytes(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      const url = new URL(window.location.href);
      if (nextMode === "routa") {
        url.searchParams.set("reader", "routa");
      } else {
        url.searchParams.set("reader", "walnut");
      }
      window.history.replaceState(null, "", url);
    },
    [],
  );

  const parseFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0];
      if (!selected) {
        reset();
        return;
      }

      const kind = detectFileKind(selected.name);
      if (!kind) {
        reset();
        setErrorMessage(t.debug.unsupportedOfficeFormat);
        return;
      }

      setSelectedFileName(selected.name);
      setStatus("initializing");
      setErrorMessage(null);
      setIsBusy(true);
      setArtifact(null);

      try {
        setStatus("parsing");
        let parsed: ParsedArtifact;

        if (kind === "csv" || kind === "tsv") {
          parsed = await parseSpreadsheetFromCsv(selected, kind === "tsv" ? "\t" : undefined);
        } else if (readerMode === "routa") {
          parsed = await parseDocumentWithGeneratedReader(selected, kind);
        } else {
          parsed = await parseDocument(selected, kind);
        }

        setArtifact(parsed);
        setLastBytes(selected.size);
        setStatus("ready");
      } catch (error: unknown) {
        setStatus("error");
        setErrorMessage(toErrorMessage(error));
      } finally {
        setIsBusy(false);
      }
    },
    [readerMode, reset, t.debug.unsupportedOfficeFormat],
  );

  const preview =
    artifact == null || artifact.kind === "presentation"
      ? ""
      : truncateJson(JSON.stringify(artifact.rawProto ?? artifact.proto, null, 2));
  const labels: PreviewLabels = useMemo(() => ({
    closeSlideshow: t.debug.officeWasmPocCloseSlideshow,
    hideSpeakerNotes: t.debug.officeWasmPocHideSpeakerNotes,
    nextSlide: t.debug.officeWasmPocNextSlide,
    playSlideshow: t.debug.officeWasmPocPlaySlideshow,
    previousSlide: t.debug.officeWasmPocPreviousSlide,
    showSpeakerNotes: t.debug.officeWasmPocShowSpeakerNotes,
    speakerNotes: t.debug.officeWasmPocSpeakerNotes,
    visualPreview: t.debug.officeWasmPocVisualPreview,
    rawJson: t.debug.officeWasmPocRawJson,
    sheet: t.debug.officeWasmPocSheet,
    slide: t.debug.officeWasmPocSlide,
    noSheets: t.debug.officeWasmPocNoSheets,
    noSlides: t.debug.officeWasmPocNoSlides,
    noDocumentBlocks: t.debug.officeWasmPocNoDocumentBlocks,
    showingFirstRows: t.debug.officeWasmPocShowingFirstRows,
    shapes: t.debug.officeWasmPocShapes,
    textRuns: t.debug.officeWasmPocTextRuns,
  }), [t.debug]);
  const showDebugDetails = artifact?.kind !== "presentation";
  const isPresentationArtifact = artifact?.kind === "presentation";

  return (
    <main
      style={{
        boxSizing: "border-box",
        display: "grid",
        fontFamily:
          "var(--font-sans, -apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif)",
        gap: 0,
        gridTemplateRows: "52px minmax(0, 1fr)",
        height: "100vh",
        maxWidth: "none",
        minHeight: "100vh",
        overflow: "hidden",
        padding: 0,
        width: "100%",
      }}
    >
      <header
        style={{
          alignItems: "center",
          borderBottom: "1px solid #e2e8f0",
          display: isPresentationArtifact ? "grid" : "flex",
          flexWrap: isPresentationArtifact ? undefined : "nowrap",
          gridTemplateColumns: isPresentationArtifact ? "minmax(0, 1fr) auto minmax(0, 1fr)" : undefined,
          gap: 12,
          minWidth: 0,
          overflow: "hidden",
          padding: "0 16px",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flex: isPresentationArtifact ? undefined : "0 0 auto",
            gap: isPresentationArtifact ? 10 : 12,
            minWidth: 0,
          }}
        >
          <label
            style={{
              alignItems: "center",
              color: "#475569",
              cursor: isBusy ? "default" : "pointer",
              display: "inline-flex",
              fontSize: 13,
              gap: 8,
              minWidth: 0,
            }}
          >
            <span>{t.debug.officeWasmPocSelectFile}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.docx,.pptx,.xlsx"
              onChange={parseFile}
              disabled={isBusy}
              style={isPresentationArtifact ? { display: "none" } : undefined}
            />
          </label>
          <label style={{ alignItems: "center", display: "flex", gap: 8, minWidth: 0 }}>
            <span style={{ color: "#475569", fontSize: 13 }}>{t.debug.officeWasmPocReader}</span>
            <select
              data-testid="office-wasm-reader-mode"
              disabled={isBusy}
              onChange={changeReaderMode}
              value={readerMode}
              style={isPresentationArtifact ? { maxWidth: 156 } : undefined}
            >
              <option value="walnut">{t.debug.officeWasmPocReaderWalnut}</option>
              <option value="routa">{t.debug.officeWasmPocReaderGenerated}</option>
            </select>
          </label>
        </div>
        {isPresentationArtifact ? (
          <div
            style={{
              alignItems: "center",
              color: "#111827",
              display: "inline-flex",
              fontSize: 13,
              fontWeight: 600,
              gap: 8,
              justifySelf: "center",
              maxWidth: "44vw",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                alignItems: "center",
                background: "#fb923c",
                borderRadius: 5,
                color: "#ffffff",
                display: "inline-flex",
                height: 18,
                justifyContent: "center",
                width: 18,
              }}
            >
              <FileText aria-hidden="true" size={12} strokeWidth={2.4} />
            </span>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {selectedFileName}
            </span>
          </div>
        ) : (
          <>
            <div style={{ color: "#475569", flex: "0 0 auto", fontSize: 13 }}>
              <strong>{t.debug.officeWasmPocStatus}</strong> {statusLabel(t, status)}
            </div>
            {selectedFileName ? (
              <div style={{ color: "#475569", flex: "1 1 auto", fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <code>{selectedFileName}</code>
                {lastBytes !== null ? <> ({lastBytes} {t.debug.officeWasmPocBytes})</> : null}
              </div>
            ) : null}
          </>
        )}
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flex: isPresentationArtifact ? undefined : "0 0 auto",
            gap: 10,
            justifyContent: isPresentationArtifact ? "flex-end" : undefined,
            minWidth: 0,
          }}
        >
          {isPresentationArtifact ? (
            <div style={{ color: "#475569", flex: "0 0 auto", fontSize: 13 }}>
              <strong>{t.debug.officeWasmPocStatus}</strong> {statusLabel(t, status)}
            </div>
          ) : null}
          {artifact?.kind === "presentation" ? (
            <div
              id={PRESENTATION_HEADER_ACTIONS_ID}
              style={{ alignItems: "center", display: "flex", flex: "0 0 auto", minWidth: 0 }}
            />
          ) : null}
          {errorMessage ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{errorMessage}</div> : null}
        </div>
      </header>

      <section style={{ minHeight: 0, overflow: "hidden" }}>
        {artifact ? (
          <div
            style={{
              display: "grid",
              gap: showDebugDetails ? 12 : 0,
              gridTemplateRows: showDebugDetails ? "minmax(0, 1fr) auto" : "minmax(0, 1fr)",
              height: "100%",
              minHeight: 0,
            }}
          >
            <section
              data-testid="office-preview"
              style={{
                minHeight: 0,
                overflowX: "hidden",
                overflowY: artifact.kind === "document" ? "auto" : "hidden",
                paddingBottom: artifact.kind === "document" ? 8 : 0,
              }}
            >
              <OfficePreview artifact={artifact} labels={labels} />
            </section>
            {showDebugDetails ? (
              <details
                data-testid="office-wasm-debug-details"
                style={{
                  borderColor: "#e2e8f0",
                  borderRadius: 8,
                  borderStyle: "solid",
                  borderWidth: 1,
                  overflow: "hidden",
                }}
              >
                <summary style={{ cursor: "pointer", padding: "10px 12px" }}>
                  {t.debug.officeWasmPocDebugDetails}
                </summary>
                <div style={{ display: "grid", gap: 12, padding: "0 12px 12px" }}>
                  {artifact.generatedSummary ? (
                    <section>
                      <div style={{ color: "#475569", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                        {t.debug.officeWasmPocGeneratedSummary}
                      </div>
                      <pre
                        data-testid="office-wasm-generated-summary"
                        style={{
                          background: "#eef6ff",
                          borderColor: "#bfdbfe",
                          borderRadius: 8,
                          borderStyle: "solid",
                          borderWidth: 1,
                          color: "#0f172a",
                          margin: 0,
                          maxHeight: "220px",
                          overflow: "auto",
                          padding: 12,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        {JSON.stringify(artifact.generatedSummary, null, 2)}
                      </pre>
                    </section>
                  ) : null}
                  <section>
                    <div style={{ color: "#475569", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      {labels.rawJson}
                    </div>
                    <pre style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: "420px",
                      overflow: "auto",
                      background: "#0b1020",
                      color: "#f8fafc",
                      padding: 12,
                      borderRadius: 8,
                    }}>
                      {preview}
                    </pre>
                  </section>
                </div>
              </details>
            ) : null}
          </div>
        ) : (
          <p>{t.debug.officeWasmPocNoResult}</p>
        )}
      </section>
    </main>
  );
}
