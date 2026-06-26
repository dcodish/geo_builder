# Deploying Geo Builder to themathbible.com/geo-builder/

The app is a **static SPA** (`dist/`) plus a **Node LLM proxy** that holds the
Anthropic key (`dist-server/proxy.mjs`). See [ADR-128](../docs/06-decisions.md) for
the architecture. Two-file deploy; the key never leaves the server.

```
Browser ──/geo-builder/*──────────────► httpdocs/geo-builder/  (static dist/)
        └─/geo-builder/api/parse──► Apache ──► 127.0.0.1:8788 (geo-proxy.service)
                                                      │ ANTHROPIC_API_KEY (env file)
                                                      └─► Anthropic Haiku
```

> **This box serves via Apache, not nginx** — nginx is disabled/off (since 2026-04).
> The reverse proxy goes in the **HTTPS Apache** include (`vhost_ssl.conf`), where the
> other app proxies (`/hw/`, `/akinator`, `/bagrut`, `/akinator2`) already live.

## Paths on the server

| What | Path |
| --- | --- |
| Static app | `/var/www/vhosts/themathbible.com/httpdocs/geo-builder/` |
| Proxy bundle | `/var/www/geo-proxy/proxy.mjs` |
| Key env file | `/var/www/geo-proxy/geo-proxy.env` (mode 600) |
| systemd unit | `/etc/systemd/system/geo-proxy.service` |

## One-time setup (Phase B)

1. Confirm Node is installed: `ssh root@themathbible.com 'node -v'` (install LTS if missing).
2. Create the proxy dir + key file (root-only):
   ```sh
   ssh root@themathbible.com 'mkdir -p /var/www/geo-proxy'
   # On the server, write the env file (NEVER commit the key):
   printf 'ANTHROPIC_API_KEY=sk-ant-...\n' > /var/www/geo-proxy/geo-proxy.env
   chmod 600 /var/www/geo-proxy/geo-proxy.env
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
   cat deploy/apache-geo-builder.conf >> "$CONF"   # (the two ProxyPass lines)
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

## Notes

- The proxy matches any path ending in `/api/parse`, so it works whether the reverse
  proxy forwards the `/geo-builder` prefix (Apache `ProxyPass` keeps it) or strips it.
  Rate-limiting is per-client via `X-Forwarded-For`, which Apache `mod_proxy_http`
  sets automatically.
- Logs: `journalctl -u geo-proxy -f`.
- No `npm install` on the server — the SDK is bundled into `proxy.mjs`.
- **Persistence caveat:** the ProxyPass lines are appended directly to
  `vhost_ssl.conf`. If a future Plesk domain reconfigure regenerates that file and
  drops them, the static app keeps working but the LLM fallback 404s (the client
  degrades gracefully to "couldn't understand"). Re-append from
  `deploy/apache-geo-builder.conf`, or add them via the Plesk GUI to be safe.
