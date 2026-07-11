/**
 * ADR-253 — default placements land in GENERAL POSITION.
 *
 * Class: a 1-anchor template fit is a pure translation, so a bare segment to a NEW point placed the
 * point at anchor+(5,0) — exactly where most shape templates put their own second vertex. "AB קוטר"
 * then "AM" stacked M onto B (and collinear with A,O,B), so K = AM∩OC collapsed onto O and the kite
 * givens OK=OE / MK=ME were "unsatisfiable" at the ONLY composition the apply gate judges (the seed is
 * applied after the fold — no seed sweep can rescue an apply-time failure). Default placements were the
 * one position source with no genericity guarantee; placeBase now spins the fitted template around the
 * anchor (golden-angle steps) until every new vertex is off existing points and off lines through the
 * anchor and an existing point. Identity is kept when already generic.
 */
import { describe, expect, it } from 'vitest';
import { build } from '@/engine';
import type { AnyCommand, Vec } from '@/engine';

const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
/** Perpendicular distance from q to the infinite line through a and b. */
const offLine = (q: Vec, a: Vec, b: Vec) => Math.abs((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);

describe('general-position default placement (ADR-253)', () => {
  it('a bare segment to a NEW point does not stack it onto an existing point ("AB" then "AM")', () => {
    const { positions } = build([
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'segment', a: 'A', b: 'M' },
    ] as AnyCommand[]);
    const [A, B, M] = [positions.get('A')!, positions.get('B')!, positions.get('M')!];
    expect(d(M, B)).toBeGreaterThan(0.5); // was exactly 0
    expect(offLine(B, A, M)).toBeGreaterThan(0.5); // and not collinear with the existing pair either
  });

  it('the operator figure: M created by "AM" after a diameter is NOT on B and NOT on line AB', () => {
    const { positions } = build([
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'midpoint', id: 'O', a: 'A', b: 'B' },
      { type: 'circle-through', id: 'circle-O', center: 'O', through: 'A' },
      { type: 'segment', a: 'A', b: 'M' },
    ] as AnyCommand[]);
    const [A, B, M, O] = [positions.get('A')!, positions.get('B')!, positions.get('M')!, positions.get('O')!];
    expect(d(M, B)).toBeGreaterThan(0.5);
    expect(d(M, O)).toBeGreaterThan(0.5);
    expect(offLine(M, A, B)).toBeGreaterThan(0.5); // K = AM∩OC no longer degenerates onto O
  });

  it('sibling: a segment from a square corner to a NEW point avoids the far corner ("square ABCD" + "AE")', () => {
    const { positions } = build([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'segment', a: 'A', b: 'E' },
    ] as AnyCommand[]);
    const E = positions.get('E')!;
    for (const v of ['A', 'B', 'C', 'D']) {
      if (v === 'A') continue;
      expect(d(E, positions.get(v)!), `E should not stack onto ${v}`).toBeGreaterThan(0.5);
    }
  });

  it('deterministic: the same commands place the same figure', () => {
    const cmds = [
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'segment', a: 'A', b: 'M' },
    ] as AnyCommand[];
    const p1 = build(cmds).positions.get('M')!;
    const p2 = build(cmds).positions.get('M')!;
    expect(p1).toEqual(p2);
  });

  it('an already-generic placement is untouched (identity spin): a lone anchored segment keeps its default', () => {
    // A alone in the figure: nothing to be degenerate against, so B stays at the template offset (5,0).
    const { positions } = build([
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'segment', a: 'A', b: 'B' },
    ] as AnyCommand[]);
    expect(positions.get('B')).toEqual({ x: 5, y: 0 });
  });
});

describe('direction general position (#34, ADR-287)', () => {
  /** |cross| of the two segment directions, normalized — 0 means exactly parallel. */
  const sinBetween = (p1: Vec, q1: Vec, p2: Vec, q2: Vec) => {
    const d1 = { x: q1.x - p1.x, y: q1.y - p1.y };
    const d2 = { x: q2.x - p2.x, y: q2.y - p2.y };
    return Math.abs(d1.x * d2.y - d1.y * d2.x) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y));
  };

  it('two DISJOINT default segments do not land parallel (the #34 class)', () => {
    const { positions } = build([
      { type: 'segment', a: 'C', b: 'K' },
      { type: 'segment', a: 'A', b: 'O' },
    ] as AnyCommand[]);
    expect(sinBetween(positions.get('C')!, positions.get('K')!, positions.get('A')!, positions.get('O')!)).toBeGreaterThan(0.01);
  });

  it('a 1-anchor default segment is oblique to the existing edges ("square ABCD" + "AE" ∦ every side)', () => {
    const { positions } = build([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'segment', a: 'A', b: 'E' },
    ] as AnyCommand[]);
    const A = positions.get('A')!;
    const E = positions.get('E')!;
    for (const [p, q] of [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']] as const) {
      expect(sinBetween(A, E, positions.get(p)!, positions.get(q)!), `AE should not parallel ${p}${q}`).toBeGreaterThan(1e-4);
    }
  });

  it('the FIRST segment keeps its template default (no edges to be parallel to)', () => {
    const { positions } = build([{ type: 'segment', a: 'A', b: 'B' }] as AnyCommand[]);
    expect(positions.get('A')).toEqual({ x: 0, y: 0 });
    expect(positions.get('B')).toEqual({ x: 5, y: 0 });
  });

  it('named shapes are untouched: two disjoint congruence triangles keep the same canonical orientation', () => {
    const { positions } = build([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'triangle', ids: ['D', 'E', 'F'] },
    ] as AnyCommand[]);
    // base AB and base DE both horizontal — the direction bar deliberately does NOT reorient shapes
    expect(sinBetween(positions.get('A')!, positions.get('B')!, positions.get('D')!, positions.get('E')!)).toBeLessThan(1e-9);
  });
});
