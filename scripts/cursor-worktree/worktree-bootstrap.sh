#!/usr/bin/env bash
# Bootstrap the current worktree (.env, ports, deps, optional Compose).
# Usage (from inside the worktree):
#   <primary>/scripts/cursor-worktree/worktree-bootstrap.sh
#   START_COMPOSE=0 <primary>/scripts/cursor-worktree/worktree-bootstrap.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETUP="$SCRIPT_DIR/setup-worktree-unix.sh"
WT_ROOT="$(pwd)"

if [[ ! -f "$WT_ROOT/docker-compose.yml" ]]; then
  echo "error: run this from a finance-dashboard worktree root (docker-compose.yml missing in $WT_ROOT)" >&2
  exit 1
fi

# Prefer git common dir (shared .git) → primary checkout; fall back to sibling name.
if [[ -z "${ROOT_WORKTREE_PATH:-}" ]]; then
  common="$(git -C "$WT_ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null \
    || git -C "$WT_ROOT" rev-parse --git-common-dir 2>/dev/null \
    || true)"
  if [[ -n "$common" ]]; then
    if [[ "$common" != /* ]]; then
      common="$(cd "$WT_ROOT" && cd "$(dirname "$common")" && pwd)/$(basename "$common")"
    fi
    if [[ "$(basename "$common")" == ".git" ]]; then
      ROOT_WORKTREE_PATH="$(cd "$common/.." && pwd)"
    elif [[ -f "$(dirname "$common")/docker-compose.yml" ]]; then
      ROOT_WORKTREE_PATH="$(cd "$(dirname "$common")" && pwd)"
    fi
  fi
fi

if [[ -z "${ROOT_WORKTREE_PATH:-}" || "$ROOT_WORKTREE_PATH" == "$WT_ROOT" ]]; then
  sibling="$(cd "$WT_ROOT/../finance-dashboard" && pwd 2>/dev/null || true)"
  if [[ -n "$sibling" && -f "$sibling/docker-compose.yml" && "$sibling" != "$WT_ROOT" ]]; then
    ROOT_WORKTREE_PATH="$sibling"
  else
    ROOT_WORKTREE_PATH=""
  fi
fi

if [[ -z "${ROOT_WORKTREE_PATH:-}" ]]; then
  echo "error: could not find primary checkout; set ROOT_WORKTREE_PATH to it and re-run" >&2
  exit 1
fi

export ROOT_WORKTREE_PATH
echo "==> Primary checkout: $ROOT_WORKTREE_PATH"
echo "==> Worktree:         $WT_ROOT"
# Prefer shared compose-up path so -f selection stays single-sourced.
# setup still owns .env rewriting + deps; we force START_COMPOSE=0 then up ourselves when requested.
WANT_COMPOSE="${START_COMPOSE:-1}"
export START_COMPOSE=0
bash "$SETUP"
if [[ "$WANT_COMPOSE" == "1" ]]; then
  echo "==> Starting Compose via scripts/compose-up.sh -d"
  COMPOSE_ROOT="$WT_ROOT" bash "$ROOT_WORKTREE_PATH/scripts/compose-up.sh" -d
fi
