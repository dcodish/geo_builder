/**
 * Angle marks (right-angle squares / angle arcs). The student's RULE: mark an angle only when they
 * SAID it — `∠ABC = α/37` is an arc; `∠ABC = 90`, `AB ⟂ CD`, a right-triangle is a right-angle
 * square — NEVER from a merely computed 90° (a rectangle's corners, a plain rhombus).
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay, type Fact } from '../geoStore';

let n = 0;
const facts = (...us: string[]): Fact[] =>
  us.flatMap((u) => {
    const r = parse(u);
    if (!r.ok) throw new Error('parse failed: ' + u);
    return r.commands.map((cmd) => ({ id: `f${n++}`, cmd, enabled: true }));
  });
const marks = (...us: string[]) => replay(facts(...us)).angleMarks;

describe('angle marks come only from the facts the student asserts', () => {
  it('a given angle (symbolic or numeric ≠ 90) is an ARC', () => {
    expect(marks('rhombus ABCD', 'angle ADC = α')).toEqual([{ vertex: 'D', ray1: 'A', ray2: 'C', right: false }]);
    expect(marks('triangle ABC', 'angle ABC = 37')).toEqual([{ vertex: 'B', ray1: 'A', ray2: 'C', right: false }]);
  });

  it('an explicit 90°, a perpendicular, and a right-triangle are RIGHT-ANGLE squares', () => {
    expect(marks('triangle ABC', 'angle ABC = 90')).toEqual([{ vertex: 'B', ray1: 'A', ray2: 'C', right: true }]);
    expect(marks('rhombus ABCD', 'point F on the extension of AD', 'CF perpendicular to DF')).toEqual([
      { vertex: 'F', ray1: 'C', ray2: 'D', right: true }, // at the shared vertex F, between FC and FD
    ]);
    expect(marks('right triangle ABC')).toEqual([{ vertex: 'C', ray1: 'A', ray2: 'B', right: true }]);
  });

  it('a COMPUTED 90° is NOT marked (the student didn\'t state it)', () => {
    expect(marks('rhombus ABCD')).toEqual([]); // a plain rhombus — no angle stated
    expect(marks('rectangle ABCD')).toEqual([]); // corners are 90° by definition, but not *stated*
    expect(marks('square ABCD')).toEqual([]);
  });

  it('a failed/removed angle fact produces no mark', () => {
    // perpendicular referencing a point that never existed → the step fails → no mark
    expect(marks('triangle ABC', 'XY perpendicular to ZW')).toEqual([]);
  });
});
