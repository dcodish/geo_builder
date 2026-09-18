/**
 * #1153 — ONE POSITION, ONE NAME.
 *
 * Measured before the fix, on «נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9»:
 *
 * ```
 * P מרכז המעגל I  ->  [P(3,4)]                  faults []
 * O מרכז המעגל I  ->  [P(3,4), O(3,4)]          faults []
 * T מרכז המעגל I  ->  [P(3,4), O(3,4), T(3,4)]  faults []
 * ```
 *
 * Three letters stacked on one position, nothing said. The class had already been reported as #1113
 * and measured again on curves in #1126, so a check inside the centre rule would be the patch shape
 * and would guarantee a fourth occurrence.
 *
 * **Operator ruling, 2026-09-17:** the second naming REFUSES and names the holder. Renaming is an
 * explicit action the student takes; nothing changes silently.
 *
 * ## What is asserted here, and what is deliberately NOT
 *
 * The check is STRUCTURAL — two rules that define the same point ARE the same point, exactly and with
 * no tolerance. So this file locks the whole `DerivedRule` family, not the centre alone, and it locks
 * the two boundaries that keep the check honest:
 *
 * - a naming of a genuinely DIFFERENT point is untouched (no false positive);
 * - «A(3,4)» + «B(3,4)» — two independent statements that merely coincide — is **unchanged**. The
 *   operator ruled on naming one object twice and explicitly did not rule on that, so it is escalated
 *   rather than answered (ADR-AG-092 §"the sub-case that is not decided here").
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { sameDerivation } from '../engine/sameDerivation';
import { analyticI18n } from '../i18n';

const CIRCLE = 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9';
const ids = (lines: string[]) => derive(lines, 0).figure.points.map((p) => p.id);
const faults = (lines: string[]) => derive(lines, 0).faults;

describe('#1153 — naming something that already has a name is refused', () => {
  it('the operator’s own sequence: the second and third namings do not mint points', () => {
    expect(ids([CIRCLE, 'P מרכז המעגל I'])).toEqual(['P']);
    expect(ids([CIRCLE, 'P מרכז המעגל I', 'O מרכז המעגל I'])).toEqual(['P']);
    expect(ids([CIRCLE, 'P מרכז המעגל I', 'O מרכז המעגל I', 'T מרכז המעגל I'])).toEqual(['P']);
  });

  it('the refusal NAMES THE HOLDER — the student sees the collision', () => {
    const f = faults([CIRCLE, 'P מרכז המעגל I', 'O מרכז המעגל I']);
    expect(f.map((x) => x.code)).toEqual(['already-named']);
    expect(f[0].holder, 'the refusal must say WHO holds it').toBe('P');
    // The holder reaches the STUDENT'S SENTENCE, not just the fault object: rendered through the
    // real locale, because a key that exists proves nothing about what anyone reads (#1179's lesson).
    const msg = analyticI18n.t('errAlreadyNamed', { holder: 'P' });
    expect(msg).toContain('P');
    expect(msg).not.toContain('{{');
  });

  it('the submit gate refuses it, carrying the holder to the UI', () => {
    const base = [CIRCLE, 'P מרכז המעגל I'];
    const v = decideSubmit('O מרכז המעגל I', base, 0, derive(base, 0));
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' && v.error.key).toBe('already-named');
    expect(v.kind === 'refused' && 'holder' in v.error && v.error.holder).toBe('P');
  });

  it('restating the SAME name is still absorbed — M1 idempotence is untouched', () => {
    // «P מרכז המעגל I» twice is a student repeating themselves, not a collision.
    expect(faults([CIRCLE, 'P מרכז המעגל I', 'P מרכז המעגל I'])).toEqual([]);
    expect(ids([CIRCLE, 'P מרכז המעגל I', 'P מרכז המעגל I'])).toEqual(['P']);
  });

  it('the check is the FAMILY’s, not the centre rule’s', () => {
    // A midpoint named twice is the same defect, and was equally silent.
    expect(faults(['A(0,0)', 'B(4,0)', 'M אמצע AB', 'N אמצע AB']).map((x) => x.code)).toEqual([
      'already-named',
    ]);
    // ...including when the second naming writes the pair the other way round.
    expect(faults(['A(0,0)', 'B(4,0)', 'M אמצע AB', 'N אמצע BA']).map((x) => x.code)).toEqual([
      'already-named',
    ]);
  });

  it('a DIFFERENT point is still nameable — no false positive', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'C(0,4)', 'M אמצע AB', 'N אמצע AC'];
    expect(faults(lines)).toEqual([]);
    expect(ids(lines)).toEqual(['A', 'B', 'C', 'M', 'N']);
  });

  it('two independently STATED points that coincide are unchanged — not this ruling’s question', () => {
    /**
     * The boundary that keeps this fix inside what was ruled. A positional check would have caught
     * this too, and the operator explicitly did not decide it: a student may state two points that a
     * later constraint separates, and under ADR-052 an unstated magnitude is a free DOF, so the
     * coincidence may be incidental rather than asserted. Escalated on the issue, not answered here.
     */
    expect(faults(['A(3,4)', 'B(3,4)'])).toEqual([]);
    expect(ids(['A(3,4)', 'B(3,4)'])).toEqual(['A', 'B']);
  });

  it('a quadrilateral’s diagonal meet compares as a RING, not a set', () => {
    /**
     * `ABCD` and `ABDC` are different quadrilaterals whose diagonals meet in different places, so
     * naming the second is not naming the first again. Comparing vertices as a set would refuse a
     * naming the student is entitled to make — the false-positive direction, which is the one that
     * would be reported as a new bug.
     */
    expect(sameDerivation({ t: 'diagonals', v: ['A', 'B', 'C', 'D'] }, { t: 'diagonals', v: ['B', 'C', 'D', 'A'] })).toBe(true);
    expect(sameDerivation({ t: 'diagonals', v: ['A', 'B', 'C', 'D'] }, { t: 'diagonals', v: ['D', 'C', 'B', 'A'] })).toBe(true);
    expect(sameDerivation({ t: 'diagonals', v: ['A', 'B', 'C', 'D'] }, { t: 'diagonals', v: ['A', 'B', 'D', 'C'] })).toBe(false);
  });

  it('a triangle centre is the same point whatever order its vertices were written', () => {
    expect(sameDerivation({ t: 'centroid', v: ['A', 'B', 'C'] }, { t: 'centroid', v: ['C', 'A', 'B'] })).toBe(true);
    // ...but a centroid and an incentre of the same triangle are two different points.
    expect(sameDerivation({ t: 'centroid', v: ['A', 'B', 'C'] }, { t: 'incentre', v: ['A', 'B', 'C'] })).toBe(false);
  });
});
