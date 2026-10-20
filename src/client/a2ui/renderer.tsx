/**
 * A2UI React Renderer
 *
 * A lightweight, framework-native renderer for A2UI v0.10 protocol.
 * Renders A2UI component trees as React elements using Tailwind CSS.
 *
 * Unlike the official @copilotkit/a2ui-renderer (which wraps Lit web components),
 * this renders pure React components for seamless integration with the existing UI.
 */

"use client";

import React, { useState } from "react";
import Image from "next/image";
import type {
  A2UIComponent,
  A2UIMessage,
  A2UISurface,
  ChildList,
  DynamicString,
  DynamicNumber,
  DynamicBoolean,
  TextVariant,
  TextAccent,
  ButtonVariant,
  JustifyContent,
  AlignItems,
  DataBinding,
  FunctionCall,
} from "./types";
import { CircleCheck, Clock, Settings, SquareArrowOutUpRight, CodeXml, NotebookText, TriangleAlert, MessageCircleMore, Users, TrendingUp, Zap } from "lucide-react";


// ─── Data binding resolution ──────────────────────────────────────

function isDataBinding(val: unknown): val is DataBinding {
  return typeof val === "object" && val !== null && "path" in val && typeof (val as DataBinding).path === "string" && !("call" in val);
}

function isFunctionCall(val: unknown): val is FunctionCall {
  return typeof val === "object" && val !== null && "call" in val;
}

/** Resolve a JSON Pointer path against a data model, with optional relative scope */
function resolvePath(data: Record<string, unknown>, path: string, scope = ""): unknown {
  // Absolute path
  const fullPath = path.startsWith("/") ? path : (scope ? `${scope}/${path}` : `/${path}`);
  const segments = fullPath.split("/").filter(Boolean);
  let current: unknown = data;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[seg];
    } else if (Array.isArray(current)) {
      const idx = parseInt(seg, 10);
      current = isNaN(idx) ? undefined : current[idx];
    } else {
      return undefined;
    }
  }
  return current;
}

/** Resolve a DynamicString to a concrete string */
function resolveString(val: DynamicString | undefined, data: Record<string, unknown>, scope = ""): string {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") return val;
  if (isDataBinding(val)) {
    const resolved = resolvePath(data, val.path, scope);
    return resolved !== undefined && resolved !== null ? String(resolved) : "";
  }
  if (isFunctionCall(val)) {
    // Basic function call support
    if (val.call === "formatString" && typeof val.args?.value === "string") {
      return val.args.value.replace(/\$\{([^}]+)\}/g, (_match, path: string) => {
        const v = resolvePath(data, path, scope);
        return v !== undefined ? String(v) : "";
      });
    }
    return `[fn:${val.call}]`;
  }
  return String(val);
}

/** Resolve a DynamicNumber to a concrete number */
function resolveNumber(val: DynamicNumber | undefined, data: Record<string, unknown>, scope = ""): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  if (isDataBinding(val)) {
    const resolved = resolvePath(data, val.path, scope);
    return typeof resolved === "number" ? resolved : Number(resolved) || 0;
  }
  return 0;
}

/** Resolve a DynamicBoolean to a concrete boolean */
function resolveBoolean(val: DynamicBoolean | undefined, data: Record<string, unknown>, scope = ""): boolean {
  if (val === undefined || val === null) return false;
  if (typeof val === "boolean") return val;
  if (isDataBinding(val)) {
    const resolved = resolvePath(data, val.path, scope);
    return Boolean(resolved);
  }
  return false;
}

// ─── Style mapping ────────────────────────────────────────────────

const TEXT_VARIANT_CLASSES: Record<TextVariant, string> = {
  h1: "text-2xl font-bold text-slate-900 dark:text-slate-100",
  h2: "text-xl font-semibold text-slate-800 dark:text-slate-200",
  h3: "text-base font-semibold text-slate-800 dark:text-slate-200",
  h4: "text-sm font-semibold text-slate-700 dark:text-slate-300",
  h5: "text-xs font-semibold text-slate-700 dark:text-slate-300",
  body: "text-sm text-slate-600 dark:text-slate-400",
  caption: "text-xs text-slate-500 dark:text-slate-500",
};

