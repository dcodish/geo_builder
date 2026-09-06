# RUNBOOK — operating & deploying Geo Builder (2-D + 3-D) on themathbible.com

The single ops entry point. Deep 2-D proxy detail (one-time setup, env file, security notes) lives in [deploy/README.md](../deploy/README.md) — this file is the day-to-day procedure + troubleshooting index for **both** apps.

## The moving parts

| Artifact | Built by | Lives on the server at | Served as |
| --- | --- | --- | --- |
| 2-D static app (`dist/`) | `npm run build` | `/var/www/vhosts/themathbible.com/httpdocs/geo-builder/` | `https://themathbible.com/geo-builder/` (Apache static) |
| 3-D static app (`dist-3d/`) | `npm run build:3d` | `…/httpdocs/3d-builder/` (**rename `3d.html` → `index.html`**) | `https://themathbible.com/3d-builder/` (Apache static) |
| Complex-numbers app (`dist-complex/`) | `npm run build:complex` | `…/httpdocs/complex-builder/` (**rename `complex.html` → `index.html`**) | `https://themathbible.com/complex-builder/` (Apache static) |
| Shared Node proxy (`dist-server/proxy.mjs`) | `npm run build:proxy` | `/var/www/geo-proxy/proxy.mjs` | `geo-proxy.service` on loopback **:8788**, reverse-proxied by Apache |
| **Site homepage** (tool links) | — hand-edited; **canonical copy: [`deploy/homepage/index.html`](../deploy/homepage/index.html)** | `…/httpdocs/index.html` | `https://themathbible.com/` (Apache static) |
| Proxy env (key, admin creds, log paths) | — (hand-edited) | `/var/www/geo-proxy/geo-proxy.env` (mode 600) | read by the service |

- **Server:** `ssh root@themathbible.com` (74.208.61.39). Plesk on Ubuntu 22.04. **Apache serves everything; nginx is OFF** — never touch `vhost_nginx.conf`.
- **One proxy serves both apps** (`server/parseHandler.ts` binds them): LLM fallback (`/api/parse`, body `tool:'3d'` selects the 3-D prompt), usage-event sinks (`events.jsonl` + `events-3d.jsonl` via `EVENTS_3D_LOG_PATH`), and the two admin dashboards.
- **Admin dashboards:** `https://themathbible.com/geo-builder/admin` and `…/3d-builder/admin` (→ proxy path `/admin3`, `ADMIN_3D_BASE`). Same credentials (in the env file).
- **Apache directives** (reverse-proxy lines): sources in [deploy/apache-geo-builder.conf](../deploy/apache-geo-builder.conf) + [deploy/apache-3d-builder.conf](../deploy/apache-3d-builder.conf) + [deploy/apache-complex-builder.conf](../deploy/apache-complex-builder.conf). **Store them in Plesk's GUI field** (*Domains → themathbible.com → Apache & nginx Settings → Additional directives for HTTPS*) so a Plesk regeneration doesn't drop them; direct edits to `vhost_ssl.conf` do NOT survive regeneration.

  **There is no CLI for this — it needs the operator's hands** (verified 2026-09-06 on Plesk Obsidian 18.0.80.6): `plesk bin site --help` exposes only *PHP* directives, and `/usr/local/psa/bin/apache` covers only modules and MPM. The GUI field is **DB-backed and authoritative** — its contents were confirmed byte-identical to the live `vhost_ssl.conf` — which is why hand-editing that file is the one thing never to do: it works instantly and reverts silently at the next regeneration, the exact failure [#903](https://github.com/dcodish/geo_builder/issues/903) exists to prevent. A session needing a directive **prepares the exact block and escalates**; it does not improvise. Before pasting, confirm the field already holds the existing proxies (`/hw/`, `/akinator`, `/bagrut`, `/akinator2`, the builder lanes) and **append** — replacing it takes four live apps down with it.

### Adding a builder: its proxy rule is a DEPLOY STEP, not an afterthought (#903, [ADR-W-043](06w-decisions-workspace.md#adr-w-043))

The complex builder was added to the table above with **no conf of its own**, so `/complex-builder/api/*`
answered 404 from its first deploy — and because every consumer has a deliberate degraded path, nothing
said so for a month. `/api/config` was worse: it had never been proxied for **any** product.

**Every product in [`products.json`](../products.json) with `enabled: true` needs a `deploy/apache-<prefix>.conf`
carrying, at minimum, the tails its app fetches**, and the static app alone is not a complete deploy:

