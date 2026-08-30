# Scripts — Docker Compose Utilities

This directory contains shell scripts that manage the Docker Compose stack for the finance-dashboard project. They provide a consistent, safe interface for starting, stopping, and restarting services across your local checkout and CI/CD environments.

## Quick Start

**Start the stack:**
```bash
./scripts/compose-up.sh
```

**Stop the stack:**
```bash
./scripts/compose-down.sh
```

**Restart the stack:**
```bash
./scripts/compose-restart.sh
```

---

## Commands

### `compose-up.sh` — Start the Stack

Starts the hot-reload Compose stack with automatic rebuilds.

**Usage:**
```bash
./scripts/compose-up.sh [-d|--detach] [-- docker-compose-up-args...]
```

**Flags:**
- `-d`, `--detach` — Run in background. Prints service URLs and returns immediately.
- `--help` — Show help text.
- `--` — Pass remaining arguments to `docker compose up`. Everything after `--` is forwarded as-is.

**Examples:**

Start in foreground (tails logs):
```bash
./scripts/compose-up.sh
# Output:
# UI  http://localhost:3000
# API http://localhost:8000
# Health: curl -sf http://localhost:8000/health && curl -sf http://localhost:3000/health
```

Start in background:
```bash
./scripts/compose-up.sh -d
# Services run in background, prints URLs
```

Pass extra arguments to docker compose:
```bash
./scripts/compose-up.sh -- --scale worker=3
# Starts with 3 worker replicas
```

Combine flags and extra args:
```bash
./scripts/compose-up.sh -d -- --scale worker=2 --no-build
```

### `compose-down.sh` — Stop the Stack

Stops the Compose stack and removes containers.

**Usage:**
```bash
./scripts/compose-down.sh [--wipe] [-- docker-compose-down-args...]
```

**Flags:**
- `--wipe` — Remove named volumes (e.g., `ui_node_modules`). Does NOT delete Postgres bind data under `FINANCE_HELPER_DATA`.
- `--help` — Show help text.
- `--` — Pass remaining arguments to `docker compose down`.

**Examples:**

Stop and keep all data:
```bash
./scripts/compose-down.sh
```

Stop and remove named volumes (node_modules cache, etc.):
```bash
./scripts/compose-down.sh --wipe
# Note: Postgres data is NOT removed; use this only for ephemeral caches.
```

### `compose-wipe-db.sh` — Wipe the Database Clean

Deletes the Postgres bind-mounted data directory for this checkout, so the
next stack start reinitializes an empty database. `compose-down.sh --wipe`
only removes named volumes and does NOT touch this data — use this script
when you need an actually clean database.

**Usage:**
```bash
./scripts/compose-wipe-db.sh [-y|--yes] [--no-up] [-d|--detach]
```

**Flags:**
- `-y`, `--yes` — Skip the confirmation prompt.
- `--no-up` — Leave the stack down after wiping (skip `compose-up.sh`).
- `-d`, `--detach` — Start the stack back up in the background.
- `--help` — Show help text.

**What it does:**
1. Stops this checkout's Compose stack (`docker compose down`).
2. Deletes `FINANCE_HELPER_DATA/pgdata` as resolved from this checkout's `.env`.
3. Starts the stack back up (unless `--no-up`).

Resolves `FINANCE_HELPER_DATA` from this checkout's own `.env`, so it only
wipes the database belonging to this worktree — other worktrees and the main
checkout are unaffected.

**Examples:**

Wipe and restart (foreground), with confirmation prompt:
```bash
./scripts/compose-wipe-db.sh
```

Wipe without prompting, restart in background:
```bash
./scripts/compose-wipe-db.sh -y -d
```

Wipe only, leave the stack down:
```bash
./scripts/compose-wipe-db.sh -y --no-up
```

### `compose-restart.sh` — Restart the Stack

Stops and starts the stack in one command, with consistent file selection.

