/**
 * #2111 ([ADR-699](../../../docs/06-decisions.md#adr-699)) — the reserved radius letter keeps naming its circle once it
 * has a value. On a bare circle the measure row «AB = r» is the letter's binding (as `radius-symbol` is for «מעגל O
 * ברדיוס r», ADR-648), so a stated «r = 3» lowers into the circle's size beside the coupling — it is not moved onto AB.
 */
import { describe, expect, it } from 'vitest';
import { buildSymTab, lowerOne, type AnyCommand } from '@/engine';

const CIRCLE = { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand;
const ON_A = { type: 'point-on-circle', id: 'A', circle: 'circle-O', theta: 0.3 } as AnyCommand;
const ON_B = { type: 'point-on-circle', id: 'B', circle: 'circle-O', theta: 1.7 } as AnyCommand;
const measure = (coef: number, v = 'r') => ({ type: 'measure-length', a: 'A', b: 'B', expr: { var: v, coef } }) as AnyCommand;
const value = (v = 'r', n = 3) => ({ type: 'set-var', name: v, value: n }) as AnyCommand;
const couple = (k: number) => ({ type: 'set-length-radius', a: 'A', b: 'B', circle: 'circle-O', center: 'O', witness: 'A', k });

describe('#2111 — a valued reserved r still names the free circle it named, and sizes it', () => {
  it('without a value: the coupling alone (ADR-071 unchanged — the free radius is not frozen)', () => {
    const m = measure(1);
    expect(lowerOne(m, buildSymTab([CIRCLE, ON_A, ON_B, m]))).toEqual([couple(1)]);
  });

  it.each([
    ['value after the measure', (m: AnyCommand) => [CIRCLE, ON_A, ON_B, m, value()]],
    ['value before the measure', (m: AnyCommand) => [CIRCLE, value(), ON_A, ON_B, m]],
  ])('%s: the coupling plus set-radius on that circle', (_l, list) => {
    const m = measure(1);
    expect(lowerOne(m, buildSymTab(list(m)))).toEqual([couple(1), { type: 'set-radius', circle: 'circle-O', value: 3 }]);
  });

  it('a coefficient rides on the coupling, the value on the circle («AB = 2r» · «r = 3»)', () => {
    const m = measure(2);
    expect(lowerOne(m, buildSymTab([CIRCLE, ON_A, ON_B, m, value()]))).toEqual([couple(2), { type: 'set-radius', circle: 'circle-O', value: 3 }]);
  });

  it('upper-case R is the same reserved letter', () => {
    const m = measure(1, 'R');
    expect(lowerOne(m, buildSymTab([CIRCLE, ON_A, ON_B, m, value('R')]))).toContainEqual({ type: 'set-radius', circle: 'circle-O', value: 3 });
  });

  it('no point on the circle: nothing names a radius, the value stays a plain length (unchanged)', () => {
    const m = measure(1);
    expect(lowerOne(m, buildSymTab([CIRCLE, m, value()]))).toEqual([{ type: 'set-distance', a: 'A', b: 'B', value: 3 }]);
  });

  it('another letter is not the radius', () => {
    const m = measure(1, 'x');
    expect(lowerOne(m, buildSymTab([CIRCLE, ON_A, ON_B, m, value('x')]))).toEqual([{ type: 'set-distance', a: 'A', b: 'B', value: 3 }]);
  });

  it('an explicit radius-symbol binding keeps its own lowering (#2101): the measure couples, the binding sizes', () => {
    const bind = { type: 'radius-symbol', circle: 'circle-O', name: 'r' } as AnyCommand;
    const m = measure(1);
    const tab = buildSymTab([CIRCLE, bind, ON_A, ON_B, m, value()]);
    expect(lowerOne(m, tab)).toEqual([couple(1)]);
    expect(lowerOne(bind, tab)).toEqual([bind, { type: 'set-radius', circle: 'circle-O', value: 3 }]);
  });
});
