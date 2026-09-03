#!/usr/bin/env bash
# Cursor worktree bootstrap for finance-dashboard.
# Enables parallel story stacks (e.g. 1.5.6 + 1.5.7) with unique Compose
# project name, host ports, and Postgres data dir.
#
# Env knobs:
#   START_COMPOSE=1   bring up db/api/ui (default: 1)
#   START_COMPOSE=0   deps + .env only
#   ROOT_WORKTREE_PATH  set by Cursor to the primary checkout
#
# --lite: skip npm ci/uv sync and Compose entirely. Symlinks ui/node_modules
# from the primary checkout (only if package-lock.json matches) and points
# the UI at the primary checkout's already-running API instead of starting
# a second stack. Only appropriate for small, mostly-UI, easy-to-validate
# changes — see scripts/worktree/README.md before recommending it.
set -euo pipefail

ROOT_WORKTREE_PATH="${ROOT_WORKTREE_PATH:-}"
WT_ROOT="$(pwd)"
MARKER_BEGIN="# --- cursor worktree overrides (generated) ---"
MARKER_END="# --- end cursor worktree overrides ---"
LITE=0

log() { printf '==> %s\n' "$*"; }
warn() { printf '!!  %s\n' "$*" >&2; }

# --- pr subcommand ---
# Usage: setup-worktree-unix.sh pr --title "<title>" --body "<body>" --commit-title "<commit-title>"
# Commits currently staged changes, pushes the current worktree branch explicitly
# (not via upstream — upstream intentionally tracks origin/main so `git pull` stays
# easy in a worktree), then opens a PR with gh.
cmd_pr() {
  local title="" body="" commit_title=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --title) title="$2"; shift 2 ;;
      --body) body="$2"; shift 2 ;;
      --commit-title) commit_title="$2"; shift 2 ;;
      *) echo "error: unknown pr option: $1" >&2; exit 1 ;;
    esac
  done

  if [[ -z "$title" || -z "$body" ]]; then
    echo "error: pr requires --title and --body" >&2
    exit 1
  fi

  if ! command -v gh >/dev/null 2>&1; then
    echo "error: gh CLI not found on PATH" >&2
    exit 1
  fi

  if ! gh auth status >/dev/null 2>&1; then
    echo "error: gh is not authenticated — run 'gh auth login' first" >&2
    exit 1
  fi

  local branch
  branch="$(git -C "$WT_ROOT" rev-parse --abbrev-ref HEAD)"
  if [[ "$branch" == "HEAD" ]]; then
    echo "error: detached HEAD — checkout a branch before opening a PR" >&2
    exit 1
  fi

  if git -C "$WT_ROOT" diff --cached --quiet; then
    warn "Nothing staged."
    if [[ ! -t 0 ]]; then
      echo "error: nothing staged and stdin is not interactive — stage changes first, or run this manually to confirm push-only" >&2
      exit 1
    fi
    read -r -p "Continue and just push + open PR? [y/N] " reply
    if [[ ! "$reply" =~ ^[Yy]$ ]]; then
      echo "Aborted." >&2
      exit 1
    fi
  else
    if [[ -z "$commit_title" ]]; then
      echo "error: staged changes present but --commit-title not given" >&2
      exit 1
    fi
    log "Committing staged changes: $commit_title"
    git -C "$WT_ROOT" commit -m "$commit_title"
  fi

  log "Fetching origin"
  git -C "$WT_ROOT" fetch origin

  local default_ref
  default_ref="$(git -C "$WT_ROOT" symbolic-ref -q refs/remotes/origin/HEAD 2>/dev/null || true)"
  default_ref="${default_ref#refs/remotes/origin/}"
  if [[ -z "$default_ref" ]]; then
    if git -C "$WT_ROOT" show-ref --verify --quiet refs/remotes/origin/main; then
      default_ref=main
    elif git -C "$WT_ROOT" show-ref --verify --quiet refs/remotes/origin/master; then
      default_ref=master
    else
      echo "error: could not resolve origin default branch (need origin/main or origin/master)" >&2
      exit 1
    fi
  fi

  log "Pushing ${branch} to origin (upstream tracking left untouched)"
  git -C "$WT_ROOT" push origin "HEAD:refs/heads/${branch}"

  log "Creating PR: base=${default_ref} head=${branch}"
  (cd "$WT_ROOT" && gh pr create --base "$default_ref" --head "$branch" --title "$title" --body "$body")
}

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g' | cut -c1-48
}

port_pair_from_path() {
  # Stable-ish offset in 1..40 → API 8010..8400, UI 3010..3400
  local hash offset
  hash="$(printf '%s' "$1" | cksum | awk '{print $1}')"
  offset=$((hash % 40 + 1))
  printf '%s %s' "$((8000 + offset * 10))" "$((3000 + offset * 10))"
}

