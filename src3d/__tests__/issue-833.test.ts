/**
 * #833 (ADR-3D-193) — a ∥-to-plane statement that is TRUE BY CONSTRUCTION must never be refused.
 *
 * Reported after round #826, measured identically before and after that work:
 *
 *   קובייה ABCDA'B'C'D'
 *   AB מקביל למישור A'B'C'D'      → {"code":"no-solution","id":"A"}
 *
 * `AB` is a bottom edge and `A'B'C'D'` is the top face, which is parallel to the bottom one. The
 * statement is true, adds nothing, and was refused — naming a point that was never the problem.
 *
 * Root cause: `seg-plane-rel` lowered ⟂ to a `perp-plane` claim (#380) and ∥ to nothing. With free
 * dims the ∥ relation becomes a driving pin, but on a DETERMINED figure it fell off the end of the
 * switch into a bare `no-solution`. `relationTable` had advertised `claim` for
 * `parallel|segment|plane-run` the entire time; nothing implemented it.
 *
 * The class being locked, per the issue: a relation ENTAILED by the construction is never refused —
 * ∥, ⟂ and ⊂ alike, anchored and un-anchored. A lowering gap must never reach a student as an
 * impossibility (#816's honesty rule).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const st = () => useGeo3.getState();
const submit = (u: string) => st().submit(u);
/** Build a sequence and return the verdict on the LAST line. */
const verdictOf = (us: string[]) => {
  reset();
  for (const u of us) submit(u);
  return st().lastError;
};

const CUBE = "קובייה ABCDA'B'C'D'";
/** The operator's own anchoring — the issue reports the failure with and without it. */
const ANCHOR = ['A(0,0,0)', 'B(4,0,0)', 'D(0,4,0)'];

describe('#833 — a TRUE ∥-to-plane builds', () => {
  beforeEach(reset);

  it("the operator's exact two lines: «AB מקביל למישור A'B'C'D'» on a bare cube", () => {
    expect(verdictOf([CUBE, "AB מקביל למישור A'B'C'D'"])).toBeNull();
  });

  it('and with the figure ANCHORED — the issue reports both, so both are locked', () => {
    expect(verdictOf([CUBE, ...ANCHOR, "AB מקביל למישור A'B'C'D'"])).toBeNull();
  });

  it('a side face too — not just the top/bottom pair the report happened to use', () => {
    // AB ∥ DC, and DC lies in DCC'D'. The fix must not be about one face.
    expect(verdictOf([CUBE, "AB מקביל למישור DCC'D'"])).toBeNull();
  });

  it('every bottom edge is parallel to the top face, at every seed', () => {
    // The entailment is structural, so the verdict cannot depend on where the figure was sampled.
    for (const seg of ['AB', 'BC', 'CD', 'DA']) {
      for (const seed of [0, 1, 3, 17]) {
        reset();
        useGeo3.setState({ seed });
        submit(CUBE);
        submit(`${seg} מקביל למישור A'B'C'D'`);
        expect(st().lastError, `${seg} at seed ${seed}`).toBeNull();
      }
    }
  });
});

describe('#833 — honesty is preserved in both directions', () => {
  beforeEach(reset);

  it('a FALSE ∥ is still refused — and as claim-refuted, not a bogus no-solution', () => {
    // AA' is perpendicular to the top face, so «AA' ∥ A'B'C'D'» is false. It must still be refused,
    // and the verdict must name the right thing: the claim was checked and did not hold.
    expect(verdictOf([CUBE, ...ANCHOR, "AA' מקביל למישור A'B'C'D'"])).toEqual({ code: 'claim-refuted' });
  });

  it('⟂ is untouched — the #380 lane still lowers and still verifies', () => {
    expect(verdictOf([CUBE, ...ANCHOR, "AA' מאונך למישור A'B'C'D'"])).toBeNull();
    expect(verdictOf([CUBE, ...ANCHOR, "AB מאונך למישור A'B'C'D'"])).toEqual({ code: 'claim-refuted' });
  });

  it('no verdict is ever `no-solution` on this lane again — the reported symptom, as a property', () => {
    // no-solution named a POINT, which is what made the refusal unactionable: nothing was wrong
    // with A. Whatever the answer, it is now either a build or a claim verdict.
    for (const seg of ['AB', "AA'", 'AC', "AB'"]) {
      for (const plane of ["A'B'C'D'", "DCC'D'", 'ABCD']) {
        const v = verdictOf([CUBE, ...ANCHOR, `${seg} מקביל למישור ${plane}`]);
        expect(v === null || v.code === 'claim-refuted', `${seg} ∥ ${plane} → ${JSON.stringify(v)}`).toBe(true);
      }
    }
  });

  it('the statement leaves a visible trace — the stated segment is drawn (#821 / V1)', () => {
    // AC is the BOTTOM DIAGONAL — parallel to the top face and not already a drawn edge, so this
    // tests the drawing convention rather than a segment the cube supplied anyway.
    reset();
    [CUBE, "AC מקביל למישור A'B'C'D'"].forEach(submit);
    expect(st().lastError).toBeNull();
    const d = derive3(st().facts, st().seed);
    const drawn = d.construction.segments.some(([a, b]) => (a === 'A' && b === 'C') || (a === 'C' && b === 'A'));
    expect(drawn).toBe(true);
  });

  it('parses through the real grammar (no hand-built commands)', () => {
    expect(parse3("AB מקביל למישור A'B'C'D'").ok).toBe(true);
  });
});
