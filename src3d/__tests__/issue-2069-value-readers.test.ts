/**
 * #2069 (ADR-3D-369, ADR-W-145) — THE VALUE READERS 2-D ALREADY HAD.
 *
 * Measured at 8b01f3bd through `decideSubmit3` (the function `store3.submit` dispatches): «AD=2*√7», «שטח המשולש ABC
 * הוא 6», «△ABC» and «AB ‖ CD» were all "not understood" in 3-D, while 2-D builds every one (2-D: `measure-length`,
 * `measure-area`, `triangle`; «‖» through the shared fold, ADR-W-145). Each line goes to its new verdict here, beside
 * the controls that already built and the neighbours that must not move.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, type Fact3, type Verdict3 } from '../store/store3';
import type { Command3 } from '../engine/types';

/** Run the lines through the App's own decision; return each verdict and the last line's commands. */
const run = (lines: readonly string[]) => {
  let s: { facts: Fact3[]; seed: number } = { facts: [], seed: 0 };
  const verdicts: Verdict3[] = [];
  for (const line of lines) {
    const v = decideSubmit3(s, line);
    verdicts.push(v);
    if (v.kind === 'record') s = { facts: v.facts, seed: v.seed };
  }
  const last = verdicts.at(-1)!;
  const cmds: Command3[] = last.kind === 'record' ? (last.facts.at(-1)?.cmds ?? []) : [];
  return { verdicts, last, cmds };
};

const lengthOf = (cmds: Command3[]) => cmds.flatMap((c) => (c.type === 'claim' && c.claim.type === 'length-eq' ? [c.claim.value] : []))[0];
const areaOf = (cmds: Command3[]) => cmds.flatMap((c) => (c.type === 'claim' && c.claim.type === 'area-eq' ? [c.claim.value] : []))[0];

describe('#2069 item 2 — a root with an explicit product is a magnitude', () => {
  it.each([
    ['AD=2*√7', 2 * Math.sqrt(7)],
    ['AD = 2 * √7', 2 * Math.sqrt(7)],
    ['AD=2·√7', 2 * Math.sqrt(7)],
    ['AD=3*√2/2', (3 * Math.SQRT2) / 2],
    ['AD=2*sqrt(7)', 2 * Math.sqrt(7)],
    ['|AD|=2*√7', 2 * Math.sqrt(7)],
    ['AD=2√7', 2 * Math.sqrt(7)], // the control
  ])('«מלבן ABCD» · «%s» records |AD| = %f', (line, value) => {
    const { last, cmds } = run(['מלבן ABCD', line]);
    expect(last.kind, line).toBe('record');
    expect(lengthOf(cmds)).toBeCloseTo(value, 10);
  });

  it.each(['AD=2*7', 'AD=2×√7'])('«%s» stays outside the atom, as 2-D escalates it', (line) => {
    expect(run(['מלבן ABCD', line]).last.kind).toBe('not-understood');
  });

  it('a revolution size keeps its own refusal («כדור שרדיוסו 2*√2», ADR-3D-340)', () => {
    const { last } = run(['כדור שרדיוסו 2*√2']);
    expect(last.kind).not.toBe('record');
  });
});

describe('#2069 item 3 — the area given takes the copula 2-D takes', () => {
  it.each([
    ['שטח המשולש ABC הוא 6', 6],
    ['שטח המשולש ABC הוא 2√3', 2 * Math.sqrt(3)],
    ['שטח המשולש ABC הוא 2.5', 2.5],
    ['שטח ABC הוא 6', 6],
    ['שטח המשולש ABC שווה 6', 6],
    ['the area of triangle ABC is 6', 6],
    ['שטח המשולש ABC = 2√3', 2 * Math.sqrt(3)], // the control
  ])('«משולש ABC» · «%s» records the area %f', (line, value) => {
    const { last, cmds } = run(['משולש ABC', line]);
    expect(last.kind, line).toBe('record');
    expect(areaOf(cmds)).toBeCloseTo(value, 10);
  });

  it.each(['שטח המשולש ABC היא 6', 'שטח המשולש ABC שווה ל-6', 'שטח המשולש הוא 6'])('«%s» is unchanged: 2-D escalates it too', (line) => {
    expect(run(['משולש ABC', line]).last.kind).toBe('not-understood');
  });
});

describe('#2069 item 5 — the triangle sign is the triangle noun', () => {
  it.each(['△ABC', '▲ABC', '△ ABC', 'משולש △ABC'])('«%s» declares triangle ABC', (line) => {
    const { last, cmds } = run([line]);
    expect(last.kind, line).toBe('record');
    expect(cmds).toContainEqual({ type: 'solid', kind: 'polygon3', ids: ['A', 'B', 'C'] });
  });

  it('«△ABC ≅ △DEF» is unchanged — 3-D reads no congruence in any spelling (#1679)', () => {
    expect(run(['△ABC ≅ △DEF']).last.kind).toBe('not-understood');
  });

  it('a sign with no label run is no noun', () => {
    expect(run(['△']).last.kind).not.toBe('record');
  });
});

describe('#2069 item 6 — «‖» and «||» are the parallel sign (the shared fold, ADR-W-145)', () => {
  it.each(['AB ‖ CD', 'AB‖CD', 'AB || CD', 'AB ∥ CD'])('«מרובע ABCD» · «%s» records AB ∥ CD', (line) => {
    const { last, cmds } = run(['מרובע ABCD', line]);
    expect(last.kind, line).toBe('record');
    expect(cmds.some((c) => c.type === 'mutual-rel' && c.rel === 'parallel')).toBe(true);
  });

  it('«‖u‖ = 5» is the student’s norm notation and is not read as a parallel', () => {
    // unchanged: 3-D has no ‖…‖ norm reading, so the line is not understood, exactly as before the fold
    expect(run(['טרפז ABCD', 'נסמן: AB = u', '‖u‖ = 5']).last.kind).toBe('not-understood');
  });
});