| tail | who needs it |
| --- | --- |
| `api/config` | **every** builder — the operator's per-tool curation. Silent when missing |
| `api/parse` | any builder with an LLM fallback |
| `api/log` | any builder that logs usage events |
| `admin` | only a builder with its own dashboard mount **and a distinct path tail** (2-D `/admin`, 3-D `/admin3`). Without one, the prefix is stripped and the request lands on the 2-D dashboard — worse than a 404, so leave the line out |

**Verify after pasting** — `405`/`200` mean routed, `404` means not:

```sh
for p in geo-builder 3d-builder complex-builder; do
  printf '%s api/config -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "https://themathbible.com/$p/api/config?tool=x"
done
```

The dashboard's config page (`/geo-builder/admin/config`) runs the same probe from the browser and
names any builder the config cannot reach.

## Standard deploy

Deploy **only committed state on `main`** ([docs/22 §5](22-workflow.md)). Decision rule first: **did `server/` change?**
- **No** → static-only deploy; **do not restart the proxy.**
- **Yes** → also rebuild + push + restart the proxy (step 4).

```sh
# 0. Gates on the exact tree being deployed
npx vitest run           # full suite green
npm run build            # 2-D (tsc -b + vite)   — skip if 2-D unchanged
npm run build:3d         # 3-D                    — skip if 3-D unchanged
npm run build:complex    # complex                — skip if src-complex/ unchanged
npm run build:proxy      # only if server/ changed

# 1. 2-D static
scp -r dist/* root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/geo-builder/

# 2. 3-D static (note the rename)
scp -r dist-3d/* root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/3d-builder/
ssh root@themathbible.com 'cd /var/www/vhosts/themathbible.com/httpdocs/3d-builder && mv -f 3d.html index.html'

# 2b. complex static (same rename pattern). The directory was created at the prod/2026-08-15-2
#     deploy: mkdir + chown root:root + chmod 755, matching its siblings.
scp -r dist-complex/* root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/complex-builder/
ssh root@themathbible.com 'cd /var/www/vhosts/themathbible.com/httpdocs/complex-builder && mv -f complex.html index.html'

# 2b. homepage — ONLY when the tool links / landing page changed. EDIT THE TRACKED COPY
#     (deploy/homepage/index.html), commit, then upload it — never hand-edit on the server,
#     or the repo copy silently stops being canonical (adopted 2026-08-15, complex-card link):
scp deploy/homepage/index.html root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/index.html

# 3. perms (static files should be 644 root:root — scp usually preserves this; verify)
ssh root@themathbible.com 'chmod -R a+rX /var/www/vhosts/themathbible.com/httpdocs/geo-builder /var/www/vhosts/themathbible.com/httpdocs/3d-builder /var/www/vhosts/themathbible.com/httpdocs/complex-builder'

# 4. proxy — ONLY when server/ changed
scp dist-server/proxy.mjs root@themathbible.com:/var/www/geo-proxy/
ssh root@themathbible.com 'systemctl restart geo-proxy'
```

## The `-next` channel — RETIRED 2026-08-18 ([ADR-W-025](06w-decisions-workspace.md#adr-w-025), #747)

