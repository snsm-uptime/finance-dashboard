#!/usr/bin/env bash
# Create a sibling git worktree for a story (run from the primary checkout).
# Usage: ./scripts/cursor-worktree/worktree-add.sh <slug> <branch>
# Example: ./scripts/cursor-worktree/worktree-add.sh 2-3-invite feat/2/2-3-invite-members-by-email
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIMARY_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/cursor-worktree/worktree-add.sh <slug> <branch>

Creates ../finance-dashboard-wt-<slug> (fetches origin first).
Branch is required (repo convention: feat/<epic>/<story-slug>).

Run from the primary checkout. Afterward:
  cd ../finance-dashboard-wt-<slug>
  <primary>/scripts/cursor-worktree/worktree-bootstrap.sh
EOF
}

valid_slug() {
  [[ -n "$1" && "$1" =~ ^[A-Za-z0-9._-]+$ ]]
}

if [[ $# -lt 2 || "$1" == "-h" || "$1" == "--help" ]]; then
  usage
  [[ $# -lt 2 && "$1" != "-h" && "$1" != "--help" ]] && exit 1
  exit 0
fi

SLUG="$1"
BRANCH="$2"

if ! valid_slug "$SLUG"; then
  echo "error: slug must be non-empty and match [A-Za-z0-9._-]+ (got: $SLUG)" >&2
  exit 1
fi

WT_PATH="$(cd "$PRIMARY_ROOT/.." && pwd)/finance-dashboard-wt-${SLUG}"

if [[ -e "$WT_PATH" ]]; then
  echo "error: path already exists: $WT_PATH" >&2
  exit 1
fi

cd "$PRIMARY_ROOT"
echo "==> Fetching origin"
git fetch origin

DEFAULT_REF="$(git symbolic-ref -q refs/remotes/origin/HEAD 2>/dev/null || true)"
DEFAULT_REF="${DEFAULT_REF#refs/remotes/origin/}"
if [[ -z "$DEFAULT_REF" ]]; then
  if git show-ref --verify --quiet refs/remotes/origin/main; then
    DEFAULT_REF=main
  elif git show-ref --verify --quiet refs/remotes/origin/master; then
    DEFAULT_REF=master
  else
    echo "error: could not resolve origin default branch (need origin/main or origin/master)" >&2
    exit 1
  fi
fi
BASE="origin/${DEFAULT_REF}"

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "==> Adding worktree $WT_PATH (existing local branch $BRANCH)"
  git worktree add "$WT_PATH" "$BRANCH"
elif git show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
  echo "==> Adding worktree $WT_PATH (tracking origin/${BRANCH})"
  git worktree add --track -b "$BRANCH" "$WT_PATH" "origin/${BRANCH}"
else
  echo "==> Adding worktree $WT_PATH (new branch $BRANCH from ${BASE})"
  git worktree add "$WT_PATH" -b "$BRANCH" "$BASE"
fi

cat <<EOF

Worktree created.
  path:   $WT_PATH
  branch: $BRANCH

Next:
  cd $WT_PATH
  $PRIMARY_ROOT/scripts/cursor-worktree/worktree-bootstrap.sh
EOF
