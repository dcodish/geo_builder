/**
 * clientIp / rate-limiter unit tests ([docs/15-hardening-plan.md](../../docs/15-hardening-plan.md) B1 / SEC-1).
 *
 * The security review found `clientIp` trusted the FIRST X-Forwarded-For entry, but Apache
 * `mod_proxy_http` APPENDS the real peer — so the first entry is client-forgeable and the limiter
 * (and the dashboard IP hash) could be bypassed/poisoned by rotating a fake first value per request.
 * These lock the corrected LAST-hop behaviour.
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { clientIp } from '../http';

/** A minimal req stub: XFF header(s) + a socket address. */
const req = (xff?: string | string[], remote = '127.0.0.1', realIp?: string): IncomingMessage =>
  ({
    headers: { ...(xff !== undefined ? { 'x-forwarded-for': xff } : {}), ...(realIp ? { 'x-real-ip': realIp } : {}) },
    socket: { remoteAddress: remote },
  }) as unknown as IncomingMessage;

afterEach(() => {
  delete process.env.TRUSTED_PROXY_HOPS;
});

describe('clientIp — trusts the last (Apache-appended) XFF hop, not the first (SEC-1)', () => {
  it('takes the LAST hop — a spoofed first entry is ignored', () => {
    // attacker sends "1.2.3.4"; Apache appends the real peer "203.0.113.9"
    expect(clientIp(req('1.2.3.4, 203.0.113.9'))).toBe('203.0.113.9');
  });

  it('a rotating fake first value cannot create distinct buckets (all map to the real last hop)', () => {
    const a = clientIp(req('9.9.9.1, 203.0.113.9'));
    const b = clientIp(req('9.9.9.2, 203.0.113.9'));
    const c = clientIp(req('deadbeef, 203.0.113.9'));
    expect(new Set([a, b, c]).size).toBe(1);
    expect(a).toBe('203.0.113.9');
  });

  it('a single-entry XFF (no client-sent value; Apache added the real client) is used directly', () => {
    expect(clientIp(req('203.0.113.9'))).toBe('203.0.113.9');
  });

  it('X-Real-IP is NOT trusted (Apache does not set it — any value is client-supplied)', () => {
    // No XFF present → falls back to the socket, NOT the spoofable X-Real-IP header.
    expect(clientIp(req(undefined, '127.0.0.1', '6.6.6.6'))).toBe('127.0.0.1');
  });

  it('falls back to the socket address when there is no XFF (dev / direct connection)', () => {
    expect(clientIp(req(undefined, '::1'))).toBe('::1');
  });

  it('TRUSTED_PROXY_HOPS=2 takes the 2nd-from-last (a trusted CDN in front of Apache)', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    // client, then real-client-as-CDN-saw-it, then CDN-as-Apache-saw-it → the real client is 2nd from end
    expect(clientIp(req('1.2.3.4, 203.0.113.9, 10.0.0.1'))).toBe('203.0.113.9');
  });

  it('handles a multi-valued header array (joined) and clamps when shorter than the hop count', () => {
    expect(clientIp(req(['1.2.3.4', '203.0.113.9']))).toBe('203.0.113.9');
    process.env.TRUSTED_PROXY_HOPS = '5';
    expect(clientIp(req('203.0.113.9'))).toBe('203.0.113.9'); // chain shorter than hops → first entry
  });
});