Track B was evaluated on parallel URLs (`/geo-builder-next/`, `/3d-builder-next/`) serving committed
`unify/ui` state while the canonical URLs kept the old builds ([ADR-W-020](06w-decisions-workspace.md#adr-w-020),
#700). At the operator's acceptance the unified build was deployed to the canonical paths as an
ordinary Standard deploy of `main` (`prod/2026-08-18`), the `-next` directories were removed from the
server, and the `build:next:*` scripts were deleted. **There is no parallel channel today: `main` →
canonical is the only deploy path, with no exceptions.**

Kept here only so the DEPLOY-LOG's `next/YYYY-MM-DD` entries stay readable. To evaluate a future big
surface under prod conditions, re-create the channel from ADR-W-020's mechanism (a `--base=` +
`--outDir` CLI override per builder, a separate scp target, canonical bytes stat-proven untouched,
its own tag scheme) — do not keep an idle one alive. The Plesk api mapping for `-next` paths must be
re-added then. Removing the existing `/geo-builder-next/api` + `/3d-builder-next/api` mappings is the operator's remaining teardown step (flagged on #747) — they are inert once the directories are gone.

## Verify (every deploy)

- `ssh root@themathbible.com 'curl -s http://127.0.0.1:8788/healthz'` → `ok`
- Both pages load over HTTPS; `index.html` references the **new** bundle hash and the bundle returns 200.
- A quick in-grammar utterance builds (no proxy call); if the proxy changed, an out-of-grammar utterance builds too (and shows in the Anthropic Console usage).
- Admin dashboards log in and show the visit.

## Record it (every deploy — non-optional)

```sh
git tag prod/YYYY-MM-DD        # -2, -3 … for same-day redeploys
git push origin --tags
```
…and append the entry to **[DEPLOY-LOG.md](DEPLOY-LOG.md)** (date, tag, commit, app(s), bundle hash(es), one line of what changed).

## Troubleshooting index

| Symptom | Likely cause → fix |
| --- | --- |
| Proxied routes (`/api/parse`, admin) 404, static fine, service `active` | **Plesk regenerated `vhost_ssl.conf`** and dropped hand-appended directives → re-add (via the Plesk GUI field this time), `apache2ctl -t && systemctl reload apache2` |
| App renders with old behaviour after a deploy | **Browser cache kept the old `index.html`** → hard-refresh; long-term the `<Directory>` cache block in `apache-geo-builder.conf` (no-cache HTML, immutable assets) |
| LLM fallback answers "service busy" | `LLM_DAILY_MAX` hit (usually a bot) → `journalctl -u geo-proxy | grep 'daily limit'`; tune in `geo-proxy.env` + restart |
| Dev machine: a "fixed" bug still reproduces | **Stale dev server** (predates the fix) → restart `npm run dev` (the ADR-115 lesson) |
| Dev machine: tests hang / ESM loads take seconds | Dropbox cloud-filter on `node_modules` → the junction fix; **`npm ci` clobbers the junction**, use `npm install` (PROJECT-MEMORY operational notes) |
| Serving a WORKTREE branch: `vite dev` fails `Cannot find package '@babel/core'` | A feature **worktree's `node_modules` is a junction** to the main tree's; the dev server's React/Babel plugin can't resolve `@babel/core` across it (`build` uses esbuild, so it works). → **Don't `vite dev` a worktree; use `build` + `vite preview`** (recipe below). |
| Local feature server: BLANK page, `#root` empty, JS request returns `Content-Type: text/html` | **Base-path mismatch.** `vite build` bakes `base:'/geo-builder/'` into `index.html`, but `vite preview` serves at `/` (`command==='serve'`), so the browser fetches `/geo-builder/assets/*.js` → SPA-fallback `index.html`. HTTP is 200 (misleading) — **check the JS `Content-Type`, not the status.** → rebuild with `--base=/`. |
| A `/`-leading CLI arg becomes `/Program Files/Git/...` | **git-bash MSYS path conversion** mangles `--base=/`. → run it from **PowerShell** (or `MSYS_NO_PATHCONV=1`, or `--base=./`). |
| Local git weirdness (phantom modified files, fsck errors) | Dropbox corrupting `.git` → `git fetch` from GitHub to backfill; GitHub is the source of truth |

## Serving a feature-branch worktree locally (for operator play-testing)

A git worktree's `node_modules` is a junction, so `vite dev` breaks (Babel, above) — serve a production **preview** instead. From the worktree, **via PowerShell** (so `--base=/` isn't mangled):

```powershell
node node_modules/vite/bin/vite.js build --base=/          # base=/ so preview (served at /) matches
node node_modules/vite/bin/vite.js preview --port 5180 --strictPort
```

Then open **`http://localhost:5180/`** (root — NOT `/geo-builder/`). VERIFY before handing over: the JS the page references must return `Content-Type: text/javascript` (`curl -sD - http://localhost:5180/assets/<hash>.js -o /dev/null`), not `text/html`. It's a static build (no HMR) — rebuild + refresh for changes. `--host` exposes it on the LAN.

## Rollback

Old hashed bundles are never deleted by `scp`, so the fastest rollback is redeploying the previous good commit's build:

```sh
git checkout prod/<previous-tag>   # in a worktree, not the shared tree
npm install && npx vitest run && npm run build   # (and/or build:3d / build:proxy)
# then the standard deploy steps for the affected artifact(s)
```

Tag the rollback deploy too (`prod/YYYY-MM-DD-rollback`) and log it.

## Logs & data

- **Proxy service:** `journalctl -u geo-proxy -f`
- **Prod usage events:** `/var/www/geo-proxy/events.jsonl` (2-D) + `events-3d.jsonl` (3-D) — hashed IPs only, self-rotating, retention per `EVENTS_RETENTION_DAYS`. Triaged by the `/log-triage` skill.
- **Dev debug log:** `logs/debug-log.jsonl` (dev-only, gitignored) — the session-reconstruction source for bug reports; keep `logs/` out of personal cloud sync.
