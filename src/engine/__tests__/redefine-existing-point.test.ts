import { describe, it, expect } from 'vitest';
import { applyStep, evaluate, emptyConstruction } from '@/engine';
import type { Command, Construction, Vec } from '@/engine';

/**
 * "Use the existing point" (ADR-107 Am., generalised): when a placement command names a point that ALREADY
 * EXISTS, it is a CONSTRAINT on that point, never a redefinition error. `reinterpretAsConstraint` now drives
 * the existing point's OWN free DOF — a non-extension on-segment `t`, an on-circle `θ`, or a non-pinned free
 * point (x,y) — to the stated spot (falling back to a free ancestor for a derived/extension point). This
 * covers the whole placement family, so a second, more-specific statement about a point just constrains it.
 */
function build(cmds: Command[]): Construction {
  let c = emptyConstruction();
  for (const cmd of cmds) {
    const r = applyStep(c, cmd);
    expect(r.ok, `${cmd.type}: ${r.ok ? '' : (r as { error: string }).error}`).toBe(true);
    if (r.ok) c = r.construction;
  }
  return c;
}
const pos = (c: Construction) => {
  const e = evaluate(c);
  expect(e.ok).toBe(true);
  return (id: string): Vec => (e.ok ? e.positions.get(id)! : { x: 0, y: 0 });
};
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

describe('redefining an EXISTING point constrains it (ADR-107 Am.)', () => {
  it('on-segment: "A on CD" then A = midpoint of CD → A is the midpoint', () => {
    const p = pos(build([
      { type: 'free-point', id: 'C', x: 0, y: 0 }, { type: 'free-point', id: 'D', x: 8, y: 0 },
      { type: 'point-on-segment', id: 'A', a: 'C', b: 'D' },
      { type: 'midpoint', id: 'A', a: 'C', b: 'D' },
    ] as Command[]));
    expect(dist(p('A'), p('C'))).toBeCloseTo(dist(p('A'), p('D')), 3);
  });

  it('on-segment: "F on AB" then F = foot of ⟂ from C → F is the foot', () => {
    const p = pos(build([
      { type: 'free-point', id: 'A', x: 0, y: 0 }, { type: 'free-point', id: 'B', x: 10, y: 0 }, { type: 'free-point', id: 'C', x: 5, y: 8 },
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'point-on-segment', id: 'F', a: 'A', b: 'B' },
      { type: 'foot', id: 'F', from: 'C', a: 'A', b: 'B' },
    ] as Command[]));
    expect(p('F').x).toBeCloseTo(5, 1);
    expect(p('F').y).toBeCloseTo(0, 1);
  });

  it('on-circle: "D on circle O" then D = arc-midpoint of BC → |DB| = |DC|', () => {
    const p = pos(build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, autoCenter: true },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' }, { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'D', circle: 'circle-O' },
      { type: 'arc-midpoint', id: 'D', circle: 'circle-O', from: 'B', to: 'C' },
    ] as Command[]));
    expect(dist(p('D'), p('B'))).toBeCloseTo(dist(p('D'), p('C')), 2);
  });

  it('on-circle: "D on circle O" then D = circle O ∩ circle P → no "already defined"', () => {
    build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, autoCenter: true },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 4, freeRadius: true, autoCenter: true },
      { type: 'point-on-circle', id: 'D', circle: 'circle-O' },
      { type: 'circle-circle-intersection', id: 'D', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
    ] as Command[]); // build() asserts every step ok
  });

  it('free vertex: triangle ABC then A = midpoint of BC → A driven to the midpoint', () => {
    const p = pos(build([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'midpoint', id: 'A', a: 'B', b: 'C' },
    ] as Command[]));
    expect(p('A').x).toBeCloseTo((p('B').x + p('C').x) / 2, 2);
    expect(p('A').y).toBeCloseTo((p('B').y + p('C').y) / 2, 2);
  });
});