const TEXT_ACCENT_CLASSES: Record<TextAccent, string> = {
  success:  "text-emerald-600 dark:text-emerald-400",
  warning:  "text-amber-600 dark:text-amber-500",
  error:    "text-red-600 dark:text-red-400",
  info:     "text-blue-600 dark:text-blue-400",
  muted:    "text-slate-400 dark:text-slate-500",
  primary:  "text-amber-600 dark:text-amber-500",
  route:    "text-slate-600 dark:text-slate-300",
};

const TEXT_ACCENT_PILL_CLASSES: Record<TextAccent, string> = {
  success:  "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  warning:  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  error:    "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  info:     "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  muted:    "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
  primary:  "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  route:    "bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300",
};

const JUSTIFY_CLASSES: Record<JustifyContent, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  spaceBetween: "justify-between",
  spaceAround: "justify-around",
  spaceEvenly: "justify-evenly",
  stretch: "justify-stretch",
};

const ALIGN_CLASSES: Record<AlignItems, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

const GAP_ROW_CLASSES: Record<string, string> = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-6",
};

const GAP_COL_CLASSES: Record<string, string> = {
  none: "gap-0",
  xs: "gap-0.5",
  sm: "gap-1.5",
  md: "gap-3",
  lg: "gap-5",
};

const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default: "px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#252838] text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#191c28] transition-colors",
  primary: "px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 transition-colors shadow-sm",
  borderless: "px-2 py-1 text-sm font-medium text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors",
};

// ─── Material icon → SVG mapping (subset for dashboard use) ───────

const ICON_SVG_MAP: Record<string, React.ReactNode> = {
  chat: (
    <MessageCircleMore className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
  ),
  people: (
    <Users className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
  ),
  check_circle: (
    <CircleCheck className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
  ),
  schedule: (
    <Clock className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
  ),
  code: (
    <CodeXml className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
  ),
  trending_up: (
    <TrendingUp className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
  ),
  priority_high: (
    <TriangleAlert className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
  ),
  settings: (
    <Settings className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
  ),
  description: (
    <NotebookText className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
  ),
  bolt: (
    <Zap className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
  ),
  open_in_new: (
    <SquareArrowOutUpRight className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}/>
  ),
};

// ─── Component renderer ───────────────────────────────────────────

interface RendererCtx {
  componentMap: Map<string, A2UIComponent>;
  data: Record<string, unknown>;
  scope: string;
  onAction?: (action: { name: string; surfaceId: string; context?: Record<string, unknown> }) => void;
  surfaceId: string;
  theme?: { primaryColor?: string };
}

function renderChildList(childList: ChildList, ctx: RendererCtx): React.ReactNode[] {
  if (Array.isArray(childList)) {
    return childList.map((childId) => (
      <A2UIComponentRenderer key={childId} componentId={childId} ctx={ctx} />
    ));
  }
  // Template-based children (iterate over data array)
  const items = resolvePath(ctx.data, childList.path, ctx.scope);
  if (!Array.isArray(items)) return [];
  return items.map((_item, idx) => {
    const childCtx: RendererCtx = {
      ...ctx,
      scope: `${childList.path}/${idx}`,
    };
    return <A2UIComponentRenderer key={`${childList.componentId}-${idx}`} componentId={childList.componentId} ctx={childCtx} />;
  });
}

