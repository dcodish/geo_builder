/**
 * #2101 ([ADR-648](../../../docs/06-decisions.md#adr-648)) — a radius letter's value lowers at its BINDING, as a
 * length letter's does at its measure: `radius-symbol` + a `set-var` on the letter → the naming plus `set-radius`.
 */
import { describe, expect, it } from 'vitest';
import { buildSymTab, lower, lowerOne, symbolsConsumedBy, type AnyCommand } from '@/engine';

const CIRCLE = { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand;
const BIND: AnyCommand = { type: 'radius-symbol', circle: 'circle-O', name: 'r' };
const VALUE: AnyCommand = { type: 'set-var', name: 'r', value: 3 };

describe('#2101 — the radius-symbol binding lowers its letter value into the circle size', () => {
  it('without a value the binding stays a name (the radius stays a free DOF, ADR-052)', () => {
    expect(lowerOne(BIND, buildSymTab([CIRCLE, BIND]))).toEqual([BIND]);
  });

  it('with a value — on any row, before or after the binding — it lowers to the naming plus set-radius', () => {
    const want = [BIND, { type: 'set-radius', circle: 'circle-O', value: 3 }];
    expect(lowerOne(BIND, buildSymTab([CIRCLE, BIND, VALUE]))).toEqual(want);
    expect(lowerOne(BIND, buildSymTab([VALUE, CIRCLE, BIND]))).toEqual(want);
    expect(lower([CIRCLE, BIND, VALUE])).toContainEqual({ type: 'set-radius', circle: 'circle-O', value: 3 });
  });

  // #2135 (ADR-681): a second, different value is REFUSED by the letter system — the first value stands (it used to be
  // "the latest value wins", which drew r = 4 with «r = 3» still ✓).
  it('a second, different value is refused and the first one sizes the circle', () => {
    const tab = buildSymTab([CIRCLE, BIND, VALUE, { type: 'set-var', name: 'r', value: 4 }]);
    expect(lowerOne(BIND, tab)).toContainEqual({ type: 'set-radius', circle: 'circle-O', value: 3 });
    expect(tab.refused.get(3)).toEqual({ at: 2, status: 'over-constrained: radius of circle-O = 4 cannot hold' });
  });

  it('a value for ANOTHER letter does not size the circle', () => {
    expect(lowerOne(BIND, buildSymTab([CIRCLE, BIND, { type: 'set-var', name: 'x', value: 3 }]))).toEqual([BIND]);
  });

  it('the binding READS its letter from the table, so ADR-492 blames a conflicting value on the value row', () => {
    expect(symbolsConsumedBy(BIND)).toEqual(['r']);
  });
});
