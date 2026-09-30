/**
 * #1245 + #1162 ([ADR-553](../../docs/06-decisions.md#adr-553)) — 2-D's pointers at a sibling tool are
 * TRUE, and the spelling 2-D teaches actually builds there.
 *
 * Two locks, both cross-product, which is why they live in `server/` — the only tree `BOUNDARIES.json`
 * lets import 2-D and analytic together:
 *
 * 1. **A pointer names a LIVE tool by the BUTTON the student sees** (#1162; PR #1575 play feedback,
 *    2026-09-30). The `analytic` message said a coordinate tool was «מתוכנן לעתיד» for two weeks after it
 *    shipped, and the first fix pointed at a URL the student had to read and type while the switcher button
 *    sat in the header. The lock is against the product REGISTRY, not the one string: no 2-D scope message
 *    carries a URL; every tool a scope message names is an ENABLED product of `products.json`, spelled with
 *    its `labelKey`'s text (the words the switcher renders); and the pointer's raw template INTERPOLATES
 *    that key (`$t(<labelKey>)`) rather than typing the name a second time — so a renamed button renames
 *    the message, and the next sibling cannot bring either class back.
 * 2. **A taught remedy is driven, not asserted as text** (#1156 / #1183). The coordinate refusal teaches
 *    `E(-1,7)`; that exact token is read OUT of the message, in both locales, and run through the
 *    analytic Builder's own submit decision and derivation. If analytic ever stops accepting it, this
 *    fails — the 2-D message would be teaching a spelling that is refused.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import i18n from '../../src/i18n';
import { decideSubmit } from '../../src-analytic/app/submit';
import { derive } from '../../src-analytic/engine/derive';
import { parseLine } from '../../src-analytic/parser/parseAnalytic';

const root = path.resolve(__dirname, '../..');
const json = (p: string) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));
const registry = json('products.json') as { products: { id: string; labelKey: string; enabled: boolean }[] };
const LOCALES = ['he', 'en'] as const;
/** The raw templates, as authored. */
const rawScope = (lng: 'he' | 'en') => json(`src/i18n/locales/${lng}.json`).input.scope as Record<string, string>;
/** What the student SEES: each scope message through the real i18n instance, bidi isolates stripped. */
const shownScope = (lng: 'he' | 'en') =>
  Object.fromEntries(
    Object.keys(rawScope(lng)).map((k) => [k, (i18n.t(`input.scope.${k}`, { lng }) as string).replace(/[\u2066-\u2069]/g, '')]),
  ) as Record<string, string>;
const label = (id: string, lng: 'he' | 'en') => {
  const p = registry.products.find((x) => x.id === id);
  if (!p || !p.enabled) throw new Error(`product ${id} is not live`);
  return i18n.t(p.labelKey, { lng }) as string;
};
/** A message SENDING the student to a button at the top of the screen: «בכלי «X» — לחצו עליו בראש המסך», `click "X" at the top of the screen`. */
const NAMED_TOOL = /בכלי «([^»]+)» — לחצו עליו בראש המסך|click "([^"]+)" at the top of the screen/g;
const POINTERS = { 'cross-app': '3d', analytic: 'analytic', 'coordinate-point': 'analytic' } as const;

describe('#1162 + PR #1575 — every sibling tool a 2-D scope message names is live, and named by its button', () => {
  it.each(LOCALES)('%s: no scope message contains a URL', (lng) => {
    for (const [key, msg] of Object.entries(shownScope(lng))) {
      expect(msg, `input.scope.${key}`).not.toMatch(/themathbible|https?:|www\.|\.com\b|\/[\w-]+-builder/);
    }
  });

  it.each(LOCALES)('%s: every tool a scope message names is an ENABLED product, spelled with its labelKey text', (lng) => {
    const buttons = new Set(registry.products.filter((p) => p.enabled && p.id !== '2d').map((p) => i18n.t(p.labelKey, { lng }) as string));
    let seen = 0;
    for (const [key, msg] of Object.entries(shownScope(lng))) {
      for (const m of msg.matchAll(NAMED_TOOL)) {
        seen++;
        const name = m[1] ?? m[2];
        expect(buttons.has(name), `input.scope.${key} names «${name}», which is no live switcher button`).toBe(true);
      }
    }
    expect(seen, 'non-vacuous: the pointers were read').toBeGreaterThanOrEqual(3); // cross-app, analytic, coordinate-point
  });

  it.each(LOCALES)('%s: each pointer names its tool, INTERPOLATED from the labelKey — never typed twice', (lng) => {
    const raw = rawScope(lng);
    const shown = shownScope(lng);
    for (const [key, id] of Object.entries(POINTERS)) {
      const p = registry.products.find((x) => x.id === id)!;
      expect(shown[key], `input.scope.${key} shows the ${id} button`).toContain(label(id, lng));
      expect(raw[key], `input.scope.${key} interpolates ${p.labelKey}`).toContain(`$t(${p.labelKey})`);
      expect(raw[key], `input.scope.${key} does not retype the button's words`).not.toContain(label(id, lng));
    }
  });

  it.each(LOCALES)('%s: no scope message calls a tool planned or future', (lng) => {
    for (const [key, msg] of Object.entries(shownScope(lng))) {
      expect(msg, `input.scope.${key}`).not.toMatch(/מתוכנן|לעתיד|בעתיד|בקרוב|\bplanned\b|coming soon|in the future/i);
    }
  });
});

describe('#1245 — the spelling the refusal teaches builds in the analytic Builder', () => {
  it.each(LOCALES)('%s: every coordinate token in the message is a point the analytic tool records', (lng) => {
    const msg = shownScope(lng)['coordinate-point'];
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
    for (const lng of LOCALES) expect(shownScope(lng)['coordinate-point']).not.toMatch(/[A-Z]\s*=\s*\(/);
  });
});
