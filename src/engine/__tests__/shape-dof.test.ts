/**
 * Shape degrees of freedom (ADR-033) — every shape carries the DOF the real shape has,
 * so a sizing/shaping constraint reshapes it instead of being a spurious over-constraint.
 * The fix made the hard-coded scalars (perp-offset dist, rotated angle, scaled-offset k)
 * solver-driveable, and dropped the square's rigid flag. A constraint that genuinely
 * CAN'T hold (a non-90° angle in a square) is still rejected.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { dist, angleDeg } from '@/engine';
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

describe('a sizing/shaping constraint reshapes each shape (no longer a locked dimension)', () => {
  it('square: a side length resizes it to N×N', () => {
    const d = replay(facts('square ABCD', 'AB = 10'));
    expect(d.lastError).toBeNull();
    expect(L(d.positions, 'A', 'B')).toBeCloseTo(10, 2);
    expect(L(d.positions, 'B', 'C')).toBeCloseTo(10, 2);
    expect(A(d.positions, 'B', 'A', 'C')).toBeCloseTo(90, 1);
  });

  it('rectangle: a height (BC) sets the height; the opposite side follows, angles stay 90°', () => {
    const d = replay(facts('rectangle ABCD', 'BC = 10'));
    expect(d.lastError).toBeNull();
    expect(L(d.positions, 'B', 'C')).toBeCloseTo(10, 2);
    expect(L(d.positions, 'A', 'D')).toBeCloseTo(10, 2); // single height DOF — BC and AD can't diverge
    expect(A(d.positions, 'B', 'A', 'C')).toBeCloseTo(90, 1);
  });

  it('rectangle: the height is reachable via the OTHER side too (|AD| through the recruit)', () => {
    const d = replay(facts('rectangle ABCD', 'AD = 10'));
    expect(d.lastError).toBeNull();
    expect(L(d.positions, 'A', 'D')).toBeCloseTo(10, 2);
    expect(L(d.positions, 'B', 'C')).toBeCloseTo(10, 2);
  });

  it('rhombus: an angle sets the angle; all four sides stay equal', () => {
    const d = replay(facts('rhombus ABCD', 'angle ABC = 80'));
    expect(d.lastError).toBeNull();
    expect(A(d.positions, 'B', 'A', 'C')).toBeCloseTo(80, 1);
    const s = L(d.positions, 'A', 'B');
    for (const [x, y] of [['B', 'C'], ['C', 'D'], ['D', 'A']] as const) expect(L(d.positions, x, y)).toBeCloseTo(s, 2);
  });

  it('trapezoid: the short side (DC) is sizable; it stays parallel to AB', () => {
    const d = replay(facts('trapezoid ABCD', 'DC = 2'));
    expect(d.lastError).toBeNull();
    expect(L(d.positions, 'D', 'C')).toBeCloseTo(2, 2);
    // AB ∥ DC: the cross product of the two edge directions is ~0
    const A0 = d.positions.get('A')!, B0 = d.positions.get('B')!, C0 = d.positions.get('C')!, D0 = d.positions.get('D')!;
    const ab = { x: B0.x - A0.x, y: B0.y - A0.y };
    const dc = { x: C0.x - D0.x, y: C0.y - D0.y };
    expect(Math.abs(ab.x * dc.y - ab.y * dc.x)).toBeLessThan(1e-3);
  });

  it('right-triangle: a leg (CB) is sizable; the right angle at C is preserved', () => {
    const d = replay(facts('right triangle ABC', 'CB = 12'));
    expect(d.lastError).toBeNull();
    expect(L(d.positions, 'C', 'B')).toBeCloseTo(12, 2);
    expect(A(d.positions, 'C', 'A', 'B')).toBeCloseTo(90, 1);
  });

  it('a length on a free-leg right-triangle sizes the figure THROUGH the construction (|BD| with D a bisector meet)', () => {
    const d = replay(
      facts(
        'right triangle ABC',
        'bisector of angle CAB',
        'bisector of angle ABC',
        'D is the intersection of the bisectors of CAB and ABC',
        'BD = 12√2',
      ),
    );
    expect(d.lastError).toBeNull();
    expect(L(d.positions, 'B', 'D')).toBeCloseTo(12 * Math.sqrt(2), 2);
    expect(A(d.positions, 'C', 'A', 'B')).toBeCloseTo(90, 1);
  });

  it("the full bagrut figure: two coupled length givens through the incenter solve to the real triangle", () => {
    // Right △ABC, the two angle bisectors meet at D (incenter); |BD| = 12√2 and |AC| = 1.4·|AD|
    // (= 7k/5 with AD = k). The unique consistent triangle is CA = 5.6, CB = 19.2 (k = 4). The
    // solver must find THAT — not a degenerate/shrunk config that fakes the numbers (ADR-033).
    const d = replay(
      facts(
        'right triangle ABC',
        'bisector of angle CAB',
        'bisector of angle ABC',
        'D is the intersection of the bisectors of CAB and ABC',
        'BD = 12√2',
        'AD = k',
        'AC = 7k/5',
      ),
    );
    expect(d.lastError).toBeNull();
    expect(L(d.positions, 'B', 'D')).toBeCloseTo(12 * Math.sqrt(2), 1);
    expect(L(d.positions, 'A', 'C') / L(d.positions, 'A', 'D')).toBeCloseTo(1.4, 2); // the REAL ratio, not a shrunk fake
    expect(L(d.positions, 'C', 'A')).toBeCloseTo(5.6, 1); // 7k/5, k=4
    expect(L(d.positions, 'C', 'B')).toBeCloseTo(19.2, 1); // 24k/5, k=4
    expect(A(d.positions, 'C', 'A', 'B')).toBeCloseTo(90, 1);
  });
});

describe('a perpendicular places a point on the EXTENSION (the ⟂ foot past an endpoint)', () => {
  it('"CF ⟂ DF" with F on the extension of AD lands F at the foot, NOT collapsed onto D', () => {
    const d = replay(facts('rhombus ABCD', 'angle ADC = 120', 'point F on the extension of AD', 'CF perpendicular to DF'));
    expect(d.lastError).toBeNull();
    expect(A(d.positions, 'F', 'C', 'D')).toBeCloseTo(90, 1); // CF ⟂ DF holds
    expect(L(d.positions, 'D', 'F')).toBeGreaterThan(0.5); // F is genuinely off D
    // F stays on line AD (collinear with A, D)
    const Ap = d.positions.get('A')!, Dp = d.positions.get('D')!, Fp = d.positions.get('F')!;
    expect(Math.abs((Dp.x - Ap.x) * (Fp.y - Ap.y) - (Dp.y - Ap.y) * (Fp.x - Ap.x))).toBeLessThan(1e-3);
  });
});

describe('a genuinely impossible constraint is still rejected (honest over-constraint)', () => {
  it('square: a non-90° angle can\'t hold (the guard keeps the prior figure)', () => {
    const d = replay(facts('square ABCD', 'angle ABC = 80'));
    expect(d.lastError).toMatch(/over-constrained/i);
  });
});
