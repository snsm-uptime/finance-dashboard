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
