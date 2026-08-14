---
title: 'Dev Compose and worktree shell scripts + HOW-TO-DEV rewrite'
type: 'chore'
created: '2026-08-06'
status: 'done'
baseline_commit: '8307b590cc672e6455a7a4e23a58308dbeca2c42'
review_loop_iteration: 0
context:
  - '{project-root}/HOW-TO-DEV.md'
  - '{project-root}/scripts/worktree/setup-worktree-unix.sh'
  - '{project-root}/README.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Day-to-day Compose and worktree commands are long, easy to mismatch (wrong `-f` set), and HOW-TO-DEV.md uses absolute host paths — new contributors cannot copy-paste safely from a fresh clone.

**Approach:** Add small bash helpers under `scripts/` for compose up/restart/stop and worktree add/bootstrap/remove, then rewrite HOW-TO-DEV.md as a relative-path new-user + parallel-worktree guide that calls those scripts.

## Boundaries & Constraints

**Always:**
- Shell scripts only (no root Makefile or root package.json) — user choice
- Scripts resolve the repo root from their own location so they work from any cwd
- Use the same Compose file set for up, down, and restart in a given checkout
- Main/dev checkout: `docker-compose.yml` + `docker-compose.dev.yml`
- Worktree checkout: add `docker-compose.worktree.yml` when that overlay should apply
- `ROOT_WORKTREE_PATH` and all HOW-TO-DEV examples use relative or script-computed paths — never hardcode a machine home path
- Keep existing `scripts/worktree/setup-worktree-unix.sh` as the bootstrap engine; new scripts may wrap it
- Preserve Postgres/data dirs outside the repo (main `~/finance-helper`, worktrees `~/finance-helper-wt/...`)

**Ask First:**
- Changing compose service graph, healthcheck intervals, or prod/test overlays
- Renaming or relocating `setup-worktree-unix.sh` / `.cursor/worktrees.json` contract
- Expanding scope into a full README rewrite (touch README only if a single stale pointer must not contradict HOW-TO-DEV)

**Never:**
- Absolute `/Users/...` paths in committed docs or scripts
- Silently `down -v` (volume wipe must be an explicit opt-in flag)
- Alias packages (direnv, zshrc freights) — scripts you invoke are enough
- Product feature / API / UI changes

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Main up | Run compose-up from primary checkout with `.env` | Starts base+dev; prints UI/API URLs from `.env` ports | Fail if docker missing/unreachable or compose files missing |
| Worktree up | Run compose-up from worktree with worktree overlay + `fh-*` project (or worktree `.env` markers) | Starts base+dev+worktree; same `-f` set later for down | If worktree `.env` missing, fail with point to bootstrap script |
| Restart | Stack running or stopped | Down then up (or equivalent recreate) with identical `-f` set | Propagate compose non-zero exit |
| Down keep data | Default down | Containers stop; volumes/bind data kept | N/A |
| Down wipe | Explicit wipe flag | `down -v` for that project only | Require flag; refuse accidental wipe |
| Worktree add | Slug + optional branch args from primary checkout | Creates `../finance-dashboard-wt-<slug>` worktree off `origin/main` (fetch first) | Fail if path exists or git errors |
| Bootstrap | Inside new worktree | Wraps setup with computed `ROOT_WORKTREE_PATH` (primary checkout) | Pass through setup script errors |
| Worktree remove | Slug from primary | `git worktree remove` for sibling path; optional prune | Fail clearly if worktree busy/missing |

</frozen-after-approval>

## Code Map

- `HOW-TO-DEV.md` -- rewrite: install → run → worktree → stop/cleanup; relative paths; script-first cheat sheet
- `scripts/compose-up.sh` -- start hot-reload stack (auto choose worktree overlay)
- `scripts/compose-down.sh` -- stop stack; optional wipe volumes flag
- `scripts/compose-restart.sh` -- stop then start with same file set
- `scripts/compose-lib.sh` -- shared: repo-root detect, compose file selection, URL print helpers
- `scripts/worktree/setup-worktree-unix.sh` -- existing bootstrap (wrap; keep behavior)
- `scripts/worktree/worktree-add.sh` -- fetch + `git worktree add` sibling path
- `scripts/worktree/worktree-bootstrap.sh` -- set relative/computed `ROOT_WORKTREE_PATH`, call setup
- `scripts/worktree/worktree-remove.sh` -- remove sibling worktree
- `scripts/worktree/README.md` -- fix stale `.cursor/...` path; point at new wrappers
- `docker-compose.yml` / `docker-compose.dev.yml` / `docker-compose.worktree.yml` -- invocation targets only (no service edits)
- `.cursor/worktrees.json` -- leave as-is unless a one-line comment/doc pointer is needed
- `README.md` -- optional one-line link to HOW-TO-DEV for parallel agents (Ask First if more)

## Tasks & Acceptance

