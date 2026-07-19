/**
 * Issue #214 (feature, ADR-370) — tangent(s) from a NAMED point to BOTH circles: the classic bagrut
 * figure (two circles, the two common external tangents drawn from an external point A).
 *
 * Before: «מנקודה A יוצא משיק לשני המעגלים» was silently mis-parsed (#215's P1 — an invented third
 * circle with A as a mutual-tangency touch; fixed to defer), and even with «משותף» the commonTangent
 * rule had no apex concept — «מנקודה A» was swept into the touch-naming labels and A was placed ON
 * circle O. Now: the from-marker binds the APEX role (ADR-233/275 — role by semantic marker), the
 * from + plural-circles form is itself a trigger («משותף» not required), the lowering reuses the
 * ADR-239 two-touch bundle plus the through-apex coupling (`set-line [A, T1, T2]` — apex strictly
 * beyond both touches — and the drawn external part), and a NEW apex is a free point the couplings
 * drive (two tangents ⇒ their crossing; the homothety centre emerges, never asserted).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function ctxOf(facts: Fact[]) {
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}
function factsFrom(lines: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const line of lines) {
    const r = parse(line, ctxOf(facts));
    expect(r.ok, `expected to parse: ${line} (${!r.ok ? r.reason : ''})`).toBe(true);
    if (!r.ok) continue;
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: line, group, cmd, enabled: true });
  }
  return facts;
}
const TWO = ['מעגל O', 'מעגל P'];
type SL = Extract<AnyCommand, { type: 'set-line' }>;

describe('#214 — common tangent(s) through a named apex', () => {
  it.each([
    ['He, no משותף', 'מנקודה A יוצא משיק לשני המעגלים'],
    ['He, with משותף', 'מנקודה A יוצא משיק משותף לשני המעגלים'],
    ['En', 'from point A a tangent to both circles'],
  ])('%s — A is the APEX (never a touch): through-coupling, touches on the circles', (_t, u) => {
    const base = factsFrom(TWO);
    const r = parse(u, ctxOf(base));
    expect(r.ok, u).toBe(true);
    if (!r.ok) return;
    // A is never placed ON a circle (the old misparse), and no third circle is invented
    expect(r.commands.some((c) => c.type === 'point-on-circle' && (c as { id: string }).id === 'A')).toBe(false);
    expect(r.commands.some((c) => c.type === 'circle' || c.type === 'circles-tangent')).toBe(false);
    // the singular NEW-apex coupling: A first in a set-line through the touches
    const sl = r.commands.find((c) => c.type === 'set-line') as SL | undefined;
    expect(sl, 'the through-apex set-line').toBeTruthy();
    expect(sl!.points[0]).toBe('A');
    // the external part is drawn from A
    expect(r.commands.some((c) => c.type === 'segment' && ((c as { a: string }).a === 'A' || (c as { b: string }).b === 'A'))).toBe(true);
  });

  it.each([['explicit count', 'מנקודה A יוצאים שני משיקים לשני המעגלים'], ['bare plural (PR #220 play-test)', 'מנקודה A יוצאים משיקים לשני המעגלים']])(
    'the PLURAL (%s) builds TWO tangents with A DERIVED at their crossing — the circles are never recruited',
    (_t, u) => {
      const base = factsFrom(TWO);
      const r = parse(u, ctxOf(base));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      expect(r.commands.filter((c) => c.type === 'common-tangent')).toHaveLength(2);
      // the fix: a NEW two-tangent apex is DERIVED (line-through scaffolding + line-intersection),
      // never a free point coupled by set-lines (whose solve recruited the radii/centres and drew
      // the declared-disjoint circles overlapping)
      expect(r.commands.some((c) => c.type === 'free-point')).toBe(false);
      expect(r.commands.some((c) => c.type === 'set-line')).toBe(false);
      expect(r.commands.filter((c) => c.type === 'line-through')).toHaveLength(2);
      const li = r.commands.find((c) => c.type === 'line-intersection') as { id: string } | undefined;
      expect(li?.id).toBe('A');
    },
  );

  it('the operator\'s figure builds END-TO-END: two tangents from A, each through its touches, A on both lines', () => {
    // A second standalone circle now takes a SPLIT default radius (the ADR-253 general-position
    // principle, radius edition), so the derived crossing exists at the fold's defaults.
    const facts = factsFrom([...TWO, 'מנקודה A יוצאים שני משיקים לשני המעגלים']);
    const fig = replay(facts);
    for (const [id, st] of Object.entries(fig.status)) expect(st, `status of ${id}`).toBe('ok');
    expect(fig.violations).toEqual([]);
    // A (derived at the crossing) is collinear with each tangent's touch pair
    const A = fig.positions.get('A')!;
    const cts = facts.filter((f) => f.cmd.type === 'common-tangent').map((f) => f.cmd) as { a: string; b: string }[];
    expect(cts).toHaveLength(2);
    for (const ct of cts) {
      const P1 = fig.positions.get(ct.a)!;
      const P2 = fig.positions.get(ct.b)!;
      const cross = Math.abs((P2.x - P1.x) * (A.y - P1.y) - (A.x - P1.x) * (P2.y - P1.y));
      const span = Math.hypot(P2.x - P1.x, P2.y - P1.y);
      expect(cross / Math.max(span, 1e-9), `collinear: A on line ${ct.a}${ct.b}`).toBeLessThan(0.05);
    }
  });

  it('the PLAY-TEST figure (PR #220 defect): «שני מעגלים זרים» stays DISJOINT under the two-tangent apex — no amber, circles untouched', () => {
    const facts = factsFrom(['שני מעגלים זרים', 'מנקודה A יוצאים משיקים לשני המעגלים']);
    const fig = replay(facts);
    for (const [id, st] of Object.entries(fig.status)) expect(st, `status of ${id}`).toBe('ok');
    expect(fig.violations, 'the declared disjointness must HOLD in the displayed config').toEqual([]);
    const cs = [...fig.circles.values()];
    expect(cs).toHaveLength(2);
    const gap = Math.hypot(cs[0].center.x - cs[1].center.x, cs[0].center.y - cs[1].center.y);
    expect(gap, 'centre gap strictly beyond the radii sum').toBeGreaterThan(cs[0].r + cs[1].r);
  });

  it('M1 — an EXISTING apex: constraints only, no free-point re-creation', () => {
    const base = factsFrom([...TWO, 'נקודה A']);
    const r = parse('מנקודה A יוצא משיק לשני המעגלים', ctxOf(base));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'free-point')).toBe(false);
  });

  it('honesty: a CONTAINED pair has no common tangent — the request clarifies, never repositions', () => {
    const base = factsFrom(['שני מעגלים מוכלים']);
    const r = parse('מנקודה A יוצא משיק לשני המעגלים', ctxOf(base));
    expect(r.ok, 'must not silently build').toBe(false);
  });

  it('no-theft: the single-circle from-forms keep their owners', () => {
    const one = factsFrom(['מעגל O']);
    const single = parse('מנקודה A יוצא משיק למעגל', ctxOf(one));
    expect(single.ok && single.commands.some((c) => c.type === 'circle-circle-intersection'), 'tangentFromExternal Thales owner').toBe(true);
    const twoT = parse('מנקודה A יוצאים שני משיקים למעגל O', ctxOf(one));
    expect(twoT.ok && twoT.commands.filter((c) => c.type === 'circle-circle-intersection').length === 2, 'tangentsFromExternal owner').toBe(true);
    // the apex-less common tangent is unchanged
    const base = factsFrom(TWO);
    const plain = parse('AB משיק משותף לשני המעגלים', ctxOf(base));
    expect(plain.ok && !plain.commands.some((c) => c.type === 'free-point') && !plain.commands.some((c) => c.type === 'set-line'), 'no apex machinery without a from-marker').toBe(true);
  });
});
