import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";

import featureSurfaceMetadata from "./feature-surface-metadata";

const { buildApiLookupKey, normalizeSurfaceMetadata } = featureSurfaceMetadata;

const FEATURE_TREE_PATH = "docs/product-specs/FEATURE_TREE.md";
const FEATURE_TREE_INDEX_PATH = "docs/product-specs/feature-tree.index.json";

export interface CapabilityGroup {
  id: string;
  name: string;
  description: string;
}

export interface FeatureTreeFeature {
  id: string;
  name: string;
  group: string;
  summary: string;
  status: string;
  pages: string[];
  apis: string[];
  sourceFiles: string[];
  relatedFeatures: string[];
  domainObjects: string[];
}

export interface FrontendPageDetail {
  name: string;
  route: string;
  description: string;
  sourceFile: string;
}

export interface ApiEndpointDetail {
  group: string;
  method: string;
  endpoint: string;
  description: string;
  nextjsSourceFiles?: string[];
  rustSourceFiles?: string[];
  implementationSources?: Array<{
    label: string;
    sourceFiles: string[];
  }>;
}

export interface ApiImplementationDetail {
  label: string;
  group: string;
  method: string;
  endpoint: string;
  sourceFiles: string[];
}

export interface FeatureTree {
  capabilityGroups: CapabilityGroup[];
  features: FeatureTreeFeature[];
  frontendPages: FrontendPageDetail[];
  apiEndpoints: ApiEndpointDetail[];
  nextjsApiEndpoints: ApiImplementationDetail[];
  rustApiEndpoints: ApiImplementationDetail[];
  implementationApiEndpoints: ApiImplementationDetail[];
}

export type FeatureTreeParsed = FeatureTree;

interface FeatureMetadataRaw {
  schemaVersion?: number;
  capability_groups?: CapabilityGroup[];
  capabilityGroups?: CapabilityGroup[];
  features?: Array<{
    id?: string;
    name?: string;
    group?: string;
    summary?: string;
    status?: string;
    pages?: string[];
    apis?: string[];
    source_files?: string[];
    sourceFiles?: string[];
    related_features?: string[];
    relatedFeatures?: string[];
    domain_objects?: string[];
    domainObjects?: string[];
  }>;
}

interface FeatureTreeFrontmatter {
  feature_metadata?: FeatureMetadataRaw;
}

interface FeatureTreeIndexPayload {
  metadata?: {
    schemaVersion?: number;
    capabilityGroups?: CapabilityGroup[];
    features?: Array<{
      id?: string;
      name?: string;
      group?: string;
      summary?: string;
      status?: string;
      pages?: string[];
      apis?: string[];
      sourceFiles?: string[];
      source_files?: string[];
      relatedFeatures?: string[];
      related_features?: string[];
      domainObjects?: string[];
      domain_objects?: string[];
    }>;
  };
  pages?: Array<{
    route?: string;
    title?: string;
    description?: string;
    sourceFile?: string;
  }>;
  apis?: Array<{
    domain?: string;
    method?: string;
    path?: string;
    summary?: string;
  }>;
  contractApis?: Array<{
    domain?: string;
    method?: string;
    path?: string;
    summary?: string;
  }>;
  nextjsApis?: Array<{
    label?: string;
    domain?: string;
    method?: string;
    path?: string;
    sourceFiles?: string[];
  }>;
  rustApis?: Array<{
    label?: string;
    domain?: string;
    method?: string;
    path?: string;
    sourceFiles?: string[];
  }>;
  implementationApis?: Array<{
    label?: string;
    domain?: string;
    method?: string;
    path?: string;
    sourceFiles?: string[];
  }>;
}

function extractFrontmatter(raw: string): string | null {
  const trimmed = raw.replace(/^\uFEFF/, "");
  const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match ? match[1] ?? null : null;
}

function readFeatureTreeContent(repoRoot: string): string | null {
  const featureTreePath = path.join(repoRoot, FEATURE_TREE_PATH);
  if (!fs.existsSync(featureTreePath)) {
    return null;
  }
  return fs.readFileSync(featureTreePath, "utf8");
}

