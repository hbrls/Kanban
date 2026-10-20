import { loadYamlFile } from "./yaml";
import { fromRoot } from "./paths";

export const OPENAPI_HTTP_METHODS = ["get", "post", "put", "delete", "patch", "options", "head"] as const;

export type OpenApiMethodName = typeof OPENAPI_HTTP_METHODS[number];

export type OpenApiOperation = Record<string, unknown> & {
  operationId?: string;
  summary?: string;
  requestBody?: unknown;
  responses?: Record<string, unknown>;
};

export type OpenApiDocument = {
  openapi: string;
  info: { version: string; title: string };
  components?: {
    schemas?: Record<string, unknown>;
  };
  paths?: Record<string, Record<string, OpenApiOperation>>;
};

export type RouteEndpoint = {
  method: string;
  path: string;
};

export function loadOpenApiContract(): OpenApiDocument {
  const contractPath = fromRoot("api-contract.yaml");
  const contract = loadYamlFile<OpenApiDocument>(contractPath);
  if (!contract) {
    throw new Error(`api-contract.yaml not found at ${contractPath}`);
  }
  return contract;
}

export function extractRefs(obj: unknown, refs: Set<string> = new Set()): Set<string> {
  if (!obj || typeof obj !== "object") {
    return refs;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractRefs(item, refs);
    }
    return refs;
  }
  const record = obj as Record<string, unknown>;
  if (typeof record.$ref === "string") {
    refs.add(record.$ref);
  }
  for (const value of Object.values(record)) {
    extractRefs(value, refs);
  }
  return refs;
}

export function normalizeComponentSchemaRefs(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") {
    return schema;
  }
  if (Array.isArray(schema)) {
    return schema.map(normalizeComponentSchemaRefs);
  }
  const record = schema as Record<string, unknown>;
  if (typeof record.$ref === "string") {
    return { $ref: record.$ref.replace(/^#\/components\/schemas\//, "#/$defs/") };
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = normalizeComponentSchemaRefs(value);
  }
  return result;
}

export function listContractEndpoints(contract: OpenApiDocument): RouteEndpoint[] {
  const endpoints: RouteEndpoint[] = [];
  for (const [apiPath, methods] of Object.entries(contract.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!OPENAPI_HTTP_METHODS.includes(method as OpenApiMethodName)) {
        continue;
      }
      if (!operation || typeof operation !== "object") {
        continue;
      }
      endpoints.push({
        method: method.toUpperCase(),
        path: apiPath,
      });
    }
  }
  return endpoints;
}

export function collectSchemaUsage(
  contract: OpenApiDocument,
): Record<string, { responses: string[]; requests: string[] }> {
  const usage: Record<string, { responses: string[]; requests: string[] }> = {};

  for (const [apiPath, methods] of Object.entries(contract.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!OPENAPI_HTTP_METHODS.includes(method as OpenApiMethodName)) continue;
      if (!operation || typeof operation !== "object") continue;

      const op = operation as OpenApiOperation;
      const opId = op.operationId ?? `${method.toUpperCase()}:${apiPath}`;

      for (const responseObj of Object.values(op.responses ?? {})) {
        const refs = extractRefs(responseObj);
        for (const ref of refs) {
          const match = ref.match(/^#\/components\/schemas\/(.+)$/);
          if (!match) continue;
          const name = match[1];
          if (!usage[name]) usage[name] = { responses: [], requests: [] };
          usage[name].responses.push(opId);
        }
      }

      for (const ref of extractRefs(op.requestBody)) {
        const match = ref.match(/^#\/components\/schemas\/(.+)$/);
        if (!match) continue;
        const name = match[1];
        if (!usage[name]) usage[name] = { responses: [], requests: [] };
        usage[name].requests.push(opId);
      }
    }
  }

  return usage;
}
