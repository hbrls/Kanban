import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as lucide from "lucide-react";
import { absolutize, normalize, parsePath, serialize } from "path-data-parser";

export type IconFingerprint = string;

type IconNode = [string, Record<string, unknown>] | [string, Record<string, unknown>, unknown[]];

type LucideNode = {
  type: string;
  props?: Record<string, unknown>;
};

const ICN_DIR = path.resolve(process.cwd(), "node_modules", "lucide-react", "dist", "esm", "icons");
const SIGNATURE_TAG_ORDER = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "g"]);

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return undefined;
}

function toCanonicalPath(value: string): string {
  try {
    const absolute = absolutize(parsePath(value));
    const normalized = normalize(absolute);
    let originX = 0;
    let originY = 0;

    const shifted = normalized.map((segment) => {
      const command = segment.key;
      if (command === "M") {
        const [x, y] = segment.data;
        originX = x;
        originY = y;
        return { ...segment, data: [0, 0] };
      }

      if (command === "Z") {
        return segment;
      }

      if (command === "L" || command === "C") {
        const data = segment.data.map((point, index) => (index % 2 === 0 ? point - originX : point - originY));
        return { ...segment, data };
      }

      return segment;
    });

    return serialize(shifted);
  } catch {
    return normalizeWhitespace(value);
  }
}

function normalizeChildren(child: unknown): unknown[] {
  if (!child) return [];
  if (Array.isArray(child)) {
    if (child.length >= 2 && typeof child[0] === "string") {
      return [child];
    }
    return child.flatMap(normalizeChildren);
  }
  return [child];
}

function extractIconNodeFromArray(node: unknown): IconNode | undefined {
  if (!Array.isArray(node) || node.length < 2) return undefined;
  const [tag, props] = node;
  if (typeof tag !== "string" || typeof props !== "object" || props === null) {
    return undefined;
  }
  return [tag, props as Record<string, unknown>];
}

function tagSignature(tag: string, props: Record<string, unknown>): string | undefined {
  if (tag === "g") {
    const next = normalizeChildren((props as { children?: unknown }).children)
      .map((item) => fromNode(item))
      .filter((entry): entry is string => Boolean(entry));

    if (next.length === 0) return undefined;
    return `g(${next.join("|")})`;
  }

  if (!SIGNATURE_TAG_ORDER.has(tag)) {
    return undefined;
  }

  const parts: string[] = [];

  if (tag === "path") {
    const d = normalizeValue(props.d);
    if (!d) return undefined;
    const normalizedD = toCanonicalPath(d);
    parts.push(`d=${normalizedD}`);
    const fillRule = normalizeValue((props as { fillRule?: unknown }).fillRule);
    if (fillRule) parts.push(`fillRule=${fillRule}`);
    const clipRule = normalizeValue((props as { clipRule?: unknown }).clipRule);
    if (clipRule) parts.push(`clipRule=${clipRule}`);
    if (!parts.some((item) => item.startsWith("d="))) return undefined;
  }

  if (tag === "circle" || tag === "ellipse") {
    const keys = ["cx", "cy", "r", "rx", "ry"];
    for (const key of keys) {
      const value = normalizeValue(props[key]);
      if (value) parts.push(`${key}=${value}`);
    }
    if (tag === "circle" && !parts.some((item) => item.startsWith("r="))) return undefined;
    if (tag === "ellipse" && (!parts.some((item) => item.startsWith("rx=")) || !parts.some((item) => item.startsWith("ry=")))) {
      return undefined;
    }
  }

  if (tag === "rect") {
    const keys = ["x", "y", "width", "height", "rx", "ry"];
    for (const key of keys) {
      const value = normalizeValue(props[key]);
      if (value) parts.push(`${key}=${value}`);
    }
    if (!parts.some((item) => item.startsWith("width=")) || !parts.some((item) => item.startsWith("height="))) {
      return undefined;
    }
  }

  if (tag === "line") {
    const keys = ["x1", "y1", "x2", "y2"];
    for (const key of keys) {
      const value = normalizeValue(props[key]);
      if (value) parts.push(`${key}=${value}`);
    }
    if (!keys.every((key) => parts.some((item) => item.startsWith(`${key}=`)))) return undefined;
  }

  if (tag === "polyline" || tag === "polygon") {
    const value = normalizeValue(props.points);
    if (!value) return undefined;
    parts.push(`points=${value}`);
  }

  const signature = `${tag}(${parts.sort().join(",")})`;
  return signature;
}

function fromNode(node: unknown): string | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }

  if (Array.isArray(node)) {
    const iconNode = extractIconNodeFromArray(node);
    if (!iconNode) return undefined;
    return tagSignature(iconNode[0], iconNode[1]);
  }

  const anyNode = node as LucideNode;
  if (typeof anyNode.type !== "string" || !anyNode.props) {
    return undefined;
  }
  return tagSignature(anyNode.type, anyNode.props);
}

function parseIconNode(iconNode: unknown): string[] {
  if (!Array.isArray(iconNode)) return [];
  const children = iconNode
    .map((item) => fromNode(item))
    .filter((entry): entry is string => Boolean(entry));
  return children;
}

function pickExportedIconName(iconName: string): string | undefined {
  if ((lucide as Record<string, unknown>)[iconName]) return iconName;
  const suffixName = `${iconName}Icon`;
  if ((lucide as Record<string, unknown>)[suffixName]) return suffixName;
  return undefined;
}

function resolveNameFromFilename(source: string): string | undefined {
  const match = source.match(/export\s*\{\s*__iconNode,\s*([A-Za-z0-9_]+)\s+as\s+default\s*\}/);
  if (!match?.[1]) return undefined;
  return match[1];
}

function extractIconNodeText(source: string): string | undefined {
  const match = source.match(/const\s+__iconNode\s*=\s*(\[[\s\S]*\]);/);
  if (!match?.[1]) return undefined;
  return match[1];
}

export function buildLucideIconMap(): Record<IconFingerprint, string> {
  if (!fs.existsSync(ICN_DIR)) {
    throw new Error(`lucide-react icon directory not found: ${ICN_DIR}`);
  }

  const files = fs
    .readdirSync(ICN_DIR)
    .filter((entry) => entry.endsWith(".js"))
    .map((entry) => path.resolve(ICN_DIR, entry));

  const map: Record<string, string> = {};

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const iconName = resolveNameFromFilename(source);
    const iconNodeText = extractIconNodeText(source);

    if (!iconName || !iconNodeText) continue;

    const exportedName = pickExportedIconName(iconName);
    if (!exportedName) continue;

    let iconNode: unknown;
    try {
      const script = new vm.Script(`(${iconNodeText})`, { filename: file });
      iconNode = script.runInNewContext(Object.create(null));
    } catch {
      continue;
    }

    const children = parseIconNode(iconNode);
    if (children.length === 0) continue;

    const signature = `0 0 24 24::${children.join("|")}`;
    if (!(signature in map)) {
      map[signature] = exportedName;
    }
  }

  return map;
}
