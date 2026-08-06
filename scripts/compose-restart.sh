#!/usr/bin/env bash
# Restart the Compose stack (down then up) with a consistent -f set.
# Usage: ./scripts/compose-restart.sh [-d|--detach] [--wipe] [--] [extra up args...]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DETACH=0
WIPE=0
EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--detach) DETACH=1; shift ;;
    --wipe) WIPE=1; shift ;;
    --) shift; EXTRA+=("$@"); break ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/compose-restart.sh [-d|--detach] [--wipe] [-- docker-compose-up-args...]

Runs compose-down then compose-up with the same checkout Compose file set.

--wipe only removes named Compose volumes on the way down (not Postgres bind
data under FINANCE_HELPER_DATA). Prefer a plain restart unless you know you
need -v.
EOF
      exit 0
      ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

DOWN_FLAGS=()
[[ "$WIPE" == "1" ]] && DOWN_FLAGS+=(--wipe)
UP_FLAGS=()
[[ "$DETACH" == "1" ]] && UP_FLAGS+=(-d)

"$SCRIPT_DIR/compose-down.sh" "${DOWN_FLAGS[@]+"${DOWN_FLAGS[@]}"}"
"$SCRIPT_DIR/compose-up.sh" "${UP_FLAGS[@]+"${UP_FLAGS[@]}"}" "${EXTRA[@]+"${EXTRA[@]}"}"
