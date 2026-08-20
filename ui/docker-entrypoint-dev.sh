#!/bin/sh
# Named volume ui_node_modules survives image rebuilds. Re-run npm ci when the
# bind-mounted lockfile no longer matches what is installed in that volume.
set -e
cd /app
if [ -f package-lock.json ]; then
  lock_hash="$(sha256sum package-lock.json | awk '{print $1}')"
  stamp="node_modules/.package-lock-hash"
  if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$lock_hash" ]; then
    echo "ui: installing dependencies from package-lock.json"
    npm ci
    mkdir -p node_modules
    printf '%s\n' "$lock_hash" > "$stamp"
  fi
fi
exec "$@"
