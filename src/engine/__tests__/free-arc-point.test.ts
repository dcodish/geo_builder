/**
 * A FREE point on an arc (ADR-042): "F is on arc BC" — point-on-circle with `between: [B, C]`.
 * F starts at the arc midpoint (the canonical seed-0 figure) but is a genuine 1-DOF point the
 * sampler slides WITHIN the arc and a constraint can drive — distinct from the fixed `arc-midpoint`.
 */
import { describe, it, expect } from 'vitest';
import { build, applySeed, evaluate } from '@/engine';
import type { AnyCommand } from '@/engine';
import { dist } from '@/engine/geometry';

const baseFigure: AnyCommand[] = [
  { type: 'triangle', ids: ['C', 'D', 'E'] },
  { type: 'point-on-segment', id: 'A', a: 'C', b: 'D' },
  { type: 'point-on-segment', id: 'B', a: 'C', b: 'E' },
  { type: 'circumcircle', id: 'circle-P', center: 'P', a: 'A', b: 'B', c: 'C' },
  { type: 'point-on-circle', id: 'F', circle: 'circle-P', between: ['B', 'C'] },
];

const ang = (p: { x: number; y: number }, o: { x: number; y: number }) => Math.atan2(p.y - o.y, p.x - o.x);
const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
/** Is F on the minor arc from B to C (its angle within the shorter span)? */
const onArc = (F: { x: number; y: number }, P: { x: number; y: number }, B: { x: number; y: number }, C: { x: number; y: number }) => {
  const span = norm(ang(C, P) - ang(B, P));
  const dF = norm(ang(F, P) - ang(B, P));
  return span <= Math.PI ? dF <= span : dF >= span;
};

describe('a free point on arc BC (between)', () => {
  it('the canonical figure places F at the arc midpoint (equidistant from B and C), on circle P', () => {
    const { positions } = build(baseFigure);
    const F = positions.get('F')!, P = positions.get('P')!, B = positions.get('B')!, C = positions.get('C')!;
    expect(dist(P, F)).toBeCloseTo(dist(P, positions.get('A')!), 4); // on circle P
    expect(dist(F, B)).toBeCloseTo(dist(F, C), 3); // midpoint of arc BC
    expect(onArc(F, P, B, C)).toBe(true);
  });

  it('F is a real DOF: "show another configuration" slides it WITHIN arc BC, staying on circle P', () => {
    const { construction } = build(baseFigure);
    const seen: { x: number; y: number }[] = [];
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const e = evaluate(applySeed(construction, seed));
      expect(e.ok).toBe(true);
      if (!e.ok) return;
      const F = e.positions.get('F')!, P = e.positions.get('P')!, B = e.positions.get('B')!, C = e.positions.get('C')!;
      expect(dist(P, F)).toBeCloseTo(dist(P, e.positions.get('A')!), 4); // never leaves circle P
      expect(onArc(F, P, B, C)).toBe(true); // never leaves arc BC
      seen.push(F);
    }
    expect(seen.some((p) => dist(p, seen[0]) > 1e-3)).toBe(true); // it genuinely varies
  });
});
