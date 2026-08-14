#!/usr/bin/env bash
# Cursor worktree bootstrap for finance-dashboard.
# Enables parallel story stacks (e.g. 1.5.6 + 1.5.7) with unique Compose
# project name, host ports, and Postgres data dir.
#
# Env knobs:
#   START_COMPOSE=1   bring up db/api/ui (default: 1)
#   START_COMPOSE=0   deps + .env only
#   ROOT_WORKTREE_PATH  set by Cursor to the primary checkout
set -euo pipefail

ROOT_WORKTREE_PATH="${ROOT_WORKTREE_PATH:-}"
WT_ROOT="$(pwd)"
MARKER_BEGIN="# --- cursor worktree overrides (generated) ---"
MARKER_END="# --- end cursor worktree overrides ---"

log() { printf '==> %s\n' "$*"; }
warn() { printf '!!  %s\n' "$*" >&2; }

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
WT_SLUG="$(slugify "$(basename "$WT_ROOT")")"
BRANCH_SLUG="$(slugify "$BRANCH")"
COMPOSE_NAME="fh-${BRANCH_SLUG:-$WT_SLUG}"
COMPOSE_NAME="$(printf '%s' "$COMPOSE_NAME" | cut -c1-50)"
read -r API_HOST_PORT UI_HOST_PORT <<<"$(port_pair_from_path "$WT_ROOT")"
DATA_DIR="${HOME}/finance-helper-wt/${COMPOSE_NAME}"
PUBLIC_APP_URL="http://localhost:${UI_HOST_PORT}"

mkdir -p "$DATA_DIR"

if [[ -f "$WT_ROOT/.env" ]]; then
  # Drop keys that must be unique per worktree (Compose uses last wins, but be explicit).
  tmp_keys="$(mktemp)"
  awk '
    BEGIN { skip=0 }
    $0 == "# --- cursor worktree overrides (generated) ---" { skip=1; next }
    $0 == "# --- end cursor worktree overrides ---" { skip=0; next }
    skip { next }
    /^(FH_COMPOSE_NAME|API_HOST_PORT|UI_HOST_PORT|FINANCE_HELPER_DATA|PUBLIC_APP_URL)=/ { next }
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
    echo "$MARKER_END"
  } >"$WT_ROOT/.env"
  rm -f "$tmp"
  log "Worktree Compose: name=${COMPOSE_NAME} api=:${API_HOST_PORT} ui=:${UI_HOST_PORT}"
  log "Postgres data: ${DATA_DIR}/pgdata"
  log "PUBLIC_APP_URL=${PUBLIC_APP_URL}"
fi

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

PR tip (AD-13): one story per branch; open PR from this worktree after commit.
EOF
