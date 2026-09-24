/**
 * #1383 (ADR-W-085) — what every builder's page tells a crawler, locked against the three sources it
 * is built from: the operator-approved wording, the product registry, and each product's catalog.
 *
 * Lives in scripts/ (build tooling), which may read all four products; `shell/` may not.
 *
 * The rows run the REAL plugin over the REAL entry HTML files — the same transform `vite build`
 * applies — rather than re-deriving what it would emit (ADR-W-053: a lock calls, it does not
 * reproduce).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import registry from '../../products.json';
import { ORIGIN, featuredExamples, productUrl, seoPages } from '../../seo-pages';
import { seoPlugin } from '../../shell/seo/seoPlugin';
import { COMMAND_CATALOG } from '../../src/parser/catalog';
import { COMMAND_CATALOG_3D } from '../../src3d/parser/catalog3';
import { CATALOG as COMPLEX_CATALOG } from '../../src-complex/parser/catalog';
import { COMMAND_CATALOG_ANALYTIC } from '../../src-analytic/parser/catalogAnalytic';
import { parseLine } from '../../src-analytic/parser/parseAnalytic';

const ROOT = path.resolve(__dirname, '../..');
const pages = seoPages();

type Product = { id: string; url?: string; devUrl?: string };
const builders = (registry.products as Product[]).filter((p) => p.url && p.devUrl);
/** The entry HTML a builder is served from in dev (`/` → index.html, `/3d.html` → 3d.html). */
const entryOf = (p: Product) => (p.devUrl === '/' ? 'index.html' : p.devUrl!.replace(/^\//, ''));
const CATALOGS: Record<string, readonly { he: string; descHe?: string; featured?: true }[]> = {
  '2d': COMMAND_CATALOG,
  '3d': COMMAND_CATALOG_3D,
  complex: COMPLEX_CATALOG,
  analytic: COMMAND_CATALOG_ANALYTIC,
};

/** Width × height from a PNG's IHDR — no image library for a two-number question. */
const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

function transform(entry: string, base: string): string {
  const plugin = seoPlugin(pages);
  (plugin.configResolved as (c: unknown) => void)({ command: 'build', base });
  const hook = plugin.transformIndexHtml as { handler: (html: string, ctx: { filename: string; path: string }) => string };
  const html = readFileSync(path.join(ROOT, entry), 'utf8');
  return hook.handler(html, { filename: path.join(ROOT, entry), path: `/${entry}` });
}

describe('#1383 — every builder in the registry has a page, and no page is orphaned', () => {
  it('the table covers exactly the registry builders', () => {
    expect(builders.length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(pages).sort()).toEqual(builders.map(entryOf).sort());
  });
});

describe.each(builders.map((b) => [b.id, b] as const))('#1383 — %s', (id, b) => {
  const entry = entryOf(b);
  const page = pages[entry].page;
  const base = b.url!;

  it('canonical is the registry URL, apex host, trailing slash', () => {
    expect(page.url).toBe(`${ORIGIN}${base}`);
    expect(page.url).toBe(productUrl(id as '2d'));
    expect(page.url).toMatch(/^https:\/\/themathbible\.com\/.+\/$/);
  });

  it('title and description fit what a result shows (≈60 / ≈160 characters) — the approved wording is short by design', () => {
    expect(page.title.length).toBeLessThanOrEqual(62);
    expect(page.description.length).toBeGreaterThan(80);
    expect(page.description.length).toBeLessThanOrEqual(170);
  });

  it('shows EXACTLY its catalog’s featured rows — the operator’s own choice (#1347), never a new list', () => {
    const want = featuredExamples(CATALOGS[id]);
    expect(want.length).toBeGreaterThan(0);
    expect(page.examples).toEqual(want);
  });

  it('the built page: head, preview, structured data, and a static block a no-JS crawler can read', () => {
    const html = transform(entry, base);
    expect(html).toContain(`<link rel="canonical" href="${page.url}">`);
    expect(html).toContain(`<meta property="og:image" content="${page.url}seo/og.png">`);
    expect(html).toContain(`<link rel="icon" type="image/svg+xml" href="${base}seo/icon.svg">`);
    const ld = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)?.[1];
    const obj = JSON.parse(ld!);
    expect(obj['@type']).toBe('WebApplication');
    expect(obj.url).toBe(page.url);
    expect(obj.isAccessibleForFree).toBe(true);
    // The measured defect was ~45 characters of text for a crawler; the block must be real prose.
    const text = /<main data-seo-static[\s\S]*?<\/main>/.exec(html)![0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text.length).toBeGreaterThan(600);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    for (const l of builders.filter((o) => o.id !== id)) expect(html, `links ${l.id}`).toContain(`href="${ORIGIN}${l.url}"`);
  });

  it('its images exist at the sizes the tags promise', () => {
    const dir = { '2d': 'src', '3d': 'src3d', complex: 'src-complex', analytic: 'src-analytic' }[id]!;
    const og = readFileSync(path.join(ROOT, dir, 'seo', 'og.png'));
    expect(pngSize(og)).toEqual([1200, 630]);
    expect(pngSize(readFileSync(path.join(ROOT, dir, 'seo', 'apple-touch-icon.png')))).toEqual([180, 180]);
    expect(readFileSync(path.join(ROOT, dir, 'seo', 'icon.svg'), 'utf8')).toMatch(/^<svg /);
  });
});

describe('#1383 — every example a page teaches is a line the product understands', () => {
  // 2-D (PAR-10, src/parser/__tests__/llm-contract.test.ts), 3-D (src3d/parser/__tests__/catalog3.test.ts)
  // and complex (src-complex/__tests__/manual.test.ts) already parse EVERY catalog row; the page shows
  // only featured rows, so they are covered there. Analytic had no whole-catalog guard — it gets one here.
  it.each(featuredExamples(COMMAND_CATALOG_ANALYTIC).map((e) => [e.text]))('analytic: «%s» parses', (line) => {
    expect(parseLine(line).ok, line).toBe(true);
  });
});

describe('#1383 — the homepage speaks for the site, and says nothing the tools do not do', () => {
  const home = readFileSync(path.join(ROOT, 'deploy/homepage/index.html'), 'utf8');

  it('has the approved title, a description, canonical, preview and parseable structured data', () => {
    expect(home).toContain('<title>ד״ר דוד קודיש — כלים אינטראקטיביים למתמטיקה לבגרות | themathbible.com</title>');
    expect(home).toMatch(/<meta name="description" content="[^"]{80,}">/);
    expect(home).toContain('<link rel="canonical" href="https://themathbible.com/">');
    expect(home).toContain('<meta property="og:image" content="https://themathbible.com/og.png">');
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(home)![1]);
    const list = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'ItemList');
    const urls = list.itemListElement.map((i: { url: string }) => i.url).sort();
    expect(urls).toEqual(builders.map((b) => `${ORIGIN}${b.url}`).sort());
    expect(pngSize(readFileSync(path.join(ROOT, 'deploy/homepage/og.png')))).toEqual([1200, 630]);
  });

  it('promises no theorem surface while that surface is switched off (#740)', () => {
    const app = readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    const off = /const THEOREMS_SURFACE: boolean = false;/.test(app);
    expect(off || /const THEOREMS_SURFACE: boolean = true;/.test(app), 'the flag this row reads has moved').toBe(true);
    if (!off) return;
    const promises = /משפטים רלוונטיים|theorems? (?:appear|surface|along the way)/i;
    expect(home).not.toMatch(promises);
    for (const [, e] of Object.entries(pages)) expect(JSON.stringify(e.page)).not.toMatch(promises);
  });

  it('the homepage’s images exist', () => {
    for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'og.png']) expect(existsSync(path.join(ROOT, 'deploy/homepage', f)), f).toBe(true);
  });
});
