/**
 * #1384 (ADR-W-084) — the site answers a crawler: robots.txt, a sitemap, an icon, and `/g/` kept OUT of
 * the index.
 *
 * Two properties, locked separately because they fail separately:
 *
 *  - **Nothing under `/g/` is indexable.** A share page carries a title the uploader chose, so an
 *    indexable one lets anyone put their words on a themathbible.com search result. Asserted on EVERY
 *    branch of the handler — page, image, and dead-link 404 — because the header is set once at the top
 *    and a later early-return must not be able to skip it.
 *  - **The site files agree with the registry and the ruling.** Every builder in `products.json` is in
 *    the sitemap (a fifth product must not be born invisible), robots.txt points at the sitemap, and it
 *    does NOT disallow `/g/` or any AI crawler (operator ruling, 2026-09-24: allow all).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleShare, handleSharePage } from '../shareStore';
import registry from '../../products.json';

const ROOT = path.resolve(__dirname, '../..');
const HOMEPAGE = path.join(ROOT, 'deploy/homepage');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'crawl-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

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
let ip = 0;
function mockReq(body: unknown, method: string, url: string) {
  async function* chunks() {
    yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  }
  const req = chunks() as unknown as Record<string, unknown>;
  Object.assign(req, { method, url, headers: {}, socket: { remoteAddress: `10.84.0.${ip++ % 250}` } });
  return req as unknown as IncomingMessage;
}
async function share(): Promise<string> {
  const res = mockRes();
  const body = { tool: '2d', fragment: 'xVPNSsNAEH6VMOcErD0UAh7SRAulrYK2', png: PNG.toString('base64'), title: 'ריבוע ABCD' };
  await handleShare(mockReq(body, 'POST', '/api/share'), res, { dir });
  expect(res.statusCode, String(res.body)).toBe(200);
  return JSON.parse(String(res.body)).id as string;
}
async function get(url: string) {
  const res = mockRes();
  await handleSharePage(mockReq('', 'GET', url), res, { dir, origin: 'https://themathbible.com' });
  return res;
}

describe('#1384 — nothing under /g/ reaches a search index', () => {
  it('the share PAGE: noindex header AND meta, and still every preview tag', async () => {
    const id = await share();
    const res = await get(`/g/${id}`);
    const html = String(res.body);
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(html).toContain('<meta name="robots" content="noindex">');
    // The preview is the page's whole purpose (#1374) — noindex must not have cost it.
    expect(html).toContain('property="og:image"');
    expect(html).toContain('property="og:title"');
  });

  it('carries no canonical — it pointed at a URL with a #fragment, which search engines drop', async () => {
    const id = await share();
    expect(String((await get(`/g/${id}`)).body)).not.toContain('rel="canonical"');
  });

  it('the preview IMAGE is noindex too — or it lands in image search', async () => {
    const id = await share();
    const res = await get(`/g/${id}.png`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex');
  });

  it('and so are both dead-link answers', async () => {
    expect((await get('/g/abcdefghjkmn')).headers['x-robots-tag']).toBe('noindex');
    expect((await get('/g/abcdefghjkmn.png')).headers['x-robots-tag']).toBe('noindex');
  });
});

describe('#1384 — the site-root files agree with the registry and the ruling', () => {
  const read = (f: string) => readFileSync(path.join(HOMEPAGE, f), 'utf8');

  it('every builder in products.json is in the sitemap, with the homepage', () => {
    const sitemap = read('sitemap.xml');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain('https://themathbible.com/');
    const builders = (registry.products as { id: string; url?: string }[]).filter((p) => p.url);
    expect(builders.length, 'the registry lists builders at all').toBeGreaterThan(0);
    for (const p of builders) {
      expect(locs, `${p.id} (${p.url}) is missing from deploy/homepage/sitemap.xml`).toContain(`https://themathbible.com${p.url}`);
    }
  });

  it('robots.txt names the sitemap and blocks nothing — no /g/, no AI crawler (ruling: allow all)', () => {
    const robots = read('robots.txt');
    const rules = robots.split('\n').filter((l) => !l.trim().startsWith('#'));
    expect(rules).toContain('Sitemap: https://themathbible.com/sitemap.xml');
    expect(rules.filter((l) => /^\s*Disallow:\s*\S/i.test(l)), 'a Disallow line contradicts the allow-all ruling').toEqual([]);
    expect(rules.filter((l) => /^\s*User-agent:/i.test(l))).toEqual(['User-agent: *']);
  });

  it('the icons a browser and iOS request at the root exist, generated from the one SVG', () => {
    for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) expect(existsSync(path.join(HOMEPAGE, f)), f).toBe(true);
    const ico = readFileSync(path.join(HOMEPAGE, 'favicon.ico'));
    expect(ico.readUInt16LE(2), 'ICO type').toBe(1);
    expect(ico.readUInt16LE(4), 'three frames: 16, 32, 48').toBe(3);
  });
});
