/**
 * Issues #612 + #615 (ADR-3D-158) — two halves of "a shape is what it says, and only what it says".
 *
 * **#612, the student's side.** On «פירמידה ABCDS שבסיסה ריבוע» every following quad noun committed
 * green: «ריבוע ABCD» twice, then «מלבן ABCD», then «מעוין ABCD». Measured at the time: 9 scalarPins,
 * 1 claim, `notices: []` — the statements were absorbed as DRIVES on a base whose ring is generated
 * structurally with zero free dims, so they could drive nothing and verify nothing. Operator ruling
 * (2026-08-15): a less specific name is a **naming error**; the same name is **redundant** and must say
 * so.
 *
 * **#615, the tool's side.** Found while implementing that ruling: the flat lane lowered to constraint
 * sets only, so the remaining dims came from `polygon4`'s generic sampling and the solver stopped
 * wherever the residual hit zero — «מקבילית ABCD» drew at 89.4° (a rectangle) and «טרפז ABCD» drew
 * right-angled, both at seed 0. ADR-052 forbids exactly those renderings in as many words. Shipping the
 * refusal without this would hold the student to a rule the tool breaks itself.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dot3, norm3, sub3, dist3 } from '../engine/vec3';
import { QUAD_IMPLIES, quadImplies, quadShapeDrawn, quadDrawnDegenerate, type QuadBase } from '../engine/baseShapes';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, planeDisplay: {}, queries: [] });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
/** Derive at the seed the STORE chose — the seed search is half of what #615 fixes. */
const derived = () => derive3(state().facts, state().seed);
const P = (d: ReturnType<typeof derive3>, id: string) => d.positions.get(id)!;
const ring = (d: ReturnType<typeof derive3>) => ['A', 'B', 'C', 'D'].map((i) => P(d, i));

describe("#612 — the operator's exact sequence", () => {
  beforeEach(reset);

  it('«ריבוע ABCD» on a square base is REDUNDANT: a notice, and the figure is untouched', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    const before = derived();
    submit('ריבוע ABCD');
    expect(state().lastError, 'true and already known — not an error').toBeNull();
    const d = derived();
    expect(d.notices.some((n) => n.kind === 'already-known' && n.rel === 'shape'), 'the student must be told it added nothing').toBe(true);
    // and it really did nothing: no pins accumulated, no point moved
    expect(d.construction.scalarPins.length).toBe(before.construction.scalarPins.length);
    for (const id of ['A', 'B', 'C', 'D', 'S']) expect(dist3(P(d, id), P(before, id))).toBeLessThan(1e-9);
  });

  it('«מלבן ABCD» on a square base is a NAMING ERROR (the ruling)', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('מלבן ABCD');
    expect(state().lastError).toEqual({ code: 'shape-less-specific', stated: 'rectangle', actual: 'square' });
  });

  it('«מעוין ABCD» likewise — the ruling is about specificity, not about one noun', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('מעוין ABCD');
    expect(state().lastError).toEqual({ code: 'shape-less-specific', stated: 'rhombus', actual: 'square' });
  });

  it('the refusal names BOTH shapes, so the message can say what the figure actually is', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('דלתון ABCD');
    const err = state().lastError;
    expect(err && 'stated' in err && 'actual' in err, 'an honest refusal names the conflict').toBe(true);
  });
});

describe('#612 — what a naming error is NOT: a statement that ADDS information still drives', () => {
  beforeEach(reset);

  it('a rectangle base told it is a square DRIVES — refusing this would break ADR-052', () => {
    // the aspect of a stated rectangle is a free DOF; «ריבוע» states more, it does not mis-name
    submit('פירמידה ABCDS שבסיסה מלבן');
    submit('ריבוע ABCD');
    expect(state().lastError, 'specialising a shape is new information, never a naming error').toBeNull();
    const d = derived();
    const [A, B, C] = ring(d);
    expect(dist3(A, B)).toBeCloseTo(dist3(B, C), 4);
  });

  it('and the ring is KNOWN as the more specific shape afterwards — so the reverse is now an error', () => {
    submit('פירמידה ABCDS שבסיסה מלבן');
    submit('ריבוע ABCD');
    submit('מלבן ABCD');
    expect(state().lastError).toEqual({ code: 'shape-less-specific', stated: 'rectangle', actual: 'square' });
  });

  it('a shape stated on a FRESH ring is not a naming error against itself', () => {
    submit('מקבילית ABCD');
    expect(state().lastError).toBeNull();
  });
});

