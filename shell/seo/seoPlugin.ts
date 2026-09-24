/**
 * The Vite plugin that puts `seo.ts`'s output into every builder's `index.html` (#1383, ADR-W-085).
 *
 * ONE plugin for four builds, keyed by the entry's HTML file name (`index.html`, `3d.html`, …),
 * because the dev server is also one: `vite.config.ts` serves all four entries in development, so a
 * plugin that knew only "its" product would stamp 2-D's metadata onto the 3-D page. Every config
 * passes the same table; each page is matched to its own file.
 *
 * **An entry with no page REFUSES the build** rather than shipping bare — a fifth builder must not be
 * born invisible (the sitemap lock of ADR-W-084 is the same rule for the site root).
 *
 * Assets: the icon, the touch icon and the 1200×630 preview are EMITTED under `seo/` with fixed,
 * unhashed names, because a preview URL is cached by every chat app that has ever shown it and must
 * stay stable across deploys. In dev nothing is emitted; the icons are inlined as `data:` URLs and
 * the page carries no `og:image` (a dev URL would be wrong in any preview anyway).
 */
import type { Plugin, ResolvedConfig } from 'vite';
import { applySeo, type SeoPage } from './seo';

export interface SeoAssets {
  /** The builder's icon, SVG source. */
  iconSvg: string;
  /** 180 px PNG rendered from `iconSvg` (scripts/render-icons.mjs). */
  touchPng: Uint8Array;
  /** 1200×630 preview (scripts/render-og.mjs), when the builder has one. */
  ogPng?: Uint8Array;
}

export interface SeoEntry {
  page: Omit<SeoPage, 'icon' | 'touchIcon' | 'ogImage'>;
  assets: SeoAssets;
}

const b64 = (u: Uint8Array | string) => {
  const bytes = typeof u === 'string' ? new TextEncoder().encode(u) : u;
  return btoa(Array.from(bytes, (c) => String.fromCharCode(c)).join(''));
};

/** The HTML file an index-html hook is transforming — `3d.html` from `/abs/…/3d.html` or `/3d.html`. */
export const entryFileOf = (p: string): string => p.split(/[\\/]/).pop() ?? p;

export function seoPlugin(entries: Record<string, SeoEntry>): Plugin {
  let config: ResolvedConfig;
  const used = new Set<string>();
  return {
    name: 'geo-seo',
    configResolved(c) {
      config = c;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        const file = entryFileOf(ctx.filename || ctx.path);
        const entry = entries[file];
        if (!entry) {
          throw new Error(
            `seo: no page for entry "${file}" — every builder ships with its metadata (#1383). ` +
              `Add it to seo-pages.ts. Known: ${Object.keys(entries).join(', ')}`,
          );
        }
        const build = config.command === 'build';
        if (build) used.add(file);
        const page: SeoPage = {
          ...entry.page,
          icon: build ? `${config.base}seo/icon.svg` : `data:image/svg+xml;base64,${b64(entry.assets.iconSvg)}`,
          touchIcon: build ? `${config.base}seo/apple-touch-icon.png` : `data:image/png;base64,${b64(entry.assets.touchPng)}`,
          ...(build && entry.assets.ogPng ? { ogImage: `${entry.page.url}seo/og.png` } : {}),
        };
        return applySeo(html, page);
      },
    },
    generateBundle() {
      if (used.size > 1) throw new Error(`seo: one build emitted ${used.size} pages (${[...used].join(', ')}) — their seo/ assets would collide`);
      for (const file of used) {
        const { assets } = entries[file];
        this.emitFile({ type: 'asset', fileName: 'seo/icon.svg', source: assets.iconSvg });
        this.emitFile({ type: 'asset', fileName: 'seo/apple-touch-icon.png', source: assets.touchPng });
        if (assets.ogPng) this.emitFile({ type: 'asset', fileName: 'seo/og.png', source: assets.ogPng });
      }
    },
  };
}
