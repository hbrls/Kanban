"use client";

import { useMemo, useState } from "react";
import { CodeBlock } from "./code-block";
import { CodeRetrievalViewer } from "./code-retrieval-viewer";
import { FileOutputViewer, parseFileOutput } from "./file-output-viewer";
import { MarkdownViewer } from "./markdown/markdown-viewer";
import { useTranslation } from "@/i18n";
import { ChevronRight } from "lucide-react";


function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (value === null) return <span className="text-slate-400 dark:text-slate-500">null</span>;
  if (typeof value === "boolean") {
    return <span className="text-amber-600 dark:text-amber-400">{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
  }
  if (typeof value === "string") {
    return (
      <span className="text-emerald-700 dark:text-emerald-400">
        &quot;{value}&quot;
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-500">[]</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed((current) => !current)}
          className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-mono"
        >
          {collapsed ? `[…${value.length}]` : "["}
        </button>
        {!collapsed && (
          <>
            <div className="pl-3 border-l border-slate-200 dark:border-slate-700 ml-1">
              {value.map((item, index) => (
                <div key={index} className="my-0.5">
                  <span className="text-slate-400 dark:text-slate-500 select-none">{index}: </span>
                  <JsonNode value={item} depth={depth + 1} />
                  {index < value.length - 1 && <span className="text-slate-400">,</span>}
                </div>
              ))}
            </div>
            <span className="text-slate-500">]</span>
          </>
        )}
      </span>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-slate-500">{"{}"}</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed((current) => !current)}
          className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-mono"
        >
          {collapsed ? `{…${entries.length}}` : "{"}
        </button>
        {!collapsed && (
          <>
            <div className="pl-3 border-l border-slate-200 dark:border-slate-700 ml-1">
              {entries.map(([key, nestedValue], index) => (
                <div key={key} className="my-0.5">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold">&quot;{key}&quot;</span>
                  <span className="text-slate-500">: </span>
                  <JsonNode value={nestedValue} depth={depth + 1} />
                  {index < entries.length - 1 && <span className="text-slate-400">,</span>}
                </div>
              ))}
            </div>
            <span className="text-slate-500">{"}"}</span>
          </>
        )}
      </span>
    );
  }

  return <span className="text-slate-700 dark:text-slate-300">{String(value)}</span>;
}

export function tryParseJsonString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function summarizeToolOutput(output: unknown, t: ReturnType<typeof useTranslation>["t"]): string {
  if (output == null) return "";

  if (typeof output === "string") {
    const parsed = tryParseJsonString(output);
    if (parsed != null) return summarizeToolOutput(parsed, t);

    const condensed = output.replace(/\s+/g, " ").trim();
    return condensed.length > 72 ? `${condensed.slice(0, 72)}…` : condensed;
  }

  if (Array.isArray(output)) {
    return `${t.toolCallContent.jsonArray} ${output.length} ${t.toolCallContent.items}`;
  }

  if (typeof output === "object") {
    return `${t.toolCallContent.jsonObject} ${Object.keys(output as Record<string, unknown>).length} ${t.toolCallContent.keys}`;
  }

  return String(output);
}

function normalizeOutput(output: unknown): { text: string; parsed: unknown | null } | null {
  if (output == null) return null;

  if (typeof output === "string") {
    return {
      text: output,
      parsed: tryParseJsonString(output),
    };
  }

  return {
    text: JSON.stringify(output, null, 2),
    parsed: output,
  };
}

