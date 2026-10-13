#!/usr/bin/env node
/**
 * OpenAPI Schema Validator (Static Analysis)
 *
 * Validates the api-contract.yaml for internal consistency and generates a
 * schema coverage report. Runs WITHOUT requiring a live server.
 *
 * Checks:
 *   1. All $ref references resolve to existing component schemas
 *   2. All operationIds are unique
 *   3. All response schemas are valid JSON Schema (compilable by AJV)
 *   4. Request body schemas are valid for mutating operations
 *   5. Enum schemas have at least one allowed value
 *   6. Required fields on objects reference defined properties
 *   7. Generates a schema coverage report
 *
 * Usage:
 *   node --import tsx scripts/fitness/validate-openapi-schema.ts
 *   node --import tsx scripts/fitness/validate-openapi-schema.ts --json
 *   node --import tsx scripts/fitness/validate-openapi-schema.ts --report
 */

import { getCliArgs, isDirectExecution } from "../lib/cli";
import {
  collectSchemaUsage,
  extractRefs,
  loadOpenApiContract,
  normalizeComponentSchemaRefs,
  OPENAPI_HTTP_METHODS,
  type OpenApiDocument,
} from "../lib/openapi-contract";

import Ajv from "ajv";
import addFormats from "ajv-formats";

const args = getCliArgs();
const jsonMode = args.has("--json");
const reportMode = args.has("--report");

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
interface ValidationIssue {
  severity: "error" | "warning" | "info";
  location: string;
  message: string;
}

interface SchemaReport {
  contractVersion: string;
  totalPaths: number;
  totalOperations: number;
  totalSchemas: number;
  operationsWithRequestSchema: number;
  operationsWithResponseSchema: number;
  issues: ValidationIssue[];
  schemaCoverage: {
    schemaName: string;
    usedInResponses: string[];
    usedInRequests: string[];
  }[];
}

