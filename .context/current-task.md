# Current Task

## Kanban Detail: Strict Resume and Explicit New

### Objective

Kanban Task Card Detail currently uses one HTTP endpoint, `POST /api/acp`, to
dispatch two different operations through a JSON-RPC request body:

```text
method = "session/load"  -> resume/load an existing Session
method = "session/new"   -> create a new Session
```

The Kanban Detail UI must expose these as two explicit actions:

```text
Resume -> strictly resume the selected persisted Session
New    -> always create a new Session with the current Task context
```

The change is an HTTP API split. It is not a new JSON-RPC method and it does
not change the ACP runtime implementation.

## Confirmed Constraints

1. Scope is local Kanban mode in the Tauri application.
2. `Resume` must not fall back to creating a new Session.
3. `New` must not attempt to resume or reuse the old Session.
4. Neither action performs an `is_alive` check. The operator decides whether
   the old ACP process is still usable.
5. Existing `AcpManager.create_session*` and `AcpManager.load_session*`
   implementations remain unchanged.
6. The existing `POST /api/acp` endpoint remains available for compatibility
   with other ACP callers.
7. Task/Lane binding is handled by the Kanban layer, not by the generic ACP
   Session endpoint.

## Current Architecture

The current Rust route is:

```text
POST /api/acp
  JSON-RPC method=session/new
  JSON-RPC method=session/load
```

This is one HTTP JSON-RPC multiplex endpoint. It is not two REST endpoints.

The underlying runtime already provides the required operations:

```text
AcpManager.create_session(...)
AcpManager.create_session_from_inline(...)
AcpManager.create_session_with_options(...)

AcpManager.load_session(...)
AcpManager.load_session_from_inline(...)
```

The existing `session/load` route also contains policy behavior that is not
appropriate for the strict Kanban Resume action:

- `AcpManager.is_alive(...)` lookup;
- returning an `attached` result for an in-memory Session;
- Provider native-resume capability checks;
- fallback to `create_session(...)` when native resume is unavailable or fails;
- provider-specific recreation behavior.

Those policies belong to the old compatibility path and must not be used by
the strict Resume endpoint.

## Proposed HTTP Endpoints

Add two explicit HTTP routes under the ACP boundary:

```text
POST /api/acp/resume
POST /api/acp/new
```

The request body contains the existing `params` fields used by
`session/load` and `session/new`. The operation is selected by the URL path,
not by adding a new JSON-RPC `method` value.

### Resume

```http
POST /api/acp/resume
Content-Type: application/json
```

Example body:

```json
{
  "sessionId": "routa-session-id",
  "cwd": "/path/to/repository",
  "toolMode": "default",
  "mcpProfile": "default"
}
```

The exact existing `session/load` parameter names remain unchanged. The
endpoint may accept optional persisted-session overrides already supported by
the current load path, but it must not introduce a new JSON-RPC envelope.

### New

```http
POST /api/acp/new
Content-Type: application/json
```

Example body:

```json
{
  "cwd": "/path/to/repository",
  "provider": "claude",
  "workspaceId": "workspace-id",
  "branch": "branch-name",
  "role": "CRAFTER",
  "specialistId": "specialist-id",
  "taskAdaptiveHarness": {}
}
```

The body reuses the existing `session/new` metadata and launch options. The
Kanban caller is responsible for including the current Task/Lane context that
the new Session needs.

## Strict Resume Contract

`POST /api/acp/resume` performs exactly this sequence:

```text
request.sessionId
      -> read persisted Session Row from SQLite
      -> read provider_session_id
      -> call AcpManager.load_session* directly
      -> return success or the underlying error
```

Required behavior:

- Require a `sessionId`.
- Require that the persisted Session Row exists.
- Require the persisted `provider_session_id` needed by the load operation.
- Reuse persisted provider, cwd, workspace, role, branch, parent Session, and
  custom launch metadata as the existing load implementation does.
- Start/load the Provider through the existing `AcpManager.load_session*`.
- Return the resulting Session information on success.

Forbidden behavior:

- No `AcpManager.is_alive(...)` call.
- No lookup in the in-memory Session map to decide the route.
- No `attached` response.
- No native-resume capability precheck in the HTTP handler.
- No fallback to `create_session*`.
- No new Routa Session ID.
- No Task/Lane mutation.

If the Provider does not support native resume, the Provider returns an error
and the endpoint returns that error. The endpoint must not silently recreate a
Session.

## Explicit New Contract

`POST /api/acp/new` performs exactly this sequence:

```text
request metadata
      -> call AcpManager.create_session*
      -> create a new Routa Session ID
      -> start a new Provider runtime
      -> persist the new Session Row and provider_session_id
      -> return the new Session ID
```

Required behavior:

- Always create a new Session.
- Use the current Task/Lane metadata supplied by the Kanban caller.
- Use the existing provider, role, workspace, branch, model, specialist,
  tool-mode, MCP, and task-harness fields where applicable.
- Return the new Routa Session ID and normal Session metadata.

Forbidden behavior:

- No lookup of the old Session's `provider_session_id`.
- No call to `load_session*`.
- No `is_alive` check.
- No reuse of the old Routa Session ID.
- No implicit resume.

After the endpoint succeeds, the Kanban orchestration updates the current
Task/Lane binding to the new Session. This keeps generic ACP Session creation
independent from Kanban persistence rules.

## Layer Boundaries

```text
Kanban Detail
  Resume button -> POST /api/acp/resume
  New button    -> POST /api/acp/new
                         |
                         v
                 Rust HTTP route adapter
                         |
                         v
                 existing AcpManager methods
                         |
                         v
                 ACP Provider subprocess/runtime
```

Only the HTTP route adapter and the Kanban caller change. The following remain
unchanged:

- ACP JSON-RPC protocol methods (`session/new`, `session/load`, etc.);
- `AcpManager` process/session lifecycle implementation;
- Provider subprocess handling;
- SQLite Session schema;
- existing compatibility behavior of `POST /api/acp`.

The route adapter may share private parsing/response helpers with the current
route, but it must not reintroduce the old `session/load` policy chain into the
strict Resume path.

## Error Semantics

### Resume

```text
Session Row missing                  -> error
provider_session_id missing          -> error
Provider native load unsupported     -> error
Provider load fails                  -> error
```

All errors terminate Resume. There is no automatic New operation.

### New

```text
Invalid launch metadata              -> error
Provider startup fails               -> error
Session persistence fails            -> error
```

New does not inspect or alter the old Session when it fails.

## Frontend Integration

The Kanban Detail actions should be wired as two independent calls:

```text
Resume button
  -> POST /api/acp/resume
  -> show success or error
  -> never call New on failure

New button
  -> POST /api/acp/new
  -> bind returned Session to current Task/Lane
  -> show success or error
```

The existing generic ACP client can continue using `POST /api/acp`. A separate
Kanban-specific client function is preferred so the two actions cannot be
accidentally merged back into one fallback workflow.

## Non-Goals

- Do not add a `session/resume` JSON-RPC method.
- Do not change ACP Provider protocol behavior.
- Do not modify `AcpManager` lifecycle semantics.
- Do not add housekeeping that changes persisted Lane Session status.
- Do not infer process liveness from SQLite.
- Do not make Resume a retry-or-recreate operation.

