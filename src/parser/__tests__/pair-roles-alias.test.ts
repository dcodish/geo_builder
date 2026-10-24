/**
 * #2464 ([ADR-760](../../../docs/06-decisions.md#adr-760)) — the parse-boundary alias of a concentric pair's roles
 * (`src/parser/pairRoles.ts`), as a mechanism:
 *  - every `ParseContext` field is classified (re-keyed into the token world, or untouched) — a circle-bearing field
 *    left un-remapped would let a rule see the pair as one circle again;
 *  - the tokens are fresh against the figure and the sentence;
 *  - no token survives the map back, and a refusal that would name a token is never returned;
 *  - the role spans are rewritten in every spelling, singular only.
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, parse, type ParseContext, type ParseResult } from '@/parser';
import { freshTokens, hasRoleSpan, PAIR_ALIAS_FIELDS, resolvePairRoles, rewriteRoles, withPairTokens, type PairAlias } from '@/parser/pairRoles';
import { replay, useGeoStore } from '@/store/geoStore';

/** The figure's parse context after `lines` (each parsed and committed through the store). */
function ctxAfter(lines: string[]): ParseContext {
  useGeoStore.getState().clear();
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const r = parse(line, buildParseCtx(f.construction, f.positions));
    expect(r.ok, line).toBe(true);
    if (r.ok) for (const c of r.commands) useGeoStore.getState().execute(c, line, `g${st.facts.length}`);
  }
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  return buildParseCtx(f.construction, f.positions);
}
const PAIR = 'שני מעגלים בעלי מרכז משותף O';
const A: PairAlias = { tok: 'O', center: 'O', outer: 'circle-O', inner: 'circle-O-2', tO: 'Z', tI: 'Y' };

describe('the ParseContext field table is total', () => {
  it('every field buildParseCtx produces is classified', () => {
    const ctx = ctxAfter([PAIR, 'A על המעגל החיצוני', 'מעגל P ברדיוס 3']);
    const unclassified = Object.keys(ctx).filter((k) => !(k in PAIR_ALIAS_FIELDS));
    expect(unclassified).toEqual([]);
  });

  it('the aliased context gives each circle of the pair its own token, and keeps the pair known (resolved)', () => {
    const ctx = ctxAfter([PAIR, 'רדיוס מעגל חיצוני הוא 10', 'רדיוס מעגל פנימי 9', 'A על המעגל החיצוני', 'B על המעגל הפנימי', 'מעגל P ברדיוס 3']);
    const c2 = withPairTokens(ctx, A);
    expect(c2.circles).toEqual(expect.arrayContaining(['Z', 'Y', 'P']));
    expect(c2.circles).not.toContain('O');
    expect(c2.points).toEqual(expect.arrayContaining(['Z', 'Y', 'O']));
    expect(c2.centrePoint).toMatchObject({ Z: 'O', Y: 'O' });
    expect(c2.concentric).toEqual([{ center: 'O', outer: 'circle-Z', inner: 'circle-Y', resolved: true }]);
    expect(c2.circleMembers?.find((e) => e.id === 'circle-Z')?.points).toContain('A');
    expect(c2.circleMembers?.find((e) => e.id === 'circle-Y')?.points).toContain('B');
    expect(c2.circleSizes?.map((e) => e.id).sort()).toEqual(['circle-P', 'circle-Y', 'circle-Z']);
    // no field still names a pair circle by its real id
    const json = JSON.stringify(c2);
    expect(json).not.toMatch(/"circle-O(-2)?"/);
  });
});

describe('fresh tokens', () => {
  it('never a point, a circle, a bound radius letter or a letter of the sentence', () => {
    const ctx: ParseContext = { points: ['Z', 'A'], circles: ['O', 'Y'], radiusSymbols: [{ name: 'x', circle: 'circle-O', center: 'O' }], concentric: [{ center: 'O', outer: 'circle-O', inner: 'circle-O-2' }] };
    const [t1, t2] = freshTokens(ctx, 'W על המעגל החיצוני ו-V על המעגל הפנימי')!;
    for (const t of [t1, t2]) expect(['Z', 'A', 'O', 'Y', 'X', 'W', 'V']).not.toContain(t);
    expect(t1).not.toBe(t2);
  });
});

describe('the role spans', () => {
  it.each([
    ['A על המעגל החיצוני', 'A על מעגל Z'],
    ['משיק למעגל הפנימי בנקודה A', 'משיק למעגל Y בנקודה A'],
    ['AB מיתר במעגל חיצוני', 'AB מיתר במעגל Z'],
    ['רדיוס של המעגל הגדול הוא r', 'רדיוס של מעגל Z הוא r'],
    ['A על המעגל החיצוני ו-B על המעגל הפנימי', 'A על מעגל Z ו-B על מעגל Y'],
    ['A on the inner circle and B on the outer circle', 'A on circle Y and B on circle Z'],
    ['the radius of the smaller circle is r', 'the radius of circle Y is r'],
  ])('«%s» → «%s»', (s, want) => {
    expect(hasRoleSpan(s)).toBe(true);
    expect(rewriteRoles(s, A)).toBe(want);
  });
  it.each([['שני מעגלים חיצוניים'], ['the outer circles'], ['נקודה חיצונית למעגל'], ['משיק משותף חיצוני']])('«%s» names no one circle by role', (s) => {
    expect(hasRoleSpan(s)).toBe(false);
  });
});

