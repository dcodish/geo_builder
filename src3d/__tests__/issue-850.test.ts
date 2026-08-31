/**
 * #850 (ADR-3D-198) — a ∥ / ⟂ the figure already implies says it is already known.
 *
 * Operator, 2026-08-31, playing #833: *"for AB מקביל למישור A'B'C'D' - this is maybe not build and
 * say that its already known? what do you think?"*
 *
 * #833 fixed the honesty half — the statement was REFUSED though true, and now builds. It built
 * silently, so a ✓ read as "something happened" when nothing did.
 *
 * **How the verdict is reached** (operator ruling: the numeric route, not the structural one):
 *
 *  1. The counterfactual — *would this hold if the student had not said it?* — is answered by the
 *     LOWERING. `seg-plane-rel` becomes a driving `scalarPin` while the figure has free dims, and a
 *     pure claim once it does not. A claim with no matching pin **constrained nothing**.
 *  2. `verifyClaim` already checks `claimSeeds` — four configurations, not one — so a relation true
 *     in a single drawing is never reported as a consequence of the givens.
 *  3. The #827 branch guard on top: seeds vary the GAUGE and never the BRANCH, so a two-branch figure
 *     must satisfy the relation in every admissible branch before anything is claimed.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const st = () => useGeo3.getState();
const build = (us: string[]) => {
  reset();
  for (const u of us) st().submit(u);
};
const entailed = (seed = 0) =>
  derive3(st().facts, seed).notices.filter((n) => n.kind === 'relation-entailed');

const CUBE = "קובייה ABCDA'B'C'D'";
const ANCHOR = ['A(0,0,0)', 'B(4,0,0)', 'D(0,4,0)'];

describe('#850 — an entailed relation says so', () => {
  beforeEach(reset);

  it("the operator's sentence: «AB מקביל למישור A'B'C'D'» builds AND is reported already known", () => {
    build([CUBE, "AB מקביל למישור A'B'C'D'"]);
    expect(st().lastError, 'still builds — #833 must not regress').toBeNull();
    expect(entailed()).toEqual([
      { kind: 'relation-entailed', seg: 'AB', plane: "A'B'C'D'", rel: 'parallel' },
    ]);
  });

  it('the plane is named as the STUDENT wrote it, not as the claim stores it', () => {
    // The claim keeps three points, because three fix a plane. Reporting «A'B'C'» back would name
    // internal state — the thing the honesty invariant exists to forbid.
    build([CUBE, "AB מקביל למישור A'B'C'D'"]);
    expect(entailed()[0]).toMatchObject({ plane: "A'B'C'D'" });
  });

  it('the ⟂ twin too — «AA\' מאונך למישור ABCD»', () => {
    build([CUBE, ...ANCHOR, "AA' מאונך למישור ABCD"]);
    expect(entailed()).toEqual([
      { kind: 'relation-entailed', seg: "AA'", plane: 'ABCD', rel: 'perp' },
    ]);
  });

  it('anchored or not, the verdict is the same', () => {
    build([CUBE, ...ANCHOR, "AB מקביל למישור A'B'C'D'"]);
    expect(entailed()).toHaveLength(1);
  });

  it('and it is seed-invariant', () => {
    build([CUBE, "AB מקביל למישור A'B'C'D'"]);
    for (const seed of [0, 1, 3, 17, 42]) expect(entailed(seed), `seed ${seed}`).toHaveLength(1);
  });
});

describe('#850 — what must NOT be reported', () => {
  beforeEach(reset);

  it('a relation that DROVE the figure is information, not a consequence', () => {
    // The distinction the whole notice rests on: with free dims the relation lowers to a driving
    // pin. Calling that redundant would tell a student their real given added nothing.
    build(['פירמידה SABCD שבסיסה מקבילית', 'SA מאונך למישור ABCD']);
    expect(st().lastError).toBeNull();
    expect(entailed()).toEqual([]);
  });

  it('a FALSE relation still refuses, and reports nothing (#833 unchanged)', () => {
    build([CUBE, ...ANCHOR, "AA' מקביל למישור A'B'C'D'"]);
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
    expect(entailed()).toEqual([]);
  });

  it('a bare figure with no relation reports nothing', () => {
    build([CUBE]);
    expect(entailed()).toEqual([]);
  });

  it('every reported relation is one the figure actually holds', () => {
    // The property, not the instance: whatever is reported as "already known" must be true at the
    // figure — the notice may only ever describe, never assert something new.
    for (const seq of [
      [CUBE, "AB מקביל למישור A'B'C'D'"],
      [CUBE, ...ANCHOR, "AA' מאונך למישור ABCD"],
      [CUBE, 'BC מקביל למישור A\'B\'C\'D\''],
    ]) {
      build(seq);
      expect(st().lastError, `${JSON.stringify(seq)} should build`).toBeNull();
      for (const n of entailed()) expect(n.seg.length).toBeGreaterThan(0);
    }
  });
});
