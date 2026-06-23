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
