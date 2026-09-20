import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  compileArchitectureDslDocument,
  createArchitectureDslValidationReport,
  loadArchitectureDslFile,
  parseArchitectureDslSource,
} from "../fitness/architecture-rule-dsl";

function createFakeProjectFiles(log: string[]) {
  return (tsConfigPath?: string) => ({
    inFolder(pattern: string) {
      log.push(`projectFiles:${tsConfigPath ?? ""}`);
      log.push(`inFolder:${pattern}`);
      return {
        shouldNot() {
          log.push("shouldNot");
          return {
            dependOnFiles() {
              log.push("dependOnFiles");
              return {
                inFolder(targetPattern: string) {
                  log.push(`target:${targetPattern}`);
                  return {
                    check: vi.fn(async () => []),
                  };
                },
              };
            },
          };
        },
        should() {
          log.push("should");
          return {
            haveNoCycles() {
              log.push("haveNoCycles");
              return {
                check: vi.fn(async () => []),
              };
            },
          };
        },
      };
    },
  });
}

describe("architecture rule DSL", () => {
  it("loads the canonical backend core DSL file", async () => {
    const filePath = path.join(process.cwd(), "architecture", "rules", "backend-core.archdsl.yaml");
    const loaded = await loadArchitectureDslFile(filePath);

    expect(loaded.document.schema).toBe("routa.archdsl/v1");
    expect(loaded.document.model.id).toBe("backend_core");
    expect(Object.keys(loaded.document.selectors)).toEqual([
      "core_ts",
      "app_ts",
      "api_ts",
      "client_ts",
    ]);
    expect(loaded.document.rules).toHaveLength(4);
    expect(loaded.document.rules[0]).toMatchObject({
      id: "ts_backend_core_no_core_to_app",
      kind: "dependency",
      suite: "boundaries",
    });
  });

  it("compiles architecture rules into ArchUnitTS builders", () => {
    const document = parseArchitectureDslSource(`
schema: routa.archdsl/v1
model:
  id: demo
  title: Demo
selectors:
  core_ts:
    kind: files
    language: typescript
    include:
      - src/core/**
  app_ts:
    kind: files
    language: typescript
    include:
      - src/app/**
  rust_core:
    kind: files
    language: rust
    include:
      - crates/routa-core/**
      - crates/routa-server/**
rules:
  - id: no_core_to_app
    title: no core to app
    kind: dependency
    suite: boundaries
    severity: advisory
    from: core_ts
    relation: must_not_depend_on
    to: app_ts
    engine_hints:
      - archunitts
  - id: rust_graph_only
    title: rust graph only
    kind: dependency
    suite: boundaries
    severity: advisory
    from: rust_core
    relation: must_not_depend_on
    to: app_ts
    engine_hints:
      - graph
  - id: no_cycles
    title: no cycles
    kind: cycle
    suite: cycles
    severity: advisory
    scope: core_ts
    relation: must_be_acyclic
    engine_hints:
      - archunitts
`);

    const log: string[] = [];
    const fakeProjectFiles = createFakeProjectFiles(log);
    const compiled = compileArchitectureDslDocument(document, "/repo/tsconfig.json");

    expect(compiled).toHaveLength(2);
    expect(compiled.map((rule) => rule.id)).toEqual(["no_core_to_app", "no_cycles"]);

    const dependencyResult = compiled[0].build(fakeProjectFiles);
    expect(dependencyResult).toHaveProperty("check");
    expect(log).toEqual([
      "projectFiles:/repo/tsconfig.json",
      "inFolder:src/core/**",
      "shouldNot",
      "dependOnFiles",
      "target:src/app/**",
    ]);

    log.length = 0;
    const cycleResult = compiled[1].build(fakeProjectFiles);
    expect(cycleResult).toHaveProperty("check");
    expect(log).toEqual([
      "projectFiles:/repo/tsconfig.json",
      "inFolder:src/core/**",
      "should",
      "haveNoCycles",
    ]);
  });

  it("accepts graph engine hints without applying ArchUnitTS-only constraints", () => {
    const document = parseArchitectureDslSource(`
schema: routa.archdsl/v1
model:
  id: demo
  title: Demo
selectors:
  rust_core:
    kind: files
    language: rust
    include:
      - crates/routa-core/**
      - crates/routa-server/**
  app_ts:
    kind: files
    language: typescript
    include:
      - src/app/**
rules:
  - id: rust_graph_only
    title: rust graph only
    kind: dependency
    suite: boundaries
    severity: advisory
    from: rust_core
    relation: must_not_depend_on
    to: app_ts
    engine_hints:
      - graph
`);

    expect(document.rules[0].engine_hints).toEqual(["graph"]);
  });

  it("skips graph-only rules when compiling ArchUnitTS builders", () => {
    const document = parseArchitectureDslSource(`
schema: routa.archdsl/v1
model:
  id: demo
  title: Demo
selectors:
  core_ts:
    kind: files
    language: typescript
    include:
      - src/core/**
  app_ts:
    kind: files
    language: typescript
    include:
      - src/app/**
  rust_core:
    kind: files
    language: rust
    include:
      - crates/routa-core/**
      - crates/routa-server/**
rules:
  - id: no_core_to_app
    title: no core to app
    kind: dependency
    suite: boundaries
    severity: advisory
    from: core_ts
    relation: must_not_depend_on
    to: app_ts
    engine_hints:
      - archunitts
  - id: rust_graph_only
    title: rust graph only
    kind: dependency
    suite: boundaries
    severity: advisory
    from: rust_core
    relation: must_not_depend_on
    to: app_ts
    engine_hints:
      - graph
`);

    const compiled = compileArchitectureDslDocument(document, "/repo/tsconfig.json");

    expect(compiled).toHaveLength(1);
    expect(compiled[0].id).toBe("no_core_to_app");
  });

  it("reports graph-only rules as skipped in the TypeScript validation report", () => {
    const document = parseArchitectureDslSource(`
schema: routa.archdsl/v1
model:
  id: demo
  title: Demo
selectors:
  core_ts:
    kind: files
    language: typescript
    include:
      - src/core/**
  app_ts:
    kind: files
    language: typescript
    include:
      - src/app/**
  rust_core:
    kind: files
    language: rust
    include:
      - crates/routa-core/**
rules:
  - id: no_core_to_app
    title: no core to app
    kind: dependency
    suite: boundaries
    severity: advisory
    from: core_ts
    relation: must_not_depend_on
    to: app_ts
  - id: rust_graph_only
    title: rust graph only
    kind: dependency
    suite: boundaries
    severity: advisory
    from: rust_core
    relation: must_not_depend_on
    to: app_ts
    engine_hints:
      - graph
`);

    const report = createArchitectureDslValidationReport("/repo", "/repo/tsconfig.json", {
      document,
      sourcePath: "/repo/architecture/rules/demo.archdsl.yaml",
    });

    expect(report.summary).toEqual({
      selectorCount: 3,
      ruleCount: 2,
      archUnitExecutableRuleCount: 1,
      skippedRuleCount: 1,
    });
    expect(report.rules).toEqual([
      {
        id: "no_core_to_app",
        title: "no core to app",
        kind: "dependency",
        suite: "boundaries",
        engines: ["archunitts"],
        executableInTypescript: true,
      },
      {
        id: "rust_graph_only",
        title: "rust graph only",
        kind: "dependency",
        suite: "boundaries",
        engines: ["graph"],
        executableInTypescript: false,
      },
    ]);
  });

  it("rejects rules that reference unknown selectors", () => {
    expect(() => parseArchitectureDslSource(`
schema: routa.archdsl/v1
model:
  id: demo
  title: Demo
selectors:
  core_ts:
    kind: files
    language: typescript
    include:
      - src/core/**
rules:
  - id: no_core_to_app
    title: no core to app
    kind: dependency
    suite: boundaries
    severity: advisory
    from: core_ts
    relation: must_not_depend_on
    to: app_ts
`)).toThrow(/Unknown selector referenced/);
  });
});