// ─────────────────────────────────────────────────────────
// Main validation
// ─────────────────────────────────────────────────────────
export function validateContract(contract: OpenApiDocument): SchemaReport {
  const issues: ValidationIssue[] = [];
  const componentSchemas = contract.components?.schemas ?? {};

  // ── Check 1: All $refs resolve ──
  const allRefs = extractRefs(contract.paths);
  for (const ref of allRefs) {
    const match = ref.match(/^#\/components\/schemas\/(.+)$/);
    if (match && !componentSchemas[match[1]]) {
      issues.push({
        severity: "error",
        location: ref,
        message: `$ref references undefined schema "${match[1]}"`,
      });
    }
  }

  // ── Check 2: operationIds are unique ──
  const operationIds = new Map<string, string[]>();
  for (const [apiPath, methods] of Object.entries(contract.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!OPENAPI_HTTP_METHODS.includes(method.toLowerCase() as (typeof OPENAPI_HTTP_METHODS)[number])) continue;
      if (!operation || typeof operation !== "object") continue;
      const op = operation as Record<string, unknown>;
      if (op.operationId) {
        const id = op.operationId as string;
        if (!operationIds.has(id)) operationIds.set(id, []);
        operationIds.get(id)!.push(`${method.toUpperCase()} ${apiPath}`);
      } else {
        issues.push({
          severity: "warning",
          location: `${method.toUpperCase()} ${apiPath}`,
          message: "Operation is missing operationId",
        });
      }
    }
  }
  for (const [id, locations] of operationIds) {
    if (locations.length > 1) {
      issues.push({
        severity: "error",
        location: locations.join(", "),
        message: `Duplicate operationId "${id}"`,
      });
    }
  }

  // ── Check 3: All response schemas compile with AJV ──
  const normalizedDefs: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(componentSchemas)) {
    normalizedDefs[name] = normalizeComponentSchemaRefs(schema);
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  for (const [schemaName, schema] of Object.entries(componentSchemas)) {
    try {
      // Wrap each schema alongside $defs so internal $refs like #/$defs/X resolve
      const wrappedSchema = {
        $defs: normalizedDefs,
        ...(normalizeComponentSchemaRefs(schema) as object),
      };
      ajv.compile(wrappedSchema);
    } catch (err) {
      issues.push({
        severity: "error",
        location: `components.schemas.${schemaName}`,
        message: `Schema fails AJV compilation: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // ── Check 4: Object schemas have properties for each required field ──
  for (const [schemaName, schema] of Object.entries(componentSchemas)) {
    if (!schema || typeof schema !== "object") continue;
    const s = schema as Record<string, unknown>;
    if (s.type === "object" && Array.isArray(s.required) && s.properties) {
      const props = Object.keys(s.properties as object);
      for (const field of s.required as string[]) {
        if (!props.includes(field)) {
          issues.push({
            severity: "error",
            location: `components.schemas.${schemaName}`,
            message: `Required field "${field}" not declared in properties`,
          });
        }
      }
    }
  }

  // ── Check 5: Enum schemas have values ──
  for (const [schemaName, schema] of Object.entries(componentSchemas)) {
    if (!schema || typeof schema !== "object") continue;
    const s = schema as Record<string, unknown>;
    if (Array.isArray(s.enum) && s.enum.length === 0) {
      issues.push({
        severity: "error",
        location: `components.schemas.${schemaName}`,
        message: "Enum schema has no allowed values",
      });
    }
  }

  // ── Check 6: Mutating operations have request schemas ──
  let totalOps = 0;
  let opsWithRequestSchema = 0;
  let opsWithResponseSchema = 0;

  for (const [apiPath, methods] of Object.entries(contract.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!OPENAPI_HTTP_METHODS.includes(method.toLowerCase() as (typeof OPENAPI_HTTP_METHODS)[number])) continue;
      if (!operation || typeof operation !== "object") continue;
      totalOps++;

      const op = operation as Record<string, unknown>;
      const opId = (op.operationId as string) ?? `${method.toUpperCase()} ${apiPath}`;

      const hasRequestSchema = !!(
        op.requestBody &&
        typeof op.requestBody === "object" &&
        (op.requestBody as Record<string, unknown>).content
      );
      if (hasRequestSchema) opsWithRequestSchema++;

      const hasResponseSchema = Object.values(
        (op.responses as Record<string, unknown>) ?? {}
      ).some((r) => {
        if (!r || typeof r !== "object") return false;
        const resp = r as Record<string, unknown>;
        return resp.content &&
          (resp.content as Record<string, unknown>)["application/json"] &&
          ((resp.content as Record<string, unknown>)["application/json"] as Record<string, unknown>).schema;
      });
      if (hasResponseSchema) opsWithResponseSchema++;

      if (["post", "put", "patch"].includes(method.toLowerCase()) && !hasRequestSchema) {
        issues.push({
          severity: "warning",
          location: `${method.toUpperCase()} ${apiPath} (${opId})`,
          message: "Mutating operation has no request body schema",
        });
      }
    }
  }

  // ── Schema coverage report ──
  const schemaUsage = collectSchemaUsage(contract);
  const schemaCoverage = Object.keys(componentSchemas).map((name) => ({
    schemaName: name,
    usedInResponses: schemaUsage[name]?.responses ?? [],
    usedInRequests: schemaUsage[name]?.requests ?? [],
  }));

  // Warn on unused schemas
  for (const { schemaName, usedInResponses, usedInRequests } of schemaCoverage) {
    if (usedInResponses.length === 0 && usedInRequests.length === 0) {
      issues.push({
        severity: "info",
        location: `components.schemas.${schemaName}`,
        message: `Schema "${schemaName}" is not referenced by any operation`,
      });
    }
  }

  return {
    contractVersion: contract.info?.version ?? "unknown",
    totalPaths: Object.keys(contract.paths ?? {}).length,
    totalOperations: totalOps,
    totalSchemas: Object.keys(componentSchemas).length,
    operationsWithRequestSchema: opsWithRequestSchema,
    operationsWithResponseSchema: opsWithResponseSchema,
    issues,
    schemaCoverage,
  };
}

// ─────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────
export function printReport(report: SchemaReport): number {
  const errors = report.issues.filter((i) => i.severity === "error");
  const warnings = report.issues.filter((i) => i.severity === "warning");
  const infos = report.issues.filter((i) => i.severity === "info");

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║     Routa.js OpenAPI Schema Validation Report    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log(`📋 Contract version:        ${report.contractVersion}`);
  console.log(`🛤️  Total paths:             ${report.totalPaths}`);
  console.log(`⚙️  Total operations:        ${report.totalOperations}`);
  console.log(`📐 Total schemas:           ${report.totalSchemas}`);
  console.log(
    `📝 Ops with request schema: ${report.operationsWithRequestSchema}/${report.totalOperations}`
  );
  console.log(
    `📤 Ops with response schema:${report.operationsWithResponseSchema}/${report.totalOperations}`
  );
  console.log("");

  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ No errors or warnings found!\n");
  } else {
    if (errors.length > 0) {
      console.log(`❌ Errors (${errors.length}):`);
      for (const issue of errors) {
        console.log(`   ${issue.location}`);
        console.log(`   → ${issue.message}`);
      }
      console.log("");
    }

    if (warnings.length > 0) {
      console.log(`⚠️  Warnings (${warnings.length}):`);
      for (const issue of warnings) {
        console.log(`   ${issue.location}`);
        console.log(`   → ${issue.message}`);
      }
      console.log("");
    }
  }

  if (infos.length > 0) {
    console.log(`ℹ️  Info (${infos.length}):`);
    for (const issue of infos) {
      console.log(`   ${issue.location}`);
      console.log(`   → ${issue.message}`);
    }
    console.log("");
  }

  if (reportMode) {
    console.log("── Schema Coverage Report ──────────────────────────");
    const sorted = [...report.schemaCoverage].sort((a, b) => {
      const aUses = a.usedInResponses.length + a.usedInRequests.length;
      const bUses = b.usedInResponses.length + b.usedInRequests.length;
      return bUses - aUses;
    });
    for (const { schemaName, usedInResponses, usedInRequests } of sorted) {
      const total = usedInResponses.length + usedInRequests.length;
      const marker = total === 0 ? "  (unused)" : "";
      console.log(
        `   ${schemaName.padEnd(30)} responses: ${String(usedInResponses.length).padEnd(4)} requests: ${usedInRequests.length}${marker}`
      );
    }
    console.log("");
  }

  console.log(
    `── Summary: ${errors.length} error(s), ${warnings.length} warning(s) ──\n`
  );

  return errors.length;
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────
function main() {
  const contract = loadOpenApiContract();
  const report = validateContract(contract);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    const errorCount = report.issues.filter((i) => i.severity === "error").length;
    process.exit(errorCount > 0 ? 1 : 0);
  }

  const errorCount = printReport(report);
  process.exit(errorCount > 0 ? 1 : 0);
}

if (isDirectExecution(import.meta.url)) {
  main();
}