describe('#612 — the implication table is the whole ruling, stated once', () => {
  it('the inclusive hierarchy holds where it should', () => {
    expect(quadImplies('square', 'rectangle')).toBe(true);
    expect(quadImplies('square', 'rhombus')).toBe(true);
    expect(quadImplies('square', 'kite')).toBe(true);
    expect(quadImplies('rectangle', 'parallelogram')).toBe(true);
    expect(quadImplies('rhombus', 'kite')).toBe(true);
  });

  it('TRAPEZOID is exclusive — the Israeli-curriculum reading, and the reason it is a table not a lattice', () => {
    expect(quadImplies('parallelogram', 'trapezoid'), 'a parallelogram is NOT a trapezoid').toBe(false);
    expect(quadImplies('square', 'trapezoid')).toBe(false);
  });

  it('every shape implies itself and the generic quad, and nothing implies something more specific', () => {
    for (const base of Object.keys(QUAD_IMPLIES) as QuadBase[]) {
      expect(quadImplies(base, base), `${base} implies itself`).toBe(true);
      expect(quadImplies(base, 'quad'), `${base} is a quadrilateral`).toBe(true);
      if (base !== 'square') expect(quadImplies(base, 'square'), `${base} must not imply square`).toBe(false);
    }
  });
});

describe('#615 — a declared shape never DRAWS as a special case of itself (ADR-052)', () => {
  beforeEach(reset);

  /** noun → the degeneracy its drawing must avoid, as the operator would see it. */
  const CASES: [string, QuadBase][] = [
    ['מקבילית ABCD', 'parallelogram'],
    ['טרפז ABCD', 'trapezoid'],
    ['דלתון ABCD', 'kite'],
    ['מלבן ABCD', 'rectangle'],
    ['מעוין ABCD', 'rhombus'],
  ];

  for (const [u, base] of CASES) {
    it(`"${u}" draws visibly as a ${base}, at the seed the student first sees`, () => {
      reset();
      submit(u);
      expect(state().lastError).toBeNull();
      const d = derived();
      expect(quadShapeDrawn(base, ring(d)), 'it must BE the stated shape').toBe(true);
      expect(quadDrawnDegenerate(base, ring(d)), 'and must not look like a special case of itself').toBe(false);
    });
  }

  it('the reported regression, as measured: «מקבילית ABCD» is not right-angled', () => {
    submit('מקבילית ABCD');
    const d = derived();
    const [A, B, C] = ring(d);
    const u = sub3(A, B);
    const v = sub3(C, B);
    // it drew at |cos| = 0.010 (89.4°) before this fix
    expect(Math.abs(dot3(u, v) / (norm3(u) * norm3(v)))).toBeGreaterThan(0.06);
  });

  it('«טרפז ABCD» is neither RIGHT-angled nor a parallelogram — the sibling the lattice alone missed', () => {
    submit('טרפז ABCD');
    const d = derived();
    expect(quadShapeDrawn('parallelogram', ring(d)), 'exactly one parallel pair').toBe(false);
    expect(quadDrawnDegenerate('trapezoid', ring(d))).toBe(false);
  });

  it('it holds across configurations, not just the first — «show another» must not reintroduce it', () => {
    submit('מקבילית ABCD');
    for (let i = 0; i < 3; i++) {
      useGeo3.getState().resample();
      const d = derived();
      expect(quadDrawnDegenerate('parallelogram', ring(d)), `after resample ${i + 1}`).toBe(false);
    }
  });
});

describe('#615 — a PREFERENCE, never a requirement: forced givens still draw', () => {
  beforeEach(reset);

  it('a parallelogram the givens force to be right-angled still builds', () => {
    // the student has said something consistent; the tool must draw it, not refuse it
    submit('מקבילית ABCD');
    submit('זווית ABC = 90');
    expect(state().lastError, 'the appearance rule must YIELD, never refuse').toBeNull();
    const d = derived();
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  });

  it('the corner-completion case that surfaced it: a square sharing three corners with a parallelogram', () => {
    submit('מקבילית ABCD');
    submit('ריבוע ABCE');
    expect(state().lastError).toBeNull();
    expect(derived().positions.has('E')).toBe(true);
  });
});
