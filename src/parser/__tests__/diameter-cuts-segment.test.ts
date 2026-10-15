/**
 * "the diameter from F cuts AC at E" / "קוטר המעגל מנקודה F חותך את AC בנקודה E" (ADR-077). The
 * diameter through an on-circle point F is the line F–O (O the centre); it meets a side AC at E.
 * A bare "AC" (or "side AC") is the SEGMENT/edge, so by DEFAULT E is constrained BETWEEN A and C
 * (set-line [A,E,C]) and the figure flexes to keep E on the segment rather than its extension; only
 * an explicit "the LINE AC" opts out. Previously this escalated to the LLM (lineLineIntersection
 * `stop`s on "קוטר") and the line∩line crossing put E on the continuation of AC.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';

// F is ON circle O here (the rule's precondition); a new or off-circle F is the #2056 block below
const ctx = { circles: ['O'], points: ['A', 'B', 'C', 'F', 'O'], circleMembers: [{ id: 'circle-O', center: 'O', points: ['F'] }] };
const CUT = [
  { type: 'line-line-intersection', id: 'E', a: 'F', b: 'O', c: 'A', d: 'C', dir1: true },
  { type: 'set-line', points: ['A', 'E', 'C'] }, // E between A and C ⇒ on the side
  { type: 'segment', a: 'F', b: 'E' },
];

describe('parse — diameter from a point cuts a side at a new point', () => {
  it('a BARE "AC" defaults to the segment (the operator wording): intersection + order + chord', () => {
    const r = parse('קוטר המעגל מנקודה F חותך את AC בנקודה E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual(CUT);
  });

  it('explicit "הצלע AC" (side) also constrains E to the segment', () => {
    const r = parse('קוטר המעגל היוצא מנקודה F חותך את הצלע AC בנקודה E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual(CUT);
  });

  it('English phrasing', () => {
    const r = parse('the diameter of the circle from F cuts AC at E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual(CUT);
  });

  it('only an explicit "the LINE AC" omits the segment-order constraint (E free on the infinite line)', () => {
    const r = parse('קוטר המעגל היוצא מנקודה F חותך את הישר AC בנקודה E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'set-line')).toBe(false);
    expect(r.commands[0]).toEqual({ type: 'line-line-intersection', id: 'E', a: 'F', b: 'O', c: 'A', d: 'C', dir1: true });
  });

  it('"המשך AC" (the extension of the side) puts E BEYOND the segment — dir2, no segment-order', () => {
    const r = parse('קוטר המעגל מנקודה F חותך את המשך AC בנקודה E', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'set-line')).toBe(false); // not kept on the segment
    expect(r.commands[0]).toEqual({ type: 'line-line-intersection', id: 'E', a: 'F', b: 'O', c: 'A', d: 'C', dir1: true, dir2: true });
  });

  it('a bare "diameter AB" (no cut) is the diameter rule, NOT diameterCutsSegment', () => {
    // A,B do NOT exist yet ⇒ the plain `diameter` command (create the diameter on circle O).
    const fresh = parse('diameter AB', { circles: ['O'], points: ['O'] });
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    expect(fresh.commands).toEqual([{ type: 'diameter', id1: 'A', id2: 'B', circle: 'circle-O' }]);
    // A,B ALREADY EXIST on circle O (the membership hint says so) ⇒ "AB is a diameter" is a CONSTRAINT
    // on the existing chord (the centre lies on AB), never a re-creation of A,B (which errors "'B' is
    // already defined"). [ADR-137] Either way it is the diameter family, NOT diameterCutsSegment (no
    // line-line-intersection).
    const existing = parse('diameter AB', { circles: ['O'], points: ['A', 'B', 'O'], circleMembers: [{ center: 'O', points: ['A', 'B'] }] });
    expect(existing.ok).toBe(true);
    if (!existing.ok) return;
    expect(existing.commands).toEqual([{ type: 'set-collinear', a: 'A', b: 'O', c: 'B' }]);
    // A,B exist but are NOT known members (free points some earlier given created) ⇒ the constraint form
    // also asserts the memberships — existence is not membership (ADR-241); a bare collinearity would let
    // "AB is a diameter" hold with A,B floating off the circle.
    const free = parse('diameter AB', { circles: ['O'], points: ['A', 'B', 'O'] });
    expect(free.ok).toBe(true);
    if (!free.ok) return;
    expect(free.commands).toEqual([
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'set-collinear', a: 'A', b: 'O', c: 'B' },
    ]);
  });
});

/**
 * #2056 ([ADR-663](../../../docs/06-decisions.md#adr-663)) — «קוטר מעגל O היוצא מנקודה F חותך את הצלע AC בנקודה E»
 * names F as an END of a diameter of circle O, so F is on circle O. `diameterCutsSegment` lowered only the crossing
 * (line F–O with AC) and dropped the membership. It now asserts it through `circleMembership`, the predicate the arc
 * post-pass and `diameterFromPoint` share: a new F is created on the circle, an existing F off it is lowered onto it,
 * and a member F gets nothing.
 */
