/**
 * #819 (ADR-3D-177) — THE ⟂/∥ SEGMENT×PLANE RELATION READS EVERY FRAME, NOT ONE.
 *
 * The operator, working the bagrut pyramid, could not state the exam's own construction:
 * «דרך AC העבירו מישור המקביל ל-SD וחותך את SB בנקודה K». Every rewording refused `not-understood`
 * — `ACK∥SD`, `המישור ACK מקביל ל-SD`, the exam sentence itself — while the engine has handled this
 * relation all along: `מישור π דרך A ו-C ומקביל ל-SD` + a crossing builds it and lands K on SB's
 * midpoint.
 *
 * Two enumerations caused it. The segment×plane rules spelled their own operand ORDER and NOTATION
 * instead of classifying through the shared seam (ADR-3D-140's `readRelationSides`), and had drifted
 * apart doing it — the ⟂ one took the `⊥` symbol and an optional plane keyword, its ∥ twin demanded
 * the literal «מקביל למישור». And `relPlaneRule` read «דרך A ו-C» but not the exam's glued «דרך AC».
 *
 * These lock the MATRIX, because that is what the fix bought: order, notation, noun, locale — all
 * consequences of classifying, none of them cases anyone has to remember.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);
const cmds = (input: string) => {
  const r = parse3(input);
  expect(r.ok, input).toBe(true);
  return r.ok ? r.commands : [];
};

/** The operator's bagrut figure. |AD| = |AB| = 5 with AD = (3,p,0) ⇒ p = 4. */
const FIGURE = [
  'פירמידה SABCD שבסיסה מקבילית',
  'המקצוע SA הוא גובה בפירמידה',
  'M אמצע אלכסון BD',
  'נסמן: AB = u, AD = v, AS = w',
  'A(0,0,0)',
  'B(0,5,0)',
  'S(0,0,6)',
  'D(3,p,0)',
  '|u| = |v|',
  'p חיובי',
];
/** A plane through AC parallel to SD meets SB at its midpoint: S(0,0,6), B(0,5,0) ⇒ (0, 5/2, 3). */
const expectK = () => {
  const K = derived().positions.get('K')!;
  expect(K.x).toBeCloseTo(0, 5);
  expect(K.y).toBeCloseTo(2.5, 5);
  expect(K.z).toBeCloseTo(3, 5);
};

describe('#819 — the exam states the construction in ONE sentence', () => {
  beforeEach(reset);

  it('«דרך AC העבירו מישור המקביל ל-SD וחותך את SB בנקודה K» builds the whole thing', () => {
    [...FIGURE, 'דרך AC העבירו מישור המקביל ל-SD וחותך את SB בנקודה K'].forEach(submit);
    expect(state().lastError).toBeNull();
    expectK();
  });

  it('English mirror', () => {
    [...FIGURE, 'through AC pass a plane parallel to SD and cuts SB at K'].forEach(submit);
    expect(state().lastError).toBeNull();
    expectK();
  });

  it('the sentence lowers to BOTH commands — the crossing is never dropped', () => {
    expect(cmds('דרך AC העבירו מישור המקביל ל-SD וחותך את SB בנקודה K')).toEqual([
      { type: 'rel-plane', name: 'π', rel: 'par', through: ['A', 'C'], a: 'S', b: 'D' },
      { type: 'plane-cut', id: 'K', plane: 'π', a: 'S', b: 'B' },
    ]);
  });

  it('split across two utterances reaches the same figure', () => {
    [...FIGURE, 'דרך AC העבירו מישור המקביל ל-SD', 'π חותך את SB בנקודה K'].forEach(submit);
    expect(state().lastError).toBeNull();
    expectK();
  });

  it('and so does the named-plane form the grammar already had', () => {
    [...FIGURE, 'מישור π דרך A ו-C ומקביל ל-SD', 'K נקודת החיתוך של π עם SB'].forEach(submit);
    expect(state().lastError).toBeNull();
    expectK();
  });

  it('«דרך AC» and «דרך A ו-C» are the same statement', () => {
    expect(cmds('מישור π דרך AC ומקביל ל-SD')).toEqual(cmds('מישור π דרך A ו-C ומקביל ל-SD'));
  });
});

