# Contributing to Routa

Thanks for contributing.

## Before you start

- Read [AGENTS.md](AGENTS.md) for repository-specific engineering rules.
- Use a focused branch and keep changes small.
- Prefer one concern per commit.

## Local setup

### Web

```bash
npm install --legacy-peer-deps
npm run dev
```

### Desktop

```bash
npm install --legacy-peer-deps
npm --prefix apps/desktop install
npm run tauri:dev
```

## Development expectations

- Follow the lint and test rules in [AGENTS.md](AGENTS.md).
- For source-code changes, expect lint, typecheck, and tests to run before push.
- Do not mix unrelated refactors with feature or bug-fix changes.
- Update docs when public behavior, commands, or workflows change.

## Pull requests

- Explain the user-visible change and the reasoning.
- Include screenshots or recordings for UI changes.
- List the checks you ran.
- Link related issues when applicable.

## Reporting bugs

- Use GitHub Issues for bugs and feature requests.
- For security-sensitive issues, use the process in [SECURITY.md](SECURITY.md).
