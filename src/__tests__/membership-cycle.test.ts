/**
 * ADR-354 (issue #202) — a membership statement about an existing point, on a circle whose own
 * definition transitively depends on that point, must LOWER to a size/constraint on the circle —
 * never convert the point into a rider of that circle (the ADR-093 inverted-dependency class:
 * C → circle-O → O → C refused by evaluate as "unresolved dependencies").
 *
 * Class tests per docs/17 §6: both end orders (M2 — entry order must not change build success),
 * the minimal membership repro, and the untouched independent-circle conversion path (c2).
 */
import { describe, it, expect } from 'vitest';
import { run, at, dist, allStepsOk } from './scenarios-corpus';

const BASE = ['ABC משולש ישר זוית', 'AC=15', 'BC=10', 'O על AC', 'D על AB'];

describe('ADR-354 — membership on a point the circle depends on', () => {
  it('minimal repro: «C על מעגל O» with O riding AC sizes the circle through C (no cycle)', () => {
    const fig = run(['ABC משולש ישר זוית', 'O על AC', 'מעגל O', 'C על מעגל O']);
    allStepsOk(fig);
    const circle = fig.circles.get('circle-O')!;
    expect(circle, 'circle resolved').toBeTruthy();
    expect(dist(at(fig, 'C'), circle.center), 'C on the circle').toBeCloseTo(circle.r, 4);
  });

  for (const [name, quarter] of [
    ['OCD (C membership first — the refused order)', 'OCD רבע מעגל'],
    ['ODC (D membership first — the order that worked)', 'רבע מעגל ODC'],
  ] as const) {
    it(`quarter end order ${name} builds to r=6`, () => {
      const fig = run([...BASE, quarter]);
      allStepsOk(fig);
      expect(dist(at(fig, 'O'), at(fig, 'C'))).toBeCloseTo(6, 2);
      expect(dist(at(fig, 'O'), at(fig, 'D'))).toBeCloseTo(6, 2);
    });
  }

  it('control: membership on an INDEPENDENT circle still converts the free vertex onto it (c2 path)', () => {
    // The circle depends on neither vertex, so the ADR-033 "shapes carry their true DOF" conversion
    // must keep firing: declaring a quad corner on the circle makes it genuinely ride the circle.
    const fig = run(['מעגל O', 'מרובע ABCD', 'C על מעגל O', 'D על מעגל O']);
    allStepsOk(fig);
    const circle = fig.circles.get('circle-O')!;
    for (const id of ['C', 'D']) expect(dist(at(fig, id), circle.center), `${id} on the circle`).toBeCloseTo(circle.r, 3);
  });
});