export function ToolOutputView({
  output,
  toolName,
}: {
  output: unknown;
  toolName?: string;
}) {
  const { t } = useTranslation();
  const normalized = useMemo(() => normalizeOutput(output), [output]);
  const [mode, setMode] = useState<"tree" | "raw" | "code">("code");
  const [richTextExpanded, setRichTextExpanded] = useState(false);
  const text = normalized?.text ?? "";
  const parsed = normalized?.parsed ?? null;
  const isLarge = text.length > 500;

  const isCodebaseRetrievalFormat = (() => {
    if (
      parsed &&
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed[0]?.type === "text" &&
      typeof parsed[0]?.text === "string" &&
      parsed[0].text.includes("Path:") &&
      parsed[0].text.includes("code sections")
    ) {
      return true;
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const outputField = (parsed as Record<string, unknown>).output;
      if (
        typeof outputField === "string" &&
        outputField.includes("Path:") &&
        outputField.includes("code sections")
      ) {
        return true;
      }
    }

    return toolName === "codebase-retrieval" && text.includes("Path:");
  })();

  const codeRetrievalContent = useMemo(() => {
    if (!isCodebaseRetrievalFormat) return text;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const outputField = (parsed as Record<string, unknown>).output;
      if (typeof outputField === "string") {
        return outputField;
      }
    }

    return text;
  }, [isCodebaseRetrievalFormat, parsed, text]);

  const innerOutput = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "output" in parsed
    ? (parsed as Record<string, unknown>).output
    : null;

  const richTextContent = typeof innerOutput === "string" ? innerOutput : text;

  const isRichTextContent = useMemo(() => {
    if (!richTextContent || richTextContent.length < 200) return false;

    const newlineCount = (richTextContent.match(/\n/g) || []).length;
    if (newlineCount < 10) return false;

    const hasMarkdownHeaders = /^#{1,6}\s+/m.test(richTextContent);
    const hasMarkdownLinks = /\[.+?\]\(.+?\)/.test(richTextContent);
    const hasMarkdownLists = /^[\s]*[-*+]\s+/m.test(richTextContent);
    const hasMarkdownBold = /\*\*[^*]+\*\*/.test(richTextContent);
    const hasHtmlTags = /<[a-z][^>]*>/i.test(richTextContent);

    const markdownScore = [
      hasMarkdownHeaders,
      hasMarkdownLinks,
      hasMarkdownLists,
      hasMarkdownBold,
      hasHtmlTags,
    ].filter(Boolean).length;

    if (toolName === "web-fetch" || toolName === "fetch") {
      return newlineCount >= 5;
    }

    return markdownScore >= 2 || (newlineCount > 30 && markdownScore >= 1);
  }, [richTextContent, toolName]);

  const normalizedToolName = toolName?.toLowerCase();
  const isSearchTool = normalizedToolName === "search" || normalizedToolName === "grep";
  const isReadTool =
    normalizedToolName === "read" ||
    normalizedToolName === "read-file" ||
    normalizedToolName === "view";

  if (!normalized) return null;

  if (isCodebaseRetrievalFormat) {
    return (
      <div>
        <div className="px-2 py-1 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
          <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            {t.toolCallContent.outputCodeSections}
          </span>
        </div>
        <div className="p-2">
          <CodeRetrievalViewer output={codeRetrievalContent} initiallyExpanded={true} />
        </div>
      </div>
    );
  }

  if (isRichTextContent && !isCodebaseRetrievalFormat) {
    return (
      <div>
        <div className="px-2 py-1 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
          <button
            onClick={() => setRichTextExpanded((current) => !current)}
            className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider hover:text-slate-600 dark:hover:text-slate-300"
          >
            <ChevronRight className={`w-3 h-3 transition-transform ${richTextExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
            {t.toolCallContent.outputRendered}
          </button>
          <span className="text-[9px] text-slate-400 dark:text-slate-500">{richTextContent.length} {t.toolCallContent.chars}</span>
        </div>
        {richTextExpanded ? (
          <div className="p-3 max-h-[500px] overflow-y-auto bg-white dark:bg-slate-900/40">
            <MarkdownViewer
              content={richTextContent}
              className="text-xs prose prose-sm dark:prose-invert max-w-none"
            />
          </div>
        ) : (
          <div
            onClick={() => setRichTextExpanded(true)}
            className="px-3 py-2 text-[10px] text-slate-500 dark:text-slate-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 line-clamp-3"
          >
            {richTextContent.slice(0, 200).replace(/\n/g, " ")}
            {richTextContent.length > 200 && "…"}
          </div>
        )}
      </div>
    );
  }

  if ((isSearchTool || isReadTool) && typeof innerOutput === "string") {
    const fileOutputParsed = parseFileOutput(innerOutput, isSearchTool ? "search" : "read");
    if (fileOutputParsed.kind !== "unknown") {
      const label = isSearchTool
        ? `${t.toolCallContent.searchResults} (${fileOutputParsed.matchCount ?? fileOutputParsed.searchMatches?.length ?? 0} ${t.toolCallContent.matches})`
        : t.toolCallContent.fileContent;

      return (
        <div>
          <div className="px-2 py-1 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
            <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {label}
            </span>
          </div>
          <div className="p-2">
            <FileOutputViewer
              output={innerOutput}
              toolName={isSearchTool ? "search" : "read"}
              initiallyExpanded={true}
            />
          </div>
        </div>
      );
    }
  }

  if (!parsed) {
    return (
      <div>
        <div className="px-2 py-1 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
          <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            {t.toolCallContent.output}
          </span>
          {isLarge && <span className="text-[9px] text-slate-400 dark:text-slate-500">{text.length} {t.toolCallContent.chars}</span>}
        </div>
        <CodeBlock
          content={text}
          language="auto"
          variant="simple"
          className="!border-0 !rounded-none"
          wordWrap={true}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="px-2 py-1 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
        <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          {t.toolCallContent.outputJson}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("code")}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              mode === "code"
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            {t.toolCallContent.codeTab}
          </button>
          <button
            onClick={() => setMode("tree")}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              mode === "tree"
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            {t.toolCallContent.treeTab}
          </button>
          <button
            onClick={() => setMode("raw")}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              mode === "raw"
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            {t.toolCallContent.rawTab}
          </button>
        </div>
      </div>
      {mode === "tree" ? (
        <div className="px-2 py-1.5 text-[10px] font-mono bg-white dark:bg-slate-900/40 overflow-auto">
          <JsonNode value={parsed} depth={0} />
        </div>
      ) : mode === "code" ? (
        <CodeBlock
          content={JSON.stringify(parsed, null, 2)}
          language="json"
          variant={isLarge ? "rich" : "simple"}
          className="!border-0 !rounded-none"
          wordWrap={true}
          showHeader={false}
        />
      ) : (
        <pre className="px-2 py-1.5 text-[10px] font-mono text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words bg-white dark:bg-slate-900/40">
          {text}
        </pre>
      )}
    </div>
  );
}

export function ToolInputTable({ input }: { input: unknown }) {
  if (input == null) return null;

  if (typeof input === "object" && !Array.isArray(input)) {
    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length === 0) return null;

    return (
      <table className="w-full text-[10px] border-collapse">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0">
              <td className="py-1 pr-3 font-mono font-semibold text-slate-500 dark:text-slate-400 align-top whitespace-nowrap w-px">
                {key}
              </td>
              <td className="py-1 font-mono text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-all">
                {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <pre className="text-[10px] text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}
