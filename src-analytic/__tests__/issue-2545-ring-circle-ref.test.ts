/**
 * #2545 ([ADR-AG-335](../../docs/06c-decisions-analytic.md#adr-ag-335)) — the ADR-W-157 port of 2-D's ADR-768: a circle
 * named by its relation to a polygon with NO ring typed («DE מיתר במעגל החוסם», «… החסום», "the circumcircle") reads
 * the figure's one polygon's described circle when that circle is drawn and is the figure's one circle. Otherwise the
 * line keeps the model hand-off it had (02c R124): creating the circle, or choosing between two, is #2560.
 *
 * Measured at d9494206: C1/C2/C2b/C8 were `not-handled` here while 2-D bound the circle; the lettered forms recorded.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';

function typed(lines: readonly string[]): { kinds: string[]; recorded: string[] } {
  const recorded: string[] = [];
  const kinds: string[] = [];
  for (const l of lines) {
    const v = decideSubmit(l, recorded, 0);
    kinds.push(v.kind === 'refused' ? `refused:${v.error.key}` : v.kind);
    if (v.kind === 'record') recorded.push(l);
  }
  return { kinds, recorded };
}

const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
const distLine = (c: { x: number; y: number }, p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.abs((q.x - p.x) * (p.y - c.y) - (p.x - c.x) * (q.y - p.y)) / d(p, q);

const READS: [string, string[], string[], 'circ' | 'in'][] = [
  ['C1 the circumcircle drawn', ['משולש ABC', 'מעגל O חוסם את משולש ABC', 'DE מיתר במעגל החוסם'], ['D', 'E'], 'circ'],
  ['C2 the triangle inscribed in a circle', ['משולש ABC חסום במעגל', 'DE מיתר במעגל החוסם'], ['D', 'E'], 'circ'],
  ['C2b «… את המשולש»', ['משולש ABC חסום במעגל', 'DE מיתר במעגל החוסם את המשולש'], ['D', 'E'], 'circ'],
  ['C8 the incircle drawn', ['משולש ABC', 'מעגל O חסום במשולש ABC', 'DE מיתר במעגל החסום'], ['D', 'E'], 'in'],
  ['a point on it', ['משולש ABC', 'מעגל O חוסם את משולש ABC', 'P על המעגל החוסם'], ['P'], 'circ'],
  ['English', ['triangle ABC', 'circle O circumscribes triangle ABC', 'DE is a chord of the circumcircle'], ['D', 'E'], 'circ'],
];

describe('#2545 — analytic reads the letterless relation when the described circle is drawn', () => {
  it.each(READS)('%s: %j records, the points on the described circle at 24 seeds', (_id, lines, members, kind) => {
    const { kinds, recorded } = typed(lines);
    expect(kinds).toEqual(lines.map(() => 'record'));
    for (let seed = 0; seed < 24; seed++) {
      const dv = derive(recorded, seed);
      expect(dv.faults, `seed ${seed}`).toEqual([]);
      const circles = dv.figure.curves.filter((c) => c.curve.kind === 'circle');
      expect(circles).toHaveLength(1);
      const cu = circles[0].curve as { cx: number; cy: number; r: number };
      const ctr = { x: cu.cx, y: cu.cy };
      const P = (k: string) => dv.figure.points.find((p) => p.id === k)!;
      for (const m of members) expect(Math.abs(d(P(m), ctr) - cu.r), `${m} on it, seed ${seed}`).toBeLessThan(1e-6);
      if (kind === 'circ') for (const v of ['A', 'B', 'C']) expect(Math.abs(d(P(v), ctr) - cu.r)).toBeLessThan(1e-6);
      else for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'A']]) expect(Math.abs(distLine(ctr, P(a), P(b)) - cu.r)).toBeLessThan(1e-6);
    }
  });

  it.each([
    [['משולש ABC', 'DE מיתר במעגל החוסם']],
    [['משולש ABC', 'DE מיתר במעגל החסום']],
    [['מעגל O', 'משולש ABC', 'DE מיתר במעגל החוסם']],
    [['משולש ABC', 'מעגל I חסום במשולש ABC', 'DE מיתר במעגל החוסם']],
    [['משולש ABC', 'מעגל O חוסם את משולש ABC', 'מעגל P', 'DE מיתר במעגל החוסם']],
    [['DE מיתר במעגל החוסם']],
  ])('%j keeps the model hand-off (not-handled), never a record', (lines) => {
    const { kinds } = typed(lines);
    expect(kinds.at(-1)).toBe('refused:not-handled');
  });

  it.each([
    [['משולש ABC', 'DE מיתר במעגל החוסם את משולש ABC']],
    [['משולש ABC', 'DE מיתר במעגל החסום במשולש ABC']],
    [['משולש ABC', 'המעגל החוסם את משולש ABC']],
  ])('the lettered forms are unchanged: %j records', (lines) => {
    expect(typed(lines).kinds.at(-1)).toBe('record');
  });
});