**Usage:**
```bash
./scripts/compose-restart.sh [-d|--detach] [--wipe] [-- docker-compose-up-args...]
```

**Flags:**
- `-d`, `--detach` — Start in background.
- `--wipe` — Remove named volumes on the way down (keeps Postgres bind data).
- `--help` — Show help text.

**Examples:**

Quick restart (foreground):
```bash
./scripts/compose-restart.sh
```

Restart with fresh node_modules cache and run detached:
```bash
./scripts/compose-restart.sh --wipe -d
```

---

## How They Work

### File Selection

Each script automatically selects the right docker-compose files for your checkout:

**Base files (always):**
- `docker-compose.yml` — production config
- `docker-compose.dev.yml` — local development overrides

**Worktree files (when detected):**
- `docker-compose.worktree.yml` — per-branch isolation (cursor worktree integration)

Worktree detection checks your `.env` file:
- Looks for `FH_COMPOSE_NAME=fh-*` (indicates a worktree checkout)
- Looks for a generated marker comment (`# --- cursor worktree overrides (generated) ---`)

### Validation

Before running any command, the scripts verify:

1. **Docker is available:** `docker` command on PATH and daemon is reachable.
2. **Docker Compose v2 is available:** Uses the `docker compose` plugin (not standalone `docker-compose`).
3. **`.env` file exists:** Prevents accidental use of the default project name, which could hit the wrong stack.
4. **Required compose files exist:** Ensures `docker-compose.yml` and `docker-compose.dev.yml` are present.

If any check fails, the script exits with a clear error message.

### Configuration

The scripts read your `.env` file to determine service ports:

- `API_HOST_PORT` — API server port (default: 8000)
- `UI_HOST_PORT` — UI server port (default: 3000)

After starting the stack, it prints the URLs you can visit:
```
UI  http://localhost:3000
API http://localhost:8000
```

---

## The Helper Library: `compose-lib.sh`

This file is sourced by all three scripts and provides shared utility functions. You can source it in your own scripts or use it from the shell.

### `compose_repo_root` — Find the Project Root

```bash
root=$(compose_repo_root)
```

Returns the project root directory (the parent of the `scripts/` folder).

**Behavior:**
1. If `COMPOSE_ROOT` environment variable is set, uses that value (and normalizes it with `pwd`).
2. Otherwise, works backward from the script location: finds where `compose-lib.sh` is, backs up one directory.

**Example:**
```bash
# From anywhere in the repo:
$(compose_repo_root)
# Output: /Users/me/finance-dashboard

# Override for CI/CD:
COMPOSE_ROOT=/tmp/finance-dashboard compose_repo_root
# Output: /tmp/finance-dashboard
```

### `compose_env_get` — Safely Extract `.env` Values

```bash
port=$(compose_env_get API_HOST_PORT /path/to/.env)
```

Extracts a single key from a `.env` file without eval-ing the entire file. Handles quotes, comments, and the `export` keyword.

**Parameters:**
1. `$1` — Key to search for (e.g., `API_HOST_PORT`)
2. `$2` — Path to `.env` file

**Returns:**
- The value associated with the key (trailing newline stripped, quotes removed).
- Empty string if key not found or file doesn't exist (no error).

**Parsing rules:**

The function searches for a line matching:
```
[optional spaces] [optional 'export'] KEY=value [# optional comment]
```

It then:
- Strips leading/trailing whitespace
- Removes the `export` keyword if present
- Extracts the value after `=`
- Strips inline comments (everything after `#`)
- Removes surrounding quotes (`"value"` or `'value'` becomes `value`)

**Examples:**

Given this `.env`:
```bash
export API_HOST_PORT="8000"  # The API port
UI_HOST_PORT=3000  # override
DEBUG_MODE='true'
```

