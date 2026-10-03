---
title: "Docker build fails because npm postinstall assets are missing"
date: "2026-05-22"
kind: issue
status: open
severity: medium
area: "docker"
tags: ["docker", "build", "npm", "postinstall"]
reported_by: "github"
related_issues: ["https://github.com/phodal/routa/pull/555", "https://github.com/phodal/routa/pull/578", "https://github.com/phodal/routa/issues/579"]
github_issue: 579
github_state: open
github_url: "https://github.com/phodal/routa/issues/579"
---

# Docker build fails because npm postinstall assets are missing

## What Happened

`docker compose up` fails during the Dockerfile dependency layer:

```text
Error: Cannot find module '/app/scripts/install/run-patch-package.mjs'
```

The Dockerfile copies only `package.json` and `package-lock.json` before running `npm ci`, but root lifecycle scripts need files under `scripts/install/`.

## Why It Matters

Fresh users cannot build the default Docker image from `main`. The failure happens before the application build starts, so Docker Compose is not a usable setup path.

## Root Cause

The dependency layer intentionally copies a small subset of files for cache efficiency, but the root `postinstall` and `prepare` scripts are part of the install contract:

- `postinstall`: `node scripts/install/run-patch-package.mjs`
- `prepare`: `node scripts/install/run-hooks-sync.mjs`

Those scripts also need `patches/` and the hook runtime entrypoint when lifecycle scripts run inside the container.

## Remediation

- Copy `scripts/install/`, `tools/hook-runtime/`, and `patches/` before `npm ci` in the Dockerfile dependency stage.
- Keep the rest of the application source copied only in the build stage.

## Verification Plan

- `docker compose build app`
- `entrix run --tier fast`

## Verification

- `colima nerdctl -- build -t routa-js-build-check .` passed.
- `docker-compose config` passed.
- `entrix run --tier fast` passed.

## Release Follow-up

- GitHub issue #579 reports that the latest stable tag `v0.18.1` remains unbuildable even though PR #555 fixed the Docker dependency layer on `main`.
- PR #578 added `git` and `ca-certificates` to the runtime image before the release, covering the requested runtime git follow-up from #570.
- `v0.19.0` is the release vehicle for both fixes. The release branch validation includes `npm ci --legacy-peer-deps`, `entrix run --dry-run`, and `entrix run --tier fast`.
- Local Docker build smoke could not be re-run during the release because this machine does not have the `docker` CLI installed; the prior `colima nerdctl` build result remains the latest local image-build evidence in this tracker.
