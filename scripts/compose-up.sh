#!/usr/bin/env bash
# Start the hot-reload Compose stack for this checkout.
# Usage: ./scripts/compose-up.sh [-d|--detach] [--] [extra docker compose up args...]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=compose-lib.sh
source "$SCRIPT_DIR/compose-lib.sh"

ROOT="$(compose_repo_root)"
DETACH=0
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--detach) DETACH=1; shift ;;
    --) shift; EXTRA+=("$@"); break ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/compose-up.sh [-d|--detach] [-- docker-compose-up-args...]

Starts docker-compose.yml + docker-compose.dev.yml.
Adds docker-compose.worktree.yml when this checkout looks like a worktree
(.env has FH_COMPOSE_NAME=fh-* or the generated worktree override marker).
EOF
      exit 0
      ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

compose_require_docker
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
