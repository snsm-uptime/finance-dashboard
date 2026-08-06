#!/usr/bin/env bash
# Stop the Compose stack for this checkout (same -f set as compose-up).
# Usage: ./scripts/compose-down.sh [--wipe] [--] [extra docker compose down args...]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=compose-lib.sh
source "$SCRIPT_DIR/compose-lib.sh"

ROOT="$(compose_repo_root)"
WIPE=0
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wipe) WIPE=1; shift ;;
    --) shift; EXTRA+=("$@"); break ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/compose-down.sh [--wipe] [-- docker-compose-down-args...]

Stops the same Compose file set compose-up would use for this checkout.
Default keeps named/bind data.

--wipe runs `docker compose down -v` (named volumes only, e.g. ui_node_modules).
Postgres uses a host bind under FINANCE_HELPER_DATA — that directory is NOT
deleted by --wipe; remove it on disk yourself if you need a clean database.
EOF
      exit 0
      ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

compose_require_docker
compose_require_env "$ROOT"
compose_require_files "$ROOT"

DOWN_ARGS=(down)
if [[ "$WIPE" == "1" ]]; then
  DOWN_ARGS+=(-v)
fi
DOWN_ARGS+=("${EXTRA[@]+"${EXTRA[@]}"}")

echo "==> Compose down in $ROOT$([[ "$WIPE" == "1" ]] && echo ' (wipe named volumes)')"
compose_run "$ROOT" "${DOWN_ARGS[@]}"
if [[ "$WIPE" == "1" ]]; then
  echo "Note: Postgres bind data under FINANCE_HELPER_DATA was not deleted."
fi
