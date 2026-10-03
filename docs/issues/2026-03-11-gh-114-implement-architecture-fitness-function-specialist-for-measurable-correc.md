---
title: "[GitHub #114] Implement Architecture Fitness Function specialist for measurable correctness checks"
date: "2026-03-11"
status: resolved
severity: medium
area: "backend"
tags: ["github", "github-sync", "gh-114", "enhancement", "agent", "area-backend", "complexity-medium", "complexity-large", "testing"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/114"]
github_issue: 114
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/114"
---

# [GitHub #114] Implement Architecture Fitness Function specialist for measurable correctness checks

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #114
- URL: https://github.com/phodal/routa/issues/114
- State: closed
- Author: phodal
- Created At: 2026-03-11T01:29:08Z
- Updated At: 2026-03-11T04:09:51Z

## Labels

- `enhancement`
- `Agent`
- `area:backend`
- `complexity:medium`
- `complexity:large`
- `testing`

## Original GitHub Body

# Implement Architecture Fitness Function specialist for measurable correctness checks

## Goal

Add a first-class Architecture Fitness Function workflow to Routa so that architectural intent can be turned into executable checks before implementation starts, and those checks are enforced as hard gates afterward.

## Context

References:
- Thoughtworks: https://www.thoughtworks.com/insights/articles/fitness-function-driven-development
- Origin discussion: https://x.com/katanalarp/status/2029928471632224486
- Amazon: https://www.cnbc.com/2026/03/10/amazon-plans-deep-dive-internal-meeting-address-ai-related-outages.html

Routa can generate code that compiles and passes narrow tests while still violating real system constraints (performance budgets, dependency ceilings, architectural boundaries). The problem is structural: there is no first-class way to capture and enforce those constraints in the task lifecycle.

Existing capabilities to build on:
- GATE verifies against acceptance criteria with evidence
- Tasks already store `verificationCommands`, `verificationVerdict`, `verificationReport`
- Specialist orchestration separates planning, implementation, and verification

### Case Background
Recently, Amazon experienced four Sev-1 (highest severity) system outages within a single week. The most severe incident caused core shopping functionalities (checkout, pricing viewing, and account access) on both the Amazon website and app to go down for approximately six hours. 

Dave Treadwell, Senior VP of eCommerce Foundation, convened an urgent internal "deep dive" meeting to address the severely degraded availability posture.

### Core Issue: The Controversy Over AI-Assisted Changes
* **Internal Document Attribution:** An early internal memo explicitly pointed out that "GenAI-assisted changes" involving GenAI tools were a significant factor in a "trend of incidents" since Q3.
* **Lack of Safeguards:** Executive memos acknowledged that "best practices and safeguards" around the usage of generative AI have not yet been fully established across engineering teams.
* *(Note: Amazon's PR team later clarified that only a single incident was related to AI and "none of the incidents involved AI-written code." However, this still highlights the risks associated with AI tool usage within the deployment pipeline.)*

### Actions Taken: Introducing "Controlled Friction"
To prevent further degradation of availability, Amazon announced remediation measures for their code commit and deployment processes:
1. **Mandatory Additional Reviews:** As a temporary safety practice, Amazon is introducing **"controlled friction"** to changes in the most critical parts of the Retail experience, requiring additional reviews for all "GenAI-assisted" production changes.
2. **Building Durable Safeguards:** The company plans to invest in more durable, long-term solutions, specifically mentioning the implementation of both **"deterministic and agentic safeguards."**

### Takeaways for AI Dev Toolchains (AI4SE)
1. **Efficiency Cannot Come at the Cost of Stability:** AI coding assistants (like Copilot, Q, etc.) drastically increase code generation speed. However, if the speed of engineering validation does not match the speed of generation, a massive volume of inadequately verified code will be pushed to production, leading to availability disasters.
2. **Code Reviews Must Evolve:** When dealing with AI-assisted code, reviews cannot be bypassed or treated lightly. Instead, necessary "friction" (e.g., stricter human peer reviews, higher automated test coverage requirements) must be introduced to counter AI hallucinations and subtle logical flaws.
3. **The Need for Engineered AI Safeguards:** When enterprises adopt AI programming tools, they cannot stop at simply "distributing licenses." They must concurrently build matching automated safety nets within the CI/CD pipeline (e.g., the "agentic safeguards" Amazon mentioned) to evaluate and gate AI-generated changes.

## Recommendation

Add a dedicated Architecture Fitness Function specialist. Keep scope narrow:
1. Extend the task model with structured `fitnessChecks` metadata
2. Expose fitness check creation in MCP tools
3. Add an `ARCHITECTURE_FITNESS` specialist that derives checks from specs
4. Update GATE to consume and surface fitness check evidence

## Proposed Data Model

```typescript
export type FitnessCheckType =
  | "benchmark" | "architecture_boundary" | "dependency_budget"
  | "observability" | "security" | "compliance"
  | "operability" | "simplicity_guard";

export interface TaskFitnessCheck {
  id: string;
  type: FitnessCheckType;
  title: string;
  rationale: string;
  measurement: string;
  target: string;
  commands?: string[];
  evidenceHints?: string[];
  blocking: boolean;
}
// fitnessChecks?: TaskFitnessCheck[];  // added to Task
```

## Thoughtworks Example Categories

| Category | Example Check | Routa Type |
|---|---|---|
| Performance | Page load < 2s, API p99 < 200ms | `benchmark` |
| Observability | All service calls produce trace spans | `observability` |
| Security | No high-CVE deps in SBOM | `security` |
| Compliance | No unapproved external calls from core | `compliance` |
| Operability | Env var changes need no redeploy | `operability` |
| Architecture | No direct DB access from UI layer | `architecture_boundary` |
| Simplicity | File count per module <= 20 | `simplicity_guard` |
| Dependencies | No new indirect deps added | `dependency_budget` |

## Acceptance Criteria

- `TaskFitnessCheck` is a first-class type in the task model
- An `ARCHITECTURE_FITNESS` specialist can be invoked to derive checks from a spec
- Derived checks are persisted on the task via `set_fitness_checks` MCP tool
- GATE evaluates fitness checks and includes evidence in its verdict
- Task panel renders fitness check status
- TypeScript compiles, lint passes, migrations run cleanly

## Non-goals

- Full policy engine or project-wide CI enforcement in v1
- Automatic benchmarking for every task type
- Replacing existing acceptance criteria or verifier flows

## Assumptions

- `ARCHITECTURE_FITNESS` specialist is invoked manually or by ROUTA, not auto-triggered
- Fitness checks are advisory by default; `blocking: true` is opt-in
- SQLite and Postgres migrations are both required (dual-schema project)

## Rollback Plan

- `fitnessChecks` column is nullable — existing tasks are unaffected
- GATE prompt addition is additive — existing verdicts stay valid
- Specialist file can be removed without breaking other flows
