#!/usr/bin/env bash
# Wipe the Postgres data for this checkout's Compose stack (destructive).
# Postgres uses a host bind under FINANCE_HELPER_DATA/pgdata — `compose-down.sh
# --wipe` only removes named volumes and does NOT touch that directory. This
# script stops the stack, deletes the bind-mounted pgdata dir, and (unless
# --no-up) starts the stack back up so Postgres reinitializes from scratch.
# Usage: ./scripts/compose-wipe-db.sh [-y|--yes] [--no-up] [-d|--detach]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=compose-lib.sh
source "$SCRIPT_DIR/compose-lib.sh"

ROOT="$(compose_repo_root)"
YES=0
NO_UP=0
DETACH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes) YES=1; shift ;;
    --no-up) NO_UP=1; shift ;;
    -d|--detach) DETACH=1; shift ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/compose-wipe-db.sh [-y|--yes] [--no-up] [-d|--detach]

Stops this checkout's Compose stack, deletes the Postgres bind-mounted data
directory (FINANCE_HELPER_DATA/pgdata), and starts the stack back up so
Postgres reinitializes empty.

-y, --yes    Skip the confirmation prompt.
--no-up      Leave the stack down after wiping (skip compose-up.sh).
-d, --detach Start the stack back up in the background.
--help       Show this help text.

This only touches the pgdata directory for THIS checkout (worktree), as
resolved from its own .env — it will not affect other worktrees or the
main checkout's database.
EOF
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

compose_require_docker
compose_require_env "$ROOT"
compose_require_files "$ROOT"

ENV_FILE="$ROOT/.env"
DATA_ROOT="$(compose_env_get FINANCE_HELPER_DATA "$ENV_FILE")"
DATA_ROOT="${DATA_ROOT:-$HOME/finance-helper}"
PGDATA_DIR="$DATA_ROOT/pgdata"

echo "==> This will DELETE all Postgres data for this checkout:"
echo "    $PGDATA_DIR"
if [[ "$YES" != "1" ]]; then
  read -r -p "Type 'yes' to continue: " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "==> Stopping stack in $ROOT"
compose_run "$ROOT" down

if [[ -d "$PGDATA_DIR" ]]; then
  echo "==> Removing $PGDATA_DIR"
  rm -rf -- "$PGDATA_DIR"
else
  echo "==> $PGDATA_DIR does not exist, nothing to remove"
fi

if [[ "$NO_UP" == "1" ]]; then
  echo "Done. Stack left down (--no-up). Run ./scripts/compose-up.sh when ready."
  exit 0
fi

UP_ARGS=()
[[ "$DETACH" == "1" ]] && UP_ARGS+=(-d)
"$SCRIPT_DIR/compose-up.sh" "${UP_ARGS[@]+"${UP_ARGS[@]}"}"
