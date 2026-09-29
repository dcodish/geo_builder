/**
 * #1380 (ADR-W-104) — the defence-in-depth gaps from the 2026-09-24 cyber review.
 *
 *  1. security response headers in every builder's reverse-proxy conf, CSP as REPORT-ONLY;
 *  3. every interpolation on the `/g/` share page escaped, the id bound once after `isShareId`;
 *  4. the share store's fill level — the dashboard banner at 80% / 95%, and a journal line on a
 *     store-full refusal (operator ruling: a warning only, no new caps, never evict).
 *
 * (Item 2, the nanoid advisory, is a lockfile change: `npm audit` is its check.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import registry from '../../products.json';
import {
  SHARE_HANDOFF_SCRIPT,
  STORE_CRITICAL_FRACTION,
  STORE_WARN_FRACTION,
  handleShare,
  handleSharePage,
  storeFillLevel,
} from '../shareStore';
import { handleAdmin, shareFillBanner } from '../admin';

const DEPLOY = path.join(__dirname, '..', '..', 'deploy');
const confFor = (url: string) => `apache${url.replace(/\/$/, '').replace(/\//g, '-')}.conf`;
const enabled = registry.products.filter((p) => p.enabled !== false);

/** The directives inside `<Location PATH>` … `</Location>`, trimmed, comments dropped. */
function locationBlock(conf: string, loc: string): string[] | null {
  const lines = conf.split(/\r?\n/).map((l) => l.trim());
  const start = lines.indexOf(`<Location ${loc}>`);
  if (start < 0) return null;
  const end = lines.indexOf('</Location>', start);
  return lines.slice(start + 1, end).filter((l) => l && !l.startsWith('#'));
}

const SAFE_HEADERS = [
  'Header always set X-Content-Type-Options "nosniff"',
  'Header always set X-Frame-Options "SAMEORIGIN"',
  'Header always set Referrer-Policy "strict-origin-when-cross-origin"',
];

describe('#1380 — every builder conf sets the security headers on its whole prefix', () => {
  it.each(enabled.map((p) => [p.id, p.url] as const))('%s (%s)', (_id, url) => {
    const conf = readFileSync(path.join(DEPLOY, confFor(url)), 'utf8');
    const block = locationBlock(conf, url);
    expect(block, `<Location ${url}> block in ${confFor(url)}`).not.toBeNull();
    for (const h of SAFE_HEADERS) expect(block).toContain(h);
    const csp = block!.find((l) => l.startsWith('Header always set Content-Security-Policy-Report-Only '));
    expect(csp, 'a Report-Only CSP').toBeDefined();
    expect(csp).toContain("script-src 'self'");
  });

  it('the CSP is REPORT-ONLY everywhere — no conf enforces one in this change', () => {
    for (const name of readdirConfs()) {
      const conf = readFileSync(path.join(DEPLOY, name), 'utf8');
      expect(conf, name).not.toMatch(/^\s*Header\s+(always\s+)?set\s+Content-Security-Policy\s/m);
    }
  });

  it('the /g/ share page carries the headers, and its CSP hash allows exactly the hand-off script', () => {
    const conf = readFileSync(path.join(DEPLOY, 'apache-geo-builder.conf'), 'utf8');
    const block = locationBlock(conf, '/g/');
    expect(block).not.toBeNull();
    for (const h of SAFE_HEADERS) expect(block).toContain(h);
    const hash = createHash('sha256').update(SHARE_HANDOFF_SCRIPT).digest('base64');
    const csp = block!.find((l) => l.includes('Content-Security-Policy-Report-Only'));
    expect(csp).toContain(`'sha256-${hash}'`);
  });
});

function readdirConfs(): string[] {
  return readdirSync(DEPLOY).filter((f) => f.startsWith('apache-') && f.endsWith('.conf'));
}

// ---------------------------------------------------------------------------------------------

function mockRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '' as string | Buffer,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    end(b?: string | Buffer) {
      if (b !== undefined) this.body = b;
    },
  };
  return res as typeof res & ServerResponse;
}
async function* chunks(parts: string[]) {
  for (const p of parts) yield Buffer.from(p);
}
let ipSeq = 0;
function mockReq(body: unknown, method = 'POST', url = '/api/share', headers: Record<string, string> = {}) {
  const req = chunks([typeof body === 'string' ? body : JSON.stringify(body)]) as AsyncGenerator<Buffer> & Record<string, unknown>;
  req.method = method;
  req.url = url;
  req.socket = { remoteAddress: `10.13.80.${ipSeq++ % 250}` };
  req.headers = headers;
  return req as unknown as IncomingMessage;
}

const GOOD = { tool: '2d', fragment: 'eJxLTEoGAAJNASc', title: 'ריבוע' };

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'share1380-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function share(): Promise<string> {
  const res = mockRes();
  await handleShare(mockReq(GOOD), res, { dir });
  expect(res.statusCode).toBe(200);
  return JSON.parse(String(res.body)).id;
}

