/**
 * #1590 (ADR-3D-291) — A GIVEN THE TOOL CANNOT DRIVE IS NOT THE STUDENT'S MISCALCULATION.
 *
 * «חרוט שקודקודו S ומרכז בסיסו O · |SO| = 4» was refused «הטענה לא מתקיימת בציור — בדקו את החישוב». SO can
 * be 4 — the height was never stated — and the student did not miscalculate: the tool cannot yet set a
 * revolution's size (#1569), nor move a point whose freedom only a pivot that never runs could drive (#1561).
 * The refusal stays (operator ruling 2026-09-29, #1567 option A); its MESSAGE now names the tool's limit.
 *
 * The rule is the not-determined table's (`sampledCarrierVerdict`, ADR-3D-260): a failing GIVEN that reads a
 * carrier whose freedom was SAMPLED is not refuted. Two carriers were missing — a point with a sampled free
 * parameter, and a revolution of unstated size. A given the point's own stated data already contradicts (a
 * fixed coordinate, the stated side of an axis, a spot off the rider's segment) is false as stated and keeps
 * «בדקו את החישוב». An ANSWER over a sampled carrier keeps the register it always had.
 *
 * Every assertion goes through `decideSubmit3`, the real submit decision.
 */
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideSubmit3, type Fact3, type StoreError3 } from '../store/store3';

type St = { facts: Fact3[]; seed: number };

function build(lines: readonly string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    if (v.kind !== 'record') throw new Error(`setup line «${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}

const refusal = (seq: readonly string[]) => {
  const v = decideSubmit3(build(seq.slice(0, -1)), seq[seq.length - 1]);
  return v.kind === 'refused' ? v.error : null;
};

/** Satisfiable givens the tool cannot drive yet. */
const UNDRIVABLE: [string, string[], unknown][] = [
  ['the operator’s cone: height never stated', ['חרוט שקודקודו S ומרכז בסיסו O', '|SO| = 4'], { kind: 'size', solid: 'cone' }],
  ['the cone with its radius stated, height not', ['חרוט שקודקודו S ומרכז בסיסו O, רדיוסו 5', '|SO| = 4'], { kind: 'size', solid: 'cone' }],
  // a rider on a LINE has no closed-form reading (#1561 reads segments, axes and letters only)
  ['a rider on a line, given its x', ['הישר l1: x = (0,0,0) + t(1,0,0)', 'P על הישר l1', 'P(3, n, p)'], { kind: 'point', id: 'P' }],
];

/**
 * #1561 (ADR-3D-292): the issue's point cases are now PLACED — the coordinate given determines the point's free
 * parameter in closed form. Kept here so this file still names every case it once listed; the placements
 * themselves are asserted in `issue-1561-coord-determines.test.ts`.
 */
const NOW_PLACED: [string, string[]][] = [
  ['a point on the positive x-axis, given its x', ['הקודקוד D נמצא על החלק החיובי של ציר ה-x', 'D(3,0,0)']],
  ['the same in English', ['D is on the positive part of the x-axis', 'D(3,0,0)']],
  ['a rider on a segment between typed points, given a spot ON the segment', ['A(0,0,0)', 'B(2,0,0)', 'K על AB', 'K(1,0,0)']],
  ['a coord-sym point, given its free coordinate', ['B(1, t, 2)', 'B(n, 4, p)']],
  ['the `=` spelling on the axis point', ['הקודקוד D נמצא על החלק החיובי של ציר ה-x', 'D = (3,0,0)']],
  ['the `=` spelling on the rider', ['A(0,0,0)', 'B(2,0,0)', 'K על AB', 'K = (1,0,0)']],
];

/** False as stated — the student's own data contradicts it; «בדקו את החישוב» is the truth. */
const FALSE_AS_STATED: [string, string[]][] = [
  ['a typed point restated elsewhere', ['B(0,7,8)', 'B(3,7,8)']],
  ['a vector over typed points', ['A(0,0,0)', 'B(1,1,1)', 'C(2,0,0)', 'AB = (5,5,5)']],
  ['a midpoint restated off its place', ['A(0,0,0)', 'C(2,0,0)', 'M אמצע AC', 'M(3, n, p)']],
  ['the stated POSITIVE side of the axis, given a negative x', ['הקודקוד D נמצא על החלק החיובי של ציר ה-x', 'D(-3,0,0)']],
  ['the same, in the `=` spelling', ['הקודקוד D נמצא על החלק החיובי של ציר ה-x', 'D = (-3,0,0)']],
  ['a fixed coordinate of a coord-sym point, given another value', ['B(1, t, 2)', 'B(3, n, p)']],
  ['a rider given a spot OFF its segment', ['A(0,0,0)', 'B(2,0,0)', 'K על AB', 'K(1,5,0)']],
  ['a rider given a spot on the segment’s line but past its end', ['A(0,0,0)', 'B(2,0,0)', 'K על AB', 'K(5,0,0)']],
];

describe('#1590 — a satisfiable given the tool cannot drive is refused as the TOOL’S limit', () => {
  for (const [title, seq, object] of UNDRIVABLE)
    it(`${title}: «${seq[seq.length - 1]}»`, () => expect(refusal(seq)).toEqual({ code: 'given-not-drivable', object }));
});

describe('#1590 → #1561 — the point cases this issue listed are now placed', () => {
  for (const [title, seq] of NOW_PLACED)
    it(`${title}: «${seq[seq.length - 1]}» records`, () => {
      const v = decideSubmit3(build(seq.slice(0, -1)), seq[seq.length - 1]);
      expect(v.kind).toBe('record');
    });
});

describe('#1590 — a given false as stated keeps «בדקו את החישוב»', () => {
  for (const [title, seq] of FALSE_AS_STATED)
    it(`${title}: «${seq[seq.length - 1]}»`, () => expect(refusal(seq)).toEqual({ code: 'claim-refuted' }));
});

describe('#1590 — an ANSWER over a sampled carrier keeps its register (the fix is about givens)', () => {
  it('«AE = 2*A\'E» over a rider E on AA\' is still refuted', () => {
    expect(refusal(['מקבילון', "E על AA'", "AE = 2*A'E"])?.code).toBe('claim-refuted');
  });
});

describe('#1590 — the message names the tool, never the student’s calculation, in both locales', () => {
  const render = (lng: string, err: StoreError3) => errorText3(i18n3d.getFixedT(lng) as (k: string, o?: Record<string, unknown>) => string, err) ?? '';
  const cone = refusal(UNDRIVABLE[0][1])!;
  const point = refusal(UNDRIVABLE[2][1])!; // the line rider P

  it('Hebrew: the cone message names «החרוט» and the point message names P; neither says «בדקו את החישוב»', () => {
    expect(render('he', cone)).toContain('החרוט');
    expect(render('he', point)).toContain('P');
    for (const e of [cone, point]) {
      expect(render('he', e)).toContain('מגבלה של הכלי');
      expect(render('he', e)).not.toContain('בדקו את החישוב');
    }
  });
  it('English: the same, with no «check the computation»', () => {
    expect(render('en', cone)).toContain('cone');
    expect(render('en', point)).toContain('P');
    for (const e of [cone, point]) {
      expect(render('en', e)).toContain('limit of the tool');
      expect(render('en', e)).not.toMatch(/check the computation/i);
    }
  });
  it('the false-as-stated control still renders «בדקו את החישוב»', () => {
    expect(render('he', refusal(FALSE_AS_STATED[0][1])!)).toContain('בדקו את החישוב');
  });
});
