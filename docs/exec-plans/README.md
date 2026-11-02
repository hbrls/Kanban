# Execution Plans

This directory stores implementation plans that bridge design intent and code changes.

Use it for:
- bounded plans for active multi-step work
- archived plans that explain what was shipped
- cross-cutting technical debt that needs prioritization

Directory structure:
- `active/`: plans that are currently in execution
- `completed/`: plans that match work already shipped or intentionally closed
- `tech-debt-tracker.md`: debt items that cut across multiple features or subsystems

Rules:
- keep plans implementation-sized
- link plans to issues, PRs, or local incident records when possible
- move finished plans out of `active/` instead of letting them rot in place