const LINE = 'קוטר מעגל O היוצא מנקודה F חותך את הצלע AC בנקודה E';
const triangle = ['A', 'B', 'C', 'O'];
const cmds = (u: string, at: Parameters<typeof parse>[1]): AnyCommand[] => {
  const r = parse(u, at);
  expect(r.ok, u).toBe(true);
  return r.ok ? (r.commands as AnyCommand[]) : [];
};
const membershipsOf = (cs: AnyCommand[]) => cs.filter((c) => c.type === 'point-on-circle');

describe('#2056 — the diameter-cut sentence puts its from-point on the circle', () => {
  it('a NEW F is created on circle O, before the crossing that uses it', () => {
    const cs = cmds(LINE, { points: triangle, circles: ['O'], circleMembers: [{ id: 'circle-O', center: 'O', points: [] }] });
    expect(membershipsOf(cs)).toEqual([{ type: 'point-on-circle', id: 'F', circle: 'circle-O' }]);
    expect(cs[0].type).toBe('point-on-circle');
    expect(cs.map((c) => c.type)).toEqual(['point-on-circle', 'line-line-intersection', 'set-line', 'segment']);
  });

  it('an EXISTING F off the circle is put on it (M1 lowering of the membership)', () => {
    const cs = cmds(LINE, { points: [...triangle, 'F'], circles: ['O'], circleMembers: [{ id: 'circle-O', center: 'O', points: [] }] });
    expect(membershipsOf(cs)).toEqual([{ type: 'point-on-circle', id: 'F', circle: 'circle-O' }]);
  });

  it('an F already on the circle gets nothing new (the «F על המעגל» control)', () => {
    const cs = cmds(LINE, { points: [...triangle, 'F'], circles: ['O'], circleMembers: [{ id: 'circle-O', center: 'O', points: ['F'] }] });
    expect(membershipsOf(cs)).toEqual([]);
  });

  it('the English sentence lowers the same way', () => {
    const he = cmds(LINE, { points: triangle, circles: ['O'], circleMembers: [{ id: 'circle-O', center: 'O', points: [] }] });
    const en = cmds('the diameter of circle O from F cuts AC at E', { points: triangle, circles: ['O'], circleMembers: [{ id: 'circle-O', center: 'O', points: [] }] });
    expect(membershipsOf(en)).toEqual(membershipsOf(he));
  });

  it('the cut-less sibling keeps its behaviour: a new F is created by `diameter`, an existing one is lowered', () => {
    const fresh = cmds('קוטר מנקודה F', { points: [], circles: ['O'], circleMembers: [{ id: 'circle-O', center: 'O', points: [] }] });
    expect(fresh.map((c) => c.type)).toEqual(['diameter']);
    const existing = cmds('קוטר מנקודה F', { points: ['F'], circles: ['O'], circleMembers: [{ id: 'circle-O', center: 'O', points: [] }] });
    expect(existing.map((c) => c.type)).toEqual(['point-on-circle', 'diameter']);
    const member = cmds('קוטר מנקודה F', { points: ['F'], circles: ['O'], circleMembers: [{ id: 'circle-O', center: 'O', points: ['F'] }] });
    expect(member.map((c) => c.type)).toEqual(['diameter']);
  });
});
