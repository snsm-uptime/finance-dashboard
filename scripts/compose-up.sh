#!/usr/bin/env bash
# Start the hot-reload Compose stack for this checkout.
# Usage: ./scripts/compose-up.sh [-d|--detach] [--lite] [--] [extra docker compose up args...]
#
# --lite: ui-only, joined to the primary checkout's already-running api
# instead of starting a second full stack. Requires ROOT_WORKTREE_PATH set
# to the primary checkout and its API already up. See scripts/worktree/README.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=compose-lib.sh
source "$SCRIPT_DIR/compose-lib.sh"

ROOT="$(compose_repo_root)"
DETACH=0
LITE=0
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--detach) DETACH=1; shift ;;
    --lite) LITE=1; shift ;;
    --) shift; EXTRA+=("$@"); break ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/compose-up.sh [-d|--detach] [--lite] [-- docker-compose-up-args...]

Starts docker-compose.yml + docker-compose.dev.yml.
Adds docker-compose.worktree.yml when this checkout looks like a worktree
(.env has FH_COMPOSE_NAME=fh-* or the generated worktree override marker).

--lite: starts only the ui container, joined to the primary checkout's
Compose network and node_modules volume, talking to the primary's already-
running api. Requires ROOT_WORKTREE_PATH set to the primary checkout.
EOF
      exit 0
      ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

compose_require_docker

if [[ "$LITE" == "1" ]]; then
  compose_require_lite "$ROOT"

  UP_ARGS=(up -d --no-deps --build ui)
  UP_ARGS+=("${EXTRA[@]+"${EXTRA[@]}"}")

  echo "==> Compose up (lite) in $ROOT, joined to ${PRIMARY_NETWORK_NAME}"
  compose_lite_run "$ROOT" "${UP_ARGS[@]}"
  exit 0
fi

compose_require_env "$ROOT"
compose_require_files "$ROOT"

UP_ARGS=(up --build)
if [[ "$DETACH" == "1" ]]; then
  UP_ARGS+=(-d)
fi
UP_ARGS+=("${EXTRA[@]+"${EXTRA[@]}"}")

echo "==> Compose up in $ROOT"
compose_print_urls "$ROOT"
compose_run "$ROOT" "${UP_ARGS[@]}"
if [[ "$DETACH" == "1" ]]; then
  compose_print_urls "$ROOT"
fi
