/**
 * The management console's login (#2868, ADR-W-209).
 *
 * The admin dashboards share one password with other pages on the same origin (#2762). A page that WRITES
 * rulings and approves plans needs more, so the console has its own credentials, its own cookie scoped to its
 * own path, and a second factor: a time-based code from an authenticator app (RFC 6238, the same codes Google
 * Authenticator shows). Writes are refused unless the second factor is configured. Every POST carries a CSRF
 * token bound to the session cookie.
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

// ── RFC 6238 TOTP (SHA-1, 30 s, 6 digits) ────────────────────────────────────

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const v = B32.indexOf(c);
    if (v < 0) throw new Error('bad base32');
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totp(secretB32: string, at: number, step = 30): string {
  const counter = Math.floor(at / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, '0');
}

/** A code is accepted for its own 30-second step and one on each side (clock drift). */
export function totpOk(secretB32: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((k) => safeEq(totp(secretB32, now + k * 30_000), code));
}
