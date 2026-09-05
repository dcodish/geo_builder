/**
 * #898 (ADR-3D-218) — A COORDINATE POWER ON A SOLID-FREE FIGURE IS REFUSED BY NAME, NEVER DROPPED.
 *
 * Measured at HEAD: «A(0,0,0)» + «C(p²,p,0)» built clean and drew C at (1.4715, 1.4715, 0) — x = y,
 * not x = y². The exponent vanished. The `comp` helper in `apply.ts`'s coord-sym branch reduces a
 * component to `{k, p}`, summing the terms' coefficients and never reading `t.e`, and that shape is
 * degree-1 by construction — so `p²` and `p` lower to the identical object. One lossy narrowing, and
 * it is the whole class: `p³`, `2p²-3`, and a power in y or z all dropped the same way.
 *
 * A silently dropped given is the honesty invariant's headline case, so this refuses. Operator ruling
 * 2026-09-05: refuse and say why; honouring powers in the free-point lane is NOT scheduled. The SOLID
 * lane (ADR-3D-214), where the pivot genuinely carries the exponent, is untouched — which is the half
 * of ADR-3D-214's "builds" row that was always true, now stated with its precondition.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';

const state = () => useGeo3.getState();
const build = (steps: string[]) => {
  state().clear();
  for (const u of steps) state().submit(u);
  return { st: state(), ...derive3(state().facts, state().seed) };
};
const BOX = "תיבה ABCDA'B'C'D'";

describe('#898 — a power with no solid refuses, and names itself', () => {
  beforeEach(() => state().clear());

  it("the operator's case: «A(0,0,0)» + «C(p²,p,0)» refuses instead of drawing «C(p,p,0)»", () => {
    const { st, construction } = build(['A(0,0,0)', 'C(p²,p,0)']);
    expect(st.lastError).toEqual({ code: 'power-needs-solid', id: 'C' });
    expect(st.facts, 'the refused statement is not committed').toHaveLength(1);
    expect(construction.points.has('C'), 'and no C is minted at the wrong place').toBe(false);
  });

  it('THE CLASS — every non-linear component refuses, in every position', () => {
    for (const u of [
      'C(p³,1,0)', // the degree-3 sibling
      'C(2p²-3,1,0)', // a coefficient and a constant around the power
      'C(1,p²,0)', // the y position
      'C(1,0,p²)', // the z position
      'C(p^2,1,0)', // the caret spelling of the same statement
    ]) {
      const { st } = build(['A(0,0,0)', u]);
      expect(st.lastError, u).toEqual({ code: 'power-needs-solid', id: 'C' });
    }
  });

  it('UNCHANGED — a LINEAR symbolic component still builds in the solid-free lane', () => {
    const { st, construction } = build(['A(0,0,0)', 'C(p,1,0)']);
    expect(st.lastError).toBeNull();
    expect(construction.points.get('C')).toMatchObject({ kind: 'coord-sym' });
    expect(construction.param).toBe('p');
  });

  it('UNCHANGED — the SOLID lane still honours the power (ADR-3D-214 is not narrowed)', () => {
    const { st, construction } = build([BOX, 'C(p²,p,0)']);
    expect(st.lastError).toBeNull();
    for (const seed of [0, 7, 1013]) {
      const { positions } = resolve3(construction, seed);
      const c = positions.get('C')!;
      expect(Math.abs(c.x - c.y * c.y), `seed ${seed}: x = y² still holds`).toBeLessThan(1e-5);
    }
  });

  it('the refusal is worded in BOTH locales, and the scope hint no longer over-promises', () => {
    expect(he.err.powerNeedsSolid).toBeTruthy();
    expect(en.err.powerNeedsSolid).toBeTruthy();
    // the guidance register promised «חזקות כן» unconditionally; under this ruling it is true only
    // in the solid lane, and a hint that promises what the next line refuses is the same defect.
    expect(he.scope['component-arithmetic']).toContain('בציור שיש בו גוף');
    expect(en.scope['component-arithmetic']).toContain('in a figure that has a solid');
  });
});
