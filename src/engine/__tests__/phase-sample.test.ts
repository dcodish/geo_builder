/**
 * ADR-018 Stage 1 — seeded sampling of residual freedom. The sampler perturbs
 * only non-pinned free points; pinned points and shape validity are preserved,
 * and it is deterministic (same seed → same figure).
 */

import { describe, it, expect } from 'vitest';
import type { Vec } from '../types';
import { build, applyStep, emptyConstruction } from '../step';
import { applySeed, freeDofs, freeDofCount } from '../sample';
import { evaluate } from '../evaluate';
import { dist, sub } from '../geometry';

const parallelogram = (p: Vec, q: Vec, r: Vec, s: Vec) =>
  Math.abs(sub(q, p).x * sub(s, r).y - sub(q, p).y * sub(s, r).x) < 1e-9;

describe('applySeed', () => {
  it('seed 0 is the canonical figure (unchanged)', () => {
    const { construction } = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }]);
    expect(applySeed(construction, 0)).toBe(construction);
  });

  it('is deterministic — same seed gives the same positions', () => {
    const { construction } = build([{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }]);
    const a = evaluate(applySeed(construction, 7));
    const b = evaluate(applySeed(construction, 7));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) for (const id of ['A', 'B', 'C', 'D']) expect(a.positions.get(id)).toEqual(b.positions.get(id));
  });

  it('moves a non-pinned free vertex but keeps the shape valid', () => {
    const { construction, positions } = build([{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }]);
    const seeded = evaluate(applySeed(construction, 3));
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;
    const A = seeded.positions.get('A')!, B = seeded.positions.get('B')!, C = seeded.positions.get('C')!, D = seeded.positions.get('D')!;
    // a different drawing…
    expect(dist(A, positions.get('A')!)).toBeGreaterThan(1e-6);
    // …still a parallelogram (D derived = A + C − B; AB ∥ DC)
    expect(D.x).toBeCloseTo(A.x + C.x - B.x, 9);
    expect(parallelogram(A, B, D, C)).toBe(true);
  });

  it('does not move a pinned point', () => {
    // A is pinned by an explicit placement; B,C are free shape vertices.
    const r1 = build([{ type: 'triangle', ids: ['A', 'B', 'C'] }, { type: 'free-point', id: 'A', x: -3, y: 2 }]);
    const seeded = evaluate(applySeed(r1.construction, 5));
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;
    expect(seeded.positions.get('A')).toEqual({ x: -3, y: 2 }); // pinned — unchanged
    expect(dist(seeded.positions.get('B')!, r1.positions.get('B')!)).toBeGreaterThan(1e-6); // free — moved
  });

  it('a fully-pinned figure has no free DOFs and the sampler is a no-op', () => {
    const r = build([
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 6, y: 0 },
      { type: 'midpoint', id: 'M', a: 'A', b: 'B' },
    ]);
    expect(freeDofs(r.construction)).toHaveLength(0);
    const seeded = evaluate(applySeed(r.construction, 9));
    expect(seeded.ok).toBe(true);
    if (seeded.ok) expect(seeded.positions.get('M')).toEqual({ x: 3, y: 0 });
  });

  it('freeDofs lists exactly the non-pinned free points', () => {
    const r1 = applyStep(emptyConstruction(), { type: 'square', ids: ['A', 'B', 'C', 'D'] });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    // square: A,B are free base vertices; C,D are derived
    expect(freeDofs(r1.construction).sort()).toEqual(['A', 'B']);
    const r2 = applyStep(r1.construction, { type: 'free-point', id: 'A', x: 1, y: 1 }); // pin A
    if (!r2.ok) return;
    expect(freeDofs(r2.construction)).toEqual(['B']);
  });

  it('varies a free shape DOF (ADR-033) — a rhombus reaches an OBTUSE angle across seeds', () => {
    const { construction } = build([{ type: 'rhombus', ids: ['A', 'B', 'C', 'D'] }]);
    const angles: number[] = [];
    for (let seed = 0; seed < 12; seed++) {
      const e = evaluate(applySeed(construction, seed));
      if (e.ok) {
        const A = e.positions.get('A')!, B = e.positions.get('B')!, D = e.positions.get('D')!;
        const u = sub(B, A), v = sub(D, A);
        angles.push((Math.acos((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180) / Math.PI);
      }
    }
    // the default (seed 0) is acute (60°); other seeds reach obtuse — so "show another configuration"
    // gives a genuinely different-shaped rhombus, not just a moved one (no need to force an angle).
    expect(angles.some((a) => a > 95)).toBe(true);
    expect(angles.some((a) => a < 85)).toBe(true);
  });

  it('slides a free on-line marker along its line across seeds (ADR-036), and lists it as a DOF', () => {
    // A, B pinned (explicit placements); the only freedom is P's offset along line AB.
    const { construction, positions } = build([
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 10, y: 0 },
      { type: 'line-through', id: 'line-AB', a: 'A', b: 'B' },
      { type: 'point-on-line', id: 'P', line: 'line-AB', offset: 3 },
    ]);
    expect(freeDofs(construction)).toEqual(['P']); // the marker is the figure's lone free DOF
    const xs = new Set<number>();
    for (let seed = 1; seed < 8; seed++) {
      const e = evaluate(applySeed(construction, seed));
      if (e.ok) {
        const P = e.positions.get('P')!;
        expect(P.y).toBeCloseTo(0, 9); // stays ON the line (y = 0 for the x-axis line AB)
        expect(P.x).toBeGreaterThan(0); // sign of the offset is preserved (same side of the anchor)
        xs.add(Math.round(P.x * 1000));
      }
    }
    expect(xs.size).toBeGreaterThan(1); // genuinely different positions → "show another configuration" varies it
    // …and a sampled position differs from the canonical (seed-0) default.
    const def = positions.get('P')!;
    expect([...xs].some((x) => Math.abs(x / 1000 - def.x) > 1e-6)).toBe(true);
  });

  it('freeDofCount (ADR-018 Stage 3): a lone square has 4 DOF (place/rotate/scale); pinning both base vertices → 0', () => {
    expect(freeDofCount(build([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }]).construction)).toBe(4);
    const pinned = build([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 6, y: 0 },
    ]);
    expect(freeDofCount(pinned.construction)).toBe(0); // fully determined → the "✓ determined" cue
    expect(freeDofs(pinned.construction)).toHaveLength(0);
  });

  it('ADR-018 Stage 2 — a constraint-driven free vertex is pruned from the DOF count and the sampler', () => {
    // Parallelogram A,B,C free (D derived) → 6 DOF. |AB| = |AC| drives ONE free vertex (ADR-030),
    // so it stops being a sampled DOF: the count drops by 2 and freeDofs loses it.
    const pgram = build([{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }, { type: 'segment', a: 'A', b: 'C' }]);
    expect(freeDofCount(pgram.construction)).toBe(6);
    expect(freeDofs(pgram.construction).sort()).toEqual(['A', 'B', 'C']);
    const r = applyStep(pgram.construction, { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(freeDofCount(r.construction)).toBe(4); // the driven vertex no longer counts
    expect(freeDofs(r.construction)).toHaveLength(2);
  });

  it("a CONSTRAINED shape DOF is NOT resampled (a driven rhombus angle stays put)", () => {
    // angle ADC = 80 drives the rhombus's `rotated` DOF → it's pinned, so the sampler leaves it.
    const { construction } = build([{ type: 'rhombus', ids: ['A', 'B', 'C', 'D'] }, { type: 'set-angle', vertex: 'D', ray1: 'A', ray2: 'C', value: 80 }]);
    const base = evaluate(construction);
    const seeded = evaluate(applySeed(construction, 5));
    const ang = (pos: Map<string, Vec>) => {
      const D = pos.get('D')!, A = pos.get('A')!, C = pos.get('C')!;
      const u = sub(A, D), v = sub(C, D);
      return (Math.acos((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180) / Math.PI;
    };
    expect(base.ok && seeded.ok).toBe(true);
    if (base.ok && seeded.ok) {
      expect(ang(base.positions)).toBeCloseTo(80, 0);
      expect(ang(seeded.positions)).toBeCloseTo(80, 0); // constraint preserved under resample
    }
  });
});
