/**
 * #1383 (ADR-W-085) — the head and the static block are built from the page, and nothing a page says
 * can break out of where it is written.
 *
 * Pure-function rows over `shell/seo/seo.ts`. What each BUILDER's page actually says is locked in
 * `scripts/__tests__/seo-pages-1383.test.ts`, which is allowed to import the four products.
 */
import { describe, expect, it } from 'vitest';
import { applySeo, jsonForScript, seoHead, seoStaticBody, type SeoPage } from '../seo/seo';
import { entryFileOf } from '../seo/seoPlugin';

const PAGE: SeoPage = {
  url: 'https://example.test/tool/',
  title: 'כלי «בדיקה»',
  description: 'תיאור & עוד',
  siteName: 'site',
  name: 'שם הכלי',
  ogImage: 'https://example.test/tool/seo/og.png',
  icon: '/tool/seo/icon.svg',
  touchIcon: '/tool/seo/apple-touch-icon.png',
  howToHeading: 'איך',
  howTo: ['צעד 1'],
  examplesHeading: 'דוגמאות',
  examples: [{ text: 'ריבוע ABCD', note: 'ריבוע' }, { text: 'z1 = 3+4i' }],
  linksHeading: 'עוד',
  links: [{ href: 'https://example.test/other/', label: 'אחר' }],
  footer: 'חינם',
  loading: 'טוען…',
  jsonLd: [{ '@type': 'WebApplication', name: 'שם הכלי' }],
};
const SHELL = '<html><head><meta charset="UTF-8" />\n<title>old</title></head><body><div id="root"></div><script src="/x.js"></script></body></html>';

describe('#1383 — the head a crawler reads', () => {
  const head = seoHead(PAGE);

  it('carries every tag the plan names', () => {
    for (const tag of [
      '<title>כלי «בדיקה»</title>',
      '<meta name="description" content="תיאור &amp; עוד">',
      '<link rel="canonical" href="https://example.test/tool/">',
      '<link rel="icon" type="image/svg+xml" href="/tool/seo/icon.svg">',
      '<link rel="apple-touch-icon" href="/tool/seo/apple-touch-icon.png">',
      '<meta property="og:image" content="https://example.test/tool/seo/og.png">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<script type="application/ld+json">',
    ]) expect(head, tag).toContain(tag);
  });

  it('without a preview image it claims no large card — a card with no image renders as a broken tile', () => {
    const bare = seoHead({ ...PAGE, ogImage: undefined });
    expect(bare).not.toContain('og:image');
    expect(bare).toContain('<meta name="twitter:card" content="summary">');
  });

  it('JSON-LD parses back to the object it was given', () => {
    const body = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(head)?.[1];
    expect(JSON.parse(body!)).toEqual(PAGE.jsonLd[0]);
  });

  it('a </script> inside JSON-LD cannot close the element early', () => {
    const s = jsonForScript({ name: '</script><script>alert(1)</script>' });
    expect(s).not.toContain('</script>');
    expect(JSON.parse(s).name).toBe('</script><script>alert(1)</script>');
  });

  it('a hostile title or description stays text', () => {
    const h = seoHead({ ...PAGE, title: '</title><script>x</script>', description: '"><img src=x onerror=y>' });
    expect(h).not.toMatch(/<script>x|<img src=x/);
    expect(h).toContain('&lt;/title&gt;');
    expect(h).toContain('&quot;&gt;&lt;img');
  });
});

describe('#1383 — the static block is readable HTML, and only text', () => {
  const body = seoStaticBody(PAGE);

  it('has one h1, the sections, every example and every link', () => {
    expect(body.match(/<h1\b/g)).toHaveLength(1);
    expect(body).toContain('שם הכלי');
    expect(body.match(/<h2\b/g)).toHaveLength(3);
    for (const e of PAGE.examples) expect(body).toContain(e.text);
    expect(body).toContain('href="https://example.test/other/"');
  });

  it('an example with markup in it is shown, not run', () => {
    const b = seoStaticBody({ ...PAGE, examples: [{ text: '<b>x</b>' }] });
    expect(b).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('#1383 — applySeo replaces the title and fills the EMPTY root, and refuses a shell it cannot read', () => {
  it('replaces exactly the old title and puts the block inside #root', () => {
    const out = applySeo(SHELL, PAGE);
    expect(out).not.toContain('<title>old</title>');
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out).toMatch(/<div id="root"><main data-seo-static/);
    expect(out).toContain('<script src="/x.js"></script>');
  });

  it('a `$` in the page text is copied literally (String.replace would expand `$&`)', () => {
    const out = applySeo(SHELL, { ...PAGE, title: 'cost $& more', description: '$1 $`' });
    expect(out).toContain('<title>cost $&amp; more</title>');
    expect(out).toContain('content="$1 $`"');
  });

  it('throws on a shell with no title or a non-empty root — shipping bare is the defect', () => {
    expect(() => applySeo(SHELL.replace('<title>old</title>', ''), PAGE)).toThrow(/title/);
    expect(() => applySeo(SHELL.replace('<div id="root"></div>', '<div id="root">x</div>'), PAGE)).toThrow(/root/);
  });
});

describe('#1383 — the plugin knows which entry it is transforming', () => {
  it.each([
    ['C:\\repo\\3d.html', '3d.html'],
    ['/abs/repo/index.html', 'index.html'],
    ['/complex.html', 'complex.html'],
  ])('%s → %s', (p, f) => expect(entryFileOf(p)).toBe(f));
});
