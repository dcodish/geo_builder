/**
 * #1973 ([ADR-797](../../docs/06-decisions.md#adr-797), [ADR-AG-430](../../docs/06c-decisions-analytic.md#adr-ag-430)) —
 * the shared half of the host tag: the noun table, the saved-host cleaner, the suite strings, and the fact list's `tag`.
 *
 * Both builders word the tag through `shell/cevianHost` and the `suite.host.*` strings, so «AE גובה» carries the same
 * «במשולש ABC» in 2-D and analytic by construction (ADR-W-118 B1); the per-builder locks assert the rendered text
 * (`CEVIAN_HOST_TAG`). This file asserts the module itself.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import he from '../locales/he.json';
import en from '../locales/en.json';
import { cleanHost, heldHost, hostNounOf, hostTag, hostTagText, type HostNoun } from '../cevianHost';
import { FactList } from '../frame/FactList';

const NOUNS: HostNoun[] = ['triangle', 'quadrilateral', 'parallelogram', 'rectangle', 'square', 'rhombus', 'trapezoid', 'kite', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'polygon'];
/** The suite table, read the way i18next reads it (no post-processor: the isolates are each builder's). */
const tOf = (table: typeof he) => (key: string, opts?: Record<string, unknown>) => {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], { suite: table.suite });
  if (typeof v !== 'string') throw new Error(`missing ${key}`);
  return v.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts?.[k] ?? ''));
};

describe('#1973 — the tag’s noun is the ring’s base noun', () => {
  it.each([
    [3, 'triangle', 'triangle'],
    [3, 'right-triangle', 'triangle'],
    [3, undefined, 'triangle'],
    [4, 'trapezoid', 'trapezoid'],
    [4, 'isosceles-trapezoid', 'trapezoid'],
    [4, 'right-trapezoid', 'trapezoid'],
    [4, 'parallelogram', 'parallelogram'],
    [4, 'right-kite', 'kite'],
    [4, 'quadrilateral', 'quadrilateral'],
    [4, undefined, 'quadrilateral'],
    [4, 'some-future-noun', 'quadrilateral'],
    [5, undefined, 'n5'],
    [10, undefined, 'n10'],
    [12, undefined, 'polygon'],
  ] as const)('%i vertices declared %s → %s', (arity, kind, want) => {
    expect(hostNounOf(arity, kind)).toBe(want);
  });
});

describe('#1973 — every noun is worded in both languages, naming the ring', () => {
  it.each(NOUNS)('%s', (noun) => {
    const host = { ring: ['A', 'B', 'C', 'D'], kind: noun };
    expect(hostTagText(host, tOf(he))).toMatch(/^ב\S+ ABCD$/);
    expect(hostTagText(host, tOf(en))).toMatch(/^in \w+ ABCD$/);
  });
  it('the operator’s row: «במשולש ABC» / "in triangle ABC", with a tooltip', () => {
    expect(hostTag({ ring: ['A', 'B', 'C'], kind: 'triangle' }, tOf(he))).toEqual({ text: 'במשולש ABC', title: he.suite.host.title });
    expect(hostTag({ ring: ['A', 'B', 'C'], kind: 'triangle' }, tOf(en))?.text).toBe('in triangle ABC');
    expect(hostTag(null, tOf(he))).toBeUndefined();
  });
});

describe('#1973 — a saved host is cleaned, never trusted', () => {
  it('a ring of three or more distinct point letters and a known noun is kept', () => {
    expect(cleanHost({ ring: ['A', 'B', 'C'], kind: 'triangle' })).toEqual({ ring: ['A', 'B', 'C'], kind: 'triangle' });
    expect(cleanHost({ ring: ['P1', 'Q', 'R', 'S'], kind: 'trapezoid', extra: 1 })).toEqual({ ring: ['P1', 'Q', 'R', 'S'], kind: 'trapezoid' });
  });
  it.each([
    ['absent', undefined],
    ['not an object', 'ABC'],
    ['two vertices', { ring: ['A', 'B'], kind: 'triangle' }],
    ['a repeated vertex', { ring: ['A', 'B', 'A'], kind: 'triangle' }],
    ['not a letter', { ring: ['A', 'b', 'C'], kind: 'triangle' }],
    ['an unknown noun', { ring: ['A', 'B', 'C'], kind: 'hexahedron' }],
  ])('%s → none', (_why, raw) => {
    expect(cleanHost(raw)).toBeNull();
  });
});

describe('#1973 — a tag names a shape the figure still holds', () => {
  const ABC = { ring: ['A', 'B', 'C'], kind: 'triangle' as const };
  it('held under any reading of the ring', () => {
    expect(heldHost(ABC, [['C', 'A', 'B'], ['A', 'B', 'C', 'D']])).toBe(ABC);
  });
  it('a ring muted, deleted or edited away names nothing', () => {
    expect(heldHost(ABC, [['A', 'B', 'C', 'D']])).toBeUndefined();
    expect(heldHost(ABC, [])).toBeUndefined();
    expect(heldHost(undefined, [['A', 'B', 'C']])).toBeUndefined();
  });
});

describe('#1973 — the fact list draws the tag BESIDE the statement, in its own direction', () => {
  const html = (tag?: { text: string; title?: string }) =>
    renderToStaticMarkup(
      <FactList
        rows={[{ id: '1', text: 'AE גובה', content: 'AE גובה', ...(tag ? { tag } : {}) }]}
        emptyHint=""
        textDir={(s) => (/[א-ת]/.test(s) ? 'rtl' : 'ltr')}
      />,
    );
  it('outside the statement’s scope, so the row’s text stays the student’s words', () => {
    const out = html({ text: 'in triangle ABC', title: 'the shape' });
    expect(out).toMatch(/<div dir="rtl" data-fact-text="">AE גובה<\/div>/);
    expect(out).toMatch(/<span data-testid="fact-tag" dir="ltr" title="the shape"[^>]*>in triangle ABC<\/span>/);
  });
  it('no tag, no element', () => {
    expect(html()).not.toContain('fact-tag');
  });
});
