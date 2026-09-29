/**
 * #1245 + #1162 ([ADR-553](../../docs/06-decisions.md#adr-553)) — 2-D's pointers at a sibling tool are
 * TRUE, and the spelling 2-D teaches actually builds there.
 *
 * Two locks, both cross-product, which is why they live in `server/` — the only tree `BOUNDARIES.json`
 * lets import 2-D and analytic together:
 *
 * 1. **A pointer names a LIVE tool** (#1162). The `analytic` message said a coordinate tool was «מתוכנן
 *    לעתיד» for two weeks after it shipped. The lock is against the product REGISTRY, not the one string:
 *    every `themathbible.com/<path>` a 2-D scope message names must be an ENABLED product in
 *    `products.json`, and no scope message may call a tool planned/future — so the next sibling cannot
 *    bring the class back.
 * 2. **A taught remedy is driven, not asserted as text** (#1156 / #1183). The coordinate refusal teaches
 *    `E(-1,7)`; that exact token is read OUT of the message, in both locales, and run through the
 *    analytic Builder's own submit decision and derivation. If analytic ever stops accepting it, this
 *    fails — the 2-D message would be teaching a spelling that is refused.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { decideSubmit } from '../../src-analytic/app/submit';
import { derive } from '../../src-analytic/engine/derive';
import { parseLine } from '../../src-analytic/parser/parseAnalytic';

const root = path.resolve(__dirname, '../..');
const json = (p: string) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));
const registry = json('products.json') as { products: { id: string; url: string; enabled: boolean }[] };
const scopeOf = (lng: 'he' | 'en') => json(`src/i18n/locales/${lng}.json`).input.scope as Record<string, string>;
const LOCALES = ['he', 'en'] as const;

const liveUrl = (id: string) => {
  const p = registry.products.find((x) => x.id === id);
  if (!p || !p.enabled) throw new Error(`product ${id} is not live`);
  return `themathbible.com${p.url.replace(/\/$/, '')}`;
};

describe('#1162 — every sibling tool a 2-D scope message names is live', () => {
  it.each(LOCALES)('%s: each themathbible.com path is an ENABLED product in the registry', (lng) => {
    const enabled = new Set(registry.products.filter((p) => p.enabled).map((p) => p.url.replace(/^\/|\/$/g, '')));
    let seen = 0;
    for (const [key, msg] of Object.entries(scopeOf(lng))) {
      for (const m of msg.matchAll(/themathbible\.com\/([\w-]+)/g)) {
        seen++;
        expect(enabled.has(m[1]), `input.scope.${key} names ${m[0]}, which is not a live product`).toBe(true);
      }
    }
    expect(seen, 'non-vacuous: the pointers were read').toBeGreaterThanOrEqual(3); // cross-app, analytic, coordinate-point
  });

  it.each(LOCALES)('%s: no scope message calls a tool planned or future', (lng) => {
    for (const [key, msg] of Object.entries(scopeOf(lng))) {
      expect(msg, `input.scope.${key}`).not.toMatch(/מתוכנן|לעתיד|בעתיד|בקרוב|\bplanned\b|coming soon|in the future/i);
    }
  });

  it.each(LOCALES)('%s: both analytic-family answers name the analytic Builder', (lng) => {
    const s = scopeOf(lng);
    expect(s.analytic).toContain(liveUrl('analytic'));
    expect(s['coordinate-point']).toContain(liveUrl('analytic'));
  });
});

describe('#1245 — the spelling the refusal teaches builds in the analytic Builder', () => {
  it.each(LOCALES)('%s: every coordinate token in the message is a point the analytic tool records', (lng) => {
    const msg = scopeOf(lng)['coordinate-point'];
    const taught = [...msg.matchAll(/([A-Z]\d*)\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/g)];
    expect(taught.length, 'the message teaches a literal spelling').toBeGreaterThan(0);
    for (const [tok, id, x, y] of taught) {
      expect(decideSubmit(tok, [], 0).kind, `${tok} is recorded by analytic`).toBe('record');
      const pt = derive([tok], 0).figure.points.find((p) => p.id === id);
      expect(pt, `${tok} places ${id}`).toBeDefined();
      expect([pt!.x, pt!.y]).toEqual([Number(x), Number(y)]);
    }
  });

  it('the `=` spelling stays refused in analytic (operator ruling 2026-09-19) — which is why the message never shows it', () => {
    expect(parseLine('E=(-1,7)').ok).toBe(false);
    for (const lng of LOCALES) expect(scopeOf(lng)['coordinate-point']).not.toMatch(/[A-Z]\s*=\s*\(/);
  });
});
