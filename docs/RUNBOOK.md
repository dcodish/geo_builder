# RUNBOOK — operating & deploying the four builders and the proxy on themathbible.com

The single ops entry point. Deep 2-D proxy detail (one-time setup, env file, security notes) lives in [deploy/README.md](../deploy/README.md) — this file is the day-to-day procedure + troubleshooting index for **all four** builders and the proxy.

## The moving parts

| Artifact | Built by | Lives on the server at | Served as |
| --- | --- | --- | --- |
| 2-D static app (`dist/`) | `npm run build` | `/var/www/vhosts/themathbible.com/httpdocs/geo-builder/` | `https://themathbible.com/geo-builder/` (Apache static) |
| 3-D static app (`dist-3d/`) | `npm run build:3d` | `…/httpdocs/3d-builder/` (**rename `3d.html` → `index.html`**) | `https://themathbible.com/3d-builder/` (Apache static) |
| Complex-numbers app (`dist-complex/`) | `npm run build:complex` | `…/httpdocs/complex-builder/` (**rename `complex.html` → `index.html`**) | `https://themathbible.com/complex-builder/` (Apache static) |
| Analytic-geometry app (`dist-analytic/`) | `npm run build:analytic` | `…/httpdocs/analytic-builder/` (**rename `analytic.html` → `index.html`**) | `https://themathbible.com/analytic-builder/` (Apache static) |
| Shared Node proxy (`dist-server/proxy.mjs`) | `npm run build:proxy` | `/var/www/geo-proxy/proxy.mjs` | `geo-proxy.service` on loopback **:8788**, reverse-proxied by Apache |
| **Site homepage** (tool links) | — hand-edited; **canonical copy: [`deploy/homepage/index.html`](../deploy/homepage/index.html)** | `…/httpdocs/index.html` | `https://themathbible.com/` (Apache static) |
| **Site-root crawl files** (#1384) | — hand-edited, beside the homepage: `robots.txt`, `sitemap.xml`, `favicon.svg`; `favicon.ico` + `apple-touch-icon.png` are REGENERATED from the SVG by `node scripts/render-icons.mjs deploy/homepage/favicon.svg deploy/homepage` | `…/httpdocs/` | `https://themathbible.com/robots.txt` etc. |
| **Page metadata + preview images** (#1383) | the builds themselves: each builder's `seo/` (icon, touch icon, `og.png`) is emitted into its `dist*/seo/` and ships with the ordinary `scp -r dist*/*`. The PNGs are REGENERATED, never edited: `node scripts/render-icons.mjs <product>/seo/icon.svg <product>/seo` and, against a running dev server, `node scripts/render-og.mjs --base http://localhost:5173` (also writes `deploy/homepage/og.png`) | `…/httpdocs/<builder>/seo/`, `…/httpdocs/og.png` | `https://themathbible.com/geo-builder/seo/og.png` etc. |
| Proxy env (key, admin creds, log paths) | — (hand-edited) | `/var/www/geo-proxy/geo-proxy.env` (mode 600) | read by the service |

- **Server:** `ssh root@themathbible.com` (74.208.61.39). Plesk on Ubuntu 22.04. **Apache serves everything; nginx is OFF** — never touch `vhost_nginx.conf`.
- **One proxy serves all four builders** (`server/parseHandler.ts` binds them): LLM fallback (`/api/parse`, the body's `tool:` selects the builder's prompt), usage-event sinks (one `events*.jsonl` per builder that logs — see *Logs & data*), and the two admin dashboards.
- **Admin dashboards:** `https://themathbible.com/geo-builder/admin` and `…/3d-builder/admin` (→ proxy path `/admin3`, `ADMIN_3D_BASE`). Same credentials (in the env file).
- **Apache directives** (reverse-proxy lines): sources in [deploy/apache-geo-builder.conf](../deploy/apache-geo-builder.conf) + [deploy/apache-3d-builder.conf](../deploy/apache-3d-builder.conf) + [deploy/apache-complex-builder.conf](../deploy/apache-complex-builder.conf) + [deploy/apache-analytic-builder.conf](../deploy/apache-analytic-builder.conf). **Store them in Plesk's GUI field** (*Domains → themathbible.com → Apache & nginx Settings → Additional directives for HTTPS*) so a Plesk regeneration doesn't drop them; direct edits to `vhost_ssl.conf` do NOT survive regeneration.

  **There is no CLI for this — it needs the operator's hands** (verified 2026-09-06 on Plesk Obsidian 18.0.80.6): `plesk bin site --help` exposes only *PHP* directives, and `/usr/local/psa/bin/apache` covers only modules and MPM. The GUI field is **DB-backed and authoritative** — its contents were confirmed byte-identical to the live `vhost_ssl.conf` — which is why hand-editing that file is the one thing never to do: it works instantly and reverts silently at the next regeneration, the exact failure [#903](https://github.com/dcodish/geo_builder/issues/903) exists to prevent. A session needing a directive **prepares the exact block and escalates**; it does not improvise. Before pasting, confirm the field already holds the existing proxies (`/hw/`, `/akinator`, `/bagrut`, `/akinator2`, the builder lanes) and **append** — replacing it takes four live apps down with it.

  **Preparing the block** (#1572): read the live `/var/www/vhosts/system/themathbible.com/conf/vhost_ssl.conf` over ssh, read-only, and diff it against `deploy/apache-*.conf`. Give the operator only the missing directives, to append at the end, because a block computed from the repo alone duplicates lines already live. When he pastes his draft back, check every required line is in it before he applies; he once dropped the one line that mattered. After he applies: `npm run deploy:preflight` and `curl -sI` per prefix.

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
for p in geo-builder 3d-builder complex-builder analytic-builder; do
  printf '%s api/config -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "https://themathbible.com/$p/api/config?tool=x"
done
```

The dashboard's config page (`/geo-builder/admin/config`) runs the same probe from the browser and
names any builder the config cannot reach.

## Standard deploy

Deploy **only committed state on `main`** ([docs/22 §5](22-workflow.md)).

**A session runs the deploy itself and never hands it back** (operator, 2026-08-19: *"never ask me to
deploy. you have the permissions and tools for that"*). The commands are allowlisted in
`.claude/settings.json`; a denial is retried in its canonical minimal form, more than once. The one
terminal case is the work PC: `Connection refused` on port 22 while 443 serves is the work network
(2026-09-02). Finish everything up to the upload, hand off through git, and deploy from home. Write no
`prod/*` tag and no DEPLOY-LOG entry until the upload has happened.

**Which steps to run is a MEASUREMENT, never a question about which files changed**
([ADR-W-058](06w-decisions-workspace.md#adr-w-058), [#1130](https://github.com/dcodish/geo_builder/issues/1130)):

```sh
npm run deploy:preflight      # builds the proxy, reads the live artifacts, probes every live route, prints what is stale or broken
```

It names each artifact `MATCHES live`, `DIFFERS — push required` or `STALE BUILD` (built before its own source last changed — rebuild, then re-run; [ADR-W-061](06w-decisions-workspace.md#adr-w-061)), and **exits non-zero whenever
anything differs** so the verdict cannot be skimmed past on the way to the commands below. Push
exactly what it names; leave the rest alone.

**`DIFFERS` means "live was built from another commit", not "this product changed".** Every bundle
bakes in `__BUILD__` (short sha + date, ADR-146), so one commit changes all four static hashes. Push
what it names anyway, so each product's release id is right. Before telling the operator what changed,
measure it: `git diff --name-only <last prod tag>..HEAD -- src/ src3d/ src-complex/ src-analytic/ shell/`
(2026-09-20). A product you did not rebuild reads `MATCHES live` because it was compared with itself.

**It also probes every ROUTE** ([ADR-W-103](06w-decisions-workspace.md#adr-w-103), #1279) — on 2026-09-20 every hash
was green while `/analytic-builder/api/parse` answered 404, because its conf was never pasted into Plesk.
The route list is **read from the tracked confs** (every `ProxyPass` line in the `deploy/apache-*.conf` of
each product `products.json` enables — never a list kept by hand), so a new conf line is probed the next
run. Each probe is a **bodiless GET** that the proxy answers before any model call (`api/parse`, `api/log`
and `api/share` → `405`, the handler's first statement; `api/config?tool=…` → `204`; a dashboard → its
login form; `/g/<id>` → `404` carrying `x-robots-tag: noindex`), so it spends nothing and writes nothing.
A route answering Apache's plain 404 reads `BROKEN — … not routed` and **the preflight exits non-zero**;
the fix is always the Plesk paste below, never an edit to `vhost_ssl.conf`.

> **The rule this replaced was *"did `server/` change?"*, and it was not merely fragile — it was
> unsound.** Measured: 20 of the proxy bundle's 26 first-party modules live OUTSIDE `server/`
> (`src/parser/catalog.ts`, `src3d/parser/catalog3.ts`, the whole complex and analytic trees …), so
> editing a catalog row changes the deployed proxy and the old rule answered "no". It shipped stale
> server code twice, and the failure mode is invisible by construction: the stale artifact keeps
> working. `server/__tests__/deploy-preflight.test.ts` asserts the old rule is unsound, so it cannot
> be restored by someone who finds it simpler.

```sh
# 0. Gates on the exact tree being deployed
npm run test:full        # the full suite; green ONLY if reports/suite-verdict.json says green for this sha, dirty: false
# Build all; `npm run deploy:preflight` decides what is stale — push exactly what it names.
npm run build            # 2-D (tsc -b + vite)
npm run build:3d         # 3-D
npm run build:complex    # complex
npm run build:analytic   # analytic
npm run build:proxy      # the proxy (~30 ms)
npm run deploy:preflight # re-run after building

# 1. 2-D static
scp -r dist/* root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/geo-builder/

# 2. 3-D static (note the rename)
scp -r dist-3d/* root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/3d-builder/
ssh root@themathbible.com 'cd /var/www/vhosts/themathbible.com/httpdocs/3d-builder && mv -f 3d.html index.html'

# 2b. complex static (same rename pattern). The directory was created at the prod/2026-08-15-2
#     deploy: mkdir + chown root:root + chmod 755, matching its siblings.
scp -r dist-complex/* root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/complex-builder/
ssh root@themathbible.com 'cd /var/www/vhosts/themathbible.com/httpdocs/complex-builder && mv -f complex.html index.html'

# 2c. analytic static (same rename pattern). The directory was created at the prod/2026-09-16
#     deploy — its FIRST: mkdir + chown root:root + chmod 755, matching its siblings.
scp -r dist-analytic/* root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/analytic-builder/
ssh root@themathbible.com 'cd /var/www/vhosts/themathbible.com/httpdocs/analytic-builder && mv -f analytic.html index.html'

# 2d. homepage — ONLY when the tool links / landing page changed. EDIT THE TRACKED COPY
#     (deploy/homepage/index.html), commit, then upload it — never hand-edit on the server,
#     or the repo copy silently stops being canonical (adopted 2026-08-15, complex-card link):
scp deploy/homepage/index.html root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/index.html
#     …and the site-root crawl files whenever they changed (#1384). robots.txt names the sitemap; the
#     sitemap must list every builder (a lock checks it against products.json, not the server copy):
scp deploy/homepage/robots.txt deploy/homepage/sitemap.xml deploy/homepage/favicon.svg deploy/homepage/favicon.ico deploy/homepage/apple-touch-icon.png deploy/homepage/og.png root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/
#     …and the GeoGebra comparison page (#1386), its own directory so /geogebra/ serves index.html:
ssh root@themathbible.com 'mkdir -p /var/www/vhosts/themathbible.com/httpdocs/geogebra'
scp deploy/homepage/geogebra/index.html root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/geogebra/index.html

# 3. perms (static files should be 644 root:root — scp usually preserves this; verify)
ssh root@themathbible.com 'chmod -R a+rX /var/www/vhosts/themathbible.com/httpdocs/geo-builder /var/www/vhosts/themathbible.com/httpdocs/3d-builder /var/www/vhosts/themathbible.com/httpdocs/complex-builder /var/www/vhosts/themathbible.com/httpdocs/analytic-builder'

# 4. proxy — when the preflight says it DIFFERS
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

### The share store's env var is a DEPLOY STEP ([ADR-W-081](06w-decisions-workspace.md#adr-w-081), #1374)

`SHARE_STORE_PATH` must be set in `/var/www/geo-proxy/geo-proxy.env`, beside `EVENTS_LOG_PATH`:

```
SHARE_STORE_PATH=/var/www/geo-proxy/shares
```

**Why this is called out rather than assumed.** The default resolves relative to the process's
working directory, and the service runs with cwd `/` — so without the var the store resolves to
`/logs`, `mkdir` throws `EACCES`, and (before the handler was hardened) the rejection **killed the
whole proxy**, taking `/api/parse` down with it. The handler now survives any storage failure, but
sharing simply will not work until the var is set and the directory exists:

```sh
mkdir -p /var/www/geo-proxy/shares && chown root:root /var/www/geo-proxy/shares && chmod 755 /var/www/geo-proxy/shares
systemctl restart geo-proxy
```

`/g/` and `api/share` also need their Apache tails — see `deploy/apache-*.conf` (#903 rules apply:
a missing tail 404s silently). Probe after deploy, since a 404 here looks exactly like a working
deploy from the outside:

```sh
curl -s -o /dev/null -w '%{http_code}
' -X POST https://themathbible.com/geo-builder/api/share   -H 'content-type: application/json' -d '{"tool":"2d","fragment":"probeABC_-"}'   # 200
curl -s -o /dev/null -w '%{http_code}
' https://themathbible.com/g/aaaaaaaaaaaa   # 404 = routed
```

### One host, not two: `www.` redirects to the apex ([ADR-W-084](06w-decisions-workspace.md#adr-w-084), #1384)

`https://www.themathbible.com/…` answered **200 with a full copy of every page** (measured 2026-09-24), so
search engines see two sites and split one site's ranking between them. The fix is a **Plesk panel
setting, not a file in this repo — it needs the operator's hands** (the same reason as the Apache
directives above; a session may not change prod hosting settings):

*Websites & Domains → themathbible.com → Hosting & DNS → Hosting → **Preferred domain: `themathbible.com`***
(Plesk then answers `www.` with an SEO-safe **301**). One-time; it survives regeneration because it is
DB-backed. Probe after:

```sh
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' https://www.themathbible.com/geo-builder/
# 301 -> https://themathbible.com/geo-builder/
```

And after any deploy that touched the crawl files:

```sh
curl -sI https://themathbible.com/robots.txt | head -1            # 200
curl -s  https://themathbible.com/sitemap.xml | grep -c '<loc>'    # one per public page
curl -sI https://themathbible.com/g/aaaaaaaaaaaa | grep -i x-robots-tag   # noindex
```

## Verify (every deploy)

- `ssh root@themathbible.com 'curl -s http://127.0.0.1:8788/healthz'` → `ok`
- Every deployed builder's page loads over HTTPS; its `index.html` references the **new** bundle hash and the bundle returns 200.
- A quick in-grammar utterance builds (no proxy call); if the proxy changed, an out-of-grammar utterance builds too (and shows in the Anthropic Console usage).
- Admin dashboards log in and show the visit.
- **A new WRITE path is verified at its destination.** After deploying anything that writes somewhere new
  (a log sink, a store, an upload or cache path), send one real request through the deployed path and look
  at the file it should have written. A 2xx proves nothing where the writer has a `catch {}`: analytic's
  sink answered 204 while writing nothing, with every artifact `MATCHES live` (#1363). The preflight now
  does this for the events sinks; anything else is probed by hand.

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
| Serving a WORKTREE branch: `vite dev` fails `Cannot find package '@babel/core'` | The worktree's `node_modules` is **linked** to the main tree's, which is never allowed ([docs/22 §7](22-workflow.md): `git worktree remove` follows the link and destroys the shared copy). → Remove the link and run `npm install` in the worktree; `vite dev` then works there. |
| Local feature server: BLANK page, `#root` empty, JS request returns `Content-Type: text/html` | **Base-path mismatch.** `vite build` bakes `base:'/geo-builder/'` into `index.html`, but `vite preview` serves at `/` (`command==='serve'`), so the browser fetches `/geo-builder/assets/*.js` → SPA-fallback `index.html`. HTTP is 200 (misleading) — **check the JS `Content-Type`, not the status.** → rebuild with `--base=/`. |
| A `/`-leading CLI arg becomes `/Program Files/Git/...` | **git-bash MSYS path conversion** mangles `--base=/`. → run it from **PowerShell** (or `MSYS_NO_PATHCONV=1`, or `--base=./`). |
| Local git weirdness (phantom modified files, fsck errors) | `git fetch` from GitHub to backfill; GitHub is the source of truth (the repo left Dropbox on 2026-07-23 for exactly this) |
| `scp -r dist*/*` dies mid-upload (`Connection closed … port 22`) while `ssh` works | Transient (prod/2026-09-18). **Check the server before retrying**: a half-written tree serves a page whose bundle 404s, so compare its `index.html` with the local one. Fallback, one stream: `tar cz -C dist-3d . \| ssh -o ServerAliveInterval=15 root@themathbible.com 'tar xz -C <dir>'`. It carries the LOCAL uid (`197608`), so then run `chown -R root:root .` and `find . -type f -exec chmod 644 {} \;` in `<dir>`; `scp` needs neither |

## Serving a feature-branch worktree locally (for operator play-testing)

> **The normal route is now a dev server per PR worktree** (the `/playsheet` skill, `scripts/play-servers.ps1`): a worktree gets its own `npm install` and never a linked `node_modules` ([docs/22 §7](22-workflow.md)), so `vite dev` works there. The preview recipe below is only for a static production preview.

To serve a production **preview** of a worktree: from the worktree, **via PowerShell** (so `--base=/` isn't mangled):

```powershell
node node_modules/vite/bin/vite.js build --base=/          # base=/ so preview (served at /) matches
node node_modules/vite/bin/vite.js preview --port 5180 --strictPort
```

Then open **`http://localhost:5180/`** (root — NOT `/geo-builder/`). VERIFY before handing over: the JS the page references must return `Content-Type: text/javascript` (`curl -sD - http://localhost:5180/assets/<hash>.js -o /dev/null`), not `text/html`. It's a static build (no HMR) — rebuild + refresh for changes. `--host` exposes it on the LAN.

## Rollback

Old hashed bundles are never deleted by `scp`, so the fastest rollback is redeploying the previous good commit's build:

```sh
git checkout prod/<previous-tag>   # in a worktree, not the shared tree
npm install && npm run test:full && npm run build   # (and/or build:3d / build:proxy); read reports/suite-verdict.json
# then the standard deploy steps for the affected artifact(s)
```

Tag the rollback deploy too (`prod/YYYY-MM-DD-rollback`) and log it.

## Logs & data

- **Proxy service:** `journalctl -u geo-proxy -f`
- **Prod usage events:** `/var/www/geo-proxy/events.jsonl` (2-D) + `events-3d.jsonl` (3-D) + one `events-<tool>.jsonl` per later builder — hashed IPs only, self-rotating, retention per `EVENTS_RETENTION_DAYS` (unset ⇒ 30 days, every file pruned on its own once per UTC day — ADR-W-110). Leave it UNSET in prod: the privacy notes state 30. Triaged by the `/log-triage` skill.
- **Dev debug log:** `logs/debug-log.jsonl` (dev-only, gitignored) — the session-reconstruction source for bug reports; keep `logs/` out of personal cloud sync.
