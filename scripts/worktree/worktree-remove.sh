#!/usr/bin/env bash
# Remove a sibling story worktree (run from the primary checkout).
# Usage: ./scripts/worktree/worktree-remove.sh <slug>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIMARY_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/worktree/worktree-remove.sh <slug>

Stops Compose in that worktree when possible, then removes
../finance-dashboard-wt-<slug> via git worktree remove.

Postgres bind data under ~/finance-helper-wt/ is left alone
(use compose-down --wipe only for named volumes; delete pgdata on disk to wipe DB).
EOF
}

valid_slug() {
  [[ -n "$1" && "$1" =~ ^[A-Za-z0-9._-]+$ ]]
}

if [[ $# -lt 1 || "$1" == "-h" || "$1" == "--help" ]]; then
  usage
  [[ $# -lt 1 ]] && exit 1
  exit 0
fi

SLUG="$1"
if ! valid_slug "$SLUG"; then
  echo "error: slug must be non-empty and match [A-Za-z0-9._-]+ (got: $SLUG)" >&2
  exit 1
fi

WT_PATH="$(cd "$PRIMARY_ROOT/.." && pwd)/finance-dashboard-wt-${SLUG}"

cd "$PRIMARY_ROOT"
if [[ ! -e "$WT_PATH" ]]; then
  echo "error: worktree path not found: $WT_PATH" >&2
  echo "hint: git worktree list" >&2
  exit 1
fi

if [[ -f "$WT_PATH/.env" ]]; then
  echo "==> Stopping Compose in worktree (if running)"
  COMPOSE_ROOT="$WT_PATH" bash "$PRIMARY_ROOT/scripts/compose-down.sh" || true
fi

echo "==> Removing worktree $WT_PATH"
git worktree remove "$WT_PATH"
git worktree prune
echo "Done. (Postgres data under ~/finance-helper-wt/ may still exist.)"
