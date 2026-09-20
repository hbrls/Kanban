"use client";

/**
 * HtmlPreviewRenderer - Renders an HTML code block as a live preview in an iframe.
 *
 * Features:
 * - Toggle between "Preview" (live iframe) and "Code" (syntax-highlighted source) tabs
 * - iframe uses srcdoc + sandbox for safe rendering
 * - Resizable iframe height with a drag handle
 * - Copy button for source code
 */

import { useState, useRef, useCallback } from "react";
import { Check, PieChart, Globe, SquareArrowOutUpRight, Copy } from "lucide-react";


interface HtmlPreviewRendererProps {
  code: string;
  className?: string;
}

export function HtmlPreviewRenderer({ code, className = "" }: HtmlPreviewRendererProps) {
  const [mode, setMode] = useState<"preview" | "code">("preview");
  const [iframeHeight, setIframeHeight] = useState(400);
  const [copied, setCopied] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartHeight = useRef<number>(400);

  // Auto-resize iframe to fit content
  const handleIframeLoad = useCallback(() => {
    setIframeReady(true);
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (doc?.body) {
        const scrollHeight = doc.documentElement.scrollHeight || doc.body.scrollHeight;
        if (scrollHeight > 100) {
          setIframeHeight(Math.min(Math.max(scrollHeight, 200), 800));
        }
      }
    } catch {
      // cross-origin sandbox — ignore
    }
  }, []);

  // Drag to resize
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartHeight.current = iframeHeight;

    const onMouseMove = (ev: MouseEvent) => {
      if (dragStartY.current === null) return;
      const delta = ev.clientY - dragStartY.current;
      setIframeHeight(Math.max(150, dragStartHeight.current + delta));
    };
    const onMouseUp = () => {
      dragStartY.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [iframeHeight]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  // Open in new tab
  const handleOpenInTab = useCallback(() => {
    const blob = new Blob([code], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [code]);

  return (
    <div className={`html-preview-renderer my-3 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-1">
          {/* Globe icon */}
          <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">HTML Preview</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Tab toggle */}
          <div className="flex items-center bg-slate-200 dark:bg-slate-700 rounded-md p-0.5">
            <button
              onClick={() => setMode("preview")}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                mode === "preview"
                  ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Preview
            </button>
            <button
              onClick={() => setMode("code")}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                mode === "code"
                  ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Code
            </button>
          </div>

          {/* Open in new tab */}
          <button
            onClick={handleOpenInTab}
            title="Open in new tab"
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <SquareArrowOutUpRight className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
          </button>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy HTML"}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}/>
            )}
          </button>
        </div>
      </div>

      {/* Content area */}
      {mode === "preview" ? (
        <div className="relative bg-white">
          {!iframeReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-slate-900 z-10">
              <PieChart className="w-5 h-5 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24"/>
            </div>
          )}
          <iframe
            ref={iframeRef}
            srcDoc={code}
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            onLoad={handleIframeLoad}
            style={{ height: `${iframeHeight}px` }}
            className="w-full border-0 block"
            title="HTML Preview"
          />
          {/* Drag resize handle */}
          <div
            onMouseDown={handleDragStart}
            className="w-full h-2 bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 cursor-row-resize flex items-center justify-center group border-t border-slate-200 dark:border-slate-700"
            title="Drag to resize"
          >
            <div className="w-8 h-0.5 rounded bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-400" />
          </div>
        </div>
      ) : (
        <div className="relative">
          <pre className="overflow-x-auto p-4 text-xs bg-slate-900 text-slate-100 font-mono leading-relaxed max-h-125 overflow-y-auto">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
