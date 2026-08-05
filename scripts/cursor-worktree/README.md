# Cursor worktrees (finance-dashboard)

Parallel agents need **isolated checkouts** plus **unique Compose ports/data**.
This folder wires that up.

## Files

| File | Role |
| --- | --- |
| `worktrees.json` | Cursor runs `setup-worktree-unix.sh` on new worktrees |
| `setup-worktree-unix.sh` | Copy `.env`, assign ports/project/data dir, `uv`/`npm`, optional Compose up |
| `docker-compose.worktree.yml` (repo root) | Fast healthchecks so `depends_on: service_healthy` works in minutes |

Compose knobs (written into the worktree `.env`):

- `FH_COMPOSE_NAME` — container project name (default `finance-helper`)
- `API_HOST_PORT` / `UI_HOST_PORT` — host ports (default `8000` / `3000`)
- `FINANCE_HELPER_DATA` — Postgres bind parent (default `~/finance-helper`)
- `PUBLIC_APP_URL` — must match the UI host port for mail links

## Manual story worktrees (already created)

From repo parent (`Documents/github/personal`):

| Story | Path | Branch |
| --- | --- | --- |
| Setup | `finance-dashboard-wt-cursor-setup` | `chore/1/cursor-worktree-setup` |
| 1.5.6 | `finance-dashboard-wt-1-5-6` | `feat/1/1-5-6-auth-smtp-rate-limit-hardening` |
| 1.5.7 | `finance-dashboard-wt-1-5-7` | `refactor/1/1-5-7-hex-port-polish-and-compose-pytest-ergonomics` |

Open each path as a Cursor window (or Agents Window → worktree).

## Agent prompts

**1.5.6** (in `finance-dashboard-wt-1-5-6`):

```text
Dev story `_bmad-output/implementation-artifacts/1-5-6-auth-smtp-rate-limit-hardening.md`.
Stay on branch feat/1/1-5-6-auth-smtp-rate-limit-hardening. Do not touch 1.5.7 port / pytest ergonomics.
When ACs pass: commit, push -u, open PR to main.
```

**1.5.7** (in `finance-dashboard-wt-1-5-7`):

```text
Dev story `_bmad-output/implementation-artifacts/1-5-7-hex-port-polish-and-compose-pytest-ergonomics.md`.
Stay on branch refactor/1/1-5-7-hex-port-polish-and-compose-pytest-ergonomics.
Do not implement rate limits (1.5.6). If rebasing later, preserve 1.5.6 Depends/helpers.
When ACs pass: commit, push -u, open PR to main.
```

## Merge order

Prefer merge **1.5.6 → main**, then rebase **1.5.7** (story anti-goal: do not undo rate-limit wiring). Land **chore worktree setup** on main first so both story PRs stay free of bootstrap noise.

## Commands

```bash
# Re-run bootstrap (deps only)
START_COMPOSE=0 ROOT_WORKTREE_PATH=/path/to/finance-dashboard \
  .cursor/setup-worktree-unix.sh

# List worktrees
git worktree list
```