debug_port_pair_from_path() {
  # Same offset scheme as port_pair_from_path but a disjoint range, so the
  # Node inspector pair (docker-compose.dev.yml) is also unique per worktree
  # instead of getting clobbered by whatever the primary checkout's .env has.
  # UI_DEBUG_WORKER_PORT must stay UI_DEBUG_PORT + 1 (Next.js hardcodes that
  # offset internally) → step by 2 to keep pairs non-overlapping.
  local hash offset
  hash="$(printf '%s' "$1" | cksum | awk '{print $1}')"
  offset=$((hash % 40 + 1))
  printf '%s %s' "$((9200 + offset * 2))" "$((9201 + offset * 2))"
}

if [[ "${1:-}" == "pr" ]]; then
  shift
  cmd_pr "$@"
  exit 0
fi

for arg in "$@"; do
  case "$arg" in
    --lite) LITE=1 ;;
    *) echo "error: unknown option: $arg" >&2; exit 1 ;;
  esac
done

# --- .env ---
if [[ -n "$ROOT_WORKTREE_PATH" && -f "$ROOT_WORKTREE_PATH/.env" ]]; then
  cp "$ROOT_WORKTREE_PATH/.env" "$WT_ROOT/.env"
  log "Copied .env from primary checkout"
elif [[ -f "$WT_ROOT/.env.example" ]]; then
  cp "$WT_ROOT/.env.example" "$WT_ROOT/.env"
  warn "No primary .env found; copied .env.example (fill secrets before smoke)"
else
  warn "No .env or .env.example — Compose will fail until .env exists"
fi

BRANCH="$(git -C "$WT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo worktree)"

# Always assign a unique Compose project name/ports/data dir, even in --lite
# mode where Compose is never started here: worktree-remove.sh and any
# ad-hoc compose-up/down run from this worktree must not resolve to the same
# default project name as the primary checkout and collide with it.
{
  WT_SLUG="$(slugify "$(basename "$WT_ROOT")")"
  BRANCH_SLUG="$(slugify "$BRANCH")"
  COMPOSE_NAME="fh-${BRANCH_SLUG:-$WT_SLUG}"
  COMPOSE_NAME="$(printf '%s' "$COMPOSE_NAME" | cut -c1-50)"
  read -r API_HOST_PORT UI_HOST_PORT <<<"$(port_pair_from_path "$WT_ROOT")"
  read -r UI_DEBUG_PORT UI_DEBUG_WORKER_PORT <<<"$(debug_port_pair_from_path "$WT_ROOT")"
  DATA_DIR="${HOME}/finance-helper-wt/${COMPOSE_NAME}"
  PUBLIC_APP_URL="http://localhost:${UI_HOST_PORT}"

  mkdir -p "$DATA_DIR"
  # api's Dockerfile runs as non-root appuser (uid 10001) with no chown-on-start
  # entrypoint (unlike the official postgres image, which fixes pgdata's
  # ownership itself) — pre-create pdfs/ and open it up so appuser can write.
  mkdir -p "$DATA_DIR/pdfs"
  chmod 777 "$DATA_DIR/pdfs"

  if [[ -f "$WT_ROOT/.env" ]]; then
    # Drop keys that must be unique per worktree (Compose uses last wins, but be explicit).
    tmp_keys="$(mktemp)"
    awk '
      BEGIN { skip=0 }
      $0 == "# --- cursor worktree overrides (generated) ---" { skip=1; next }
      $0 == "# --- end cursor worktree overrides ---" { skip=0; next }
      skip { next }
      /^(FH_COMPOSE_NAME|API_HOST_PORT|UI_HOST_PORT|FINANCE_HELPER_DATA|PUBLIC_APP_URL|UI_DEBUG_PORT|UI_DEBUG_WORKER_PORT)=/ { next }
      { print }
    ' "$WT_ROOT/.env" >"$tmp_keys"
    mv "$tmp_keys" "$WT_ROOT/.env"

    # Strip a previous generated block, then append a fresh one.
    tmp="$(mktemp)"
    awk -v b="$MARKER_BEGIN" -v e="$MARKER_END" '
      $0 == b {skip=1; next}
      $0 == e {skip=0; next}
      !skip {print}
    ' "$WT_ROOT/.env" >"$tmp"
    {
      cat "$tmp"
      echo ""
      echo "$MARKER_BEGIN"
      echo "FH_COMPOSE_NAME=${COMPOSE_NAME}"
      echo "API_HOST_PORT=${API_HOST_PORT}"
      echo "UI_HOST_PORT=${UI_HOST_PORT}"
      echo "FINANCE_HELPER_DATA=${DATA_DIR}"
      echo "PUBLIC_APP_URL=${PUBLIC_APP_URL}"
      echo "UI_DEBUG_PORT=${UI_DEBUG_PORT}"
      echo "UI_DEBUG_WORKER_PORT=${UI_DEBUG_WORKER_PORT}"
      echo "$MARKER_END"
    } >"$WT_ROOT/.env"
    rm -f "$tmp"
    log "Worktree Compose: name=${COMPOSE_NAME} api=:${API_HOST_PORT} ui=:${UI_HOST_PORT} debug=:${UI_DEBUG_PORT}/:${UI_DEBUG_WORKER_PORT}"
    log "Postgres data: ${DATA_DIR}/pgdata"
    log "PUBLIC_APP_URL=${PUBLIC_APP_URL}"
  fi
}

