---
title: "React Duplicate Keys in CRAFTER Messages"
date: 2026-03-05
status: resolved
severity: medium
area: frontend
reported_by: QoderAI
---

## What Happened

React warning appeared in the console:
```
Encountered two children with the same key, `call_f7408eaaa5de48faa542fa38`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.
```

Location: `src/client/components/task-panel.tsx` line 425

The error occurred when rendering CRAFTER message bubbles in the chat history view.

## Why This Might Happen

The issue was caused by duplicate message IDs being generated in the history loading logic. In the `CraftersView` component, when loading session history from the API and converting it to `CrafterMessage` objects:

1. Messages were being created with `crypto.randomUUID()` for IDs
2. However, when consecutive messages of the same type (assistant/thought) were merged, the original message's ID was preserved
3. This could potentially lead to duplicate IDs if the same random UUID pattern was generated or if the merging logic had edge cases
4. The React key prop was directly using `msg.id`, causing the duplicate key warning

The specific problematic code was in the history loading useEffect (lines 261-341) where messages were constructed from session history.

## Relevant Files

- `src/client/components/task-panel.tsx` (lines 261-341, 424-426)
- `src/client/components/task-panel.tsx` (lines 296-302, 312-318, 322-329)

## Solution Applied

Fixed by prefixing message IDs with role-specific prefixes to ensure global uniqueness:
- Assistant messages: `assistant-${crypto.randomUUID()}`
- Thought messages: `thought-${crypto.randomUUID()}`
- Tool messages: `tool-${crypto.randomUUID()}`

This ensures that even if `crypto.randomUUID()` somehow generated the same value, the role prefix would make the full ID unique.