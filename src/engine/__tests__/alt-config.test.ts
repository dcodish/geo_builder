/**
 * "Show another configuration" (FR-ALT) over a figure's free DOFs: the seeded
 * sampler must give a DIFFERENT valid drawing for the under-determined parts (an
 * inscribed triangle's free vertices) while leaving fixed-angle shapes (an
 * inscribed square) and driven/constrained points alone.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay, polygonsConvex } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { build } from '../step';
import { applySeed, freeDofs } from '../sample';
import { evaluate } from '../evaluate';
import { isGeoPoint, circleMembers } from '../index';
import { dist, angleDeg } from '../geometry';
import type { Command, Vec } from '../types';

const cmds = (u: string): Command[] => {
  const r = parse(u);
  if (!r.ok) throw new Error(`parse: ${u}`);
  return r.commands as Command[];
};

describe('resample varies free on-circle vertices (an inscribed triangle)', () => {
  it('the vertices are free DOFs and move to a different valid configuration', () => {
    const { construction, positions } = build(cmds('triangle ABD inscribed in circle O radius 5'));
    expect(freeDofs(construction)).toEqual(expect.arrayContaining(['A', 'B', 'D'])); // vertices are free
    const A0 = positions.get('A')!;
    let differs = false;
    for (let s = 1; s < 8 && !differs; s++) {
      const e = evaluate(applySeed(construction, s));
      if (e.ok && dist(e.positions.get('A')!, A0) > 0.5) {
        differs = true;
        // still a valid inscribed triangle — all three vertices on the radius-5 circle
        const O = e.positions.get('O')!;
        for (const id of ['A', 'B', 'D']) expect(dist(O, e.positions.get(id)!)).toBeCloseTo(5, 6);
      }
    }
    expect(differs).toBe(true);
  });

  it('every sampled configuration is a proper (non-sliver) triangle, never just dots', () => {
    const { construction } = build(cmds('triangle ABC inscribed in circle O radius 5'));
    for (let s = 0; s < 30; s++) {
      const e = evaluate(applySeed(construction, s));
      if (!e.ok) continue;
      const [A, B, C] = ['A', 'B', 'C'].map((id) => e.positions.get(id)!);
      const minAngle = Math.min(angleDeg(A, B, C), angleDeg(B, A, C), angleDeg(C, A, B));
      expect(minAngle, `seed ${s} collapsed to a sliver`).toBeGreaterThan(10); // spread-preserving sampler
    }
  });

  it('an inscribed square keeps its fixed-angle corners (not free) — stays a square', () => {
    const { construction } = build(cmds('square ABCD inscribed in a circle'));
    for (const id of ['A', 'B', 'C', 'D']) expect(freeDofs(construction)).not.toContain(id);
  });
});

/**
 * Q4 (bagrut) — the coupled tangent/secant trapezoid (operator session m26xv4m2): quadrilateral BKCD with
 * KB ∥ CD, CD a chord, KB tangent at K, BD a secant cutting the circle at A. Encoded via the tangent–chord
 * theorem (KB tangent at K AND KB ∥ CD ⟺ K = arc-midpoint of CD) + B = (tangent at K) ∩ (line AD).
 *
 * The construction was always geometrically correct, but the CLEAN textbook drawing — a convex trapezoid
 * BKCD with A strictly BETWEEN B and D (the secant "BD cuts the circle at A") — was ~1-in-300 under the old
 * seeder, because the chord CD (C,D) and the lone secant point A read as "3 free on-circle points → an
 * inscribed cluster" and were jittered tight (±30°), so CD never got short enough. The sample.ts fix scopes
 * the tight jitter to genuine inscribed polygons (≥3 on-circle vertices); a chord/secant point now ranges
 * wide, lifting the clean-config rate ~100× so "show another configuration" reliably reaches it.
 */
describe('Q4 tangent/secant trapezoid — the clean textbook config is reachable (seeder fix)', () => {
  const STEPS = [
    'מעגל סביב O רדיוס 5',
    'מיתר CD במעגל O',
    'K אמצע הקשת CD במעגל O',
    'A על מעגל O',
    'B חיתוך המשיק למעגל O בנקודה K עם AD',
    'מרובע BKCD',
    'E חיתוך AK ו-BC',
  ];

  const ctxOf = (facts: Fact[]) => {
    const { construction } = replay(facts);
    return {
      circles: construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [o.center] : [])),
      points: construction.objects.filter(isGeoPoint).map((o) => o.id),
      circleMembers: circleMembers(construction),
    };
  };

  /** Thread figure context exactly as the app does; `branch` simulates one "show another" arc-midpoint flip. */
  const facts = (branch?: number): Fact[] => {
    const fs: Fact[] = [];
    let g = 0;
    for (const u of STEPS) {
      const r = parse(u, ctxOf(fs));
      if (!r.ok) throw new Error(`Q4 step did not parse: ${u}`);
      const group = `g${g++}`;
      for (const cmd of r.commands) {
        if (branch !== undefined && cmd.type === 'arc-midpoint') (cmd as { branch?: number }).branch = branch;
        fs.push({ id: `${group}.${fs.length}`, utterance: u, group, cmd, enabled: true });
      }
    }
    return fs;
  };

  // projection parameter of A onto B→D; ∈(0,1) ⟺ A strictly between B and D (the secant requirement)
  const tBetween = (B: Vec, A: Vec, D: Vec) =>
    ((A.x - B.x) * (D.x - B.x) + (A.y - B.y) * (D.y - B.y)) / (((D.x - B.x) ** 2 + (D.y - B.y) ** 2) || 1);

  it('the construction builds cleanly (every relation holds; no over-constraint)', () => {
    const fig = replay(facts());
    expect(fig.lastError).toBeNull();
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status ${id}`).toBe('ok');
  });

  it('within the app seed budget, branch-1 reaches a convex BKCD with A between B and D', () => {
    const fs = facts(1); // the correct-secant arc ("show another configuration" cycles K onto it)
    let found = -1;
    for (let seed = 0; seed < 24 && found < 0; seed++) {
      const fig = replay(fs, seed);
      if (fig.lastError) continue;
      const P = (id: string) => fig.positions.get(id);
      const A = P('A'), B = P('B'), D = P('D');
      if (!A || !B || !D) continue;
      const t = tBetween(B, A, D);
      if (polygonsConvex(fs, fig.positions) && t > 0.05 && t < 0.95) found = seed;
    }
    expect(found, 'no clean convex + A-between config within 24 seeds').toBeGreaterThanOrEqual(0);
  });
});
