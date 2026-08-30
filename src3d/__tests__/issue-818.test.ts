/**
 * #818 (ADR-3D-179) — A STATED SIGN GIVEN IS NEVER VIOLATED AT ANY SEED: sign-axis continuation.
 *
 * The operator's pyramid (2026-08-29): |AB| = |AD| with AD = (3, p, 0) forces p = ±4, and the sign
 * given selects −4. Measured before the fix, D.y by seed: 4 → −4, 1017 → +4, 2031 → −4. At seed 1017 the
 * pivot's pool held NINE solutions and every one carried D.y = +4: the multi-start spreads the gauge
 * (eight rotations) and the pin symbols (#797's walk), but the shape dims start at the seed's single
 * sample in every start — and the two branches differ only in a dim (the parallelogram's angle,
 * acute vs obtuse). The sign filter then fell through to the unfiltered pool and the drawing
 * contradicted the given (the store's verifier named it `sign-unsatisfiable` — a FALSE refusal of a
 * satisfiable statement, and the panel fell back to «D(3, ?, 0)»).
 *
 * After: when no solution of a mirror honours every stated sign, the pivot restarts from each found
 * solution with the violated coordinate hard-pinned at its negation while gauge and dims adapt, then
 * releases — the #797 two-step walk along the axis the student named. Failure path only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

const facts = (us: string[]): Fact3[] =>
  us.map((u, i) => {
    const p = parse3(u);
    if (!p.ok) throw new Error(`parse failed: ${u}`);
    return { id: `f${i}`, utterance: u, cmds: p.commands, enabled: true };
  });

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
];
const COORD_SIGN = 'שיעור ה-y של D הוא שלילי';
const NAMED_SIGN = 'p שלילי';
// the operator's seed table (4 / 1017 / 2031 / 5 / 11) plus the panel's and the #814 battery's seeds
const SEEDS = [0, 1, 2, 4, 5, 11, 1013, 1017, 2027, 2031];

const allOk = (d: ReturnType<typeof derive3>) => Object.values(d.status).every((s) => s === 'ok');

describe('#818 — the negative branch is reached at every seed', () => {
  beforeEach(reset);

  for (const [label, sign] of [['the coordinate sign given', COORD_SIGN], ['the named-component sign (#814)', NAMED_SIGN]] as const) {
    it(`${label}: D.y = −4 at every seed of the battery, and the figure is green there`, () => {
      const fs = facts([...FIGURE, sign]);
      for (const seed of SEEDS) {
        const d = derive3(fs, seed);
        expect(allOk(d), `seed ${seed}: ${JSON.stringify(d.status)}`).toBe(true);
        expect(d.positions.get('D')!.y, `seed ${seed}`).toBeCloseTo(-4, 5);
        expect(d.positions.get('C')!.y, `seed ${seed}`).toBeCloseTo(1, 5);
      }
    });
  }

  it('the panel prints the SELECTED value — «D(3, -4, 0)» is knowledge now, not «?»', () => {
    [...FIGURE, COORD_SIGN].forEach(submit);
    expect(state().lastError).toBeNull();
    const d = derive3(state().facts, state().seed);
    const coords = dataView(d.construction, state().seed).points;
    expect(coords).toContain('D(3, -4, 0)');
    expect(coords).toContain('C(3, 1, 0)');
  });

  it('the POSITIVE sign is untouched: +4 at every seed (the branch the cold starts always found)', () => {
    const fs = facts([...FIGURE, 'שיעור ה-y של D הוא חיובי']);
    for (const seed of SEEDS) {
      const d = derive3(fs, seed);
      expect(allOk(d), `seed ${seed}`).toBe(true);
      expect(d.positions.get('D')!.y, `seed ${seed}`).toBeCloseTo(4, 5);
    }
  });

  it('a sign NOBODY can satisfy still refuses, naming the statement — the walk finds branches, never invents them', () => {
    // A = (0,0,0) is a coordinate injection; the base parallelogram with |AB| = |AD| = 5 keeps D.z = 0
    // (S A is the height, so the base is z = 0): «D.z is positive» has no solution anywhere.
    [...FIGURE, 'שיעור ה-z של D הוא חיובי'].forEach(submit);
    expect(state().lastError).toEqual({ code: 'sign-unsatisfiable', id: 'D' });
  });

  it('«show another configuration» never lands on a violating drawing: the whole seed walk honours the sign', () => {
    [...FIGURE, COORD_SIGN].forEach(submit);
    for (let i = 0; i < 6; i++) {
      state().resample();
      const d = derive3(state().facts, state().seed);
      expect(allOk(d), `seed ${state().seed}: ${JSON.stringify(d.status)}`).toBe(true);
      expect(d.positions.get('D')!.y, `seed ${state().seed}`).toBeLessThan(0);
    }
  });
});