# --- bmad and claude configs ---
# _bmad and .claude are gitignored per-user tool config, so a fresh worktree
# checkout won't have them; copy from the primary checkout if available.
if [[ -n "$ROOT_WORKTREE_PATH" ]]; then
  for dir in _bmad .claude; do
    src="$ROOT_WORKTREE_PATH/$dir"
    dest="$WT_ROOT/$dir"
    if [[ -d "$src" ]]; then
      if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete "$src/" "$dest/"
      else
        rm -rf "$dest"
        cp -R "$src" "$dest"
      fi
      log "Copied $dir from primary checkout"
    else
      warn "No $dir in primary checkout ($ROOT_WORKTREE_PATH) — skipped"
    fi
  done
else
  warn "ROOT_WORKTREE_PATH not set — skipping _bmad/.claude copy"
fi

if [[ "$LITE" == "1" ]]; then
  # --- lite: only the ui container, joined to the primary's Compose network ---
  # No db/api container in this project; ui talks to the primary's already-
  # running api over its Compose network, and mounts the primary's own
  # populated ui_node_modules volume read-only instead of installing a fresh
  # one. Preconditions + the actual compose invocation live in
  # scripts/compose-lib.sh (compose_require_lite / compose_lite_run), shared
  # with `./scripts/compose-up.sh --lite`.
  if ! command -v docker >/dev/null 2>&1; then
    echo "error: docker not on PATH — required for --lite" >&2
    exit 1
  fi

  # shellcheck source=../compose-lib.sh
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../compose-lib.sh"
  compose_require_lite "$WT_ROOT"

  log "Starting ui-only container (joined to ${PRIMARY_NETWORK_NAME}, node_modules from ${PRIMARY_COMPOSE_NAME}_ui_node_modules)"
  compose_lite_run "$WT_ROOT" up -d --no-deps --build ui

  cat <<EOF

Worktree ready (lite mode): ${WT_ROOT}
Branch:         ${BRANCH}
Skipped:        db/api containers, npm ci (reusing ${PRIMARY_COMPOSE_NAME}_ui_node_modules read-only)
UI:             ${PUBLIC_APP_URL}
API:            http://127.0.0.1:${PRIMARY_API_PORT} (primary checkout's, via ${PRIMARY_NETWORK_NAME})

Re-run this stack later (no bootstrap needed):
  ./scripts/compose-up.sh --lite

Stop this worktree's ui container only:
  docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.worktree.yml -f docker-compose.worktree-lite.yml down

PR tip (AD-13): one story per branch. Stage your changes, then:
  ./scripts/worktree/setup-worktree-unix.sh pr --title "..." --body "..." --commit-title "..."
EOF
  exit 0
fi

# --- host deps (fast feedback without relying only on container builds) ---
if command -v uv >/dev/null 2>&1; then
  log "Installing api deps (uv sync --group dev)"
  (cd "$WT_ROOT/api" && uv sync --group dev)
else
  warn "uv not on PATH — skip api/.venv (Compose image build still works)"
fi

if command -v npm >/dev/null 2>&1; then
  log "Installing ui deps (npm ci)"
  (cd "$WT_ROOT/ui" && npm ci)
else
  warn "npm not on PATH — skip ui/node_modules"
fi

# --- Compose stack ---
START_COMPOSE="${START_COMPOSE:-1}"

if [[ "$START_COMPOSE" == "1" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    warn "docker not on PATH — skip compose up"
  elif ! docker info >/dev/null 2>&1; then
    warn "docker daemon not reachable — skip compose up"
  else
    log "Building and starting Compose (detached, via scripts/compose-up.sh)"
    COMPOSE_ROOT="$WT_ROOT" bash "$WT_ROOT/scripts/compose-up.sh" -d
  fi
else
  log "START_COMPOSE=0 — deps ready; start later with:"
  log "  ./scripts/compose-up.sh"
fi

cat <<EOF

Worktree ready: ${WT_ROOT}
Branch:         ${BRANCH}
Compose name:   ${COMPOSE_NAME}
UI:             ${PUBLIC_APP_URL}
API:            http://localhost:${API_HOST_PORT}
Debug (dev):    inspector :${UI_DEBUG_PORT} / next-server :${UI_DEBUG_WORKER_PORT} (update nvim dap.lua \`port\` to match)

PR tip (AD-13): one story per branch. Stage your changes, then:
  ./scripts/worktree/setup-worktree-unix.sh pr --title "..." --body "..." --commit-title "..."
EOF
