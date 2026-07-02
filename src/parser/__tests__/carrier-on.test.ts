/**
 * A point ON a diameter / radius carrier ([docs/15-hardening-plan.md] C5 / PAR-5).
 *
 * Two coupled defects made "נקודה D על הרדיוס OB" / "E על הקוטר AB" silently drop the rider point:
 *   1. The `על\b` guards were DEAD — JS `\b` never fires between a Hebrew letter (ל, not \w) and a
 *      space, so `radiusSegment`/`nameCenter` never bailed on an "על" phrasing → `radiusSegment` grabbed
 *      the two-letter run and dropped D. Fix: `על(?=\s|$)`.
 *   2. `קוטר`/`רדיוס` weren't in CARRIER_NOUN, so `pointOnSegment`'s SEG_NOUN couldn't eat "הקוטר"/"הרדיוס"
 *      and the labels didn't align. Fix: add `ה?קוטר|ה?רדיוס` (diameter/radius) to CARRIER_NOUN, plus a
 *      POINT_ON_CARRIER guard on the `diameter` rule (it runs before `pointOnSegment`).
 *
 * The `withCarrierMembership` post-pass then adds the geometric membership: a diameter's endpoints on the
 * circle + collinear-through-centre; a radius's rim point on the circle.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';

const ctx = { circles: ['O'], points: ['A', 'B'] } as const;
const cmds = (u: string, c: unknown = ctx) => {
  const r = parse(u, c as never);
  if (!r.ok) throw new Error(`did not parse: ${JSON.stringify(u)}`);
  return r.commands;
};
const onCircle = (c: ReturnType<typeof cmds>) =>
  c.filter((x) => x.type === 'point-on-circle').map((x) => (x as { id: string }).id).sort();
const onSeg = (c: ReturnType<typeof cmds>) =>
  c.find((x) => x.type === 'point-on-segment') as { id: string; a: string; b: string } | undefined;

describe('PAR-5 — a point ON a diameter is a point on segment AB (+ diameter membership)', () => {
  it('"E על הקוטר AB" → E on segment AB; A,B on circle O + collinear-through-centre', () => {
    const c = cmds('E על הקוטר AB');
    const seg = onSeg(c);
    expect(seg, 'E is placed ON the diameter segment (not dropped)').toBeTruthy();
    expect(seg!.id).toBe('E');
    expect([seg!.a, seg!.b].sort()).toEqual(['A', 'B']);
    expect(onCircle(c), 'the diameter endpoints are on the circle').toEqual(['A', 'B']);
    const col = c.find((x) => x.type === 'set-collinear') as { a: string; b: string; c: string } | undefined;
    expect(col, 'AB passes through the centre → a real diameter').toBeTruthy();
    expect(col!.b).toBe('O');
  });

  it('English "E on diameter AB" behaves the same', () => {
    const c = cmds('E on diameter AB');
    expect(onSeg(c)?.id).toBe('E');
    expect(onCircle(c)).toEqual(['A', 'B']);
  });
});

describe('PAR-5 — a point ON a radius is a point on segment O·rim (+ rim membership)', () => {
  it('"נקודה D על הרדיוס OB" → D on segment OB; B on circle O (rim); D is NOT dropped', () => {
    const c = cmds('נקודה D על הרדיוס OB');
    const seg = onSeg(c);
    expect(seg, 'D is placed ON the radius segment (was dropped by the dead-guard bug)').toBeTruthy();
    expect(seg!.id).toBe('D');
    expect([seg!.a, seg!.b].sort()).toEqual(['B', 'O']);
    expect(onCircle(c), 'only the rim B is on the circle — the centre O is not').toEqual(['B']);
  });

  it('a bare radius "OB רדיוס" (no rider) still routes to radiusSegment — rim on circle + segment', () => {
    const c = cmds('OB רדיוס');
    expect(onCircle(c)).toEqual(['B']);
    expect(c.some((x) => x.type === 'segment'), 'the drawn radius segment').toBe(true);
    expect(c.some((x) => x.type === 'point-on-segment'), 'no rider point').toBe(false);
  });
});
