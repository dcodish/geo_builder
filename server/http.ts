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
 * Behind the production reverse proxy every request's `socket.remoteAddress` is the
 * proxy's loopback (127.0.0.1), which would collapse a per-IP limiter into one
 * global bucket — so prefer the `X-Forwarded-For` / `X-Real-IP` header Apache sets.
 * Safe to trust because the Node server binds to loopback and only the reverse
 * proxy can reach it; in dev (no header) it falls back to the socket address.
 */
export function clientIp(req: IncomingMessage): string {
  const xff = req.headers?.['x-forwarded-for'];
  const fwd = Array.isArray(xff) ? xff[0] : xff;
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers?.['x-real-ip'];
  if (typeof real === 'string' && real) return real;
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
