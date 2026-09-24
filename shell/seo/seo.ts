/**
 * THE PAGE A CRAWLER READS (#1383, ADR-W-085) — pure `SeoPage → HTML` for every builder's shell.
 *
 * Measured before this existed: each builder served a crawler ~450 bytes — a four-word `<title>` and
 * ~45 characters of text. Google renders JavaScript and saw the chrome; most AI crawlers do not, and
 * saw nothing they could quote. This module writes two things into each builder's `index.html` at
 * build time:
 *
 *  - **the head** — title, description, canonical, OpenGraph/Twitter, icons, and JSON-LD;
 *  - **a static block inside `#root`** — what the tool is, how to use it, and the product's own
 *    featured catalog examples. React's `createRoot().render` REPLACES the container's children, so a
 *    student sees it only while the script downloads (it doubles as the loading screen) and the app
 *    never renders twice.
 *
 * `shell/` rules hold: no strings and no product knowledge here — every word arrives in the `SeoPage`
 * the caller builds (ADR-W-016). Pure and synchronous, so the lock tests call it directly.
 */

export interface SeoExample {
  /** Exactly what a student types — a catalog row's `he`. */
  text: string;
  /** The catalog's own description of the row. */
  note?: string;
}

export interface SeoPage {
  /** Absolute canonical URL, apex host, trailing slash (`https://themathbible.com/geo-builder/`). */
  url: string;
  /** `<title>` — the operator-approved wording (#1383). */
  title: string;
  /** Meta description — operator-approved; also the static block's lead paragraph. */
  description: string;
  /** Short site name for `og:site_name`. */
  siteName: string;
  /** The builder's display name — the static block's heading and JSON-LD `name`. */
  name: string;
  /** Absolute URL of the 1200×630 preview image, when the page has one. */
  ogImage?: string;
  /** Icon hrefs as the page should reference them (base-relative in a build, `data:` in dev). */
  icon: string;
  touchIcon: string;
  /** Static block: the "how it works" heading and its steps. */
  howToHeading: string;
  howTo: string[];
  /** Static block: the examples heading and rows. */
  examplesHeading: string;
  examples: SeoExample[];
  /** Static block: links to the sibling builders and the home page. */
  linksHeading: string;
  links: { href: string; label: string }[];
  /** The line under everything (free, no sign-up…). */
  footer: string;
  /** The loading line shown above the block while the app starts. */
  loading: string;
  /** JSON-LD objects, already shaped by the caller (a `WebApplication`, …). */
  jsonLd: Record<string, unknown>[];
}

/** HTML-escape for text and double-quoted attribute values. */
export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * JSON for a `<script type="application/ld+json">` body. `JSON.stringify` does not escape `<`, so a
 * string holding `</script>` would end the element early; `<` is the same character to a JSON
 * parser and inert to an HTML one.
 */
export const jsonForScript = (v: unknown): string => JSON.stringify(v).replace(/</g, '\\u003c');

/** Everything that belongs in `<head>` after the charset/viewport lines, the `<title>` included. */
export function seoHead(p: SeoPage): string {
  const meta = (attr: 'name' | 'property', key: string, value: string) => `<meta ${attr}="${key}" content="${esc(value)}">`;
  return [
    `<title>${esc(p.title)}</title>`,
    meta('name', 'description', p.description),
    `<link rel="canonical" href="${esc(p.url)}">`,
    `<link rel="icon" type="image/svg+xml" href="${esc(p.icon)}">`,
    `<link rel="apple-touch-icon" href="${esc(p.touchIcon)}">`,
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', p.siteName),
    meta('property', 'og:locale', 'he_IL'),
    meta('property', 'og:title', p.title),
    meta('property', 'og:description', p.description),
    meta('property', 'og:url', p.url),
    ...(p.ogImage
      ? [meta('property', 'og:image', p.ogImage), meta('property', 'og:image:width', '1200'), meta('property', 'og:image:height', '630')]
      : []),
    meta('name', 'twitter:card', p.ogImage ? 'summary_large_image' : 'summary'),
    meta('name', 'twitter:title', p.title),
    meta('name', 'twitter:description', p.description),
    ...(p.ogImage ? [meta('name', 'twitter:image', p.ogImage)] : []),
    ...p.jsonLd.map((o) => `<script type="application/ld+json">${jsonForScript(o)}</script>`),
  ].join('\n    ');
}

/**
 * The static block that sits inside `#root` until React replaces it. Semantic HTML (one `h1`, `h2`
 * sections, a list) because that structure is what a crawler — and an answer engine quoting it —
 * reads; inline styles only, since the app's stylesheet may not have loaded yet.
 */
export function seoStaticBody(p: SeoPage): string {
  const li = (inner: string) => `<li style="margin:.25rem 0">${inner}</li>`;
  const code = (t: string) =>
    `<code dir="auto" style="font-family:ui-monospace,Consolas,monospace;background:#eef4fb;border-radius:4px;padding:0 .3rem;unicode-bidi:isolate">${esc(t)}</code>`;
  return `<main data-seo-static style="font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;max-width:44rem;margin:0 auto;padding:1.5rem 1rem;line-height:1.6;color:#0f1923">
      <p style="color:#046bd2;margin:0 0 .5rem">${esc(p.loading)}</p>
      <h1 style="font-size:1.6rem;margin:.25rem 0">${esc(p.name)}</h1>
      <p>${esc(p.description)}</p>
      <h2 style="font-size:1.15rem;margin-top:1.25rem">${esc(p.howToHeading)}</h2>
      <ol>${p.howTo.map((s) => li(esc(s))).join('')}</ol>
      <h2 style="font-size:1.15rem;margin-top:1.25rem">${esc(p.examplesHeading)}</h2>
      <ul>${p.examples.map((e) => li(code(e.text) + (e.note ? ` — ${esc(e.note)}` : ''))).join('')}</ul>
      <h2 style="font-size:1.15rem;margin-top:1.25rem">${esc(p.linksHeading)}</h2>
      <ul>${p.links.map((l) => li(`<a href="${esc(l.href)}">${esc(l.label)}</a>`)).join('')}</ul>
      <p style="color:#3a4a5a">${esc(p.footer)}</p>
    </main>`;
}

/**
 * Apply both to an entry's `index.html`: the `<title>` is REPLACED by the head block, and the empty
 * `#root` receives the static body. Throws when either anchor is missing — a shell that silently
 * shipped without its metadata is the exact defect this exists to remove.
 */
export function applySeo(html: string, p: SeoPage): string {
  const title = /<title>[^<]*<\/title>/;
  const root = /<div id="root"><\/div>/;
  if (!title.test(html)) throw new Error('seo: the entry html has no <title> to replace');
  if (!root.test(html)) throw new Error('seo: the entry html has no empty <div id="root"></div>');
  return html.replace(title, () => seoHead(p)).replace(root, () => `<div id="root">${seoStaticBody(p)}</div>`);
}