function readFeatureTreeIndex(repoRoot: string): FeatureTreeIndexPayload | null {
  const indexPath = path.join(repoRoot, FEATURE_TREE_INDEX_PATH);
  if (!fs.existsSync(indexPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(indexPath, "utf8");
    const parsed = JSON.parse(raw) as FeatureTreeIndexPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseMarkdownRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return null;
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function stripCodeCell(value: string): string {
  return value.trim().replace(/^`+|`+$/g, "");
}

function normalizeDomainHeading(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeImplementationLabel(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }

  const parts = normalized.split(/\s+/);
  if (parts.join("") === "nextjs") {
    return "nextjs";
  }

  return parts
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

function implementationSectionLabelFromHeading(heading: string): string | null {
  const match = heading
    .trim()
    .match(/^##\s+(.+?)\s+(?:API Routes|API Route Sources|API Source Files)$/u);
  if (!match) {
    return null;
  }

  const label = normalizeImplementationLabel(match[1] ?? "");
  return label || null;
}

function parseSourceFilesCell(value: string): string[] {
  const codeMatches = [...value.matchAll(/`([^`]+)`/g)]
    .map((match) => stripCodeCell(match[1] ?? ""))
    .filter(Boolean);
  if (codeMatches.length > 0) {
    return [...new Set(codeMatches)];
  }

  return value
    .split(",")
    .map((part) => stripCodeCell(part))
    .filter(Boolean);
}

function parseFeatureTreeTables(raw: string): {
  frontendPages: FrontendPageDetail[];
  apiEndpoints: ApiEndpointDetail[];
  nextjsApiEndpoints: ApiImplementationDetail[];
  rustApiEndpoints: ApiImplementationDetail[];
  implementationApiEndpoints: ApiImplementationDetail[];
} {
  const frontendPages: FrontendPageDetail[] = [];
  const apiEndpoints: ApiEndpointDetail[] = [];
  const nextjsApiEndpoints: ApiImplementationDetail[] = [];
  const rustApiEndpoints: ApiImplementationDetail[] = [];
  const implementationApiEndpoints: ApiImplementationDetail[] = [];

  let section: "frontend" | "contract" | "implementation" | null = null;
  let inTable = false;
  let currentApiGroup = "";
  let currentImplementationLabel = "";

  const frontMarker = "## Frontend Pages";
  const apiMarkers = new Set(["## API Endpoints", "## API Contract Endpoints", "## HTTP Contract Endpoints"]);
  const nextjsMarkers = new Set(["## Next.js API Routes", "## Next.js-only API Routes"]);
  const rustMarkers = new Set(["## Rust API Routes", "## Rust-only API Routes"]);

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();

    if (trimmed === frontMarker) {
      section = "frontend";
      inTable = false;
      continue;
    }

    if (apiMarkers.has(trimmed)) {
      section = "contract";
      inTable = false;
      continue;
    }

    if (nextjsMarkers.has(trimmed)) {
      section = "implementation";
      inTable = false;
      currentImplementationLabel = "nextjs";
      continue;
    }

    if (rustMarkers.has(trimmed)) {
      section = "implementation";
      inTable = false;
      currentImplementationLabel = "rust";
      continue;
    }

    const implementationLabel = implementationSectionLabelFromHeading(trimmed);
    if (implementationLabel) {
      section = "implementation";
      inTable = false;
      currentImplementationLabel = implementationLabel;
      continue;
    }

    if (trimmed.startsWith("## ") && trimmed !== frontMarker && !apiMarkers.has(trimmed) && !nextjsMarkers.has(trimmed) && !rustMarkers.has(trimmed)) {
      section = null;
      inTable = false;
      currentImplementationLabel = "";
      continue;
    }

    if (section === "frontend") {
      if (trimmed === "| Page | Route | Description |" || trimmed === "| Page | Route | Source File | Description |") {
        inTable = true;
        continue;
      }

      if (!trimmed) {
        inTable = false;
        continue;
      }

      if (!inTable) {
        continue;
      }

      if (trimmed === "|------|-------|-------------|" || trimmed === "|------|-------|-------------|-------------|") {
        continue;
      }

      const cells = parseMarkdownRow(trimmed);
      if (cells && cells.length >= 3) {
        frontendPages.push({
          name: cells[0] ?? "",
          route: stripCodeCell(cells[1] ?? ""),
          sourceFile: cells.length >= 4 ? stripCodeCell(cells[2] ?? "") : "",
          description: cells.length >= 4 ? (cells[3] ?? "") : (cells[2] ?? ""),
        });
      }
      continue;
    }

    if (section === "contract" || section === "implementation") {
      if (trimmed.startsWith("### ")) {
        currentApiGroup = normalizeDomainHeading(trimmed
          .replace(/^###\s+/, "")
          .replace(/\s+\(\d+\)\s*$/, "")
          .trim());
        inTable = false;
        continue;
      }

      if (
        trimmed === "| Method | Endpoint | Description |"
        || trimmed === "| Method | Endpoint | Details |"
        || trimmed === "| Method | Endpoint | Details | Next.js | Rust |"
        || trimmed === "| Method | Endpoint | Source Files |"
      ) {
        inTable = true;
        continue;
      }

      if (!trimmed) {
        inTable = false;
        continue;
      }

      if (!inTable) {
        continue;
      }

      if (
        trimmed === "|--------|----------|-------------|"
        || trimmed === "|--------|----------|---------|"
        || trimmed === "|--------|----------|---------|---------|------|"
        || trimmed === "|--------|----------|--------------|"
      ) {
        continue;
      }

      const cells = parseMarkdownRow(trimmed);
      if (cells && cells.length >= 3) {
        if (section === "contract") {
          const nextjsSourceFiles = cells.length >= 5 ? parseSourceFilesCell(cells[3] ?? "") : [];
          const rustSourceFiles = cells.length >= 5 ? parseSourceFilesCell(cells[4] ?? "") : [];
          apiEndpoints.push({
            group: currentApiGroup,
            method: cells[0] ?? "",
            endpoint: stripCodeCell(cells[1] ?? ""),
            description: cells[2] ?? "",
            ...(nextjsSourceFiles.length > 0 ? { nextjsSourceFiles } : {}),
            ...(rustSourceFiles.length > 0 ? { rustSourceFiles } : {}),
          });

          if (nextjsSourceFiles.length > 0) {
            const nextjsApi = {
              label: "nextjs",
              group: currentApiGroup,
              method: cells[0] ?? "",
              endpoint: stripCodeCell(cells[1] ?? ""),
              sourceFiles: nextjsSourceFiles,
            };
            nextjsApiEndpoints.push(nextjsApi);
            implementationApiEndpoints.push(nextjsApi);
          }

          if (rustSourceFiles.length > 0) {
            const rustApi = {
              label: "rust",
              group: currentApiGroup,
              method: cells[0] ?? "",
              endpoint: stripCodeCell(cells[1] ?? ""),
              sourceFiles: rustSourceFiles,
            };
            rustApiEndpoints.push(rustApi);
            implementationApiEndpoints.push(rustApi);
          }
        } else {
          const implementationApi = {
            label: currentImplementationLabel || "implementation",
            group: currentApiGroup,
            method: cells[0] ?? "",
            endpoint: stripCodeCell(cells[1] ?? ""),
            sourceFiles: parseSourceFilesCell(cells[2] ?? ""),
          };
          implementationApiEndpoints.push(implementationApi);
          if (implementationApi.label === "nextjs") {
            nextjsApiEndpoints.push(implementationApi);
          } else if (implementationApi.label === "rust") {
            rustApiEndpoints.push(implementationApi);
          }
        }
      }
    }
  }

  return {
    frontendPages,
    apiEndpoints,
    nextjsApiEndpoints,
    rustApiEndpoints,
    implementationApiEndpoints,
  };
}

function toFrontendPagesFromIndex(payload: FeatureTreeIndexPayload | null): FrontendPageDetail[] {
  if (!payload?.pages || !Array.isArray(payload.pages)) {
    return [];
  }

  return payload.pages
    .map((page) => ({
      name: page.title?.trim() ?? "",
      route: page.route?.trim() ?? "",
      description: page.description?.trim() ?? "",
      sourceFile: page.sourceFile?.trim() ?? "",
    }))
    .filter((page) => page.name && page.route);
}

function toApiEndpointsFromIndex(payload: FeatureTreeIndexPayload | null): ApiEndpointDetail[] {
  const source = Array.isArray(payload?.contractApis) ? payload?.contractApis : payload?.apis;
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((api) => ({
      group: api.domain?.trim() ?? "",
      method: api.method?.trim() ?? "",
      endpoint: api.path?.trim() ?? "",
      description: api.summary?.trim() ?? "",
    }))
    .filter((api) => api.method && api.endpoint);
}

function toImplementationApiEndpoints(
  source:
    | FeatureTreeIndexPayload["nextjsApis"]
    | FeatureTreeIndexPayload["rustApis"]
    | FeatureTreeIndexPayload["implementationApis"],
  fallbackLabel?: string,
): ApiImplementationDetail[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((api) => ({
      label: normalizeImplementationLabel(api.label?.trim() ?? fallbackLabel ?? "implementation"),
      group: api.domain?.trim() ?? "",
      method: api.method?.trim() ?? "",
      endpoint: api.path?.trim() ?? "",
      sourceFiles: Array.isArray(api.sourceFiles)
        ? api.sourceFiles.map((file) => file.trim()).filter(Boolean)
        : [],
    }))
    .filter((api) => api.label && api.method && api.endpoint);
}

function mergeImplementationApiEndpoints(...lists: ApiImplementationDetail[][]): ApiImplementationDetail[] {
  const merged = new Map<string, ApiImplementationDetail>();

  for (const api of lists.flat()) {
    const key = `${api.label}:${buildApiLookupKey(api.method, api.endpoint)}`;
    const existing = merged.get(key);
    if (existing) {
      existing.sourceFiles = [...new Set([...existing.sourceFiles, ...api.sourceFiles])].sort();
      if (!existing.group && api.group) {
        existing.group = api.group;
      }
      continue;
    }

    merged.set(key, {
      label: api.label,
      group: api.group,
      method: api.method,
      endpoint: api.endpoint,
      sourceFiles: [...new Set(api.sourceFiles)].sort(),
    });
  }

  return [...merged.values()].sort((left, right) =>
    left.label.localeCompare(right.label)
    || left.group.localeCompare(right.group)
    || left.endpoint.localeCompare(right.endpoint)
    || left.method.localeCompare(right.method),
  );
}

function toSurfaceMetadata(
  featureMetadata: FeatureMetadataRaw | FeatureTreeIndexPayload["metadata"] | null | undefined,
) {
  if (!featureMetadata) {
    return null;
  }

  const capabilityGroups = Array.isArray((featureMetadata as FeatureMetadataRaw).capability_groups)
    ? (featureMetadata as FeatureMetadataRaw).capability_groups ?? []
    : Array.isArray((featureMetadata as { capabilityGroups?: CapabilityGroup[] }).capabilityGroups)
      ? (featureMetadata as { capabilityGroups?: CapabilityGroup[] }).capabilityGroups ?? []
      : [];
  const features = Array.isArray(featureMetadata.features)
    ? featureMetadata.features
    : [];

  return {
    schemaVersion: typeof featureMetadata.schemaVersion === "number" ? featureMetadata.schemaVersion : 1,
    capabilityGroups: capabilityGroups.map((group: CapabilityGroup) => ({
      id: group.id ?? "",
      name: group.name ?? "",
      description: group.description ?? "",
    })),
    features: features.map((feature) => ({
      id: feature.id ?? "",
      name: feature.name ?? "",
      group: feature.group ?? "",
      summary: feature.summary ?? "",
      status: feature.status ?? "",
      pages: Array.isArray(feature.pages) ? [...feature.pages] : [],
      apis: Array.isArray(feature.apis) ? [...feature.apis] : [],
      sourceFiles: Array.isArray(feature.source_files)
        ? [...feature.source_files]
        : Array.isArray(feature.sourceFiles)
          ? [...feature.sourceFiles]
          : [],
      relatedFeatures: Array.isArray(feature.related_features)
        ? [...feature.related_features]
        : Array.isArray(feature.relatedFeatures)
          ? [...feature.relatedFeatures]
          : [],
      domainObjects: Array.isArray(feature.domain_objects)
        ? [...feature.domain_objects]
        : Array.isArray(feature.domainObjects)
          ? [...feature.domainObjects]
          : [],
    })),
  };
}

export function parseFeatureTree(repoRoot: string): FeatureTree {
  const raw = readFeatureTreeContent(repoRoot);
  const index = readFeatureTreeIndex(repoRoot);
  let metadata = toSurfaceMetadata(index?.metadata);

  if (raw) {
    const frontmatter = extractFrontmatter(raw);
    if (frontmatter) {
      try {
        const parsed = yaml.load(frontmatter) as FeatureTreeFrontmatter | null;
        metadata = toSurfaceMetadata(parsed?.feature_metadata) ?? metadata;
      } catch {
        // Fall back to generated index data or empty metadata when older markdown cannot be parsed.
      }
    }
  }

  const fallbackTables = raw
    ? parseFeatureTreeTables(raw)
    : {
        frontendPages: [],
        apiEndpoints: [],
        nextjsApiEndpoints: [],
        rustApiEndpoints: [],
        implementationApiEndpoints: [],
      };
  const frontendPages = toFrontendPagesFromIndex(index);
  const apiEndpoints = toApiEndpointsFromIndex(index);
  const nextjsApiEndpoints = toImplementationApiEndpoints(index?.nextjsApis, "nextjs");
  const rustApiEndpoints = toImplementationApiEndpoints(index?.rustApis, "rust");
  const implementationApiEndpoints = toImplementationApiEndpoints(index?.implementationApis);
  const resolvedFrontendPages = frontendPages.length > 0 ? frontendPages : fallbackTables.frontendPages;
  const resolvedApiEndpoints = apiEndpoints.length > 0 ? apiEndpoints : fallbackTables.apiEndpoints;
  const resolvedNextjsApiEndpoints = nextjsApiEndpoints.length > 0 ? nextjsApiEndpoints : fallbackTables.nextjsApiEndpoints;
  const resolvedRustApiEndpoints = rustApiEndpoints.length > 0 ? rustApiEndpoints : fallbackTables.rustApiEndpoints;
  const resolvedImplementationApiEndpoints = mergeImplementationApiEndpoints(
    implementationApiEndpoints,
    resolvedNextjsApiEndpoints,
    resolvedRustApiEndpoints,
    fallbackTables.implementationApiEndpoints,
  );
  const normalizedMetadata = normalizeSurfaceMetadata({
    metadata,
    pages: resolvedFrontendPages.map((page) => ({
      route: page.route,
      title: page.name,
      description: page.description,
      sourceFile: page.sourceFile,
    })),
    contractApis: resolvedApiEndpoints.map((api) => ({
      domain: api.group,
      method: api.method,
      path: api.endpoint,
      summary: api.description,
    })),
    nextjsApis: resolvedNextjsApiEndpoints.map((api) => ({
      domain: api.group,
      method: api.method,
      path: api.endpoint,
      sourceFiles: api.sourceFiles,
    })),
    rustApis: resolvedRustApiEndpoints.map((api) => ({
      domain: api.group,
      method: api.method,
      path: api.endpoint,
      sourceFiles: api.sourceFiles,
    })),
    implementationApis: resolvedImplementationApiEndpoints.map((api) => ({
      domain: api.group,
      method: api.method,
      path: api.endpoint,
      sourceFiles: api.sourceFiles,
    })),
  });

  return {
    capabilityGroups: (normalizedMetadata?.capabilityGroups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description ?? "",
    })),
    features: (normalizedMetadata?.features ?? []).map((feature) => ({
      id: feature.id,
      name: feature.name,
      group: feature.group ?? "",
      summary: feature.summary ?? "",
      status: feature.status ?? "",
      pages: Array.isArray(feature.pages) ? [...feature.pages] : [],
      apis: Array.isArray(feature.apis) ? [...feature.apis] : [],
      sourceFiles: Array.isArray(feature.sourceFiles) ? [...feature.sourceFiles] : [],
      relatedFeatures: Array.isArray(feature.relatedFeatures) ? [...feature.relatedFeatures] : [],
      domainObjects: Array.isArray(feature.domainObjects) ? [...feature.domainObjects] : [],
    })),
    frontendPages: resolvedFrontendPages,
    apiEndpoints: resolvedApiEndpoints,
    nextjsApiEndpoints: resolvedNextjsApiEndpoints,
    rustApiEndpoints: resolvedRustApiEndpoints,
    implementationApiEndpoints: resolvedImplementationApiEndpoints,
  };
}
