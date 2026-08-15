wrm() {
  local primary_root
  primary_root="$(git rev-parse --show-toplevel 2>/dev/null)" ||
    {
      echo "wrm: not inside a git repo" >&2
      return 1
    }
  "$primary_root/scripts/worktree/worktree-remove.sh" "$@" || return $?
  export ROOT_WORKTREE_PATH="$primary_root"
  echo "==> ROOT_WORKTREE_PATH=$ROOT_WORKTREE_PATH"
}

wad() {
  local primary_root
  primary_root="$(git rev-parse --show-toplevel 2>/dev/null)" ||
    {
      echo "wad: not inside a git repo" >&2
      return 1
    }
  "$primary_root/scripts/worktree/worktree-add.sh" "$@" || return $?
  export ROOT_WORKTREE_PATH="$primary_root"
  echo "==> ROOT_WORKTREE_PATH=$ROOT_WORKTREE_PATH"
}
