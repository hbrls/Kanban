#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import yaml from "js-yaml";
import { z } from "zod";

import { isDirectExecution } from "../lib/cli";
import { fromRoot } from "../lib/paths";

type SuiteName = "boundaries" | "cycles";

type RuleCheckOptions = {
  allowEmptyTests?: boolean;
};

type RuleCheckable = {
  check(options?: RuleCheckOptions): Promise<unknown[]>;
};

type FilesShouldCondition = {
  should(): {
    haveNoCycles(): RuleCheckable;
  };
  shouldNot(): {
    dependOnFiles(): {
      inFolder(pattern: string): RuleCheckable;
    };
  };
};

type ProjectFilesFactory = {
  inFolder(pattern: string): FilesShouldCondition;
};

type ProjectFilesFn = (tsConfigFilePath?: string) => ProjectFilesFactory;

export type ArchitectureRuleDefinition = {
  id: string;
  title: string;
  suite: SuiteName;
  build(projectFiles: ProjectFilesFn): RuleCheckable;
};

type ArchitectureSelectorKind = "files";
type ArchitectureLanguage = "typescript" | "rust";
type ArchitectureSeverity = "advisory" | "warning" | "error";
type ArchitectureEngineHint = "archunitts" | "graph";

type ArchitectureSelector = {
  kind: ArchitectureSelectorKind;
  language: ArchitectureLanguage;
  description?: string;
  include: string[];
  exclude?: string[];
};

type ArchitectureModel = {
  id: string;
  title: string;
  description?: string;
  owners?: string[];
};

type ArchitectureDefaults = {
  root?: string;
  exclude?: string[];
};

type ArchitectureDependencyRule = {
  id: string;
  title: string;
  message_key?: string;
  kind: "dependency";
  suite: "boundaries";
  severity: ArchitectureSeverity;
  from: string;
  relation: "must_not_depend_on";
  to: string;
  engine_hints?: ArchitectureEngineHint[];
};

type ArchitectureCycleRule = {
  id: string;
  title: string;
  message_key?: string;
  kind: "cycle";
  suite: "cycles";
  severity: ArchitectureSeverity;
  scope: string;
  relation: "must_be_acyclic";
  engine_hints?: ArchitectureEngineHint[];
};

type ArchitectureRule = ArchitectureDependencyRule | ArchitectureCycleRule;

type ArchitectureDslDocument = {
  schema: "routa.archdsl/v1";
  model: ArchitectureModel;
  defaults?: ArchitectureDefaults;
  selectors: Record<string, ArchitectureSelector>;
  rules: ArchitectureRule[];
};

type ArchitectureDslLoadResult = {
  document: ArchitectureDslDocument;
  sourcePath: string;
};

export type ArchitectureDslValidationRuleSummary = {
  id: string;
  title: string;
  kind: ArchitectureRule["kind"];
  suite: SuiteName;
  engines: ArchitectureEngineHint[];
  executableInTypescript: boolean;
};

export type ArchitectureDslValidationReport = {
  reportType: "architecture_dsl_typescript";
  generatedAt: string;
  repoRoot: string;
  dslPath: string;
  tsconfigPath: string;
  schema: ArchitectureDslDocument["schema"];
  model: Pick<ArchitectureModel, "id" | "title" | "description"> & { owners: string[] };
  summary: {
    selectorCount: number;
    ruleCount: number;
    archUnitExecutableRuleCount: number;
    skippedRuleCount: number;
  };
  rules: ArchitectureDslValidationRuleSummary[];
};

const architectureSelectorSchema = z.object({
  kind: z.literal("files"),
  language: z.enum(["typescript", "rust"]),
  description: z.string().optional(),
  include: z.array(z.string()).min(1),
  exclude: z.array(z.string()).optional(),
}).strict();

const architectureModelSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  owners: z.array(z.string()).optional(),
}).strict();

const architectureDefaultsSchema = z.object({
  root: z.string().optional(),
  exclude: z.array(z.string()).optional(),
}).strict();

const architectureDependencyRuleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  message_key: z.string().optional(),
  kind: z.literal("dependency"),
  suite: z.literal("boundaries"),
  severity: z.enum(["advisory", "warning", "error"]),
  from: z.string().min(1),
  relation: z.literal("must_not_depend_on"),
  to: z.string().min(1),
  engine_hints: z.array(z.enum(["archunitts", "graph"])).optional(),
}).strict();

const architectureCycleRuleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  message_key: z.string().optional(),
  kind: z.literal("cycle"),
  suite: z.literal("cycles"),
  severity: z.enum(["advisory", "warning", "error"]),
  scope: z.string().min(1),
  relation: z.literal("must_be_acyclic"),
  engine_hints: z.array(z.enum(["archunitts", "graph"])).optional(),
}).strict();

const architectureRuleSchema = z.discriminatedUnion("kind", [
  architectureDependencyRuleSchema,
  architectureCycleRuleSchema,
]);

