#!/usr/bin/env bash
# Shared helpers for finance-dashboard Compose scripts.
# Sourced by compose-up / compose-down / compose-restart (not invoked directly).
set -euo pipefail

compose_repo_root() {
  if [[ -n "${COMPOSE_ROOT:-}" ]]; then
    (cd "$COMPOSE_ROOT" && pwd)
    return
  fi
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$here/.." && pwd
}

compose_env_get() {
  # Best-effort key=value from repo-root .env (no export/eval of full file).
  local key="$1" env_file="$2" line val
  [[ -f "$env_file" ]] || return 0
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$env_file" | tail -n1 || true)"
  [[ -n "$line" ]] || return 0
  line="${line#"${line%%[![:space:]]*}"}" # ltrim
  line="${line#export }"
  line="${line#"${line%%[![:space:]]*}"}"
  val="${line#*=}"
  val="${val%%#*}" # strip inline comments
  val="${val%"${val##*[![:space:]]}"}" # rtrim
  val="${val#"${val%%[![:space:]]*}"}" # ltrim
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  printf '%s' "$val"
}

compose_is_worktree_env() {
  local env_file="$1" name
  [[ -f "$env_file" ]] || return 1
  if grep -qF '# --- cursor worktree overrides (generated) ---' "$env_file" 2>/dev/null; then
    return 0
  fi
  name="$(compose_env_get FH_COMPOSE_NAME "$env_file")"
  [[ "$name" == fh-* ]]
}

compose_files() {
  local root="$1"
  local env_file="$root/.env"
  local files=(-f docker-compose.yml -f docker-compose.dev.yml)
  if [[ -f "$root/docker-compose.worktree.yml" ]] && compose_is_worktree_env "$env_file"; then
    files+=(-f docker-compose.worktree.yml)
  fi
  printf '%s\n' "${files[@]}"
}

compose_require_env() {
  local root="$1"
  if [[ ! -f "$root/.env" ]]; then
    echo "error: missing $root/.env — copy .env.example first (see HOW-TO-DEV.md)" >&2
    echo "refusing to run: without .env, Compose would use the default project name and may hit the wrong stack." >&2
    return 1
  fi
}

compose_require_files() {
  local root="$1" f
  for f in docker-compose.yml docker-compose.dev.yml; do
    if [[ ! -f "$root/$f" ]]; then
      echo "error: missing $root/$f" >&2
      return 1
    fi
  done
}

compose_require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "error: docker not on PATH" >&2
    return 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "error: docker daemon not reachable" >&2
    return 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "error: Docker Compose v2 plugin not available (need: docker compose)" >&2
    return 1
  fi
}

compose_print_urls() {
  local root="$1"
  local env_file="$root/.env"
  local api_port ui_port
  api_port="$(compose_env_get API_HOST_PORT "$env_file")"
  ui_port="$(compose_env_get UI_HOST_PORT "$env_file")"
  api_port="${api_port:-8000}"
  ui_port="${ui_port:-3000}"
  echo "UI  http://localhost:${ui_port}"
  echo "API http://localhost:${api_port}"
  echo "Health: curl -sf http://localhost:${api_port}/health && curl -sf http://localhost:${ui_port}/health"
}

compose_require_lite() {
  # Verifies preconditions for --lite (ui-only, joined to primary's stack)
  # and exports ROOT_WORKTREE_PATH / PRIMARY_COMPOSE_NAME / PRIMARY_NETWORK_NAME
  # / PRIMARY_API_PORT for compose_lite_run. Mirrors the checks in
  # scripts/worktree/setup-worktree-unix.sh's --lite path.
  local root="$1"

  if [[ -z "${ROOT_WORKTREE_PATH:-}" ]]; then
    echo "error: --lite requires ROOT_WORKTREE_PATH (primary checkout not found)" >&2
    return 1
  fi

  if [[ ! -f "$root/ui/package-lock.json" || ! -f "$ROOT_WORKTREE_PATH/ui/package-lock.json" ]]; then
    echo "error: ui/package-lock.json missing (worktree or primary) — cannot verify the shared node_modules volume is safe to reuse" >&2
    return 1
  fi
  if [[ "$(cksum <"$root/ui/package-lock.json")" != "$(cksum <"$ROOT_WORKTREE_PATH/ui/package-lock.json")" ]]; then
    echo "error: ui/package-lock.json differs from primary checkout — the primary's node_modules volume would be missing/mismatched deps for this worktree." >&2
    echo "       Re-run without --lite (full setup) instead." >&2
    return 1
  fi

  if [[ ! -f "$root/docker-compose.worktree-lite.yml" ]]; then
    echo "error: docker-compose.worktree-lite.yml missing in $root — pull the branch that adds it, or drop --lite" >&2
    return 1
  fi

  PRIMARY_COMPOSE_NAME="$(compose_env_get FH_COMPOSE_NAME "$ROOT_WORKTREE_PATH/.env")"
  PRIMARY_COMPOSE_NAME="${PRIMARY_COMPOSE_NAME:-finance-helper}"
  PRIMARY_API_PORT="$(compose_env_get API_HOST_PORT "$ROOT_WORKTREE_PATH/.env")"
  PRIMARY_API_PORT="${PRIMARY_API_PORT:-8000}"

  if ! curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:${PRIMARY_API_PORT}/health"; then
    echo "error: primary checkout's API not reachable at http://127.0.0.1:${PRIMARY_API_PORT}/health" >&2
    echo "       Start it first: cd $ROOT_WORKTREE_PATH && ./scripts/compose-up.sh -d" >&2
    return 1
  fi

  export ROOT_WORKTREE_PATH PRIMARY_COMPOSE_NAME
  export PRIMARY_NETWORK_NAME="${PRIMARY_COMPOSE_NAME}_internal"
}

compose_lite_run() {
  local root="$1"
  shift
  # A stale ui/.next from a prior full (non-lite) run was built against this
  # worktree's own node_modules; --lite swaps in the primary's node_modules
  # volume, so a leftover build cache can reference mismatched module hashes.
  if [[ -d "$root/ui/.next" ]]; then
    rm -rf "$root/ui/.next"
    echo "==> Cleared stale ui/.next (rebuilding against primary's node_modules)"
  fi
  (
    cd "$root"
    docker compose \
      -f docker-compose.yml -f docker-compose.dev.yml \
      -f docker-compose.worktree.yml -f docker-compose.worktree-lite.yml \
      "$@"
  )
}

compose_run() {
  local root="$1"
  shift
  local -a files=()
  while IFS= read -r line; do
    files+=("$line")
  done < <(compose_files "$root")
  (
    cd "$root"
    docker compose "${files[@]}" "$@"
  )
}