```bash
compose_env_get API_HOST_PORT .env
# Output: 8000

compose_env_get UI_HOST_PORT .env
# Output: 3000

compose_env_get DEBUG_MODE .env
# Output: true

compose_env_get MISSING_KEY .env
# Output: (empty, no error)
```

### `compose_files` — Get the File List

```bash
files=$(compose_files /path/to/repo)
```

Returns the list of docker-compose files to use for this checkout (one per line, with `-f` prefix).

**Output format:**
```
-f docker-compose.yml
-f docker-compose.dev.yml
[-f docker-compose.worktree.yml]  # optional, if worktree is detected
```

### `compose_run` — Execute Docker Compose

```bash
compose_run /path/to/repo logs -f api
```

Runs `docker compose` with the correct file set for your checkout.

**Parameters:**
1. `$1` — Project root
2. `$@` — Arguments to pass to `docker compose`

**Example:**
```bash
compose_run . up -d
compose_run . down -v
compose_run . ps
```

### Validation Functions

These exit with error if checks fail:

**`compose_require_docker`** — Verify Docker and Docker Compose v2 are available.

**`compose_require_env`** — Verify `.env` file exists.

**`compose_require_files`** — Verify `docker-compose.yml` and `docker-compose.dev.yml` exist.

### `compose_print_urls` — Print Service URLs

```bash
compose_print_urls /path/to/repo
```

Prints the UI and API URLs (read from `.env` or defaults):
```
UI  http://localhost:3000
API http://localhost:8000
Health: curl -sf http://localhost:8000/health && curl -sf http://localhost:3000/health
```

---

## Common Workflows

### Fresh Start (Clean Slate)

```bash
./scripts/compose-down.sh --wipe
./scripts/compose-up.sh
```

### Quick Restart (Keep Data)

```bash
./scripts/compose-restart.sh
```

### Restart with Code Changes

```bash
./scripts/compose-restart.sh -d
# Services rebuild and run in background
```

### Debug a Specific Service

```bash
./scripts/compose-up.sh
# Let it run, then in another terminal:
docker compose logs -f api
docker compose exec api bash
```

### Use in CI/CD

```bash
# Override project root for isolated CI stacks:
COMPOSE_ROOT=/tmp/test-stack ./scripts/compose-up.sh -d
COMPOSE_ROOT=/tmp/test-stack ./scripts/compose-down.sh
```

### Worktree Integration (Cursor)

If you're using a cursor worktree:
```bash
./scripts/compose-up.sh -d
# Automatically loads docker-compose.worktree.yml if detected
```

---

## Troubleshooting

**Error: `missing .env — copy .env.example first`**
```bash
cp .env.example .env
```

**Error: `docker daemon not reachable`**
```bash
# Start Docker Desktop or docker daemon:
open /Applications/Docker.app
# or on Linux: sudo systemctl start docker
```

**Error: `Docker Compose v2 plugin not available`**
```bash
# Update Docker Desktop or install the compose plugin:
docker run --rm --privileged docker/binfmt:latest
```

**Containers keep restarting**
```bash
# Check logs:
docker compose logs -f

# Restart with fresh volumes:
./scripts/compose-restart.sh --wipe -d
```

**Port already in use (e.g., 8000 or 3000)**
```bash
# Check what's using the port:
lsof -i :8000

# Or override in .env:
echo "API_HOST_PORT=9000" >> .env
./scripts/compose-up.sh -d
```

---

## Script Maintenance

All three entry-point scripts source `compose-lib.sh`. If you need to add logic:

- **Shared behavior** (repo root detection, env parsing, validation) → add to `compose-lib.sh`
- **Command-specific behavior** (up flags, down flags) → modify the individual script
- **New commands** → create a new script and source `compose-lib.sh` at the top

Example template for a new command:
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/compose-lib.sh"

ROOT="$(compose_repo_root)"

compose_require_docker
compose_require_env "$ROOT"
compose_require_files "$ROOT"

# Your logic here
compose_run "$ROOT" ps
```