const architectureDslSchema = z.object({
  schema: z.literal("routa.archdsl/v1"),
  model: architectureModelSchema,
  defaults: architectureDefaultsSchema.optional(),
  selectors: z.record(z.string(), architectureSelectorSchema),
  rules: z.array(architectureRuleSchema).min(1),
}).strict().superRefine((document, ctx) => {
  const selectorIds = new Set(Object.keys(document.selectors));
  const ruleIds = new Set<string>();

  for (const [index, rule] of document.rules.entries()) {
    const archUnitEnabled = rule.engine_hints?.length
      ? rule.engine_hints.includes("archunitts")
      : true;

    if (ruleIds.has(rule.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rules", index, "id"],
        message: `Duplicate rule id: ${rule.id}`,
      });
    }
    ruleIds.add(rule.id);

    const selectorKeys = rule.kind === "dependency" ? [rule.from, rule.to] : [rule.scope];
    for (const selectorKey of selectorKeys) {
      if (!selectorIds.has(selectorKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rules", index, rule.kind === "dependency" ? (selectorKey === rule.from ? "from" : "to") : "scope"],
          message: `Unknown selector referenced by rule ${rule.id}: ${selectorKey}`,
        });
        continue;
      }

      const selector = document.selectors[selectorKey];
      if (selector.language !== "typescript" && archUnitEnabled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rules", index, "engine_hints"],
          message: `Rule ${rule.id} uses ArchUnitTS but selector ${selectorKey} is ${selector.language}`,
        });
      }

      if (selector.include.length !== 1 && archUnitEnabled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selectors", selectorKey, "include"],
          message: `ArchUnitTS currently supports exactly one include glob per selector (selector ${selectorKey})`,
        });
      }
    }
  }
});

function toArchitectureDslError(message: string, sourcePath?: string): Error {
  return new Error(sourcePath ? `${sourcePath}: ${message}` : message);
}

export function parseArchitectureDslSource(source: string, sourcePath?: string): ArchitectureDslDocument {
  let raw: unknown;

  try {
    raw = yaml.load(source);
  } catch (error) {
    throw toArchitectureDslError(`Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`, sourcePath);
  }

  const parsed = architectureDslSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw toArchitectureDslError(`Invalid architecture DSL: ${message}`, sourcePath);
  }

  return parsed.data as ArchitectureDslDocument;
}

export async function loadArchitectureDslFile(filePath: string): Promise<ArchitectureDslLoadResult> {
  const source = await fs.readFile(filePath, "utf8");
  return {
    document: parseArchitectureDslSource(source, filePath),
    sourcePath: filePath,
  };
}

export function defaultArchitectureDslPath(repoRoot: string): string {
  return path.join(repoRoot, "architecture", "rules", "backend-core.archdsl.yaml");
}

function assertArchUnitCompatibleSelector(
  selectorId: string,
  selector: ArchitectureSelector | undefined,
): asserts selector is ArchitectureSelector {
  if (!selector) {
    throw new Error(`Missing selector during ArchUnitTS compilation: ${selectorId}`);
  }

  if (selector.language !== "typescript") {
    throw new Error(`ArchUnitTS supports only typescript selectors, but ${selectorId} is ${selector.language}`);
  }

  if (selector.include.length !== 1) {
    throw new Error(`ArchUnitTS supports exactly one include glob per selector, but ${selectorId} has ${selector.include.length}`);
  }
}

function ruleIsArchUnitExecutable(rule: ArchitectureRule): boolean {
  return rule.engine_hints?.length ? rule.engine_hints.includes("archunitts") : true;
}

function resolvedEngineHints(rule: ArchitectureRule): ArchitectureEngineHint[] {
  return rule.engine_hints?.length ? [...rule.engine_hints] : ["archunitts"];
}

function compileDependencyRule(
  rule: ArchitectureDependencyRule,
  selectors: Record<string, ArchitectureSelector>,
  tsConfigPath: string,
): ArchitectureRuleDefinition {
  const fromSelector = selectors[rule.from];
  const toSelector = selectors[rule.to];
  assertArchUnitCompatibleSelector(rule.from, fromSelector);
  assertArchUnitCompatibleSelector(rule.to, toSelector);
  const fromPattern = fromSelector.include[0];
  const toPattern = toSelector.include[0];

  return {
    id: rule.id,
    title: rule.title,
    suite: rule.suite,
    build: (projectFiles) => projectFiles(tsConfigPath)
      .inFolder(fromPattern)
      .shouldNot()
      .dependOnFiles()
      .inFolder(toPattern),
  };
}

function compileCycleRule(
  rule: ArchitectureCycleRule,
  selectors: Record<string, ArchitectureSelector>,
  tsConfigPath: string,
): ArchitectureRuleDefinition {
  const scopeSelector = selectors[rule.scope];
  assertArchUnitCompatibleSelector(rule.scope, scopeSelector);
  const scopePattern = scopeSelector.include[0];

  return {
    id: rule.id,
    title: rule.title,
    suite: rule.suite,
    build: (projectFiles) => projectFiles(tsConfigPath)
      .inFolder(scopePattern)
      .should()
      .haveNoCycles(),
  };
}