describe('resolvePairRoles', () => {
  const ctx: ParseContext = { circles: ['O'], points: ['O'], centrePoint: { O: 'O' }, concentric: [{ center: 'O', outer: 'circle-O', inner: 'circle-O-2' }] };
  it('maps every token back: circle ids to the real circles, a token in centre geometry to the centre letter', () => {
    const stub = (): ParseResult => ({ ok: true, commands: [{ type: 'point-on-circle', id: 'A', circle: 'circle-Z' }, { type: 'foot', id: '@tang-Y-A-B', from: 'O', a: 'A', b: 'B' }, { type: 'point-on-circle', id: '@tang-Y-A-B', circle: 'circle-Y' }] as never });
    const r = resolvePairRoles('A על המעגל החיצוני ו-AB משיק למעגל הפנימי', ctx, stub);
    expect(r).toEqual({ ok: true, commands: [{ type: 'point-on-circle', id: 'A', circle: 'circle-O' }, { type: 'foot', id: '@tang-O-A-B', from: 'O', a: 'A', b: 'B' }, { type: 'point-on-circle', id: '@tang-O-A-B', circle: 'circle-O-2' }] });
    expect(JSON.stringify(r)).not.toMatch(/(?<![a-z])[ZY](?![a-z])/);
  });
  it('a refusal that names a token is never returned', () => {
    const stub = (): ParseResult => ({ ok: false, reason: 'ambiguous-circle-ref', centers: ['Z', 'Y'] });
    expect(resolvePairRoles('A על המעגל החיצוני', ctx, stub)).toEqual({ ok: false, reason: 'not-handled' });
  });
  it('a refusal naming no token passes; on a two-role line only the pair-relation reader\'s refusal does', () => {
    const tangents = (): ParseResult => ({ ok: false, reason: 'tangents-exhausted', kind: 'external', position: 'contained' });
    expect(resolvePairRoles('A על המעגל החיצוני', ctx, tangents)).toEqual(tangents());
    expect(resolvePairRoles('משיק משותף חיצוני למעגל הפנימי ולמעגל החיצוני', ctx, tangents)).toEqual({ ok: false, reason: 'not-handled' });
    const equal = (): ParseResult => ({ ok: false, reason: 'equal-circles-nested', relation: 'concentric' });
    expect(resolvePairRoles('רדיוס המעגל החיצוני שווה לרדיוס המעגל הפנימי', ctx, equal)).toEqual(equal());
  });
  it('a command relating the pair\'s own two circles is declined; the radius readers are not', () => {
    const tangent = (): ParseResult => ({ ok: true, commands: [{ type: 'circles-tangent', circle1: 'circle-Y', circle2: 'circle-Z', at: 'T', external: false }] as never });
    expect(resolvePairRoles('המעגל הפנימי משיק למעגל החיצוני', ctx, tangent)).toEqual({ ok: false, reason: 'not-handled' });
    const ratio = (): ParseResult => ({ ok: true, commands: [{ type: 'set-radius-ratio', c1: 'circle-Z', c2: 'circle-Y', k: 2 }] as never });
    expect(resolvePairRoles('רדיוס המעגל החיצוני גדול פי 2 מרדיוס המעגל הפנימי', ctx, ratio)).toEqual({ ok: true, commands: [{ type: 'set-radius-ratio', c1: 'circle-O', c2: 'circle-O-2', k: 2 }] });
  });
  it('no pair, or no role span → not this resolver (null); two pairs → not-handled; the centre letter beside a role → the ADR-244 ask', () => {
    const never = (): ParseResult => { throw new Error('not called'); };
    expect(resolvePairRoles('A על המעגל החיצוני', { circles: ['O'] }, never)).toBeNull();
    expect(resolvePairRoles('A על מעגל O', ctx, never)).toBeNull();
    expect(resolvePairRoles('A על המעגל החיצוני', { ...ctx, concentric: [...ctx.concentric!, { center: 'Q', outer: 'circle-Q', inner: 'circle-Q-2' }] }, never)).toEqual({ ok: false, reason: 'not-handled' });
    expect(resolvePairRoles('A על מעגל O ו-B על המעגל הפנימי', ctx, never)).toEqual({ ok: false, reason: 'ambiguous-circle', center: 'O' });
  });
});