function A2UIComponentRenderer({ componentId, ctx }: { componentId: string; ctx: RendererCtx }): React.ReactNode {
  const comp = ctx.componentMap.get(componentId);
  if (!comp) return null;

  const flex = comp.weight ? { flex: comp.weight } : undefined;

  switch (comp.component) {
    case "Text": {
      const text = resolveString(comp.text, ctx.data, ctx.scope);
      const accentCls = comp.accent
        ? (comp.pill ? TEXT_ACCENT_PILL_CLASSES[comp.accent] : TEXT_ACCENT_CLASSES[comp.accent])
        : undefined;
      if (comp.pill) {
        return (
          <span key={comp.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider shrink-0 ${accentCls ?? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`} style={flex}>
            {text}
          </span>
        );
      }
      const variantCls = TEXT_VARIANT_CLASSES[comp.variant ?? "body"];
      return <span key={comp.id} className={`${variantCls} ${accentCls ?? ""}`.trim()} style={flex}>{text}</span>;
    }

    case "Image": {
      const url = resolveString(comp.url, ctx.data, ctx.scope);
      const fitCls = comp.fit === "cover" ? "object-cover" : comp.fit === "contain" ? "object-contain" : "object-cover";
      const variantCls =
        comp.variant === "avatar" ? "w-10 h-10 rounded-full" :
        comp.variant === "icon" ? "w-6 h-6" :
        comp.variant === "smallFeature" ? "w-16 h-16 rounded-lg" :
        comp.variant === "mediumFeature" ? "w-32 h-32 rounded-lg" :
        comp.variant === "largeFeature" ? "w-full max-h-48 rounded-lg" :
        comp.variant === "header" ? "w-full max-h-64 rounded-lg" :
        "w-full max-h-48 rounded-lg";
      return <Image key={comp.id} src={url} className={`${variantCls} ${fitCls}`} style={flex} alt="" />;
    }

    case "Icon": {
      const name = resolveString(comp.name, ctx.data, ctx.scope);
      const icon = ICON_SVG_MAP[name];
      if (icon) return <span key={comp.id} className="shrink-0 text-slate-500 dark:text-slate-400" style={flex}>{icon}</span>;
      // Fallback: render name as text
      return <span key={comp.id} className="text-xs text-slate-400 shrink-0" style={flex}>{name}</span>;
    }

    case "Row": {
      const justify = JUSTIFY_CLASSES[comp.justify ?? "start"];
      const align = ALIGN_CLASSES[comp.align ?? "center"];
      const gap = GAP_ROW_CLASSES[comp.gap ?? "sm"];
      return (
        <div key={comp.id} className={`flex flex-row ${gap} ${justify} ${align}`} style={flex}>
          {renderChildList(comp.children, ctx)}
        </div>
      );
    }

    case "Column": {
      const justify = JUSTIFY_CLASSES[comp.justify ?? "start"];
      const align = ALIGN_CLASSES[comp.align ?? "stretch"];
      const gap = GAP_COL_CLASSES[comp.gap ?? "sm"];
      return (
        <div key={comp.id} className={`flex flex-col ${gap} ${justify} ${align}`} style={flex}>
          {renderChildList(comp.children, ctx)}
        </div>
      );
    }

    case "Card": {
      const accentBorderMap: Record<string, string> = {
        success: "border-t-2 border-t-emerald-500",
        warning: "border-t-2 border-t-amber-500",
        error:   "border-t-2 border-t-red-500",
        info:    "border-t-2 border-t-blue-500",
        route:   "border-t-2 border-t-slate-500",
        primary: "border-t-2 border-t-amber-500",
        muted:   "",
      };
      const headerLabel = comp.label ? resolveString(comp.label, ctx.data, ctx.scope) : undefined;
      const cardAccentCls = comp.accent ? (accentBorderMap[comp.accent] ?? "") : "";
      return (
        <div key={comp.id} className={`bg-white dark:bg-[#12141c] rounded-xl border border-slate-200/60 dark:border-[#1c1f2e] overflow-hidden ${cardAccentCls}`} style={flex}>
          {headerLabel && (
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-[#191c28] flex items-center justify-between">
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">{headerLabel}</span>
            </div>
          )}
          <div className="p-4">
            <A2UIComponentRenderer componentId={comp.child} ctx={ctx} />
          </div>
        </div>
      );
    }

    case "List": {
      const dirCls = comp.direction === "horizontal" ? "flex flex-row gap-2 flex-wrap" : "flex flex-col gap-1.5";
      return (
        <div key={comp.id} className={dirCls} style={flex}>
          {renderChildList(comp.children, ctx)}
        </div>
      );
    }

    case "Divider": {
      return comp.axis === "vertical"
        ? <div key={comp.id} className="w-px bg-slate-200 dark:bg-[#1c1f2e] self-stretch mx-1" />
        : <hr key={comp.id} className="border-slate-200 dark:border-[#191c28] my-2" />;
    }

    case "Button": {
      const variantCls = BUTTON_VARIANT_CLASSES[comp.variant ?? "default"];
      const handleClick = () => {
        if (!comp.action || !ctx.onAction) return;
        if ("event" in comp.action) {
          const resolvedCtx: Record<string, unknown> = {};
          if (comp.action.event.context) {
            for (const [k, v] of Object.entries(comp.action.event.context)) {
              if (isDataBinding(v)) {
                resolvedCtx[k] = resolvePath(ctx.data, v.path, ctx.scope);
              } else {
                resolvedCtx[k] = v;
              }
            }
          }
          ctx.onAction({
            name: comp.action.event.name,
            surfaceId: ctx.surfaceId,
            context: resolvedCtx,
          });
        }
      };
      return (
        <button key={comp.id} className={variantCls} style={flex} onClick={handleClick}>
          <A2UIComponentRenderer componentId={comp.child} ctx={ctx} />
        </button>
      );
    }

    case "TextField": {
      const label = resolveString(comp.label, ctx.data, ctx.scope);
      const value = resolveString(comp.value, ctx.data, ctx.scope);
      const isLong = comp.variant === "longText";
      return (
        <div key={comp.id} className="flex flex-col gap-1" style={flex}>
          {label && <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>}
          {isLong ? (
            <textarea
              defaultValue={value}
              rows={3}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-[#252838] bg-slate-50 dark:bg-[#0e1019] text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
            />
          ) : (
            <input
              type={comp.variant === "number" ? "number" : comp.variant === "obscured" ? "password" : "text"}
              defaultValue={value}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-[#252838] bg-slate-50 dark:bg-[#0e1019] text-sm text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          )}
        </div>
      );
    }

    case "CheckBox": {
      const label = resolveString(comp.label, ctx.data, ctx.scope);
      const checked = resolveBoolean(comp.value, ctx.data, ctx.scope);
      return (
        <label key={comp.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer" style={flex}>
          <input type="checkbox" defaultChecked={checked} className="rounded border-slate-300 dark:border-slate-600" />
          {label}
        </label>
      );
    }

    case "Slider": {
      const label = resolveString(comp.label, ctx.data, ctx.scope);
      const value = resolveNumber(comp.value, ctx.data, ctx.scope);
      return (
        <div key={comp.id} className="flex flex-col gap-1" style={flex}>
          {label && <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>}
          <input
            type="range"
            defaultValue={value}
            min={comp.min ?? 0}
            max={comp.max ?? 100}
            className="w-full accent-amber-500"
          />
        </div>
      );
    }

    case "Tabs": {
      return <A2UITabsRenderer key={comp.id} comp={comp} ctx={ctx} />;
    }

    case "Modal":
    case "Video":
    case "AudioPlayer":
    case "ChoicePicker":
    case "DateTimeInput":
      // Placeholder for less common types
      return (
        <div key={comp.id} className="text-xs text-slate-400 italic p-2" style={flex}>
          [{comp.component}]
        </div>
      );

    default:
      return null;
  }
}

/** Tabs require internal state, so they're a separate React component */
function A2UITabsRenderer({ comp, ctx }: { comp: Extract<A2UIComponent, { component: "Tabs" }>; ctx: RendererCtx }) {
  const [activeIdx, setActiveIdx] = useState(0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 border-b border-slate-200/60 dark:border-[#191c28]">
        {comp.tabs.map((tab, idx) => {
          const title = resolveString(tab.title, ctx.data, ctx.scope);
          const isActive = idx === activeIdx;
          return (
            <button
              key={idx}
              onClick={() => setActiveIdx(idx)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                isActive
                  ? "border-amber-500 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {title}
            </button>
          );
        })}
      </div>
      <div>
        {comp.tabs[activeIdx] && (
          <A2UIComponentRenderer componentId={comp.tabs[activeIdx].child} ctx={ctx} />
        )}
      </div>
    </div>
  );
}

// ─── Surface renderer ─────────────────────────────────────────────

export interface A2UISurfaceRendererProps {
  surface: A2UISurface;
  onAction?: (action: { name: string; surfaceId: string; context?: Record<string, unknown> }) => void;
  className?: string;
}

export function A2UISurfaceRenderer({ surface, onAction, className }: A2UISurfaceRendererProps) {
  // Find root component (id === "root" or first component)
  const rootId = surface.rootId ?? "root";

  const ctx: RendererCtx = {
    componentMap: surface.components,
    data: surface.dataModel,
    scope: "",
    onAction,
    surfaceId: surface.surfaceId,
    theme: surface.theme,
  };

  return (
    <div className={className}>
      {surface.theme?.agentDisplayName && (
        <div className="flex items-center gap-2 mb-3">
          {surface.theme.iconUrl && (
            <Image src={surface.theme.iconUrl} className="w-5 h-5 rounded" alt="" />
          )}
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {surface.theme.agentDisplayName}
          </span>
        </div>
      )}
      <A2UIComponentRenderer componentId={rootId} ctx={ctx} />
    </div>
  );
}

// ─── Message processor ────────────────────────────────────────────

/**
 * Process an array of A2UI messages and produce surfaces.
 * This is the main entry point for consuming A2UI protocol output.
 */
export function processA2UIMessages(messages: A2UIMessage[]): Map<string, A2UISurface> {
  const surfaces = new Map<string, A2UISurface>();

  for (const msg of messages) {
    if ("createSurface" in msg) {
      const cs = msg.createSurface;
      surfaces.set(cs.surfaceId, {
        surfaceId: cs.surfaceId,
        catalogId: cs.catalogId,
        theme: cs.theme,
        components: new Map(),
        dataModel: {},
      });
    } else if ("updateComponents" in msg) {
      const uc = msg.updateComponents;
      const surface = surfaces.get(uc.surfaceId);
      if (surface) {
        for (const comp of uc.components) {
          surface.components.set(comp.id, comp);
          if (comp.id === "root") {
            surface.rootId = "root";
          }
        }
      }
    } else if ("updateDataModel" in msg) {
      const udm = msg.updateDataModel;
      const surface = surfaces.get(udm.surfaceId);
      if (surface) {
        if (!udm.path || udm.path === "/") {
          surface.dataModel = (udm.value as Record<string, unknown>) ?? {};
        } else {
          // Set value at path
          const segments = udm.path.split("/").filter(Boolean);
          let current: Record<string, unknown> = surface.dataModel;
          for (let i = 0; i < segments.length - 1; i++) {
            const seg = segments[i];
            if (!(seg in current) || typeof current[seg] !== "object") {
              current[seg] = {};
            }
            current = current[seg] as Record<string, unknown>;
          }
          const lastSeg = segments[segments.length - 1];
          if (udm.value === undefined) {
            delete current[lastSeg];
          } else {
            current[lastSeg] = udm.value;
          }
        }
      }
    } else if ("deleteSurface" in msg) {
      surfaces.delete(msg.deleteSurface.surfaceId);
    }
  }

  return surfaces;
}

// ─── Multi-surface viewer ─────────────────────────────────────────

export interface A2UIViewerProps {
  /** Raw A2UI protocol messages */
  messages: A2UIMessage[];
  /** Called when user triggers an action (button click, form submit, etc.) */
  onAction?: (action: { name: string; surfaceId: string; context?: Record<string, unknown> }) => void;
  className?: string;
}

/**
 * A2UIViewer — renders one or more A2UI surfaces from protocol messages.
 * Drop-in replacement for @copilotkit/a2ui-renderer in React contexts.
 */
export function A2UIViewer({ messages, onAction, className }: A2UIViewerProps) {
  const surfaces = React.useMemo(() => processA2UIMessages(messages), [messages]);
  const surfaceList = Array.from(surfaces.values());

  if (surfaceList.length === 0) return null;

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      {surfaceList.map((surface) => (
        <A2UISurfaceRenderer
          key={surface.surfaceId}
          surface={surface}
          onAction={onAction}
        />
      ))}
    </div>
  );
}
