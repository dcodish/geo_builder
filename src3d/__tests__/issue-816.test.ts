/**
 * #816 (ADR-3D-186) — SATISFIABILITY MUST NOT DEPEND ON ENTRY ORDER (docs/17 M2 law i).
 *
 * The operator's exam pyramid, with «|u| = |v|» typed BEFORE the coordinate injections, refused
 * `S(0,0,6)` as `injection-unsatisfiable` — while the identical fact set built fully determined when
 * the same line was typed after. The refusal was honest about what the pivot found (`solutions === 0`)
 * and wrong about the world: the givens are satisfiable, and the pivot proved it at 9 of 12 seeds.
 *
 * Root cause: the gauge-solving path spreads the GAUGE (eight rotations) and the pin SYMBOLS (#797),
 * and never the shape DIMS — the gap `solve3.ts` already named at the #818 continuation. The fix
 * applies the dims spread the `invariantOnly` branch has always used, on the failure path only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const state = () => useGeo3.getState();

const HEAD = [
  'פירמידה SABCD שבסיסה מקבילית',
  'המקצוע SA הוא גובה בפירמידה',
  'M אמצע אלכסון BD',
  'נסמן: AB = u, AD = v, AS = w',
];
const REL = '|u| = |v|';
const INJ = ['A(0,0,0)', 'B(0,5,0)', 'S(0,0,6)', 'D(3,p,0)'];
/** the operator's order: the size relation BEFORE the injections */
const RELATION_FIRST = [...HEAD, REL, ...INJ];
/** the order that already worked, and must stay byte-identical */
const RELATION_LAST = [...HEAD, ...INJ, REL];

/** submit every line at `seed`; returns the refusal that stopped it, or null */
function build(lines: string[], seed: number): string | null {
  useGeo3.setState({ facts: [], seed, lastError: null });
  useGeo3.temporal.getState().clear();
  for (const l of lines) {
    useGeo3.getState().submit(l);
    const e = state().lastError;
    if (e) return `${l} → ${JSON.stringify(e)}`;
  }
  return null;
}
const panel = (seed: number) => dataView(derive3(state().facts, seed).construction, seed).points;

// the three that failed before the fix, plus the wider sweep the diagnosis measured
const SEEDS = [0, 1, 2, 3, 4, 5, 7, 11, 17, 101, 1013, 2027];

describe('#816 — the relation-first order is satisfiable, at every seed', () => {
  beforeEach(reset);

  it.each([0, 1, 3])('seed %i — the three that refused before the fix now build', (seed) => {
    expect(build(RELATION_FIRST, seed)).toBeNull();
  });

  it('the whole 12-seed sweep builds — entry order buys nothing', () => {
    const refused = SEEDS.filter((s) => build(RELATION_FIRST, s) !== null);
    expect(refused).toEqual([]);
  });

  it('the relation-LAST order is unchanged — it never refused and still does not', () => {
    const refused = SEEDS.filter((s) => build(RELATION_LAST, s) !== null);
    expect(refused).toEqual([]);
  });

  /**
   * THE INVARIANT THE ISSUE IS ABOUT, asserted directly rather than by pinning values: the two orders
   * are the same fact SET, so every cell the panel prints must match, at every seed and with or
   * without the sign given. Pinning numbers would also pass while hiding an order difference in the
   * cells that read «?»; comparing the orders cannot.
   */
  it.each(SEEDS)('seed %i — the two orders print the SAME panel, bare and with either sign', (seed) => {
    for (const extra of [[], ['p חיובי'], ['p שלילי']]) {
      expect(build([...RELATION_FIRST, ...extra], seed)).toBeNull();
      const first = panel(seed);
      expect(build([...RELATION_LAST, ...extra], seed)).toBeNull();
      expect(panel(seed), `seed ${seed} · ${extra[0] ?? 'bare'}`).toEqual(first);
    }
  });
});

describe('#816 — and the figure the order reaches is the RIGHT one', () => {
  beforeEach(reset);

  /**
   * The pool the widening finds carries BOTH roots of `|AD| = 5` with `AD = (3, p, 0)` — so a stated
   * sign SELECTS, exactly as #814/#818 designed, and it does so at every seed. This is the assertion
   * that says the extra starts found real solutions rather than numerical debris.
   */
  it.each([0, 1, 3, 17])('seed %i — «p חיובי» selects +4 in the relation-first order', (seed) => {
    expect(build([...RELATION_FIRST, 'p חיובי'], seed)).toBeNull();
    expect(panel(seed)).toEqual(['A(0, 0, 0)', 'B(0, 5, 0)', 'C(3, 9, 0)', 'D(3, 4, 0)', 'S(0, 0, 6)', 'M(3/2, 9/2, 0)']);
  });

  it.each([0, 1, 3, 17])('seed %i — «p שלילי» selects −4 in the relation-first order', (seed) => {
    expect(build([...RELATION_FIRST, 'p שלילי'], seed)).toBeNull();
    expect(panel(seed)).toEqual(['A(0, 0, 0)', 'B(0, 5, 0)', 'C(3, 1, 0)', 'D(3, -4, 0)', 'S(0, 0, 6)', 'M(3/2, 1/2, 0)']);
  });
});

describe('#816 — widening must not turn a REAL refusal into a long search that gives up', () => {
  beforeEach(reset);

  /**
   * `SA` is the pyramid's height, so `AS ⟂ AB`. `S(0,3,6)` gives `AS·AB = 15 ≠ 0`: genuinely
   * unsatisfiable, and it must still be refused — the widening only ever ADDS starts, so a system
   * with no solution still finds none.
   */
  it('a coordinate that contradicts a stated perpendicularity is still refused', () => {
    const refusal = build([...HEAD, REL, 'A(0,0,0)', 'B(0,5,0)', 'S(0,3,6)'], 0);
    expect(refusal).not.toBeNull();
    expect(refusal).toContain('S(0,3,6)');
  });
});
