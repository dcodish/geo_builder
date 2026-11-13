/**
 * The management console's login (#2868, ADR-W-209).
 *
 * Username and password, like the admin dashboards (operator, 2026-11-13: "I dont want the authenticator part.
 * just user password like i have for the geo-builder admin page"). The console has its own credentials and its
 * own cookie scoped to its own path, because the dashboards' password is shared with other pages on the origin
 * (#2762) and this page writes. Every POST carries a CSRF token bound to the session cookie.
 *
 * Stateless, like the admin cookie: `geo_mgmt = base64url(exp).hmac(secret, exp)`, checked timing-safe.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const SESSION_MS = 8 * 60 * 60 * 1000; // 8 h (operator, 2026-11-13: "8 hours is enough")
export const COOKIE = 'geo_mgmt';

export function safeEq(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

const sign = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest('hex');

export function makeSession(secret: string, now = Date.now()): string {
  const exp = Buffer.from(String(now + SESSION_MS)).toString('base64url');
  return `${exp}.${sign(exp, secret)}`;
}

export function validSession(raw: string | undefined, secret: string, now = Date.now()): boolean {
  if (!raw || !secret) return false;
  const dot = raw.indexOf('.');
  if (dot < 0) return false;
  const exp = raw.slice(0, dot);
  if (!safeEq(raw.slice(dot + 1), sign(exp, secret))) return false;
  const ms = Number(Buffer.from(exp, 'base64url').toString('utf8'));
  return Number.isFinite(ms) && ms > now;
}

/** The CSRF token for a session: an HMAC of the session cookie under a separate purpose string. */
export const csrfFor = (session: string, secret: string) => sign(`csrf:${session}`, secret).slice(0, 32);

export function readCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}
