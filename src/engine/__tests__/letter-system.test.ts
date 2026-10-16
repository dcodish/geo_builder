/**
 * #2165 + #2135 + #2133 ([ADR-681](../../../docs/06-decisions.md#adr-681)) — the letter system, on its own: every source of
 * a letter's value judged in list order, the derived values the lowering reads, and the refusals with their provenance.
 */
import { describe, expect, it } from 'vitest';
import { buildSymTab, letterSystem, lowerOne, measureLabelText } from '@/engine';
import type { AnyCommand, Id } from '@/engine';

const len = (a: Id, b: Id, coef: number, v: string, k?: number): AnyCommand => ({ type: 'measure-length', a, b, expr: { coef, var: v, ...(k ? { const: k } : {}) } });
const ang = (vertex: Id, ray1: Id, ray2: Id, coef: number, v: string, k?: number): AnyCommand => ({ type: 'measure-angle', vertex, ray1, ray2, expr: { coef, var: v, ...(k ? { const: k } : {}) } });
const num = (a: Id, b: Id, value: number): AnyCommand => ({ type: 'set-distance', a, b, value });
const val = (name: string, value: number): AnyCommand => ({ type: 'set-var', name, value });
const CIRCLE3: AnyCommand = { type: 'circle', id: 'circle-O', center: 'O', radius: 3 };
const FREE: AnyCommand = { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true };
const BIND_r: AnyCommand = { type: 'radius-symbol', circle: 'circle-O', name: 'r' };

describe('letterSystem — consistent rows determine letters', () => {
  it('two expressions on one segment solve the letter: 2a = a + 3 → a = 3', () => {
    const tab = buildSymTab([len('A', 'B', 2, 'a'), len('A', 'B', 1, 'a', 3)]);
    expect(tab.vars.get('a')).toMatchObject({ derived: 3 });
    expect(tab.vars.get('a')!.value).toBeUndefined(); // derived, not stated
    expect(tab.refused.size).toBe(0);
  });

  it('either spelling order of the segment is one target', () => {
    expect(buildSymTab([len('A', 'B', 2, 'a'), len('B', 'A', 1, 'a', 3)]).vars.get('a')!.derived).toBe(3);
  });

  it('a number on the target determines the letter, whichever comes first', () => {
    expect(buildSymTab([num('A', 'B', 6), len('A', 'B', 2, 'a')]).vars.get('a')!.derived).toBe(3);
    expect(buildSymTab([len('A', 'B', 2, 'a'), num('A', 'B', 6)]).vars.get('a')!.derived).toBe(3);
  });

  it('an angle: 2α = α + 40 → α = 40', () => {
    expect(buildSymTab([ang('B', 'A', 'C', 2, 'α'), ang('B', 'C', 'A', 1, 'α', 40)]).vars.get('α')!.derived).toBe(40);
  });

  it('the lowering reads the derived value (a pin), the label reads the stated value only (the letters)', () => {
    const cmds = [len('A', 'B', 2, 'a'), len('A', 'B', 1, 'a', 3), len('C', 'D', 1, 'a')];
    const tab = buildSymTab(cmds);
    expect(lowerOne(cmds[2], tab)).toEqual([{ type: 'set-distance', a: 'C', b: 'D', value: 3 }]);
    expect(measureLabelText(cmds[0] as Extract<AnyCommand, { type: 'measure-length' }>, tab)).toBe('2a');
  });

  it('a radius letter on a stated circle takes its radius', () => {

    expect(letterSystem([CIRCLE3, { type: 'radius-symbol', circle: 'circle-O', name: 'k' }], new Map()).values.get('k')?.derived).toBe(3);
  });

  it('multi-letter equations and powers add nothing (the ratio lowering keeps them)', () => {
    expect(buildSymTab([len('A', 'B', 1, 'a'), len('C', 'D', 1, 'b'), len('A', 'B', 2, 'b')]).refused.size).toBe(0);
    const pow: AnyCommand = { type: 'measure-length', a: 'A', b: 'B', expr: { coef: 1, var: 'a', pow: 2 } };
    const tab = buildSymTab([pow, len('A', 'B', 1, 'a', 2)]);
    expect(tab.vars.get('a')!.derived).toBeUndefined();
    expect(tab.refused.size).toBe(0);
  });
});

