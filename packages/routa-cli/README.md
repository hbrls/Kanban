# Routa CLI (NPM)

Command-line interface for Routa.js distributed through NPM. This package
provides the `routa` command by launching a platform-specific prebuilt binary,
so terminal workflows can use the same workspace, session, task, ACP,
specialist, Kanban, workflow, review, scan, and team-coordination features as
the web and desktop runtimes.

## Installation

Install globally:

```bash
npm install -g routa-cli
```

Run without installing:

```bash
npx -p routa-cli routa --help
```

The installed command is `routa`.

## Package Layout

`routa-cli` is a thin Node.js wrapper. At install time it resolves one of these
optional platform packages and executes the bundled binary:

- `routa-cli-darwin-arm64`
- `routa-cli-darwin-x64`
- `routa-cli-linux-x64`
- `routa-cli-windows-x64`

If no matching binary is available for the current platform, reinstall the
package so NPM can fetch the correct optional dependency.

## Quick Start

### Prompt Mode

Run a quick one-off `DEVELOPER` session from a single requirement:

```bash
routa -p "Add OAuth login with Google and GitHub providers"
routa -p "Refactor the auth module" --workspace-id my-project
routa -p "Investigate flaky tests" --provider claude
```

Prompt mode uses:
- `--workspace-id <ID>`: target workspace, default `default`
- `--provider <PROVIDER>`: ACP provider for the developer session, default `opencode`
- `--db <PATH>`: SQLite database path, default `routa.db`

### HTTP Backend Server

Start the local Routa backend server:

```bash
routa server --host 127.0.0.1 --port 3210
routa server --static-dir ../../out
```

### ACP Server Mode

Run Routa itself as an ACP server over stdio:

```bash
routa acp serve --workspace-id my-project --provider opencode
```

Related ACP runtime commands:

```bash
routa acp list
routa acp installed
routa acp install opencode
routa acp runtime-status
routa acp ensure-node
routa acp ensure-uv
```

### Specialist and Team Runs

Execute a specialist directly:

```bash
routa specialist run crafter -p "Implement a calculator CLI"
routa specialist run ui-journey-evaluator -p "scenario: core-home-session"
```

Run a coordinated team session:

```bash
routa team run -t "Design and implement Kanban automation" --workspace-id default
routa team status --workspace-id default
```

### Fitness and Fluency

Run the Harness Fluency assessment from the CLI:

```bash
routa fitness fluency
routa fitness fluency --profile agent_orchestrator
routa fitness fluency --json
routa fitness fluency --format json --compare-last --no-save
```

## Command Overview

Top-level commands from `routa --help`:

```text
server      Start the Routa HTTP backend server
acp         ACP server and runtime management
agent       Agent lifecycle and specialist execution helpers
specialist  Run specialist definitions directly
task        Task CRUD and artifact operations
kanban      Board, card, and column management
workspace   Workspace management
skill       Skill discovery and reload
session     Persisted ACP session inspection and picking
rpc         Send raw JSON-RPC requests
delegate    Delegate a task to a specialist agent
chat        Interactive chat with an agent
scan        Repository static/security scans
workflow    YAML-defined workflow execution and validation
review      Read-only code review analysis against git changes
team        Team coordination with an agent lead
```

### Workspace Management

```bash
routa workspace list
routa workspace create --name my-project
```

### Agent and Specialist Management

```bash
routa agent list --workspace-id default
routa agent create --name dev-agent --role DEVELOPER --workspace-id default
routa agent run --specialist crafter -p "Add auth middleware" --workspace-id default
```

### Task Management

```bash
routa task list --workspace-id default
routa task create \
  --title "Add feature" \
  --objective "Implement user authentication" \
  --workspace-id default
routa task update-status \
  --id <task-id> \
  --status COMPLETED \
  --agent-id <agent-id>
routa task artifact-provide \
  --task-id <task-id> \
  --agent-id <agent-id> \
  --type logs \
  --content "build ok"
routa task artifact-list --task-id <task-id>
```

### Sessions, Kanban, and Workflow

```bash
routa session list --workspace-id default
routa session get --id <session-id>
routa session pick --workspace-id default

routa kanban card create --title "Investigate release flow" --workspace-id default --board-id <board-id> --column-id <column-id>
routa kanban card move --card-id <card-id> --target-column-id todo

routa workflow validate .routa/workflows/release.yaml
routa workflow run .routa/workflows/release.yaml --verbose
```

### Review, Scan, Chat, and Delegate

```bash
routa chat --workspace-id default --provider opencode --role DEVELOPER
routa scan --project-dir . --output-dir artifacts/security
routa review --help
routa delegate \
  --task-id <task-id> \
  --caller-agent-id <parent-agent-id> \
  --caller-session-id <session-id> \
  --specialist CRAFTER \
  --provider opencode
```

## Requirements

- Node.js 18+
- A supported ACP provider installed, such as `opencode` or `claude`
- SQLite is used by default via `--db routa.db`
- One of the supported prebuilt binary packages for your platform

## Architecture

The NPM package is a thin launcher around the Rust CLI:

```text
routa-cli (NPM package)
  ├── bin/routa.js            (platform detection + child process spawn)
  ├── optionalDependencies    (prebuilt platform binaries)
  └── routa binary
       ↓
routa CLI (Rust)
  ├── commands/prompt.rs      (-p prompt mode)
  ├── commands/server.rs      (HTTP backend bootstrap)
  ├── commands/acp_serve.rs   (ACP stdio server)
  └── commands/*.rs           (agent/task/kanban/workflow/team operations)
       ↓
routa-core (shared business logic)
  ├── orchestration/          (RoutaOrchestrator)
  ├── acp/                    (AcpManager)
  ├── rpc/                    (RpcRouter)
  └── store/                  (SQLite stores)
```

This keeps the NPM distribution aligned with the Rust CLI while avoiding a
local Rust toolchain requirement for end users.

## Documentation

- [Repository Guide](../../AGENTS.md)
- [Rust CLI README](../../crates/routa-cli/README.md)

## License

MIT
