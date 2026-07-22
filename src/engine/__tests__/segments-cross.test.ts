/**
 * The point-free crossing REQUIREMENT «CD חותך את AB» with no point named (issue #241, ADR-383):
 * reading (a) — typing STATES the crossing (`segments-cross`, within both spans), NO label is
 * invented, and the ADR-380 forced-crossing dot then offers the naming. The named forms stay
 * byte-identical; recognised common tangents defer (they meet beyond their touches).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import type { ParseContext } from '@/parser';
import { replay, firstSatisfyingSeed, meetsRequirements, segmentsCrossWithin, forcedCrossingKeys } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { applySeed, evaluate, isGeoPoint } from '@/engine';
import type { AnyCommand, Id, Vec } from '@/engine';

const cmds = (u: string, ctx?: ParseContext) => {
  const r = parse(u, ctx);
  expect(r.ok, `${u} should parse deterministically`).toBe(true);
  return r.ok ? r.commands : [];
};
const ctxOf = (facts: Fact[]) => {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
};
const factsOf = (steps: string[]): Fact[] => {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const r = parse(step, ctxOf(facts));
    if (!r.ok) throw new Error(`step did not parse: ${step}`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd, enabled: true });
  }
  return facts;
};

describe('segments-cross parsing (#241)', () => {
  it('the unnamed cut form parses in both orders and both locales — no label invented', () => {
    expect(cmds('CD חותך את AB')).toEqual([
      { type: 'segment', a: 'C', b: 'D' },
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'segments-cross', a: 'C', b: 'D', c: 'A', d: 'B' },
    ]);
    expect(cmds('AB חותך את CD').find((c) => c.type === 'segments-cross')).toEqual({ type: 'segments-cross', a: 'A', b: 'B', c: 'C', d: 'D' });
    expect(cmds('CD cuts AB').find((c) => c.type === 'segments-cross')).toEqual({ type: 'segments-cross', a: 'C', b: 'D', c: 'A', d: 'B' });
  });

  it('the unnamed conjunction meet parses («AB ו-CD נפגשים» / "AB and CD intersect")', () => {
    expect(cmds('AB ו-CD נפגשים').find((c) => c.type === 'segments-cross')).toEqual({ type: 'segments-cross', a: 'A', b: 'B', c: 'C', d: 'D' });
    expect(cmds('AB and CD intersect').find((c) => c.type === 'segments-cross')).toEqual({ type: 'segments-cross', a: 'A', b: 'B', c: 'C', d: 'D' });
  });

  it('a re-statement on a drawn figure emits ONLY the requirement (the ADR-234 zero-delta class)', () => {
    const facts = factsOf(['AB', 'CD']);
    expect(cmds('CD חותך את AB', ctxOf(facts))).toEqual([{ type: 'segments-cross', a: 'C', b: 'D', c: 'A', d: 'B' }]);
  });

  // ── no-theft locks ──
  it('the NAMED form is byte-identical to before («CD חותך את AB בנקודה R» → line-line-intersection onSeg)', () => {
    expect(cmds('CD חותך את AB בנקודה R')).toEqual([
      { type: 'segment', a: 'C', b: 'D' },
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'line-line-intersection', id: 'R', a: 'C', b: 'D', c: 'A', d: 'B', onSeg: true },
    ]);
  });

  it('a המשך/הישר operand still defers (per-operand order needs the named forms)', () => {
    expect(parse('המשך CD חותך את AB').ok).toBe(false);
    expect(parse('הישר CD חותך את AB').ok).toBe(false);
  });

  it('two recognised COMMON TANGENTS defer — they meet BEYOND their touches', () => {
    const ctx: ParseContext = {
      points: ['A', 'B', 'C', 'D'],
      commonTangents: { 'circle-O|circle-P': [{ pair: ['A', 'B'] }, { pair: ['C', 'D'] }] },
    };
    expect(parse('AB ו-CD נפגשים', ctx).ok).toBe(false);
    expect(parse('AB חותך את CD', ctx).ok).toBe(false);
  });
});

describe('segments-cross requirement (#241)', () => {
  it('the operator sequence builds with NO invented point, crossing within both, verifier clean', () => {
    const facts = factsOf(['AB', 'CD', 'CD חותך את AB']);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toBeNull();
    expect(fig.violations).toEqual([]);
    expect([...fig.positions.keys()].sort()).toEqual(['A', 'B', 'C', 'D']); // reading (a): nothing minted
    expect(segmentsCrossWithin(facts, fig.positions)).toBe(true);
  });

  it('meetsRequirements never accepts a non-crossing configuration', () => {
    const facts = factsOf(['AB', 'CD', 'CD חותך את AB']);
    for (let s = 0; s < 24; s++) {
      const fig = replay(facts, s);
      if (meetsRequirements(facts, s)) expect(segmentsCrossWithin(facts, fig.positions)).toBe(true);
    }
  });

  it('a fresh «CD חותך את AB» statement (nothing drawn yet) also builds crossing', () => {
    const facts = factsOf(['CD חותך את AB']);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toBeNull();
    expect(segmentsCrossWithin(facts, fig.positions)).toBe(true);
  });

  it('the stated crossing becomes FORCED — the ADR-380 dot is offered on the requirement-satisfying pool', () => {
    const facts = factsOf(['AB', 'CD', 'CD חותך את AB']);
    const c0 = replay(facts, firstSatisfyingSeed(facts)).construction;
    const samples: Map<Id, Vec>[] = [];
    for (let s = 0; s < 16; s++) {
      const r = evaluate(applySeed(c0, s));
      if (r.ok && segmentsCrossWithin(facts, r.positions)) samples.push(r.positions);
    }
    expect(samples.length).toBeGreaterThanOrEqual(4);
    expect(forcedCrossingKeys({ constructions: [c0], samples })).toEqual(new Set(['s:A-B|s:C-D']));
  });

  it('the requirement records no point object and no constraint — the ADR-244 shape', () => {
    const facts = factsOf(['AB', 'CD', 'CD חותך את AB']);
    const fig = replay(facts);
    expect(fig.construction.objects.filter(isGeoPoint).map((o) => o.id).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(fig.construction.constraints).toEqual([]);
  });

  it('#240 composition: «CD חוצה את AB» draws a genuine crossing, M exactly the midpoint, never all-collinear', () => {
    const facts = factsOf(['CD חוצה את AB']);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toBeNull();
    expect(fig.violations).toEqual([]);
    const P = (id: Id) => fig.positions.get(id)!;
    const M = P('M'), A = P('A'), B = P('B'), C = P('C'), D = P('D');
    expect(Math.hypot(M.x - (A.x + B.x) / 2, M.y - (A.y + B.y) / 2)).toBeLessThan(1e-6);
    // the crossing must be a real transversal, not the degenerate all-on-one-line solution
    const perp = (p: Vec) => Math.abs((B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x)) / Math.hypot(B.x - A.x, B.y - A.y);
    expect(Math.max(perp(C), perp(D))).toBeGreaterThan(0.5);
    // and M lies WITHIN CD (the set-line betweenness)
    const t = ((M.x - C.x) * (D.x - C.x) + (M.y - C.y) * (D.y - C.y)) / ((D.x - C.x) ** 2 + (D.y - C.y) ** 2);
    expect(t).toBeGreaterThan(0.02);
    expect(t).toBeLessThan(0.98);
  });
});
