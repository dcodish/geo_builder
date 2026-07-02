/**
 * chord + a relation tail no longer swallows the length ([docs/15-hardening-plan.md] C3 / PAR-1).
 *
 * The `chord`/`מיתר` rule ran before every measure rule and grabbed only the first label pair, silently
 * discarding a trailing "= 6" (the operator's `מיתר AB=2`). Fix: `chord` bails when the utterance carries a
 * relation operator (`=`/`<`/`>`), so the measure/equality rule claims the length AND draws the segment,
 * from which `withChordMembership` re-asserts the endpoints on the circle — the full correct command set.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';

const ctx = { circles: ['O'], points: ['A', 'B', 'C', 'D'] } as const;
const cmds = (u: string) => {
  const r = parse(u, ctx as never);
  if (!r.ok) throw new Error(`did not parse: ${JSON.stringify(u)}`);
  return r.commands;
};
const onCircle = (c: ReturnType<typeof cmds>) =>
  c.filter((x) => x.type === 'point-on-circle').map((x) => (x as { id: string }).id).sort();

describe('PAR-1 — chord with a "= length" keeps the length AND the circle membership', () => {
  it('"מיתר AB=2" (the operator case) → A,B on circle O + segment AB + |AB|=2', () => {
    const c = cmds('מיתר AB=2');
    const dist = c.find((x) => x.type === 'set-distance') as { a: string; b: string; value: number } | undefined;
    expect(dist, 'the length is NOT dropped').toBeTruthy();
    expect([dist!.a, dist!.b].sort()).toEqual(['A', 'B']);
    expect(dist!.value).toBe(2);
    expect(onCircle(c), 'A,B re-asserted on the circle').toEqual(['A', 'B']);
    expect(c.some((x) => x.type === 'segment'), 'the chord segment is drawn').toBe(true);
  });

  it('English "chord AB = 6" behaves the same', () => {
    const c = cmds('chord AB = 6');
    expect((c.find((x) => x.type === 'set-distance') as { value: number } | undefined)?.value).toBe(6);
    expect(onCircle(c)).toEqual(['A', 'B']);
  });

  it('"chord AB = CD" (equal chords, bare labels) → both on circle + set-equal', () => {
    const c = cmds('chord AB = CD');
    expect(c.some((x) => x.type === 'set-equal'), 'the equality is kept').toBe(true);
    expect(onCircle(c)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('a plain "chord AB" (no relation) is unaffected — still membership + segment, no distance', () => {
    const c = cmds('chord AB');
    expect(onCircle(c)).toEqual(['A', 'B']);
    expect(c.some((x) => x.type === 'segment')).toBe(true);
    expect(c.some((x) => x.type === 'set-distance')).toBe(false);
  });
});

describe('PAR-4 — diameter membership is generalized (withCarrierMembership)', () => {
  const collinear = (c: ReturnType<typeof cmds>) => c.find((x) => x.type === 'set-collinear') as { a: string; b: string; c: string } | undefined;

  it('"קוטר AB=10" → A,B on circle + collinear-through-centre (a real DIAMETER) + |AB|=10', () => {
    const c = cmds('קוטר AB=10');
    expect((c.find((x) => x.type === 'set-distance') as { value: number } | undefined)?.value).toBe(10);
    expect(onCircle(c)).toEqual(['A', 'B']);
    const col = collinear(c);
    expect(col, 'collinear-through-centre added → it is a diameter, not just a chord').toBeTruthy();
    expect([col!.a, col!.c].sort()).toEqual(['A', 'B']);
    expect(col!.b).toBe('O'); // through the centre
  });

  it('"הקוטר AB מאונך למיתר CD" → A,B,C,D on circle + AB collinear-through-centre + ⟂ (PAR-4 headline)', () => {
    const c = cmds('הקוטר AB מאונך למיתר CD');
    expect(c.some((x) => x.type === 'set-perpendicular'), 'the ⟂ relation is kept').toBe(true);
    expect(onCircle(c), 'both the diameter and the chord are on the circle').toEqual(['A', 'B', 'C', 'D']);
    const col = collinear(c);
    expect([col!.a, col!.c].sort(), 'the diameter AB passes through the centre').toEqual(['A', 'B']);
    expect(col!.b).toBe('O');
  });

  it('a plain "diameter AB" (A,B exist) still routes to the diameter rule — one collinear, no double', () => {
    const c = cmds('diameter AB');
    expect(c.filter((x) => x.type === 'set-collinear').length, 'exactly one collinear (no duplicate from the post-pass)').toBe(1);
  });
});
