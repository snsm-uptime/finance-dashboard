# Cursor worktrees (finance-dashboard)

Parallel agents need **isolated checkouts** plus **unique Compose ports/data**.
This folder wires that up. New-user flow: see `HOW-TO-DEV.md`.

## Files

| File | Role |
| --- | --- |
| `worktrees.json` (under `.cursor/`) | Cursor runs `setup-worktree-unix.sh` on new worktrees |
| `setup-worktree-unix.sh` | Copy `.env`, assign ports/project/data dir, `uv`/`npm` |
| `worktree-add.sh` | Create `../finance-dashboard-wt-<slug>` + branch |
| `worktree-bootstrap.sh` | Set `ROOT_WORKTREE_PATH`, run setup, optional `compose-up -d` |
| `worktree-remove.sh` | Compose-down (best effort) + `git worktree remove` |
| `docker-compose.worktree.yml` (repo root) | Fast healthchecks so `depends_on: service_healthy` works in minutes |

Day-to-day Compose helpers (primary or worktree):

| Script | Role |
| --- | --- |
| `scripts/compose-up.sh` | Hot-reload up (auto worktree overlay when `.env` looks like a worktree) |
| `scripts/compose-down.sh` | Matching down; `--wipe` → named volumes only (`down -v`) |
| `scripts/compose-restart.sh` | Down then up |

Compose knobs (written into the worktree `.env`):

- `FH_COMPOSE_NAME` — container project name (default `finance-helper`)
- `API_HOST_PORT` / `UI_HOST_PORT` — host ports (default `8000` / `3000`)
- `FINANCE_HELPER_DATA` — Postgres bind parent (default `~/finance-helper`)
- `PUBLIC_APP_URL` — must match the UI host port for mail links

## Typical flow

From the primary checkout:

```bash
./scripts/cursor-worktree/worktree-add.sh 2-3-invite feat/2/2-3-invite-members-by-email
cd ../finance-dashboard-wt-2-3-invite
../finance-dashboard/scripts/cursor-worktree/worktree-bootstrap.sh
./scripts/compose-up.sh -d   # if START_COMPOSE=0 during bootstrap
```

Re-run bootstrap (deps / `.env` only):

```bash
START_COMPOSE=0 ../finance-dashboard/scripts/cursor-worktree/worktree-bootstrap.sh
```

List / remove:

```bash
git worktree list
# from primary:
./scripts/cursor-worktree/worktree-remove.sh 2-3-invite
```
