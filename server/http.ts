/**
 * Small HTTP helpers shared by the proxy handlers (parse, log, admin).
 *
 * Both the dev Vite middleware and the standalone production server hand us Node's
 * `http` `req`/`res`, so these work in either host.
 */

import type { IncomingMessage } from 'node:http';

/**
 * The client IP, for rate-limiting and (hashed) unique-visitor counting.
 *
 * Behind the production reverse proxy `socket.remoteAddress` is Apache's loopback
 * (127.0.0.1), which would collapse a per-IP limiter into one global bucket — so we read
 * `X-Forwarded-For`. CRITICAL: Apache `mod_proxy_http` APPENDS the connecting peer to any
 * client-sent XFF, so the header is `<client-forgeable …>, <real client as Apache saw it>`
 * — the trustworthy value is the **LAST** hop, NOT the first. Trusting `xff[0]` (the old bug,
 * SEC-1) let an attacker send a fresh fake IP per request and land each in its own bucket,
 * defeating the limiter entirely and poisoning the dashboard's unique-visitor hash. We take
 * the hop `TRUSTED_PROXY_HOPS` (default 1 = just Apache) from the END; raise it only if another
 * TRUSTED proxy sits in front of Apache (e.g. a CDN). `X-Real-IP` is NOT trusted — Apache does
 * not set it here, so any value present is 100% client-supplied. In dev (no proxy, loopback-only)
 * there is no XFF, so it falls back to the socket address.
 */
export function clientIp(req: IncomingMessage): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
  const raw = req.headers?.['x-forwarded-for'];
  const header = Array.isArray(raw) ? raw.join(',') : raw;
  if (header) {
    const chain = header.split(',').map((s) => s.trim()).filter(Boolean);
    // The real client is the entry Apache appended (the last), or `hops` from the end when
    // several trusted proxies chain; clamp to the first if the chain is shorter than declared.
    if (chain.length) return chain[Math.max(0, chain.length - hops)];
  }
  return req.socket?.remoteAddress ?? 'local';
}

/**
 * A sliding-window per-key rate limiter. `make()` returns an independent limiter
 * (its own bucket map) so each route can rate-limit separately. Returns `true`
 * when the key has exceeded `max` hits within `windowMs`.
 */
export function makeRateLimiter(max: number, windowMs: number): (key: string) => boolean {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length > max;
  };
}

/** Read a request body with a hard byte cap. Resolves `null` if the cap is exceeded. */
export async function readBody(req: IncomingMessage, maxBytes: number): Promise<string | null> {
  let body = '';
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) return null;
    body += chunk;
  }
  return body;
}