**Execution:**
- [x] `scripts/compose-lib.sh` -- shared root + compose-file selection (main vs worktree) + env port helpers -- one place for `-f` logic
- [x] `scripts/compose-up.sh` -- `up --build` (foreground default; optional `-d`) using lib -- daily start
- [x] `scripts/compose-down.sh` -- `down`; `--wipe` → `down -v` -- safe stop
- [x] `scripts/compose-restart.sh` -- down then up with same flags/file set -- recovery without memorizing flags
- [x] `scripts/worktree/worktree-add.sh` -- `git fetch` + worktree add `../finance-dashboard-wt-<slug>` + branch naming consistent with HOW-TO-DEV -- create isolation
- [x] `scripts/worktree/worktree-bootstrap.sh` -- compute primary checkout path, invoke `setup-worktree-unix.sh` with `START_COMPOSE` passthrough -- no absolute ROOT path in docs
- [x] `scripts/worktree/worktree-remove.sh` -- remove by slug from primary checkout -- cleanup
- [x] `HOW-TO-DEV.md` -- rewrite for new clone: prereqs → `.env` → compose scripts → worktree add/bootstrap/run/stop/remove → PR tip; all relative; cheat sheet uses scripts -- first-run mental model
- [x] `scripts/worktree/README.md` -- align paths/commands with new wrappers; drop wrong `.cursor/setup-worktree-unix.sh` -- no contradictory docs
- [x] Manual smoke per Verification -- confirm scripts detect main vs worktree `-f` sets

**Acceptance Criteria:**
- Given a fresh clone with `.env` from `.env.example`, when a new user follows HOW-TO-DEV using only relative paths and `scripts/*`, then they can start the hot-reload stack and hit UI/API health URLs printed by the script
- Given a primary checkout, when they run the worktree-add then worktree-bootstrap scripts (no absolute `ROOT_WORKTREE_PATH` typed), then the worktree gets unique Compose name/ports/data dir and can up/down via compose scripts
- Given a worktree stack, when they compose-down without wipe, then containers stop and Postgres data under `~/finance-helper-wt/...` remains; with wipe flag, named Compose volumes for that project are removed (`down -v`) while the Postgres host bind is left intact
- Given compose-up/down/restart in the same checkout, when inspected, then all three use the identical Compose file set
- Given HOW-TO-DEV.md and `scripts/worktree/README.md`, when searched for `/Users/` or stale `.cursor/setup-worktree-unix.sh`, then there are no matches

## Spec Change Log

## Design Notes

**Compose file detection:** Prefer including `docker-compose.worktree.yml` when (a) the file exists in repo root **and** (b) `.env` looks like a worktree stack (`FH_COMPOSE_NAME` starts with `fh-` and/or the generated override marker block is present). Primary checkouts keep base+dev only so default ports stay 8000/3000.

**Worktree layout:** Sibling path `../finance-dashboard-wt-<slug>` relative to primary checkout; branch example `feat/<epic>/<story-slug>` documented in HOW-TO-DEV, with script args for slug/branch.

**Bootstrap root:** From worktree, primary = `git rev-parse --git-common-dir` → parent of `.git`, or pass-through from add script; never require paste of absolute home paths.

Example cheat sheet (final docs should match scripts shipped):

```bash
cp .env.example .env
./scripts/compose-up.sh
./scripts/worktree/worktree-add.sh 2-3-invite feat/2/2-3-invite-members-by-email
cd ../finance-dashboard-wt-2-3-invite && ../finance-dashboard/scripts/worktree/worktree-bootstrap.sh
./scripts/compose-down.sh
```

## Verification

**Commands:**
- `bash -n scripts/compose-lib.sh scripts/compose-up.sh scripts/compose-down.sh scripts/compose-restart.sh scripts/worktree/worktree-*.sh` -- expected: no syntax errors
- `rg -n '/Users/|\\.cursor/setup-worktree-unix\\.sh' HOW-TO-DEV.md scripts/worktree/README.md` -- expected: no matches
- `./scripts/compose-up.sh -d` from primary (if Docker available) then `./scripts/compose-down.sh` -- expected: exit 0; health URLs use `.env` ports

**Manual checks (if no CLI):**
- Diff of `docker compose` argv between main vs a bootstrapped worktree: worktree includes `docker-compose.worktree.yml`; main does not
- HOW-TO-DEV reads as copy-pasteable from a new clone on any machine

## Suggested Review Order

**Compose file selection**

- Single place that picks base+dev vs +worktree overlay from `.env` markers
  [`compose-lib.sh:36`](../../scripts/compose-lib.sh#L36)

- Refuse down/up without `.env` so default project name cannot hit the wrong stack
  [`compose-lib.sh:56`](../../scripts/compose-lib.sh#L56)

- `COMPOSE_ROOT` override so primary scripts can operate on a worktree cwd
  [`compose-lib.sh:7`](../../scripts/compose-lib.sh#L7)

**Day-to-day entrypoints**

- Print health URLs before blocking foreground `up`
  [`compose-up.sh:33`](../../scripts/compose-up.sh#L33)

- `--wipe` is named volumes only; Postgres bind left intact
  [`compose-down.sh:18`](../../scripts/compose-down.sh#L18)

**Worktree helpers**

- Required branch + sanitized slug before creating sibling path
  [`worktree-add.sh:23`](../../scripts/worktree/worktree-add.sh#L23)

- Bootstrap sets `ROOT_WORKTREE_PATH` then shares `compose-up` via `COMPOSE_ROOT`
  [`worktree-bootstrap.sh:52`](../../scripts/worktree/worktree-bootstrap.sh#L52)

- Setup/Cursor hook now starts via the same `compose-up` path
  [`setup-worktree-unix.sh:115`](../../scripts/worktree/setup-worktree-unix.sh#L115)

**Docs**

- New-user relative-path install + script cheat sheet
  [`HOW-TO-DEV.md:1`](../../HOW-TO-DEV.md#L1)
