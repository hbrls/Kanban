/**
 * @vitest-environment node
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";

import { parseFeatureTree } from "../feature-tree-parser";

function ensureFile(filePath: string, content = ""): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

describe("feature tree parser", () => {
  it("derives feature source files from the generated surface index", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feature-tree-parser-"));
    const repoRoot = path.join(tempRoot, "repo");

    ensureFile(
      path.join(repoRoot, "docs/product-specs/FEATURE_TREE.md"),
      `---
feature_metadata:
  capability_groups:
    - id: workspace-coordination
      name: Workspace Coordination
  features:
    - id: feature-explorer
      name: Feature Explorer
      group: workspace-coordination
      pages:
        - /workspace/:workspaceId/feature-explorer
      apis:
        - GET /api/feature-explorer
---

# Product Feature Specification

## Frontend Pages

| Page | Route | Source File | Description |
|------|-------|-------------|-------------|
| Workspace / Feature Explorer | \`/workspace/:workspaceId/feature-explorer\` | \`src/app/workspace/[workspaceId]/feature-explorer/page.tsx\` |  |

## API Contract Endpoints

### Feature-Explorer (1)

| Method | Endpoint | Details | Next.js | Rust |
|--------|----------|---------|---------|------|
| GET | \`/api/feature-explorer\` | List feature explorer features | \`src/app/api/feature-explorer/route.ts\` | \`crates/routa-server/src/api/feature_explorer.rs\` |
`,
    );

    const featureTree = parseFeatureTree(repoRoot);
    expect(featureTree.frontendPages[0]).toMatchObject({
      route: "/workspace/:workspaceId/feature-explorer",
      sourceFile: "src/app/workspace/[workspaceId]/feature-explorer/page.tsx",
    });
    expect(featureTree.features[0]?.sourceFiles).toEqual([
      "crates/routa-server/src/api/feature_explorer.rs",
      "src/app/api/feature-explorer/route.ts",
      "src/app/workspace/[workspaceId]/feature-explorer/page.tsx",
    ]);
  });

  it("returns an empty feature tree when generated artifacts are missing", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feature-tree-parser-empty-"));
    const repoRoot = path.join(tempRoot, "repo");

    const featureTree = parseFeatureTree(repoRoot);

    expect(featureTree).toEqual({
      capabilityGroups: [],
      features: [],
      frontendPages: [],
      apiEndpoints: [],
      nextjsApiEndpoints: [],
      rustApiEndpoints: [],
      implementationApiEndpoints: [],
    });
  });

  it("infers features from legacy generated markdown without feature metadata frontmatter", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feature-tree-parser-legacy-"));
    const repoRoot = path.join(tempRoot, "repo");

    ensureFile(
      path.join(repoRoot, "docs/product-specs/FEATURE_TREE.md"),
      `---
status: generated
purpose: Auto-generated route and API surface index for Routa.js.
---

# Product Feature Specification

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Feature Explorer | \`/workspace/:workspaceId/feature-explorer\` | Browse features |

## API Endpoints

### Feature-Explorer (1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/api/feature-explorer\` | List features |
`,
    );

    const featureTree = parseFeatureTree(repoRoot);

    expect(featureTree.capabilityGroups).toEqual([
      {
        id: "inferred-surfaces",
        name: "Inferred Surfaces",
        description: "Auto-inferred surface clusters derived from generated page and API tables.",
      },
    ]);
    expect(featureTree.features).toEqual([
      {
        id: "feature-explorer",
        name: "Feature Explorer",
        group: "inferred-surfaces",
        summary: "Auto-inferred from FEATURE_TREE surfaces (1 page, 1 API).",
        status: "inferred",
        pages: ["/workspace/:workspaceId/feature-explorer"],
        apis: ["GET /api/feature-explorer"],
        sourceFiles: [],
        relatedFeatures: [],
        domainObjects: [],
      },
    ]);
    expect(featureTree.frontendPages).toEqual([
      {
        name: "Feature Explorer",
        route: "/workspace/:workspaceId/feature-explorer",
        sourceFile: "",
        description: "Browse features",
      },
    ]);
    expect(featureTree.apiEndpoints).toEqual([
      {
        group: "feature-explorer",
        method: "GET",
        endpoint: "/api/feature-explorer",
        description: "List features",
      },
    ]);
  });

  it("infers feature ownership for unmapped surfaces from the generated tables", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feature-tree-parser-inferred-"));
    const repoRoot = path.join(tempRoot, "repo");

    ensureFile(
      path.join(repoRoot, "docs/product-specs/FEATURE_TREE.md"),
      `---
feature_metadata:
  capability_groups:
    - id: workspace-coordination
      name: Workspace Coordination
  features:
    - id: workspace-overview
      name: Workspace Overview
      group: workspace-coordination
      pages:
        - /workspace/:workspaceId/overview
---

# Product Feature Specification

## Frontend Pages

| Page | Route | Source File | Description |
|------|-------|-------------|-------------|
| Workspace / Overview | \`/workspace/:workspaceId/overview\` | \`src/app/workspace/[workspaceId]/overview/page.tsx\` |  |
| Settings / Agents | \`/settings/agents\` | \`src/app/settings/agents/page.tsx\` |  |

## API Contract Endpoints

### Agents (1)

| Method | Endpoint | Details | Next.js | Rust |
|--------|----------|---------|---------|------|
| GET | \`/api/agents\` | List agents | \`src/app/api/agents/route.ts\` | \`crates/routa-server/src/api/agents.rs\` |
`,
    );

    const featureTree = parseFeatureTree(repoRoot);
    expect(featureTree.features.find((feature) => feature.id === "agents")).toMatchObject({
      group: "inferred-surfaces",
      pages: ["/settings/agents"],
      apis: ["GET /api/agents"],
      sourceFiles: [
        "crates/routa-server/src/api/agents.rs",
        "src/app/api/agents/route.ts",
        "src/app/settings/agents/page.tsx",
      ],
    });
  });

  it("parses generic implementation API sections from generated markdown", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feature-tree-parser-spring-"));
    const repoRoot = path.join(tempRoot, "repo");

    ensureFile(
      path.join(repoRoot, "docs/product-specs/FEATURE_TREE.md"),
      `---
feature_metadata:
  capability_groups:
    - id: administration
      name: Administration
  features:
    - id: admin-dashboard
      name: Admin Dashboard
      group: administration
      pages:
        - /admin/dashboard
      apis:
        - GET /admin/dashboard
---

# Product Feature Specification

## Frontend Pages

| Page | Route | Source File | Description |
|------|-------|-------------|-------------|
| Admin Dashboard | \`/admin/dashboard\` | \`src/main/resources/templates/dashboard.html\` |  |

## API Contract Endpoints

### Admin (1)

| Method | Endpoint | Details |
|--------|----------|---------|
| GET | \`/admin/dashboard\` | Render Dashboard |

## Spring MVC API Routes

### Admin (1)

| Method | Endpoint | Source Files |
|--------|----------|--------------|
| GET | \`/admin/dashboard\` | \`src/main/java/com/example/controller/AdminController.java\` |
`,
    );

    const featureTree = parseFeatureTree(repoRoot);
    expect(featureTree.implementationApiEndpoints).toEqual([
      {
        label: "springMvc",
        group: "admin",
        method: "GET",
        endpoint: "/admin/dashboard",
        sourceFiles: ["src/main/java/com/example/controller/AdminController.java"],
      },
    ]);
    expect(featureTree.features[0]?.sourceFiles).toEqual([
      "src/main/java/com/example/controller/AdminController.java",
      "src/main/resources/templates/dashboard.html",
    ]);
  });
});
