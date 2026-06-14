/**
 * Triangle congruence (≅) and similarity (~) as givens that RESHAPE the figure
 * (ADR-032). "ABC ≅ DEF" drives the second triangle's free vertices so corresponding
 * sides are equal (SSS); "ABC ~ DEF" so corresponding angles are equal (AA). Both
 * compose two disjoint triangles — which the place-apart fix lets coexist — and lean
 * on the existing coupled constraint solver (ADR-030/031).
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { dist, angleDeg, isGeoPoint } from '@/engine';
import { replay, type Fact } from '@/store/geoStore';

let n = 0;
const facts = (...us: string[]): Fact[] =>
  us.flatMap((u) => {
    const r = parse(u);
    if (!r.ok) throw new Error('parse failed: ' + u);
    return r.commands.map((cmd) => ({ id: `f${n++}`, cmd, enabled: true }));
  });
const L = (p: Map<string, { x: number; y: number }>, a: string, b: string) => dist(p.get(a)!, p.get(b)!);
const A = (p: Map<string, { x: number; y: number }>, v: string, a: string, b: string) => angleDeg(p.get(v)!, p.get(a)!, p.get(b)!);

describe('place two disjoint shapes apart', () => {
  it('two independent triangles coexist (no "same point" collision)', () => {
    const d = replay(facts('triangle ABC', 'triangle DEF'));
    expect(d.lastError).toBeNull();
    expect(d.construction.objects.filter(isGeoPoint).map((o) => o.id).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('the second shape sits clear of the first (their bounding boxes do not overlap in x)', () => {
    const d = replay(facts('triangle ABC', 'triangle DEF'));
    const x = (id: string) => d.positions.get(id)!.x;
    const abcMaxX = Math.max(x('A'), x('B'), x('C'));
    const defMinX = Math.min(x('D'), x('E'), x('F'));
    expect(defMinX).toBeGreaterThan(abcMaxX);
  });
});

describe('congruence (≅) reshapes the second triangle (SSS)', () => {
  it('parses "ABC ≅ DEF" to: build both + three equal-side constraints', () => {
    const r = parse('ABC ≅ DEF', { points: [] });
    expect(r.ok && r.commands.map((c) => c.type)).toEqual(['triangle', 'triangle', 'set-equal', 'set-equal', 'set-equal']);
  });

  it('drives DEF so corresponding sides equal ABC', () => {
    const d = replay(facts('ABC ≅ DEF'));
    expect(d.lastError).toBeNull();
    expect(L(d.positions, 'D', 'E')).toBeCloseTo(L(d.positions, 'A', 'B'), 2);
    expect(L(d.positions, 'E', 'F')).toBeCloseTo(L(d.positions, 'B', 'C'), 2);
    expect(L(d.positions, 'F', 'D')).toBeCloseTo(L(d.positions, 'C', 'A'), 2);
  });

  it('only constrains (no triangle re-create) when both already exist', () => {
    const r = parse('ABC ≅ DEF', { points: ['A', 'B', 'C', 'D', 'E', 'F'] });
    expect(r.ok && r.commands.map((c) => c.type)).toEqual(['set-equal', 'set-equal', 'set-equal']);
  });

  it('English "congruent to" and Hebrew "חופפים" parse the same way', () => {
    for (const u of ['triangle ABC congruent to triangle DEF', 'המשולשים ABC ו-DEF חופפים']) {
      const d = replay(facts(u));
      expect(d.lastError).toBeNull();
      expect(L(d.positions, 'D', 'E')).toBeCloseTo(L(d.positions, 'A', 'B'), 2);
    }
  });
});

describe('similarity (~) reshapes the second triangle (AA)', () => {
  it('parses "ABC ~ DEF" to: build both + two equal-angle constraints', () => {
    const r = parse('ABC ~ DEF', { points: [] });
    expect(r.ok && r.commands.map((c) => c.type)).toEqual(['triangle', 'triangle', 'set-angle-ratio', 'set-angle-ratio']);
  });

  it('drives DEF so corresponding angles equal ABC (so the triangles are similar)', () => {
    const d = replay(facts('ABC ~ DEF'));
    expect(d.lastError).toBeNull();
    expect(A(d.positions, 'D', 'E', 'F')).toBeCloseTo(A(d.positions, 'A', 'B', 'C'), 1);
    expect(A(d.positions, 'E', 'D', 'F')).toBeCloseTo(A(d.positions, 'B', 'A', 'C'), 1);
    // equal angles ⇒ proportional sides
    const r1 = L(d.positions, 'A', 'B') / L(d.positions, 'D', 'E');
    const r2 = L(d.positions, 'B', 'C') / L(d.positions, 'E', 'F');
    expect(r1).toBeCloseTo(r2, 2);
  });
});
