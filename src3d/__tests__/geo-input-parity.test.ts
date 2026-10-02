/**
 * #1649 (ADR-W-108) — 3-D's thin lock on the cross-product geometry-input parity rows
 * (`shell/__tests__/fixtures/geo-input-parity.ts`, docs/28 §5c).
 *
 * 3-D models plane figures as faces, bases and triangles inside a solid, so the CORE plane families
 * (polygons, lengths, angles, midpoints and ratios, cevians, parallel/perpendicular, area) are expected
 * here and give 2-D's verdict. Circle geometry (X8) and rows that need a free point (X9) are not expected
 * in 3-D — except the four circle rows of 3-D's own catalog, which are plain rows. Solids, planes and
 * vectors (X7) are 3-D's alone, and the other builders must refuse them.
 *
 * The runner is `decideSubmit3`, the function `store3.submit` dispatches; a `record` carries its facts and
 * seed forward. `not-understood` is the verdict the app escalates to the model — never called here.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, type Fact3, type Verdict3 } from '../store/store3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import {
  catalogCoverageFaults,
  parityFaults,
  type StepRunner,
  type StepVerdict,
} from '../../shell/__tests__/fixtures/geo-input-parity';

/** One verdict, in the rows' vocabulary. An `ambiguous-*` refusal is a question to the student. */
function verdictOf3D(v: Verdict3): StepVerdict {
  switch (v.kind) {
    case 'record':
      return { verdict: 'builds' };
    case 'already-stated':
      return { verdict: 'builds', code: 'already-stated' };
    case 'not-understood':
      return { verdict: 'not-handled' };
    case 'refused':
      return { verdict: /^ambiguous/.test(v.error.code) ? 'asks' : 'refused', code: v.error.code };
    case 'rename':
    case 'swap':
      return { verdict: 'builds', code: v.kind };
  }
}

const run3D: StepRunner = (steps) => {
  let s: { facts: Fact3[]; seed: number } = { facts: [], seed: 0 };
  return steps.map((line) => {
    const v = decideSubmit3(s, line);
    if (v.kind === 'record') s = { facts: v.facts, seed: v.seed };
    return verdictOf3D(v);
  });
};

describe('#1649 — 3-D gives 2-D’s verdict on every core plane-geometry parity row', () => {
  it('every row through decideSubmit3', async () => {
    expect(await parityFaults({ '3d': run3D })).toEqual([]);
  }, 120_000);

  it('every construction sentence of the 3-D catalog is a parity step, a topic exception, or on the shrinking allowlist', () => {
    const sentences = COMMAND_CATALOG_3D.filter((e) => e.lane !== 'rewrite').map((e) => e.he);
    expect(catalogCoverageFaults('3d', sentences)).toEqual([]);
  });
});
