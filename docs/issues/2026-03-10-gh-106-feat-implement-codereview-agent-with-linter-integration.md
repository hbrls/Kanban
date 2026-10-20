---
title: "[GitHub #106] feat: Implement CodeReview Agent with Linter Integration"
date: "2026-03-10"
status: resolved
severity: medium
area: "backend"
tags: ["github", "github-sync", "gh-106", "enhancement", "agent", "area-backend", "complexity-medium"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/106"]
github_issue: 106
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/106"
---

# [GitHub #106] feat: Implement CodeReview Agent with Linter Integration

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #106
- URL: https://github.com/phodal/routa/issues/106
- State: closed
- Author: phodal
- Created At: 2026-03-10T07:32:34Z
- Updated At: 2026-03-10T07:35:37Z

## Labels

- `enhancement`
- `Agent`
- `area:backend`
- `complexity:medium`

## Original GitHub Body

## Summary

Implement a comprehensive CodeReview Agent system with Linter integration, inspired by the design patterns from xiuper project. This will enhance the existing GATE specialist with automated linting capabilities and a structured review lifecycle.

## Motivation

Currently, routa has:
- GATE specialist for verification against acceptance criteria
- PR Reviewer specialist for PR code review
- Basic ESLint configuration

However, we lack:
- Automated linter execution during code review
- Structured lifecycle management (pre-analysis, analysis, fix)
- Multi-linter support for different file types
- Integration with the existing specialist system

## Proposed Architecture

### 1. Linter System (`src/core/linter/`)

```
src/core/linter/
├── linter.ts              # Base interface
├── linter-registry.ts     # Registry for managing linters
├── linter-summary.ts      # Result aggregation
├── shell-based-linter.ts  # Base class for shell-based linters
├── ai-linter.ts           # AI-driven linter (optional)
└── linters/
    ├── eslint-linter.ts   # JavaScript/TypeScript
    ├── biome-linter.ts    # JS/TS/JSON/CSS
    ├── ruff-linter.ts     # Python
    └── shellcheck-linter.ts # Shell scripts
```

#### Core Interface

```typescript
// src/core/linter/linter.ts
interface LintIssue {
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule?: string;
  suggestion?: string;
  filePath: string;
}

interface LintResult {
  filePath: string;
  issues: LintIssue[];
  success: boolean;
  linterName: string;
  errorMessage?: string;
}

interface Linter {
  readonly name: string;
  readonly description: string;
  readonly supportedExtensions: string[];
  
  isAvailable(): Promise<boolean>;
  lintFile(filePath: string, projectPath: string): Promise<LintResult>;
  lintFiles(filePaths: string[], projectPath: string): Promise<LintResult[]>;
  getInstallationInstructions(): string;
}
```

### 2. Review Lifecycle States (`src/core/models/review-stage.ts`)

```typescript
enum ReviewStage {
  IDLE = 'IDLE',                           // Initial state
  RUNNING_LINT = 'RUNNING_LINT',           // Running linter analysis
  ANALYZING_LINT = 'ANALYZING_LINT',       // Analyzing lint results
  GENERATING_PLAN = 'GENERATING_PLAN',     // Generating modification plan
  WAITING_FOR_USER_INPUT = 'WAITING_FOR_USER_INPUT', // Waiting for feedback
  GENERATING_FIX = 'GENERATING_FIX',       // Executing code fixes
  COMPLETED = 'COMPLETED',                 // Review complete
  ERROR = 'ERROR'                          // Error state
}
```

### 3. Enhanced Code Review Specialist

Create a new specialist file: `resources/specialists/code-reviewer.md`

```markdown
---
name: "Code Reviewer"
description: "Comprehensive code review with automated linting and fix suggestions"
modelTier: "smart"
role: "GATE"
roleReminder: "Run linters first, analyze issues, provide structured fix suggestions. Be evidence-driven."
---

## Code Reviewer

You are a code review specialist with automated linting capabilities.

## Lifecycle

### Phase 1: Pre-Analysis (RUNNING_LINT)
1. Detect file types in changes
2. Run appropriate linters (ESLint, Biome, etc.)
3. Collect lint results and categorize by severity

### Phase 2: Analysis (ANALYZING_LINT)
1. Analyze lint results against code changes
2. Identify critical issues vs warnings
3. Correlate with acceptance criteria

### Phase 3: Planning (GENERATING_PLAN)
1. Prioritize issues by severity and impact
2. Generate structured fix suggestions
3. Present modification plan

### Phase 4: User Input (WAITING_FOR_USER_INPUT)
- Wait for user to select which issues to fix
- Accept additional feedback

### Phase 5: Fix Generation (GENERATING_FIX)
- Generate fixes for selected issues
- Verify fixes don't introduce new issues

## Output Format

### Lint Summary
- Total issues: X (Y errors, Z warnings)
- Files with issues: [list]

### Issues by Severity

#### CRITICAL (Must Fix)
- **File**: path/to/file.ts (Line X)
  - **Rule**: eslint-rule-name
  - **Issue**: Description
  - **Suggestion**: How to fix

#### WARNING (Should Fix)
...

## Tools
- \`run_linter\` - Execute linters on specified files
- \`get_lint_summary\` - Get aggregated lint results
- \`generate_fix_suggestion\` - Generate fix for specific issue
```

### 4. Linter Integration with MCP Tools

Add new MCP tools in `src/core/tools/`:

```typescript
// src/core/tools/linter-tools.ts
export const linterTools = {
  run_linter: {
    description: 'Run linters on specified files',
    parameters: {
      filePaths: { type: 'array', items: { type: 'string' } },
      projectPath: { type: 'string' },
      linterNames: { type: 'array', items: { type: 'string' }, optional: true }
    },
    execute: async (params, context) => {
      const registry = LinterRegistry.getInstance();
      return registry.getLinterSummaryForFiles(params.filePaths, params.projectPath);
    }
  },
  
  get_lint_summary: {
    description: 'Get summary of lint results',
    // ...
  }
};
```

### 5. Review Progress Tracking

```typescript
// src/core/models/review-progress.ts
interface ReviewProgress {
  stage: ReviewStage;
  currentFile?: string;
  lintOutput: string;
  lintResults: LintFileResult[];
  analysisOutput: string;
  planOutput: string;
  fixOutput: string;
  userFeedback: string;
}
```

## Implementation Phases

### Phase 1: Core Linter System
- [ ] Define Linter interface and types
- [ ] Implement LinterRegistry
- [ ] Implement ShellBasedLinter base class
- [ ] Create ESLint integration
- [ ] Create Biome integration

### Phase 2: Review Lifecycle
- [ ] Define ReviewStage enum
- [ ] Implement ReviewProgress tracking
- [ ] Integrate with existing specialist system
- [ ] Add progress callbacks for UI

### Phase 3: Specialist Integration
- [ ] Create code-reviewer.md specialist
- [ ] Add linter MCP tools
- [ ] Update specialist-prompts.ts
- [ ] Add fix generation capabilities

### Phase 4: UI Integration
- [ ] Display lint results in UI
- [ ] Show review progress
- [ ] Allow issue selection for fixes
- [ ] Stream fix generation output

### Phase 5: Testing & Documentation
- [ ] Unit tests for linters
- [ ] Integration tests for review flow
- [ ] E2E tests with Playwright
- [ ] Update documentation

## Supported Linters (Initial)

| Language | Linter | Priority |
|----------|--------|----------|
| TypeScript/JavaScript | ESLint | P0 |
| TypeScript/JavaScript | Biome | P1 |
| Python | Ruff | P2 |
| Shell | ShellCheck | P2 |
| YAML | yamllint | P3 |

## Dependencies

No new runtime dependencies required. Will use existing:
- Child process for shell execution
- Existing MCP tool infrastructure
- Existing specialist system

## Related Files

- \`src/core/orchestration/specialist-prompts.ts\`
- \`resources/specialists/gate.md\`
- \`resources/specialists/pr-reviewer.md\`
- \`src/core/tools/\` (for MCP tool integration)
- \`eslint.config.mjs\` (existing config)

## References

- xiuper CodeReview Agent design (for patterns)
- LSP/Linter integration patterns

## Acceptance Criteria

- [ ] Can run ESLint on changed files and collect results
- [ ] Lint results are categorized by severity (error/warning/info)
- [ ] Code review specialist can access lint results
- [ ] Review lifecycle states are properly tracked
- [ ] UI displays lint summary and progress
- [ ] Can generate fix suggestions for lint issues
- [ ] Tests pass for all new functionality