describe('letterSystem — inconsistent rows are refused with the statement they contradict', () => {
  it('#2135: a second, different value — the first stands', () => {
    const cmds = [len('A', 'B', 1, 'x'), val('x', 3), val('x', 4)];
    const tab = buildSymTab(cmds);
    expect(tab.vars.get('x')!.value).toBe(3);
    expect(tab.refused.get(2)).toEqual({ at: 1, status: 'over-constrained: |AB| = 4 cannot hold' });
    expect(lowerOne(cmds[0], tab)).toEqual([{ type: 'set-distance', a: 'A', b: 'B', value: 3 }]);
  });

  it('a value against a derived one names the number that supplied it', () => {
    const tab = buildSymTab([len('A', 'B', 1, 'a'), num('A', 'B', 5), val('a', 6)]);
    expect(tab.refused.get(2)).toEqual({ at: 1, status: 'over-constrained: |AB| = 6 cannot hold' });
  });

  it('0 = c: the same letter and coefficient with another constant (ADR-662) — the earlier expression', () => {
    expect(buildSymTab([ang('B', 'A', 'C', 1, 'α'), ang('B', 'A', 'C', 1, 'α', 40)]).refused.get(1)).toEqual({ at: 0, status: 'over-constrained: ∠ABC = α + 40 cannot hold' });
  });

  it('an inadmissible value: 2a = 3a → a = 0 (ADR-661\'s coefficient conflict, in its own sentence)', () => {
    expect(buildSymTab([len('A', 'B', 2, 'a'), len('A', 'B', 3, 'a')]).refused.get(1)).toEqual({ at: 0, status: 'over-constrained: |AB| = 3a cannot hold' });
  });

  it('a refused row\'s equations are dropped for the rows after it', () => {
    const tab = buildSymTab([len('A', 'B', 1, 'x'), val('x', 3), val('x', 4), len('C', 'D', 1, 'x')]);
    expect(tab.vars.get('x')!.value).toBe(3);
    expect(tab.refused.has(3)).toBe(false);
  });

  it('#2135 radius: «r = 4» after «r = 3» on «מעגל O ברדיוס r» is a radius conflict', () => {
    expect(buildSymTab([FREE, BIND_r, val('r', 3), val('r', 4)]).refused.get(3)).toEqual({ at: 2, status: 'over-constrained: radius of circle-O = 4 cannot hold' });
  });

  it('#2133: the reserved r names the ONE stated radius, also when it is given a value', () => {
    const cmds: AnyCommand[] = [{ type: 'circle', id: 'circle-O', center: 'O', radius: 4 }, { type: 'point-on-circle', id: 'A', circle: 'circle-O' }, { type: 'point-on-circle', id: 'B', circle: 'circle-O' }, len('A', 'B', 1, 'r'), val('r', 3)];
    const tab = buildSymTab(cmds);
    expect(tab.refused.get(4)).toEqual({ at: 0, status: 'over-constrained: radius of circle-O = 3 cannot hold' });
    expect(lowerOne(cmds[3], tab)).toEqual([{ type: 'set-distance', a: 'A', b: 'B', value: 4 }]);
  });

  it('«r = 4» on a circle of radius 3, with no other use of r', () => {
    expect(buildSymTab([CIRCLE3, val('r', 4)]).refused.get(1)).toEqual({ at: 0, status: 'over-constrained: radius of circle-O = 4 cannot hold' });
  });

  it('the reserved r is NOT bound when two circles have a stated radius (unruled — today\'s reading kept)', () => {
    const P: AnyCommand = { type: 'circle', id: 'circle-P', center: 'P', radius: 5 };
    expect(buildSymTab([CIRCLE3, P, val('r', 4)]).refused.size).toBe(0);
  });

  it('a value for a letter nothing binds waits (#926) — it contradicts nothing yet', () => {
    expect(buildSymTab([val('x', 3), val('x', 4)]).refused.size).toBe(0);
  });
});
