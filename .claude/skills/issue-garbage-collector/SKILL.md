---
name: issue-garbage-collector
description: Two-phase cleanup of duplicate and outdated issue files in docs/issues/. Phase 1 uses Python script for fast pattern matching. Phase 2 uses claude -p for semantic analysis on suspects only.
when_to_use: When the issues directory becomes cluttered, after resolving multiple issues, or as periodic maintenance (weekly during active development, monthly otherwise).
version: 1.2.0
---

## Quick Start

```bash
# Phase 1: Run Python scanner (fast, free)
python3 .github/scripts/issue-scanner.py

# Phase 1: Get suspects only (for Phase 2 input)
python3 .github/scripts/issue-scanner.py --suspects-only

# Phase 1: JSON output (for automation)
python3 .github/scripts/issue-scanner.py --json

# Phase 1: Validation check (CI integration, exit 1 if errors)
python3 .github/scripts/issue-scanner.py --check
```

---

## Harness Integration

- Repo-defined entry: `docs/harness/automations.yml` contains `issue-gc-review`
- Harness surface: `settings/harness` → `Cleanup & Correction`
- Data source: the Harness automation view reads suspect data from `python3 .github/scripts/issue-scanner.py --suspects-only`
- Intended usage: review pending duplicate / stale / open-check suspects in Harness first, then decide whether to run the cleanup workflow below

---

## Two-Phase Strategy (Cost Optimization)

**Problem**: Running deep AI analysis on every issue is expensive.

**Solution**: Two-phase approach:
1. **Phase 1 (Fast/Free)** — Python script for pattern matching
2. **Phase 2 (Deep/Expensive)** — `claude -p` only on suspects

```
┌─────────────────────────────────────────────────────────┐
│  All Issues (N files)                                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Phase 1: Python Scanner (.github/scripts/issue-scanner.py)│ │
│  │ - Filename keyword extraction                     │  │
│  │ - YAML front-matter validation                    │  │
│  │ - Same area + keyword overlap detection           │  │
│  │ - Age-based staleness check                       │  │
│  │ → Output: Suspect list (M files, M << N)          │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Phase 2: Deep Analysis (claude -p, only M files)  │  │
│  │ - Content similarity                              │  │
│  │ - Semantic duplicate detection                    │  │
│  │ - Merge recommendations                           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1: Python Scanner

Run `python3 .github/scripts/issue-scanner.py` to get:

### 1.1 Formatted Table View

```
====================================================================================================
📋 ISSUE SCANNER REPORT
====================================================================================================

📊 ISSUE TABLE:
----------------------------------------------------------------------------------------------------
Status       Sev  Date         Area               Title
----------------------------------------------------------------------------------------------------
✅ resolv     🟠    2026-03-02   background-worker  HMR 导致 sessionToTask 内存 Map 丢失
🔴 open       🟡    2026-03-04   ui                 Task Execute button disabled
...
----------------------------------------------------------------------------------------------------
Total: 12 issues

📈 SUMMARY BY STATUS:
  🔴 open: 5
  ✅ resolved: 7
```

### 1.2 Validation Errors

If any issue has malformed front-matter, the scanner reports:

```
❌ VALIDATION ERRORS (need AI fix):
------------------------------------------------------------
  2026-03-08-broken-issue.md:
    - Missing required field: area
    - Invalid status: pending (valid: ['open', 'investigating', 'resolved', 'wontfix', 'duplicate'])
```

**Action**: Ask AI to fix the file:
```bash
claude -p "Fix the front-matter in docs/issues/2026-03-08-broken-issue.md. Add missing 'area' field and change status to a valid value."
```

### 1.3 Suspect Detection

The scanner automatically detects:

| Type | Detection Rule | Example |
|------|----------------|---------|
| **Duplicate** | Same area + ≥2 common keywords | `hmr-task` vs `task-hmr-recovery` |
| **Stale** | `open` > 30 days | Issue from 2026-01-15 still open |
| **Stale** | `investigating` > 14 days | Stuck investigation |

Output:
```
⚠️  SUSPECTS (need Phase 2 deep analysis):
------------------------------------------------------------

  🔗 Potential Duplicates:
    - 2026-03-02-hmr-resets-session-to-task-map.md
      ↔ 2026-03-08-background-task-hmr-recovery.md
      Reason: Same area 'background-worker', keywords: {'task', 'hmr'}

  ⏰ Stale Issues:
    - 2026-02-01-old-bug.md: Open for 35 days (>30)
```

### 1.4 JSON Output for Automation

```bash
# Get suspects as JSON for scripting
python3 .github/scripts/issue-scanner.py --suspects-only
```

Output:
```json
[
  {
    "file_a": "2026-03-02-hmr-resets-session-to-task-map.md",
    "file_b": "2026-03-08-background-task-hmr-recovery.md",
    "reason": "Same area 'background-worker', keywords: {'task', 'hmr'}",
    "type": "duplicate"
  }
]
```

---

## Phase 2: Automatic Deep Analysis

**IMPORTANT**: After Phase 1, proceed automatically to Phase 2 without asking. Do NOT ask "Would you like me to proceed?" — just do it.

### Execution Flow

1. Run `python3 .github/scripts/issue-scanner.py`
2. For each suspect found, **automatically** perform deep analysis
3. For each action needed, **execute immediately** (update status, merge, etc.)
4. Only ask for confirmation on **destructive actions** (delete, merge)
5. Report final summary when done

### For Each Suspect Type

**Duplicates** — Read both files, compare content:
- If same root cause → Merge (keep newer, add context from older)
- If related but different → Add `related_issues` cross-reference
- If distinct → Skip (false positive)

**Open Issues** — Check if resolved:
- Read the issue, check `Relevant Files` in codebase
- If code shows fix → `python3 .github/scripts/issue-scanner.py --resolve <file>`
- If still broken → Leave as open
- If unclear → Leave as open, add comment in issue

**Stale Issues** (open > 30 days):
- Check if code still exists
- If fixed → Resolve
- If code removed → Close with `--close`
- If still relevant → Create GitHub issue for tracking

### Quick Update Commands

Use the scanner's update commands for fast changes:

```bash
# Resolve issues (status: open → resolved)
python3 .github/scripts/issue-scanner.py --resolve file1.md file2.md

# Close issues (status: open → wontfix)
python3 .github/scripts/issue-scanner.py --close file.md

# Generic field update
python3 .github/scripts/issue-scanner.py --set severity high --files file.md
```

### Safety Rules

1. **Never delete `_template.md`**
2. **Never delete issues with `status: investigating`** — active work
3. **Ask for confirmation** only for: delete, merge
4. **Auto-execute** for: status updates, adding cross-references
5. **Preserve knowledge** — resolved issues are valuable

---

## Periodic Maintenance

| Frequency | Action |
|-----------|--------|
| After adding issues | Run `python3 .github/scripts/issue-scanner.py` |
| Weekly (active dev) | Full scan + Phase 2 on suspects |
| Monthly (stable) | Full scan + triage all open issues |

---

## Cost Optimization

| Approach | Deep Analysis | Cost |
|----------|---------------|------|
| Naive (all) | N files | 💰💰💰💰💰 |
| Two-phase | ~M suspects (M << N) | 💰 |

**Savings**: ~90% cost reduction by filtering in Phase 1.
