# How to develop (local)

Relative paths assume your primary clone directory is named `finance-dashboard`. If you renamed it, use the absolute path printed by `worktree-add` / `worktree-bootstrap` instead of `../finance-dashboard/...`.

## Prerequisites

- Docker with Compose v2
- Optional (faster host feedback): [`uv`](https://docs.astral.sh/uv/) and Node/`npm`
- Disk for Postgres **outside** the repo (default: `~/finance-helper`)

## 1. First-time install (primary checkout)

```bash
git clone <repo-url> finance-dashboard
cd finance-dashboard

cp .env.example .env
# Optional: set FINANCE_HELPER_DATA to an absolute path outside the repo.
mkdir -p "${FINANCE_HELPER_DATA:-$HOME/finance-helper}/pgdata"
```

Start the hot-reload stack (`db` / `api` / `ui`):

```bash
./scripts/compose-up.sh
# Detached:
./scripts/compose-up.sh -d
```

Health (defaults `8000` / `3000` unless you changed `.env`):

- API: http://localhost:8000/health
- UI: http://localhost:3000/health

URLs are printed before `up` starts (foreground) and again after a detached start.

Stop / restart:

```bash
./scripts/compose-down.sh          # keep volumes + bind data
./scripts/compose-restart.sh -d    # down then up (detached)
./scripts/compose-down.sh --wipe   # also remove named Compose volumes (not Postgres bind data)
```

`--wipe` maps to `docker compose down -v` (named volumes such as `ui_node_modules`). Postgres is a host bind under `FINANCE_HELPER_DATA` / `~/finance-helper-wt/...` and is **not** deleted by `--wipe`.

Day-to-day product setup notes (tests, prod overlay) live in `README.md`. This file is the parallel-agent / Compose cheat sheet.

## 2. Parallel work with git worktrees

Use a **sibling** worktree when another agent or branch needs its own ports and Postgres data.

### Create

From the **primary** checkout:

```bash
./scripts/worktree/worktree-add.sh <slug> <branch>
```

Example:

```bash
./scripts/worktree/worktree-add.sh 2-3-invite feat/2/2-3-invite-members-by-email
```

That creates `../finance-dashboard-wt-<slug>` from the remote default branch (`origin/main` when that is the default).

### Bootstrap

Use the absolute `Next:` path printed by `worktree-add`, or from the worktree:

```bash
cd ../finance-dashboard-wt-<slug>
# If your primary folder is named finance-dashboard:
../finance-dashboard/scripts/worktree/worktree-bootstrap.sh
```

Deps only (start Compose yourself later):

```bash
START_COMPOSE=0 ../finance-dashboard/scripts/worktree/worktree-bootstrap.sh
```

Bootstrap copies `.env` from the primary checkout when present, assigns unique `FH_COMPOSE_NAME` / ports / data dir under `~/finance-helper-wt/`, installs deps, and optionally starts Compose. It sets `ROOT_WORKTREE_PATH` for you via git (override with `ROOT_WORKTREE_PATH=...` if discovery fails for a renamed clone).

### Run / stop in a worktree

Same scripts as the primary checkout. They add `docker-compose.worktree.yml` automatically when the worktree `.env` markers are present:

```bash
./scripts/compose-up.sh -d
./scripts/compose-down.sh
./scripts/compose-restart.sh -d
```

Ports and URLs are printed by the scripts (not always `3000` / `8000`). Values live in the worktree `.env`.

### Commit, push, open PR

```bash
git status
git add <files>
git commit -m "your message"
git push -u origin HEAD

gh pr create --base main --title "Story title" --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [ ] ...

EOF
)"
```

One story per branch (repo convention). Open the PR from the worktree.

### Remove the worktree (after merge)

Prefer stopping Compose first; `worktree-remove` also attempts `compose-down` when `.env` exists:

```bash
# from primary:
./scripts/worktree/worktree-remove.sh <slug>
```

Postgres data under `~/finance-helper-wt/` is left alone unless you delete that directory on disk.

---

## Cheat sheet

| Step | Command |
| --- | --- |
| First run | `cp .env.example .env` → `./scripts/compose-up.sh` |
| Stop | `./scripts/compose-down.sh` |
| Restart | `./scripts/compose-restart.sh -d` |
| Add worktree | `./scripts/worktree/worktree-add.sh <slug> <branch>` |
| Bootstrap | `cd ../finance-dashboard-wt-<slug>` → `<primary>/scripts/worktree/worktree-bootstrap.sh` |
| Remove worktree | `./scripts/worktree/worktree-remove.sh <slug>` |

More detail on Cursor’s worktree hook: `scripts/worktree/README.md`.
