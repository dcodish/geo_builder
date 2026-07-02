# Deploying Geo Builder to themathbible.com/geo-builder/

The app is a **static SPA** (`dist/`) plus a **Node LLM proxy** that holds the
Anthropic key (`dist-server/proxy.mjs`). See [ADR-128](../docs/06-decisions.md) for
the architecture. Two-file deploy; the key never leaves the server.

```
Browser ──/geo-builder/*──────────────► httpdocs/geo-builder/  (static dist/)
        ├─/geo-builder/api/parse──► Apache ──► 127.0.0.1:8788 (geo-proxy.service)
        │                                             │ ANTHROPIC_API_KEY (env file)
        │                                             └─► Anthropic Haiku
        ├─/geo-builder/api/log────► Apache ──► 127.0.0.1:8788 ─► events.jsonl (hashed IP)
        └─/geo-builder/admin──────► Apache ──► 127.0.0.1:8788 ─► usage dashboard (login)
```

The same Node service now also hosts a **usage-event sink** (`/api/log`) and a
**password-protected admin dashboard** (`/admin`) — see [ADR-146](../docs/06-decisions.md#adr-146).
The SPA fire-and-forgets one lean event per user action; the proxy hashes the
visitor IP (never stores it raw) and appends to `events.jsonl`, which the dashboard
aggregates.

> **This box serves via Apache, not nginx** — nginx is disabled/off (since 2026-04).
> The reverse proxy goes in the **HTTPS Apache** include (`vhost_ssl.conf`), where the
> other app proxies (`/hw/`, `/akinator`, `/bagrut`, `/akinator2`) already live.

## Paths on the server

| What | Path |
| --- | --- |
| Static app | `/var/www/vhosts/themathbible.com/httpdocs/geo-builder/` |
| Proxy bundle | `/var/www/geo-proxy/proxy.mjs` |
| Key + admin env file | `/var/www/geo-proxy/geo-proxy.env` (mode 600) |
| Usage events | `/var/www/geo-proxy/events.jsonl` (written by the service) |
| systemd unit | `/etc/systemd/system/geo-proxy.service` |

## One-time setup (Phase B)

1. Confirm Node is installed: `ssh root@themathbible.com 'node -v'` (install LTS if missing).
2. Create the proxy dir + key file (root-only):
   ```sh
   ssh root@themathbible.com 'mkdir -p /var/www/geo-proxy'
   # On the server, write the env file (NEVER commit secrets). The admin/analytics
   # vars are read only by this proxy process; pick long random values for the salts.
   cat > /var/www/geo-proxy/geo-proxy.env <<'EOF'
   ANTHROPIC_API_KEY=sk-ant-...
   LLM_DAILY_MAX=1000          # hard cap on Haiku calls/day (cost backstop, SEC-2); tune to taste
   IP_HASH_SALT=<long-random-string>
   EVENTS_LOG_PATH=/var/www/geo-proxy/events.jsonl
   ADMIN_USERNAME=<pick-a-name>
   ADMIN_PASSWORD=<pick-a-strong-password>
   ADMIN_COOKIE_SECRET=<long-random-string>
   ADMIN_BASE=/geo-builder/admin
   EOF
   chmod 600 /var/www/geo-proxy/geo-proxy.env
   chown www-data:www-data /var/www/geo-proxy   # the service writes events.jsonl as www-data
   ```
3. Install + start the service:
   ```sh
   scp deploy/geo-proxy.service root@themathbible.com:/etc/systemd/system/
   ssh root@themathbible.com 'systemctl daemon-reload && systemctl enable --now geo-proxy && systemctl status geo-proxy --no-pager'
   ```
4. Add the reverse-proxy rule from `deploy/apache-geo-builder.conf` to the HTTPS
   Apache include (backup → append → validate → reload):
   ```sh
   CONF=/var/www/vhosts/system/themathbible.com/conf/vhost_ssl.conf
   cp -a "$CONF" "$CONF.bak-$(date +%s)"
   cat deploy/apache-geo-builder.conf >> "$CONF"   # (the six ProxyPass lines)
   apache2ctl -t && systemctl reload apache2
   ```
   (Equivalently via Plesk: *Apache & nginx Settings → Additional directives for HTTPS*.)

## Each deploy (Phase C)

From the project root on the dev machine:

```sh
npm test                 # 1387 green
npm run build            # dist/  (subpath /geo-builder/ baked in)
npm run build:proxy      # dist-server/proxy.mjs  (self-contained, ~504 KB)

# Push the two artifacts:
ssh root@themathbible.com 'mkdir -p /var/www/vhosts/themathbible.com/httpdocs/geo-builder'
scp -r dist/* root@themathbible.com:/var/www/vhosts/themathbible.com/httpdocs/geo-builder/
scp dist-server/proxy.mjs root@themathbible.com:/var/www/geo-proxy/
ssh root@themathbible.com 'systemctl restart geo-proxy'
```

## Verify (Phase C smoke test)

- `ssh root@themathbible.com 'curl -s http://127.0.0.1:8788/healthz'` → `ok`
- Open `https://themathbible.com/geo-builder/` — type an **in-grammar** utterance
  (e.g. `square ABCD`): builds with no proxy call (deterministic parser).
- Type an **out-of-grammar** utterance: this hits `/geo-builder/api/parse`; confirm
  the figure builds and the [Anthropic Console](https://console.anthropic.com/settings/usage)
  logs a Haiku call.
- Set the Console **spend limit + alert** before sharing the URL (cost control).
- Open `https://themathbible.com/geo-builder/admin`, log in with `ADMIN_USERNAME`/
  `ADMIN_PASSWORD`: the visit you just made should appear in the dashboard. Confirm
  `events.jsonl` stores `iph` (a hash) and **never a raw IP**:
  `ssh root@themathbible.com "tail -1 /var/www/geo-proxy/events.jsonl"`.

## Notes

- The proxy matches any path ending in `/api/parse`, so it works whether the reverse
  proxy forwards the `/geo-builder` prefix (Apache `ProxyPass` keeps it) or strips it.
  Rate-limiting (and the hashed visitor id) is per-client via `X-Forwarded-For`, which
  Apache `mod_proxy_http` sets automatically. The proxy trusts the **LAST** hop of that
  header (the peer Apache appended = the real client); a client-forged first entry is
  ignored (SEC-1). If you ever put another TRUSTED proxy in front of Apache (e.g. a CDN),
  set `TRUSTED_PROXY_HOPS` in `geo-proxy.env` to the number of trusted proxies so the real
  client is still picked; the default (1) is correct for the plain Apache→loopback setup.
- Logs: `journalctl -u geo-proxy -f`.
- **Global cost ceiling (SEC-2):** `LLM_DAILY_MAX` caps total Haiku calls per UTC day (default 1000); past
  it, `/api/parse` returns a distinct 429 and the SPA shows "service busy" (never "couldn't understand").
  Track how often it's hit: `journalctl -u geo-proxy | grep 'daily limit'` (real users are not expected to
  reach it — a hit usually means a bot). Raise/lower the number in `geo-proxy.env` and restart the service.
- No `npm install` on the server — the SDK is bundled into `proxy.mjs`.
- **Usage events** accumulate in `events.jsonl`; the service self-rotates it past
  50 MB (keeps one `events.jsonl.1`). IPs are stored only as a salted hash (`iph`).
  Rotating `IP_HASH_SALT` resets unique-visitor counts (old/new hashes won't match).
- The admin session is a stateless signed cookie (8 h); `ADMIN_BASE` must match the
  public path (`/geo-builder/admin`) so the cookie scopes and redirects resolve.
- **`ADMIN_COOKIE_SECRET` is REQUIRED and must be its OWN long random string** (not reused
  from `IP_HASH_SALT`). The dashboard is **fail-closed** (SEC-3): if `ADMIN_PASSWORD` or a
  dedicated `ADMIN_COOKIE_SECRET` is unset (or the secret is left at the committed default),
  `/admin` refuses ALL authentication — no login succeeds and no cookie is accepted (so a
  cookie forged under a guessed default can't reach it). The `/api/parse` proxy is unaffected.
- **Stale-figure-after-deploy = browser cache.** `scp` never deletes old hashed
  bundles, and without a Cache-Control header on `index.html` a browser keeps the
  old entry point and loads a stale (still-present) `index-*.js` — the app renders
  with old code (e.g. missing the latest relations marks). The `<Directory>` cache
  block in `apache-geo-builder.conf` fixes it (no-cache HTML, immutable assets). For
  a one-off check, hard-refresh (`Ctrl+Shift+R`). Old bundles are left in place so
  in-flight cached pages don't break; they age out as caches revalidate.
- **Persistence caveat:** the ProxyPass lines are appended directly to
  `vhost_ssl.conf`. If a future Plesk domain reconfigure regenerates that file and
  drops them, the static app keeps working but the LLM fallback 404s (the client
  degrades gracefully to "couldn't understand"). Re-append from
  `deploy/apache-geo-builder.conf`, or add them via the Plesk GUI to be safe.