describe('#819 — the segment × plane-run MATRIX: order, notation, noun, locale', () => {
  // The relation is symmetric, so each pair must reach the SAME command whichever way round it is
  // said and whichever notation is used. Asserted on the lowered commands, so a frame that merely
  // stops erroring but lowers to something else cannot pass.
  const same = (a: string, b: string) => expect(cmds(a)).toEqual(cmds(b));

  it('∥ — either order', () => same('המישור ACD מקביל ל-AB', 'AB מקביל למישור ACD'));
  it('⊥ — either order', () => same('המישור ACD מאונך ל-AB', 'AB מאונך למישור ACD'));
  it('∥ symbol — either order, and equal to the word form', () => {
    same('AB∥ACD', 'AB מקביל למישור ACD');
    same('ACD∥AB', 'AB מקביל למישור ACD');
  });
  it('⊥ symbol — either order, and equal to the word form', () => {
    same('AB⊥ACD', 'AB מאונך למישור ACD');
    same('ACD⊥AB', 'AB מאונך למישור ACD');
  });
  it('English — either order', () => {
    same('plane ACD is parallel to AB', 'AB is parallel to plane ACD');
    same('plane ACD is perpendicular to AB', 'AB is perpendicular to plane ACD');
  });
  it('a 4-label box FACE is a plane run too, in both orders (#380)', () => {
    same('ABCD מקביל ל-EF', 'EF מקביל למישור ABCD');
  });
  it('the noun vocabulary the seam already knew comes for free (פאה)', () => {
    same('הפאה ACD מקביל ל-AB', 'AB מקביל למישור ACD');
  });

  it('the «בסיס» sentinel survives, for BOTH relations', () => {
    expect(cmds('AS ניצב לבסיס')).toEqual([{ type: 'seg-plane-rel', rel: 'perp', a: 'A', b: 'S', plane: [] }]);
    expect(cmds('AB מקביל לבסיס')).toEqual([{ type: 'seg-plane-rel', rel: 'parallel', a: 'A', b: 'B', plane: [] }]);
  });

  it('the plane run keeps every label it was given — a 4th is never truncated (#380)', () => {
    const c = cmds('MO ⊥ABCD').find((x) => x.type === 'seg-plane-rel')!;
    expect(c).toMatchObject({ type: 'seg-plane-rel', rel: 'perp', a: 'M', b: 'O', plane: ['A', 'B', 'C', 'D'] });
  });

  it('a plane×plane or plane×named-line pair is NOT claimed by this rule', () => {
    // they belong to planeRelGiven / planeLinePerp — asserted by the command they lower to
    expect(cmds('המישור ABC מקביל למישור SBD')[0].type).toBe('plane-rel');
    expect(cmds('המישור ABC מאונך לישר l1')[0].type).toBe('plane-line-perp');
  });
});

describe('#819 — the same relation, judged the same either way round', () => {
  beforeEach(reset);

  // Order must not change the VERDICT either, not just the parse: on this figure both are false.
  it('a false relation is refused identically in both orders', () => {
    reset();
    [...FIGURE, 'SB מקביל למישור ACD'].forEach(submit);
    const first = state().lastError;
    reset();
    [...FIGURE, 'המישור ACD מקביל ל-SB'].forEach(submit);
    expect(state().lastError?.code).toBe(first?.code);
    expect(first?.code).toBe('givens-contradict');
  });

  it('a TRUE relation is accepted identically in both orders', () => {
    reset();
    [...FIGURE, 'AB מקביל למישור ACD'].forEach(submit); // AB lies in the base plane ACD
    expect(state().lastError).toBeNull();
    reset();
    [...FIGURE, 'המישור ACD מקביל ל-AB'].forEach(submit);
    expect(state().lastError).toBeNull();
  });
});