export function compileArchitectureDslDocument(
  document: ArchitectureDslDocument,
  tsConfigPath: string,
): ArchitectureRuleDefinition[] {
  return document.rules.flatMap((rule) => {
    if (!ruleIsArchUnitExecutable(rule)) {
      return [];
    }

    if (rule.kind === "dependency") {
      return [compileDependencyRule(rule, document.selectors, tsConfigPath)];
    }
    return [compileCycleRule(rule, document.selectors, tsConfigPath)];
  });
}

export async function loadArchitectureRuleDefinitions(
  repoRoot: string,
  tsConfigPath: string,
  dslPath = defaultArchitectureDslPath(repoRoot),
): Promise<ArchitectureDslLoadResult & { rules: ArchitectureRuleDefinition[] }> {
  const loaded = await loadArchitectureDslFile(dslPath);
  return {
    ...loaded,
    rules: compileArchitectureDslDocument(loaded.document, tsConfigPath),
  };
}

export function createArchitectureDslValidationReport(
  repoRoot: string,
  tsConfigPath: string,
  loaded: ArchitectureDslLoadResult,
): ArchitectureDslValidationReport {
  const compiledRules = compileArchitectureDslDocument(loaded.document, tsConfigPath);
  const executableRuleIds = new Set(compiledRules.map((rule) => rule.id));

  return {
    reportType: "architecture_dsl_typescript",
    generatedAt: new Date().toISOString(),
    repoRoot,
    dslPath: loaded.sourcePath,
    tsconfigPath: tsConfigPath,
    schema: loaded.document.schema,
    model: {
      id: loaded.document.model.id,
      title: loaded.document.model.title,
      description: loaded.document.model.description,
      owners: loaded.document.model.owners ?? [],
    },
    summary: {
      selectorCount: Object.keys(loaded.document.selectors).length,
      ruleCount: loaded.document.rules.length,
      archUnitExecutableRuleCount: compiledRules.length,
      skippedRuleCount: loaded.document.rules.length - compiledRules.length,
    },
    rules: loaded.document.rules.map((rule) => ({
      id: rule.id,
      title: rule.title,
      kind: rule.kind,
      suite: rule.suite,
      engines: resolvedEngineHints(rule),
      executableInTypescript: executableRuleIds.has(rule.id),
    })),
  };
}

export async function loadArchitectureDslValidationReport(
  repoRoot: string,
  tsConfigPath: string,
  dslPath = defaultArchitectureDslPath(repoRoot),
): Promise<ArchitectureDslValidationReport> {
  const loaded = await loadArchitectureDslFile(dslPath);
  return createArchitectureDslValidationReport(repoRoot, tsConfigPath, loaded);
}

function parseRepoRoot(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo-root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("Missing value for --repo-root");
      }
      return path.resolve(value);
    }
    if (arg.startsWith("--repo-root=")) {
      return path.resolve(arg.slice("--repo-root=".length));
    }
  }

  const envRepoRoot = process.env.ROUTA_ARCH_REPO_ROOT?.trim();
  return envRepoRoot ? path.resolve(envRepoRoot) : fromRoot();
}

function parseDslPath(argv: string[], repoRoot: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dsl") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("Missing value for --dsl");
      }
      return path.resolve(repoRoot, value);
    }
    if (arg.startsWith("--dsl=")) {
      return path.resolve(repoRoot, arg.slice("--dsl=".length));
    }
  }

  const envDslPath = process.env.ROUTA_ARCH_DSL_PATH?.trim();
  return envDslPath ? path.resolve(repoRoot, envDslPath) : defaultArchitectureDslPath(repoRoot);
}

function parseTsConfigPath(argv: string[], repoRoot: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--tsconfig") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("Missing value for --tsconfig");
      }
      return path.resolve(value);
    }
    if (arg.startsWith("--tsconfig=")) {
      return path.resolve(arg.slice("--tsconfig=".length));
    }
  }

  return path.join(repoRoot, "tsconfig.json");
}

function formatValidationReport(report: ArchitectureDslValidationReport): string {
  const lines = [
    `Architecture DSL validated: ${report.model.title} (${report.model.id})`,
    `DSL: ${report.dslPath}`,
    `TSConfig: ${report.tsconfigPath}`,
    `Selectors: ${report.summary.selectorCount}`,
    `Rules: ${report.summary.ruleCount}`,
    `ArchUnitTS executable: ${report.summary.archUnitExecutableRuleCount}`,
    `Skipped in TypeScript path: ${report.summary.skippedRuleCount}`,
    "",
    "Rules:",
  ];

  for (const rule of report.rules) {
    lines.push(
      `- ${rule.id} [${rule.suite}/${rule.kind}] engines=${rule.engines.join(",")} executable=${rule.executableInTypescript ? "yes" : "no"}`,
    );
  }

  return lines.join("\n");
}

async function runCli(argv: string[]): Promise<void> {
  const json = argv.includes("--json");
  const repoRoot = parseRepoRoot(argv);
  const dslPath = parseDslPath(argv, repoRoot);
  const tsConfigPath = parseTsConfigPath(argv, repoRoot);
  const report = await loadArchitectureDslValidationReport(repoRoot, tsConfigPath, dslPath);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatValidationReport(report));
}

if (isDirectExecution(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
