# Cursor worktrees (finance-dashboard)

Parallel feature development with **isolated checkouts** + **unique Compose ports/data** + **separate Claude Code sessions**.
This enables multiple developers or stories to work simultaneously without port/database conflicts.

## Core Concept

Git worktrees create independent checkouts sharing a single `.git` directory. Each worktree gets:
- Unique git branch
- Unique Docker Compose project name
- Unique host ports (prevents API/UI port collisions)
- Isolated Postgres data directory
- Separate `node_modules` and `.venv`

This setup ensures each Claude Code session (or developer) can run the full stack in parallel.

## Files

| File | Role |
| --- | --- |
| `worktree-add.sh` | Create `../finance-dashboard-wt-<slug>` sibling checkout + branch |
| `worktree-bootstrap.sh` | Copy `.env`, assign unique ports/project/data dir, install deps, optional Compose |
| `setup-worktree-unix.sh` | Core bootstrap logic: `.env` rewrites, `uv`/`npm`, Compose lifecycle (see also its `pr` subcommand below) |
| `worktree-remove.sh` | Compose-down (best effort) + `git worktree remove` |
| `worktrees.json` (under `.cursor/`) | Cursor IDE: auto-runs `setup-worktree-unix.sh` on new worktrees |

Day-to-day Compose helpers (work in primary or any worktree):

| Script | Role |
| --- | --- |
| `scripts/compose-up.sh` | Hot-reload up; auto-detects worktree via `.env` |
| `scripts/compose-down.sh` | Down; `--wipe` → clear volumes only |
| `scripts/compose-restart.sh` | Down then up |

## Worktree `.env` Configuration

Each worktree receives a unique, auto-generated `.env` block:

```
FH_COMPOSE_NAME=fh-{branch-slug}           # e.g., fh-feat-2-3-invite
API_HOST_PORT={8010..8400}                 # Stable offset from worktree path
UI_HOST_PORT={3010..3400}                  # Stable offset from worktree path
FINANCE_HELPER_DATA=~/finance-helper-wt/{compose-name}  # Isolated Postgres data
PUBLIC_APP_URL=http://localhost:{UI_HOST_PORT}  # Used for email links, etc.
```

These values are auto-calculated and injected by `setup-worktree-unix.sh`.

## Typical Workflow: Single Story per Worktree

### Step 1: Create a worktree for your story
From the **primary checkout** (`finance-dashboard/`):

```bash
./scripts/worktree/worktree-add.sh <slug> <branch>
```

Example:
```bash
./scripts/worktree/worktree-add.sh 2-3-invite feat/2/2-3-invite-members-by-email
```

This creates `../finance-dashboard-wt-2-3-invite` with the specified branch checked out.

### Step 2: Bootstrap the worktree
Inside the new worktree:

```bash
cd ../finance-dashboard-wt-2-3-invite
../finance-dashboard/scripts/worktree/worktree-bootstrap.sh
```

This:
- Copies `.env` from primary, injects unique Compose name/ports/data dir
- Installs Python (`uv sync --group dev`) and Node deps (`npm ci`)
- Starts Docker Compose (detached, `-d`)
- Prints summary with assigned ports and URLs

**Output example:**
```
==> Primary checkout: /path/to/finance-dashboard
==> Worktree:         /path/to/finance-dashboard-wt-2-3-invite
==> Worktree Compose: name=fh-2-3-invite api=:8040 ui=:3040
==> Postgres data: ~/finance-helper-wt/fh-2-3-invite/pgdata

Worktree ready: /path/to/finance-dashboard-wt-2-3-invite
UI:  http://localhost:3040
API: http://localhost:8040
```

### Step 3: Start Claude Code in the worktree
From **inside the worktree directory**, start a Claude Code session:

```bash
claude .
```

This launches Claude Code with the worktree as the root. Claude sees only this branch's files and can safely run commands/tests without affecting other worktrees.

### Step 4: Work on your story
- Write code, run tests, debug with full stack (`api`, `ui`, `postgres`)
- All Claude Code suggestions/refactorings are scoped to this worktree
- Stage your changes, then commit + push + open a PR in one step:
  ```bash
  ./scripts/worktree/setup-worktree-unix.sh pr \
    --title "Add manual origin card" \
    --body "Implements story 4.2..." \
    --commit-title "feat: add manual origin card"
  ```
  This commits what's staged, pushes the current branch explicitly to `origin/<branch>` (worktree branches intentionally track `origin/main` for easy `git pull`, so a plain `git push` would target the wrong branch), then runs `gh pr create`.
  - `--commit-title` is required whenever something is staged.
  - If nothing is staged, it prompts `Continue and just push + open PR? [y/N]` (interactive terminals only — fails fast with an error if stdin isn't a TTY).

---

## Parallel Development: Multiple Stories

To work on **2+ stories simultaneously**, repeat Steps 1–3 in separate terminals:

**Terminal 1 (Story 2-3):**
```bash
cd ~/finance-dashboard
./scripts/worktree/worktree-add.sh 2-3-invite feat/2/2-3-invite-members-by-email
cd ../finance-dashboard-wt-2-3-invite
../finance-dashboard/scripts/worktree/worktree-bootstrap.sh
claude .
```

**Terminal 2 (Story 2-4):**
```bash
cd ~/finance-dashboard
./scripts/worktree/worktree-add.sh 2-4-billing feat/2/2-4-billing-page
cd ../finance-dashboard-wt-2-4-billing
../finance-dashboard/scripts/worktree/worktree-bootstrap.sh
claude .
```

Each Claude session:
- Has its own port set (e.g., 3040 vs 3041)
- Runs independently with no port conflicts
- Can debug/test the full stack in parallel
- Is isolated to its branch/changes

---

## Common Commands

### Reboot bootstrap (deps/`.env` only, skip Compose)
```bash
START_COMPOSE=0 ../finance-dashboard/scripts/worktree/worktree-bootstrap.sh
```

### List all worktrees
```bash
git worktree list
```

### Stop Compose for this worktree only
```bash
./scripts/compose-down.sh
```

### Restart Compose
```bash
./scripts/compose-restart.sh
```

### Remove a worktree when done
From the **primary checkout**:
```bash
./scripts/worktree/worktree-remove.sh 2-3-invite
```

This stops Compose and removes the worktree from `.git/worktrees/`.

### Check assigned ports for a worktree
Inside the worktree:
```bash
grep -E '^(API_HOST_PORT|UI_HOST_PORT|PUBLIC_APP_URL)=' .env
```

---

## Cursor IDE Integration (Alternative)

If using **Cursor editor** instead of Claude Code CLI:
- Cursor reads `.cursor/worktrees.json` and auto-runs `setup-worktree-unix.sh` on new worktrees
- Open the worktree folder in Cursor: **File → Open Folder** → select `../finance-dashboard-wt-<slug>`
- Cursor will bootstrap it automatically

For Claude Code CLI, manually run `worktree-bootstrap.sh` as shown above.

---

## Troubleshooting

**Port already in use:**
```bash
# Find which process is using the port
lsof -i :3040

# The setup assigns ports based on worktree path hash; a new worktree gets a different port.
# If you need a specific port, manually edit the worktree's .env before starting Compose.
```

**Database not healthy:**
```bash
# Check Compose status
./scripts/compose-ps.sh

# View logs
docker compose logs db
```

**Compose not starting in bootstrap:**
```bash
# Re-run with docker-compose explicitly
./scripts/compose-up.sh -d
```

**Stale worktree reference:**
```bash
# If .git/worktrees/<name> is broken, repair it
git worktree repair
```
