/**
 * #1285 ([ADR-540](../../../docs/06-decisions.md#adr-540)) — THE BISECTOR RULE READS ITS TRIANGLE OPERAND.
 *
 * Operator, 2026-09-20: «CE חוצה זווית C במשולש ABC» was not-handled while «CE חוצה זווית C» built.
 * `labelRun(after, 3)` found the TRIANGLE's letters and read them as the angle. The triangle is now read
 * first, removed from the hunt (the #1267 shape), and used: apex C in ring ABC is ∠BCA.
 *
 * Parity with the bare form is asserted on the FIGURE, never on a hand-written command list.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../index';
import { ctxOf, factsOf } from '../../__tests__/scenario-pipeline';
import { replay } from '@/replay/core';

type Pt = { x: number; y: number };
const fig = (steps: string[]) => replay(factsOf(steps as never));
const pos = (f: ReturnType<typeof replay>, id: string): Pt => f.positions.get(id)!;
/** ∠(p, v, q) in degrees, unsigned. */
const angleAt = (p: Pt, v: Pt, q: Pt) => {
  const a = Math.atan2(p.y - v.y, p.x - v.x) - Math.atan2(q.y - v.y, q.x - v.x);
  return Math.abs((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * (180 / Math.PI);
};
const onSegment = (p: Pt, a: Pt, b: Pt) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);

describe('#1285 — «CE חוצה זווית C במשולש ABC» is «CE חוצה זווית C»', () => {
  it.each([
    'CE חוצה זווית C במשולש ABC',
    'CE חוצה את הזווית C במשולש ABC',
    'CE חוצה זווית במשולש ABC',
    'CE bisects angle C in triangle ABC',
  ])('«%s» builds the figure the bare form builds — E on AB, ∠ACE = ∠ECB', (line) => {
    const f = fig(['משולש ABC', line]);
    expect(f.lastError, line).toBeNull();
    const A = pos(f, 'A'), B = pos(f, 'B'), C = pos(f, 'C'), E = pos(f, 'E');
    expect(onSegment(E, A, B), 'E on AB').toBeLessThan(1e-6);
    expect(angleAt(A, C, E)).toBeCloseTo(angleAt(E, C, B), 6);
    // the same figure as the bare spelling, point for point
    const bare = fig(['משולש ABC', 'CE חוצה זווית C']);
    for (const id of ['A', 'B', 'C', 'E']) {
      expect(pos(f, id).x, `${id}.x`).toBeCloseTo(pos(bare, id).x, 6);
      expect(pos(f, id).y, `${id}.y`).toBeCloseTo(pos(bare, id).y, 6);
    }
  });

  it('the property is CONSTRAINED, not drawn plausibly — on a scalene triangle the two half-angles agree at every configuration', () => {
    for (const seed of [0, 1, 2, 3]) {
      const f = replay(factsOf(['משולש ABC', 'AB = 7', 'BC = 5', 'CA = 9', 'CE חוצה זווית C במשולש ABC'] as never), seed);
      expect(f.lastError, `seed ${seed}`).toBeNull();
      const A = pos(f, 'A'), B = pos(f, 'B'), C = pos(f, 'C'), E = pos(f, 'E');
      expect(angleAt(A, C, E), `seed ${seed}`).toBeCloseTo(angleAt(E, C, B), 5);
    }
  });

  it('the widening: the triangle form answers where the bare form must ask — a vertex with three edges', () => {
    // D is a fourth point joined to C, so C has three edges and «זווית C» alone names no single angle.
    const base = ['משולש ABC', 'נקודה D', 'CD'];
    const ctx = ctxOf(factsOf(base as never));
    const bare = parse('CE חוצה זווית C', ctx);
    expect(bare.ok).toBe(false);
    expect(!bare.ok && bare.reason).toBe('ambiguous-angle');
    const withTri = parse('CE חוצה זווית C במשולש ABC', ctx);
    expect(withTri.ok, 'the triangle identifies the angle').toBe(true);
  });

  it('a stated vertex that is not the bisector’s own first letter is refused quoting both — never silently redirected', () => {
    const r = parse('CE חוצה זווית A במשולש ABC', ctxOf(factsOf(['משולש ABC'] as never)));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('bisector-wrong-apex');
    expect(!r.ok && r.reason === 'bisector-wrong-apex' && r.apex).toBe('C');
    expect(!r.ok && r.reason === 'bisector-wrong-apex' && r.stated).toBe('A');
  });

  it('#1267’s own rows are untouched — a wrongly named SIDE is still refused, and a three-letter angle still reads', () => {
    const ctx = ctxOf(factsOf(['משולש ABC'] as never));
    const wrongSide = parse('BD חוצה זווית לצלע BC', ctx);
    expect(!wrongSide.ok && wrongSide.reason).toBe('cevian-wrong-side');
    const explicit = fig(['משולש ABC', 'CE חוצה זווית ACB במשולש ABC']);
    expect(explicit.lastError).toBeNull();
    expect(pos(explicit, 'E')).toBeDefined();
  });
});
