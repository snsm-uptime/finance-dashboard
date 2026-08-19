# How to develop (local)

Relative paths assume your primary clone directory is named `finance-dashboard`. If you renamed it, use the absolute path printed by `worktree-add` / `worktree-bootstrap` instead of `../finance-dashboard/...`.

## Prerequisites

- Docker with Compose v2
- Optional (faster host feedback): `[uv](https://docs.astral.sh/uv/)` and Node/`npm`
- Disk for Postgres **outside** the repo (default: `~/finance-helper`)

## 1. First-time install (primary checkout)

```bash
git clone <repo-url> finance-dashboard
cd finance-dashboard

cp .env.example .env
# Optional: set FINANCE_HELPER_DATA to an absolute path outside the repo.
mkdir -p "${FINANCE_HELPER_DATA:-$HOME/finance-helper}/pgdata"
mkdir -p "${FINANCE_HELPER_DATA:-$HOME/finance-helper}/pdfs"
# api's Dockerfile runs as non-root appuser (uid 10001) with no chown-on-start
# entrypoint (unlike the official postgres image, which fixes pgdata's
# ownership itself) — open pdfs/ up so appuser can write into it.
chmod 777 "${FINANCE_HELPER_DATA:-$HOME/finance-helper}/pdfs"
```

Start the hot-reload stack (`db` / `api` / `ui`):

```bash
./scripts/compose-up.sh
# Detached:
./scripts/compose-up.sh -d
```

Health (defaults `8000` / `3000` unless you changed `.env`):

- API: [http://localhost:8000/health](http://localhost:8000/health)
- UI: [http://localhost:3000/health](http://localhost:3000/health)

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

./scripts/worktree/setup-worktree-unix.sh pr \
  --title "Story title" \
  --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [ ] ...

EOF
)" \
  --commit-title "your message"
```

This commits what's staged, pushes the current branch explicitly to `origin/<branch>`, then opens the PR via `gh`. Don't use `git push -u origin HEAD` here — worktree branches intentionally track `origin/main` (for easy `git pull`), and `-u` would overwrite that tracking.

One story per branch (repo convention). Open the PR from the worktree.

### Remove the worktree (after merge)

Prefer stopping Compose first; `worktree-remove` also attempts `compose-down` when `.env` exists:

```bash
# from primary:
./scripts/worktree/worktree-remove.sh <slug>
```

Postgres data under `~/finance-helper-wt/` is left alone unless you delete that directory on disk.

## 3. UI component conventions

**Any icon-only button composes `ui/components/IconButton`** — never hand-roll a raw `<button>` around an icon. `IconButton` owns the interactive base: `type`, `disabled`, `onClick`, `aria-label`/`title`, and the ghost-button chrome (padding, border, transitions, disabled state).

To build a custom-looking icon button, wrap `IconButton` and layer your chrome on top via `className`, instead of writing your own `<button>`:

```tsx
<IconButton
  icon={<SomeIcon />}
  label="Accessible name"
  className="!border border-border !bg-surface enabled:!text-accent" // your custom look
  onClick={...}
/>
```

Tailwind v4 orders generated utilities by internal category, not source order, so a same-property override (e.g. your `bg-surface` vs `IconButton`'s default `bg-transparent`) is not guaranteed to win just by being listed later — use `!important` on the utilities that need to beat `IconButton`'s ghost defaults (see `FormIconSubmit.tsx` for a worked example: bordered/accent submit chrome layered on `IconButton`).

For a button that also needs local state around the click (e.g. a "copied!" confirmation), wrap `IconButton` inside your own component rather than duplicating its button markup — see `ui/components/CopyButton/CopyButton.tsx`.

Raw `<button>` stays fine for **text-labeled** buttons (form submits, choice/toggle buttons) — this convention is specifically for icon-only controls.

## 4. Bank statement dev tools

Full docs: `api/scripts/README.md`.

To build/test a new `BankAdapter` (`api/adapters/bank/`), turn a real statement PDF into a safe-to-commit mock + structure mapping:

```bash
cd api
uv run python scripts/statement_recon.py /path/to/real_statement.pdf --bank <bank_id>
```

Writes `tests/fixtures/bank_recon/<bank_id>/mapping.yaml` (structure only) and `mock_statement.pdf` (synthetic, safe to commit). Review `mapping.yaml`'s `statement_marker`/`header` fields for personal data before committing — those two fields are real text lifted from the source PDF; nothing else is.

Real statement PDFs for local testing go in `bank_data/` at the repo root (gitignored) — never commit them. `api/scripts/README.md` also covers recovering the ones that were briefly committed early in this project's history and later removed from tracking (still in git history, not on disk).

---

## Cheat sheet

| Step            | Command                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| First run       | `cp .env.example .env` → `./scripts/compose-up.sh`                                       |
| Stop            | `./scripts/compose-down.sh`                                                              |
| Restart         | `./scripts/compose-restart.sh -d`                                                        |
| Add worktree    | `./scripts/worktree/worktree-add.sh <slug> <branch>`                                     |
| Bootstrap       | `cd ../finance-dashboard-wt-<slug>` → `<primary>/scripts/worktree/worktree-bootstrap.sh` |
| Remove worktree | `./scripts/worktree/worktree-remove.sh <slug>`                                           |
| Statement → mock + mapping | `cd api && uv run python scripts/statement_recon.py <pdf> --bank <id>`                   |

More detail on Cursor’s worktree hook: `scripts/worktree/README.md`.
