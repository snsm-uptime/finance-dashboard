# Debugging the Next.js UI (in Docker) from Neovim

Attach-only Node.js remote debugging of the `ui` service (Next.js 16, TypeScript) via
`nvim-dap` + `js-debug-adapter` (Microsoft's maintained `vscode-js-debug` DAP server).

Scope: server-side/Node debugging only (API routes, server components, middleware) —
not browser-side (`pwa-chrome`) debugging, not launch-based `docker exec` flows.

## 1. Dependencies

| Component | Choice | Why |
|---|---|---|
| Adapter | `js-debug-adapter` (Mason package) | Maintained `vscode-js-debug` DAP server, prebuilt binary. The older `nvim-dap-vscode-js` plugin route is legacy — the nvim-dap wiki points to the standalone `dapDebugServer.js`/Mason path as current best practice. |
| LazyVim extra | `lazyvim.plugins.extras.dap.core` | Provides `nvim-dap`, `nvim-dap-ui`, `nvim-nio`, `<leader>d*` keymaps, and the mason-tool-installer hook. No LazyVim extra exists for JS-specific DAP wiring — that's custom. |
| Session type | **Attach**, not launch | The Node process is started inside the container by `docker-entrypoint-dev.sh` → the compose `command:` override, independent of Neovim. Attach connects to the already-running inspector. |
| Runtime requirement | `node --inspect=0.0.0.0:9229 node_modules/next/dist/bin/next dev ...` as the container's `command:` (dev only) — **not** `NODE_OPTIONS` and **not** `npm run dev` | Must bind `0.0.0.0` — the container's own loopback isn't reachable from the host even with the port published. `--inspect` has to be a real CLI flag (landing in `process.execArgv`), not `NODE_OPTIONS`: see the jest-worker note below. |
| Process model | **Two Node processes**, not one | `node ... next/dist/bin/next dev` (PID 1) only supervises — it's a thin CLI wrapper. It forks a second process, `next-server` (running `next/dist/server/lib/start-server.js`), which is where route handlers/server components/middleware actually execute. Breakpoints in app code only ever bind in `next-server`; PID 1 never runs your code. |
| Attach port | **9230**, not 9229 | `bin/next` detects the inherited `--inspect=0.0.0.0:9229` on PID 1 (via `process.execArgv`) and, to avoid colliding with itself, forks `next-server` with its own inspector on **port + 1** (9230), bound to the same host. This offset is hardcoded in Next's CLI (`address.port = address.port + 1`) — not independently configurable. 9229 stays published for completeness (and shows up as a mostly-idle target at `/json/list`), but the attach config you actually use must point at 9230. |
| jest-worker gotcha | Don't reintroduce `NODE_OPTIONS=--inspect=...` | Next's dev-mode background static-path/type-check workers run via `jest-worker`, which forks children with `execArgv: process.execArgv.filter(f => !/^--(debug\|inspect)/.test(f))` — it deliberately strips `--inspect` from execArgv before forking, but forks with `env: {...process.env}`, so `NODE_OPTIONS` is **not** filtered. If `--inspect` arrives via `NODE_OPTIONS`, every jest-worker child re-applies it from its inherited env, collides with the parent on the same port, and crashes (`Jest worker encountered N child process exceptions, exceeding retry limit`) — this broke static-path generation for `force-dynamic` routes like `/lists/[listId]` even though they don't need static generation at all. Passing `--inspect` as a real CLI arg lets jest-worker's own filter do its job. |
| js-debug auto-attach gotcha | Set `autoAttachChildProcesses = false` in the attach config | Once attached, `js-debug-adapter` injects `NODE_OPTIONS=--require <bootloader.js>` into the debuggee's env so any process it forks also auto-attaches. That bootloader path is on the **host** filesystem (the Mason install dir), which doesn't exist inside the container — so every child `next-server` forks (jest-worker included) crashes on `MODULE_NOT_FOUND` the instant it starts, again exceeding jest-worker's retry limit. We don't need jest-worker's internal children debugged, so this is disabled outright. |
| `skipFiles` must NOT include `.next/` | `skipFiles = { "<node_internals>/**", "**/node_modules/**" }` — no `.next` entry | Turbopack compiles route handlers/server components into `.next/dev/server/chunks/*.js`; there's no separate output location for app code the way there is for a webpack `dist/` vs `node_modules`. A breakpoint that source-maps into a `skipFiles`-matched compiled file is silently ignored — nvim-dap shows it as verified, the session stays attached and connected, but execution never pauses there. This was the actual cause of "attaches fine, breakpoint just never fires": confirmed by inspecting the dev source map (`.next/dev/server/chunks/*.js.map`), which correctly resolves `ui/app/health/route.ts` to `file:///app/app/health/route.ts` (i.e. `localRoot`/`remoteRoot` were never the problem) — the compiled file hosting that mapped line was simply blackboxed. |
| `.next` must be a **bind mount**, not a named volume | `docker-compose.dev.yml` — `./ui/.next:/app/.next`, not `ui_next:/app/.next` | `js-debug-adapter` runs on the **host**, not in the container. For `file://` script URLs it reads the `.js.map` sidecar straight off local disk (via the `localRoot`/`remoteRoot` substitution) — it does not fetch source maps over the CDP connection. If `.next` is a named volume, its contents (including every `.js.map`) exist only inside the container; once substituted to the host path (`<repo>/ui/.next/...`) the read 404s with `Could not read source map for file:///app/.next/...: ENOENT`, one line per compiled chunk. Bind-mounting `.next` is a genuine perf tradeoff on macOS (thousands of small files rewritten on every HMR pass) — accepted here because it's required for source-mapped breakpoints to resolve at all, not an incidental choice. `.next` is already gitignored. |
| Dev bundler: `--webpack`, not Turbopack (default) | `next dev --webpack ...` in the container `command:` | Turbopack's dev-mode React Server Components runtime re-instantiates page/layout modules as a **brand-new V8 Script object on every single render** (confirmed via a raw CDP probe: hitting `/health`, a Route Handler, parsed its script once and reused it across 3 requests; hitting an App Router page re-parsed the module fresh each time, with an incrementing `?id=NN` suffix wrapped in an unusual `about://React/Server/file://...` URL). `js-debug` binds a breakpoint to one script instance and doesn't appear to rebind it to each freshly-reparsed instance for this URL scheme, so breakpoints in `page.tsx`/layouts (and anything they call, e.g. `lib/session.ts`) silently never pause — even though the exact same breakpoint in a Route Handler (`route.ts`) works fine, since those scripts are stable across requests. Switching to classic webpack removes the per-request module reinstantiation, and breakpoints in pages pause reliably. This is a real tradeoff (Turbopack is faster) accepted specifically for debugging sessions — switch back to the default (drop `--webpack`) for normal dev work if you're not actively debugging page-level server code. |

## 2. Implementation

### 2a. Neovim config (`~/dotfiles/nvim/config` or wherever your LazyVim config lives)

- `lazyvim.json`: `"lazyvim.plugins.extras.dap.core"` added to `extras`.
- `lua/plugins/dap.lua` (new file): defines the `pwa-node` adapter (via Mason's
  `js-debug-adapter`) and an attach configuration named **"Attach to Docker (Next.js ui)"**
  for `typescript`/`javascript`/`typescriptreact`/`javascriptreact` filetypes.

Key details:
- `localRoot`/`remoteRoot` pair `<repo>/ui` ↔ `/app` (the actual bind mount in
  `docker-compose.dev.yml`), not the repo root. The config assumes Neovim is opened at the
  repo root (`finance-dashboard-wt-5-8/`) and appends `/ui` to `${workspaceFolder}` — if you
  open Neovim from inside `ui/` instead, adjust accordingly.
- `port = 9230`, not 9229 — see the process-model row above. Attaching to 9229 "succeeds"
  (nvim-dap shows a connected session) but breakpoints never fire, because that process
  never executes route-handler code.
- `autoAttachChildProcesses = false` — required to avoid the jest-worker/bootloader crash
  described above.

### 2b. This repo (`finance-dashboard-wt-5-8`)

`docker-compose.dev.yml` — `ui` service:
```yaml
    command: ["node", "--inspect=0.0.0.0:9229", "node_modules/next/dist/bin/next", "dev", "--webpack", "-H", "0.0.0.0", "-p", "3000"]
    ports:
      - "${UI_DEBUG_PORT:-9229}:9229"
      - "${UI_DEBUG_WORKER_PORT:-9230}:9230"
```
`--webpack` opts out of the Turbopack default — see the dev-bundler row above. It's
here because we're treating this compose file as the debugging configuration; drop it
for a normal (non-debugging) dev session if you want Turbopack's speed back.
The `command:` override replaces the image's `CMD ["npm", "run", "dev", ...]` (the
entrypoint still runs first — `docker-entrypoint-dev.sh` does `exec "$@"`, so `npm ci`
on a stale lockfile still happens). Bypassing `npm run dev` matters: `npm` itself is a
Node process, so if `--inspect` arrived via `NODE_OPTIONS` it would also try to bind the
port on `npm`'s own process before `next` ever started, pushing `next dev`'s inspector
onto a fallback port. Invoking `node ... next dev` directly means the CLI process claims
9229 with nothing ahead of it in line. Compose overlays merge list-type keys like
`ports:` with the base file (they don't replace them), so this adds to the base
`${UI_HOST_PORT:-3000}:3000` mapping, it doesn't remove it.

The second `ports:` entry (9230) is required — see the process-model row above. It's not
something we chose; it's where the `next-server` child's own inspector actually ends up.

`.env.example` — documents `UI_DEBUG_PORT` and `UI_DEBUG_WORKER_PORT` (both commented out,
defaulting to `9229`/`9230`). No change needed to your live `.env` unless those collide
with another worktree stack already running — and if you do change `UI_DEBUG_PORT`,
`UI_DEBUG_WORKER_PORT` must be set to exactly one higher (Next hardcodes the +1 offset
internally, so the two can't drift apart).

### 2c. `package.json` / `Dockerfile.dev` — no changes

`Dockerfile.dev`'s `CMD` is overridden by the compose `command:` above; the entrypoint
(`docker-entrypoint-dev.sh`) is untouched and still runs its `npm ci` check before
`exec "$@"`.

## 3. Validation

1. **Bring up the stack** (via the repo's wrapper script, not raw `docker compose`, to
   preserve project naming/worktree overlay):
   ```bash
   ./scripts/compose-up.sh
   ```

2. **Confirm both inspectors started** — tail `ui` logs for the V8 inspector banners:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.worktree.yml \
     -p fh-feat-5-5-8-settle-up-simplify-suggested-transfe logs -f ui
   ```
   Expect two: `Debugger listening on ws://0.0.0.0:9229/<uuid>` (the CLI wrapper) and a
   second one on `0.0.0.0:9230` shortly after (the `next-server` child — this is the one
   that matters). You should *not* see a `Starting inspector on ... failed: address
   already in use` line — if you do, something is still setting `NODE_OPTIONS` with
   `--inspect` somewhere (that reintroduces the jest-worker crash described above).

3. **Confirm 9230 is reachable from host and is the real server**:
   ```bash
   curl -s http://localhost:9230/json/list
   ```
   Should return JSON with `"url": "file:///app/node_modules/next/dist/server/lib/start-server.js"`
   and a `webSocketDebuggerUrl` field. (9229's `/json/list` will show `next/dist/bin/next`
   instead — that's the wrapper, not what you want to attach to.)

4. **Attach from Neovim**:
   - `cd finance-dashboard-wt-5-8 && nvim` (open at repo root).
   - Open `ui/app/health/route.ts` to lazy-load the DAP spec (filetype-triggered).
   - Set a breakpoint: `<leader>db`.
   - Start the session: `:lua require('dap').continue()` → select
     "Attach to Docker (Next.js ui)".
   - Trigger it: `curl http://localhost:3280/health`.

5. **Confirm correct hit/mapping**: Neovim should pause on the exact local source line in
   `ui/app/health/route.ts` — not a `.next`/bundled blob (if it does, `localRoot`/
   `remoteRoot` are misaligned, most likely because Neovim wasn't opened at the repo
   root). Use `<leader>du` for the variables/scopes pane; step with
   `<leader>dc`/`dso`/`dsi`; confirm the session survives a Next.js HMR recompile
   (validates `restart = true`). If it attaches cleanly but never pauses at all, double
   check the config's `port` is 9230, not 9229 — that was the original bug here.

6. **Rollback/cleanup**: all changes are confined to `docker-compose.dev.yml` (dev-only
   overlay) — the prod compose path is untouched. `docker compose down` releases ports
   9229/9230 like any other published port. To resolve a port collision across concurrent
   worktree stacks, set `UI_DEBUG_PORT` **and** `UI_DEBUG_WORKER_PORT` (= `UI_DEBUG_PORT`
   + 1) in this worktree's `.env` and update the `port` field in `lua/plugins/dap.lua`'s
   attach config to match `UI_DEBUG_WORKER_PORT` — no other files need to change.

7. **Confirm the jest-worker fixes hold**: navigate to a `force-dynamic` page like
   `/lists/[listId]` while attached. It should render normally with no
   `Jest worker encountered N child process exceptions, exceeding retry limit` in the
   `ui` logs. If it does still crash, check the error for `Cannot find module
   '.../js-debug/src/bootloader.js'` — that means `autoAttachChildProcesses = false`
   isn't taking effect (config not reloaded, or a stale nvim-dap session from before the
   change is still attached).

8. **Confirm page-level (not just Route Handler) breakpoints pause**: set a breakpoint in
   an actual page, e.g. `ui/app/lists/[listId]/page.tsx`, and reload that URL in the
   browser. This is the case `--webpack` fixes — see the dev-bundler row above. If it
   still doesn't pause, verify the container is actually running with `--webpack`
   (`docker compose ... logs ui` banner should say `Next.js 16.2.12` with no
   `(Turbopack)` suffix) and that `.next` was rebuilt after the switch (a stale Turbopack
   `.next` bind mount from before the flag change can leave mixed build output —
   `./scripts/compose-restart.sh --wipe` or manually clearing `ui/.next` resolves this).
