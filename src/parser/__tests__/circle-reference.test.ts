/**
 * #430 (ADR-422): a definite/implicit circle reference resolves through ONE seam.
 *
 * Reported by triage: after «חצי מעגל», «משולש CDE חסום במעגל» ("triangle CDE inscribed in THE circle")
 * built a SECOND, unrelated circle and inscribed the triangle in that — C, D, E measured 11.695 / 4.043
 * / 12.288 from the semicircle's centre, with `lastError: null` and no verifier violation. Completely
 * silent: nothing on screen told the student the tool had not understood.
 *
 * Class: *a definite circle reference is resolved by some circle-consuming rules and silently
 * re-created by others, because each rule decides for itself instead of asking one seam.*
 * `pointOnCircle` bound the very same reference correctly — so the rules disagreed with each other about
 * whether a hidden circle is a referent at all.
 *
 * These lock the seam itself (the scenarios lock the end-to-end figures).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

/** Lower a sequence through the real parse-with-context path; return the LAST step's commands. */
function lowerLast(steps: string[]): AnyCommand[] {
  let facts: Fact[] = [];
  let last: AnyCommand[] = [];
  steps.forEach((u, gi) => {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`did not parse: ${u} (${JSON.stringify(r)})`);
    last = r.commands;
    facts = [...facts, ...r.commands.map((cmd, i) => ({ id: `g${gi}.${i}`, utterance: u, group: `g${gi}`, cmd, enabled: true }))];
  });
  return last;
}

const centresCreated = (cmds: AnyCommand[]) =>
  cmds.filter((c) => c.type === 'circle' || c.type === 'circumcircle').map((c) => String((c as { center: string }).center));

describe('#430 — the definite reference binds the circle on screen', () => {
  it('a HIDDEN circle is a referent: «חסום במעגל» after a semicircle creates NO circle', () => {
    const cmds = lowerLast(['חצי מעגל', 'משולש CDE חסום במעגל']);
    expect(centresCreated(cmds), 'no second circle invented').toEqual([]);
    for (const id of ['C', 'D', 'E'])
      expect(cmds, `${id} rides the existing circle`).toContainEqual({ type: 'point-on-circle', id, circle: 'circle-O' });
  });

  it('the English mirror behaves identically', () => {
    const cmds = lowerLast(['חצי מעגל', 'triangle CDE inscribed in a circle']);
    expect(centresCreated(cmds)).toEqual([]);
    expect(cmds).toContainEqual({ type: 'point-on-circle', id: 'C', circle: 'circle-O' });
  });

  it('a plainly drawn circle binds too (the fixture case)', () => {
    const cmds = lowerLast(['מעגל O', 'משולש ABC חסום במעגל']);
    expect(centresCreated(cmds)).toEqual([]);
    expect(cmds).toContainEqual({ type: 'point-on-circle', id: 'A', circle: 'circle-O' });
  });

  it('a quad binds as readily as a triangle (the rule, not the arity)', () => {
    const cmds = lowerLast(['מעגל O', 'מרובע ABCD חסום במעגל']);
    expect(centresCreated(cmds)).toEqual([]);
    for (const id of ['A', 'B', 'C', 'D'])
      expect(cmds).toContainEqual(expect.objectContaining({ type: 'point-on-circle', id, circle: 'circle-O' }));
  });

  it('a NAMED existing circle still binds (unchanged)', () => {
    const cmds = lowerLast(['מעגל O', 'משולש ABC חסום במעגל O']);
    expect(centresCreated(cmds)).toEqual([]);
    expect(cmds).toContainEqual({ type: 'point-on-circle', id: 'A', circle: 'circle-O' });
  });
});

describe('#430 — the bounds of the fix (what must still MINT)', () => {
  it('with NO circle in the figure, an inscribe still creates one', () => {
    const cmds = lowerLast(['משולש ABC חסום במעגל']);
    expect(centresCreated(cmds).length, 'a circle is introduced').toBe(1);
  });

  it('vertices that ALL pre-exist keep their own circumcircle (the operator-locked reading)', () => {
    const cmds = lowerLast(['משולש CDE', 'A על CD', 'B על CE', 'מרובע ABED חסום במעגל', 'משולש ABC חסום במעגל']);
    expect(centresCreated(cmds).length, 'the second inscribe mints its own circle').toBe(1);
  });

  it('a stated RADIUS is not swallowed by a bind (it is also a size given — #53)', () => {
    const cmds = lowerLast(['מעגל O', 'משולש ABC חסום במעגל שרדיוסו 7']);
    expect(centresCreated(cmds).length, 'kept its existing behaviour rather than dropping the size').toBe(1);
  });

  it('beside TWO circles an unnamed reference does not guess', () => {
    // two circles ⇒ the reference is ambiguous; the rule must not silently pick one of them
    const cmds = lowerLast(['מעגל O', 'מעגל P', 'משולש ABC חסום במעגל']);
    const bound = cmds.filter((c) => c.type === 'point-on-circle');
    expect(bound.length === 0 || centresCreated(cmds).length === 1, 'either defers or mints — never picks').toBe(true);
  });
});