describe('#1380 — nothing reaches the /g/ page unescaped', () => {
  it('a hostile ORIGIN is escaped in og:image, og:url and both hand-offs', async () => {
    const id = await share();
    const res = mockRes();
    await handleSharePage(mockReq('', 'GET', `/g/${id}`), res, { dir, origin: 'https://x"><script>alert(1)</script>' });
    const html = String(res.body);
    expect(res.statusCode).toBe(200);
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('https://x"');
    expect(html).toContain('https://x&quot;&gt;&lt;script&gt;');
  });

  it.each(['<script>alert(1)</script>', '"onmouseover="x', "abc'def<ghjk", '../../etc/passwd'])(
    'a hostile id %j is refused as a dead link, never echoed',
    async (hostile) => {
      for (const url of [`/g/${hostile}`, `/g/${hostile}.png`]) {
        const res = mockRes();
        await handleSharePage(mockReq('', 'GET', url), res, { dir, origin: 'https://themathbible.com' });
        expect(res.statusCode).toBe(404);
        expect(String(res.body)).not.toContain(hostile);
      }
    },
  );

  it('the inline script is the CONSTANT hand-off, reading the escaped fallback link', async () => {
    const id = await share();
    const res = mockRes();
    await handleSharePage(mockReq('', 'GET', `/g/${id}`), res, { dir, origin: 'https://themathbible.com' });
    const html = String(res.body);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts).toEqual([SHARE_HANDOFF_SCRIPT]);
    expect(html).toMatch(/<a id="go" href="https:\/\/themathbible\.com\/geo-builder\/#eJxLTEoGAAJNASc">/);
  });
});

describe('#1380 — the share store tells the operator before it fills', () => {
  const MAX = 1000;
  it.each([
    [0, 'ok'],
    [MAX * STORE_WARN_FRACTION - 1, 'ok'],
    [MAX * STORE_WARN_FRACTION, 'warn'],
    [MAX * STORE_CRITICAL_FRACTION - 1, 'warn'],
    [MAX * STORE_CRITICAL_FRACTION, 'critical'],
    [MAX * 2, 'critical'],
  ])('%d of %d bytes → %s', (bytes, level) => {
    expect(storeFillLevel({ bytes, maxBytes: MAX })).toBe(level);
  });

  it('the thresholds are the ruled 80% and 95%', () => {
    expect([STORE_WARN_FRACTION, STORE_CRITICAL_FRACTION]).toEqual([0.8, 0.95]);
  });

  it('a zero or missing allocation never reads as full', () => {
    expect(storeFillLevel({ bytes: 5, maxBytes: 0 })).toBe('ok');
  });

  it('the banner follows the threshold function: none, amber, red — and says what 100% refuses', () => {
    expect(shareFillBanner(null)).toBe('');
    expect(shareFillBanner({ bytes: 790, shares: 3, maxBytes: MAX })).toBe('');
    const warn = shareFillBanner({ bytes: 850, shares: 3, maxBytes: MAX });
    expect(warn).toContain('share-fill-warn');
    expect(warn).toContain('85%');
    expect(warn).toContain('507');
    const crit = shareFillBanner({ bytes: 960, shares: 3, maxBytes: MAX });
    expect(crit).toContain('share-fill-critical');
    expect(crit).toContain('96%');
  });

  it('a store-full refusal writes a line to the journal', async () => {
    await share();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prev = process.env.SHARE_STORE_MAX_BYTES;
    process.env.SHARE_STORE_MAX_BYTES = '10';
    try {
      const res = mockRes();
      await handleShare(mockReq(GOOD), res, { dir });
      expect(res.statusCode).toBe(507);
    } finally {
      if (prev === undefined) delete process.env.SHARE_STORE_MAX_BYTES;
      else process.env.SHARE_STORE_MAX_BYTES = prev;
    }
    expect(spy.mock.calls.map((c) => String(c[0])).join('\n')).toMatch(/share refused: store-full/);
  });
});

describe('#1380 — the banner is on the live dashboard', () => {
  it('a store past 80% shows it above the cards', async () => {
    const adminDir = await mkdtemp(path.join(tmpdir(), 'admin1380-'));
    const logPath = path.join(adminDir, 'events.jsonl');
    await writeFile(logPath, '', 'utf8');
    const store = path.join(adminDir, 'shares');
    await mkdir(store);
    await writeFile(path.join(store, 'abcdefghjkmn.json'), 'x'.repeat(900), 'utf8');
    const prev = { p: process.env.SHARE_STORE_PATH, m: process.env.SHARE_STORE_MAX_BYTES };
    process.env.SHARE_STORE_PATH = store;
    process.env.SHARE_STORE_MAX_BYTES = '1000';
    const OPTS = { username: 'teacher', password: 's3cret', cookieSecret: 'sign-me', base: '/admin', logPath };
    try {
      const login = mockRes();
      await handleAdmin(
        mockReq('username=teacher&password=s3cret', 'POST', '/admin/login', { 'content-type': 'application/x-www-form-urlencoded' }),
        login,
        OPTS,
      );
      const cookie = String(login.headers['set-cookie']).split(';')[0];
      const dash = mockRes();
      await handleAdmin(mockReq('', 'GET', '/admin', { cookie }), dash, OPTS);
      expect(dash.statusCode).toBe(200);
      expect(String(dash.body)).toContain('share-fill-warn');
    } finally {
      for (const [k, v] of [['SHARE_STORE_PATH', prev.p], ['SHARE_STORE_MAX_BYTES', prev.m]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      await rm(adminDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
