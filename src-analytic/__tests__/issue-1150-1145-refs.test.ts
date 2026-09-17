/**
 * #1150 — A DEFINING CLAUSE MAY NOT VANISH · #1145 — A REFUSAL NAMES THE STUDENT'S WORD.
 *
 * Bundled because #1150's fix creates a new instance of #1145's defect: the check it adds refuses by
 * naming a curve, and a curve's id is prefixed (`line-l7`), so shipping them apart would have shipped
 * a brand-new message containing a word the student never typed.
 *
 * ## #1150, and the diagnosis that had to be corrected
 *
 * Operator, on his saved figure «עבודת סוכות 1»: *"the last input referred to l1 and l2 which don't
 * exist and yet point D was positioned"*.
 *
 * The issue's own body said the cause was that the point rule's optional tail *"fails to match and the
 * rule succeeds with the tail dropped"* — and flagged it as **measured but not yet complete**. It is
 * not what happens. Measured on `main`, the sentence parses FULLY, into
 * `declare + on-curve + on-curve + selector`; the two constraints faithfully name `l7` and `l8`. What
 * failed is one step later: `constraintRefs` answers *which POINTS does this touch* — correct for both
 * of its callers — so **nothing ever checked that the curve existed**. The constraints passed the apply
 * boundary in silence and then could not be measured at evaluation, so `D` was drawn as an ordinary
 * free point at a sampled position while the data panel one column over read `D = –`.
 *
 * Same class as the issue said (a given that vanishes), one seam over from where it said.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { statedName } from '../engine/apply';
import { constraintCurveRefs } from '../engine/solve';

const refusal = (setup: string[], line: string) => {
  const v = decideSubmit(line, setup, 0);
  return v.kind === 'refused' ? v.error : null;
};

describe('#1150 — a statement about a curve the figure does not have is REFUSED, never absorbed', () => {
  it('the operator’s sentence, with no such lines', () => {
    const e = refusal(['A(0,0)'], 'נקודה D היא חיתוך של l7 ו- l8');
    expect(e, 'must be refused, not silently accepted').toBeTruthy();
    expect(e!.key).toBe('unknown-reference');
  });

  it('the English form, likewise', () => {
    const e = refusal(['A(0,0)'], 'point D is the intersection of l7 and l8');
    expect(e?.key).toBe('unknown-reference');
  });

  it('ONE missing line is enough — it names that one', () => {
    const e = refusal(['הישר l1: y=x'], 'נקודה D היא חיתוך של l1 ו- l9');
    expect(e?.key).toBe('unknown-reference');
    expect(e?.detail).toBe('l9');
  });

  /**
   * THE COUNTER-DIRECTION, and the whole risk of this fix: the same sentence with the lines PRESENT
   * must still build. A reference check that refused a legitimate statement would be far worse than
   * the silence it replaces.
   */
  it('…and with both lines present it still records', () => {
    expect(decideSubmit('נקודה D היא חיתוך של l1 ו- l2', ['הישר l1: y=x', 'הישר l2: y=-x+4'], 0).kind).toBe('record');
  });

  /** The curve refs are declared per kind; a constraint that names no curve must report none. */
  it('constraintCurveRefs answers about curves, and only about curves', () => {
    expect(constraintCurveRefs({ t: 'on-curve', id: 'D', curve: 'line-l7' })).toEqual(['line-l7']);
    expect(constraintCurveRefs({ t: 'midpoint', id: 'M', a: 'A', b: 'B' })).toEqual([]);
    expect(
      constraintCurveRefs({
        t: 'relation',
        rel: 'parallel',
        u: { k: 'curve', id: 'line-l1' },
        v: { k: 'points', a: 'A', b: 'B' },
      }),
    ).toEqual(['line-l1']);
  });
});

describe('#1145 — the refusal names what the STUDENT wrote', () => {
  /** The reported case, verbatim. */
  it('«O מרכז המעגל Z» blames «Z», not «circle-Z»', () => {
    const e = refusal(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'], 'O מרכז המעגל Z');
    expect(e?.key).toBe('unknown-reference');
    expect(e?.detail).toBe('Z');
  });

  it('and the same sentence about the circle that EXISTS records', () => {
    expect(decideSubmit('O מרכז המעגל I', ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'], 0).kind).toBe('record');
  });

  it('#1150’s new message inherits it — «l7», not «line-l7»', () => {
    expect(refusal(['A(0,0)'], 'נקודה D היא חיתוך של l7 ו- l8')?.detail).toBe('l7');
  });

  /** A missing POINT was already named correctly, and must stay that way — `statedName` is the
   *  identity on an id with no prefix, which is what makes a uniform call safe. */
  it('a missing point still names its letter', () => {
    expect(refusal(['A(0,0)'], 'M אמצע AB')?.detail).toBe('B');
  });

  it('statedName strips only the prefixes it minted', () => {
    expect(statedName('circle-Z')).toBe('Z');
    expect(statedName('line-l7')).toBe('l7');
    expect(statedName('B')).toBe('B');
    // An ANONYMOUS curve has no student name to recover; printing the hash's tail would be a
    // different wrong word rather than the right one, so it is left whole.
    expect(statedName('curve-3f2a')).toBe('curve-3f2a');
  });
});