// ── M1 widening (ADR-231): the existing point may be DERIVED (no free DOF of its own) — the statement
// still lowers to a constraint, and the figure's OTHER free DOFs are recruited to satisfy it. This is the
// operator-reported class ("O על ED" where O was the incircle centre → "'O' is already defined",
// prod session fn34ptei 2026-07-06); before the widening every member below hard-conflicted. ──
describe('redefining an existing DERIVED point constrains the figure (M1, ADR-231)', () => {
  it('"M on CD" where M is a midpoint (derived, 0-DOF) → the free vertices flex so M lands ON CD', () => {
    const c = build([
      { type: 'free-point', id: 'C', x: 0, y: 0, free: true }, { type: 'free-point', id: 'D', x: 8, y: 0, free: true },
      { type: 'segment', a: 'C', b: 'D' },
      { type: 'free-point', id: 'A', x: 1, y: 5, free: true }, { type: 'free-point', id: 'B', x: 5, y: 7, free: true },
      { type: 'midpoint', id: 'M', a: 'A', b: 'B' },
      { type: 'point-on-segment', id: 'M', a: 'C', b: 'D' }, // the "O על ED" shape
    ] as Command[]);
    const p = pos(c);
    // M is still the midpoint of AB AND lies on segment CD (collinear + between, the stated order).
    expect(p('M').x).toBeCloseTo((p('A').x + p('B').x) / 2, 2);
    expect(p('M').y).toBeCloseTo((p('A').y + p('B').y) / 2, 2);
    const cross = (p1: Vec, p2: Vec, q: Vec) => (p2.x - p1.x) * (q.y - p1.y) - (p2.y - p1.y) * (q.x - p1.x);
    expect(Math.abs(cross(p('C'), p('D'), p('M')))).toBeLessThan(0.05 * dist(p('C'), p('D')));
    const t = dist(p('C'), p('M')) / dist(p('C'), p('D'));
    expect(t).toBeGreaterThan(-0.01);
    expect(t).toBeLessThan(1.01); // BETWEEN C and D — "on CD" means the segment, not the line (ADR-077)
  });

  it('a second placement of a derived point with NO free param ancestor recruits the free vertices', () => {
    // F is the foot from C to AB — fully derived, and its ancestors (A, B, C) are 2-DOF free points the
    // old param-only walk could not use. "F = midpoint of AB" must move C until the foot IS the midpoint.
    const c = build([
      { type: 'free-point', id: 'A', x: 0, y: 0, free: true }, { type: 'free-point', id: 'B', x: 10, y: 0, free: true },
      { type: 'free-point', id: 'C', x: 2, y: 6, free: true },
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'foot', id: 'F', from: 'C', a: 'A', b: 'B' },
      { type: 'midpoint', id: 'F', a: 'A', b: 'B' },
    ] as Command[]);
    const p = pos(c);
    expect(p('F').x).toBeCloseTo((p('A').x + p('B').x) / 2, 1);
    expect(p('F').y).toBeCloseTo((p('A').y + p('B').y) / 2, 1);
  });

  it('re-stating a truth about a derived point passes as a check ("M on AB" where M = midpoint of AB)', () => {
    build([
      { type: 'free-point', id: 'A', x: 0, y: 0 }, { type: 'free-point', id: 'B', x: 6, y: 2 },
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'midpoint', id: 'M', a: 'A', b: 'B' },
      { type: 'point-on-segment', id: 'M', a: 'A', b: 'B' }, // already true — a check, never a conflict
    ] as Command[]); // build() asserts every step ok
  });

  it('a genuinely impossible second placement reports the RELATION, not "already defined"', () => {
    // The square's C can never be 5 from A and 5 from B while |AB| = 5 stays rigid (|CA| = 5√2).
    const sq = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }] as Command[]);
    const r = applyStep(sq, { type: 'point-by-distances', id: 'C', from1: 'A', dist1: 5, from2: 'B', dist2: 5 } as Command);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).not.toMatch(/already defined/i);
      expect(r.error).not.toMatch(/~/); // hidden helper ids never leak
    }
  });
});
