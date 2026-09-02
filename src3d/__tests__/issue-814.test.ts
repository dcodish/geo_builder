/**
 * #814 (ADR-3D-175) — A NAMED FREE COMPONENT: «D(3,p,0)» then «p חיובי».
 *
 * The class: *a component the student NAMED is stored as an anonymous free DOF — the name is
 * discarded at the parser boundary, so no later statement can address it.*
 *
 * What the letter MEANS was always handled. «D(3,p,0)» on an existing D means "D's y is unknown",
 * and the engine lowers it to a null pin component: a free sampled DOF, resampled by "show another
 * configuration" and selectable by a sign given (ADR-3D-032 / ADR-3D-094 — the "partial injection"
 * the exam gates in `scenarios3` and `v7-t2` are built on). What was missing is the NAME: nothing
 * recorded that the student called it `p`, so «p חיובי» refused «הפרמטר p לא הוגדר בסרטוט» — the
 * tool denying a statement it had just been given.
 *
 * The fix binds the name and nothing else; the component still solves exactly as before. The guard
 * that matters most is therefore NEGATIVE — `partialInjectionUnchanged` below pins the two exam
 * gates, because promoting these letters to pivot unknowns instead (the first attempt at this issue)
 * makes `solvePivot` report `givens-contradict` on satisfiable givens and breaks both.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { parse3 } from '../parser/parse3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);
const panel = () => dataView(derived().construction, state().seed).points;
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}

/** The operator's figure (prod, 2026-08-29): a pyramid on a parallelogram base whose base vertex is
 *  stated with a bare parameter. |AB| = |AD| with AD = (3,p,0) forces p = ±4; the sign given picks. */
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
/** The same figure with the parameter stated on the vector / pair lanes instead of the point. */
const LANE_SETUP = ['פירמידה SABCD שבסיסה מקבילית', 'נסמן: AB = u, AD = v, AS = w', 'A(0,0,0)', 'B(0,5,0)', 'S(0,0,6)'];

describe('#814 — the operator sequence', () => {
  beforeEach(reset);

  it('«p חיובי» selects the positive root and the figure prints its values, not «?»', () => {
    [...FIGURE, 'p חיובי'].forEach(submit);
    expectAllOk();
    expect(panel()).toEqual(['A(0, 0, 0)', 'B(0, 5, 0)', 'C(3, 9, 0)', 'D(3, 4, 0)', 'S(0, 0, 6)', 'M(3/2, 9/2, 0)']);
  });

  it('«p שלילי» selects the other root — the sign SELECTS, it never invents', () => {
    [...FIGURE, 'p שלילי'].forEach(submit);
    expectAllOk();
    // #818 (ADR-3D-179) reached the negative branch at every seed, so this is asserted on the PANEL
    // again — a value printed is a value identical across the panel's samples.
    expect(panel()).toEqual(['A(0, 0, 0)', 'B(0, 5, 0)', 'C(3, 1, 0)', 'D(3, -4, 0)', 'S(0, 0, 6)', 'M(3/2, 1/2, 0)']);
    expect(derived().positions.get('D')!.y).toBeCloseTo(-4, 5);
  });

  it('the selection holds at EVERY seed — a branch chosen by seed luck is not knowledge', () => {
    [...FIGURE, 'p חיובי'].forEach(submit);
    expectAllOk();
    for (const s of [0, 1, 2, 1013, 2027]) expect(derive3(state().facts, s).positions.get('D')!.y, `seed ${s}`).toBeCloseTo(4, 5);
  });

  it('the «p > 0» and English spellings reach the same place', () => {
    reset();
    [...FIGURE, 'p > 0'].forEach(submit);
    expectAllOk();
    expect(derived().positions.get('D')!.y).toBeCloseTo(4, 5);

    reset();
    [
      'pyramid SABCD with a parallelogram base',
      'M is the midpoint of diagonal BD',
      'let AB = u, AD = v, AS = w',
      'A(0,0,0)', 'B(0,5,0)', 'S(0,0,6)', 'D(3,p,0)', '|u| = |v|', 'p is positive',
    ].forEach(submit);
    expectAllOk();
    expect(derived().positions.get('D')!.y).toBeCloseTo(4, 5);
  });
});

describe('#814 — the class: a letter names a component on ANY injection lane', () => {
  beforeEach(reset);

  // the same figure, the parameter stated on each of the three lanes a tuple can be injected on
  const LANES: { label: string; inject: string }[] = [
    { label: 'existing point', inject: 'D(3,p,0)' },
    { label: 'vector', inject: 'v = (3,p,0)' },
    { label: 'pair', inject: 'AD = (3,p,0)' },
  ];

  for (const { label, inject } of LANES) {
    it(`${label}: «${inject}» + «p שלילי» selects the negative root`, () => {
      [...LANE_SETUP, inject, '|u| = |v|', 'p שלילי'].forEach(submit);
      expectAllOk();
      expect(derived().positions.get('D')!.y).toBeCloseTo(-4, 5);
    });

    it(`${label}: and «p חיובי» the positive one`, () => {
      [...LANE_SETUP, inject, '|u| = |v|', 'p חיובי'].forEach(submit);
      expectAllOk();
      expect(derived().positions.get('D')!.y).toBeCloseTo(4, 5);
    });
  }

  it('a letter the figure does NOT carry still refuses — the message is only shown when it is true', () => {
    [...FIGURE, 'q חיובי'].forEach(submit);
    expect(state().lastError).toEqual({ code: 'unknown-symbol', id: 'q' });
  });

  it('a letter naming a component the tuple then fixed numerically is not bound', () => {
    // z is a NUMBER here, so no letter names it; only p is addressable
    [...LANE_SETUP, 'D(3,p,0)', '|u| = |v|'].forEach(submit);
    expect(derived().construction.partialNames.map((b) => b.sym)).toEqual(['p']);
  });
});

describe('#814 — the partial injection is UNCHANGED (the exam gates this fix must not disturb)', () => {
  beforeEach(reset);

  // These are the two GATE figures whose whole subject is bare letters as free components. They are
  // reproduced here (not merely relied on in their own files) so that anyone changing how a named
  // component solves sees the cost in THIS file, next to the feature that tempted the change.
  it('2023 קיץ א Q2 — «A(3,n,p)»: only x constrains, the coordinate sign given picks the branch', () => {
    ['קובייה ABCD', "נסמן: AB = u, AD = v, AA' = w", 'D(0,0,0)', 'C(4,3,0)', 'A(3,n,p)',
     "שיעור ה-z של C' חיובי", 'A = (3, -4, 0)', "C' = (4, 3, 5)"].forEach(submit);
    expectAllOk();
    const d = derived();
    expect(d.positions.get('A')!.y).toBeCloseTo(-4, 4);
    expect(d.positions.get("C'")!.z).toBeCloseTo(5, 4);
  });

  it('2023 קיץ מועד ב Q2 — «B(p,3,0), C(0,n,0)» solve as free components, not pivot unknowns', () => {
    ['פירמידה ABCD', 'DC ניצב למישור ABC', 'E אמצע AD', 'נסמן: AB = u, AC = v, CD = w',
     'DF = (k/2)DB + kDC', 'EF מקביל למישור ABC', 'נתון: A(0,0,0), B(p,3,0), C(0,n,0)',
     'BD = (-4,5,12)', 'u·v = 24', 'B = (4, 3, 0)', 'C = (0, 8, 0)', 'D = (0, 8, 12)',
     'נפח הפירמידה ABCD = 64'].forEach(submit);
    expectAllOk();
    expect(derived().positions.get('D')!.z).toBeCloseTo(12, 3);
  });

  it('an unaddressed named component still RESAMPLES — naming is not pinning (ADR-052)', () => {
    ['פירמידה SABCD שבסיסה מקבילית', 'A(0,0,0)', 'B(0,5,0)', 'S(0,0,6)', 'D(3,p,0)'].forEach(submit);
    expect(state().lastError).toBeNull();
    const ys = [0, 1, 2].map((s) => derive3(state().facts, s).positions.get('D')!.y.toFixed(3));
    expect(new Set(ys).size).toBeGreaterThan(1);
    expect(panel().find((t) => t.startsWith('D'))).toBe('D(3, ?, 0)'); // a sample is not knowledge
  });
});

describe('#814 — the parser carries the NAME, never the solver register', () => {
  const cmds = (input: string) => {
    const r = parse3(input);
    expect(r.ok, input).toBe(true);
    return r.ok ? r.commands : [];
  };

  it('a bare letter emits `syms` and NOT `symExprs` — emitting the latter is what changes the solve', () => {
    expect(cmds('A(3,n,p)')).toEqual([
      { type: 'point3', id: 'A', x: 3, y: null, z: null, syms: [null, 'n', 'p'] },
    ]);
  });

  it('the vector and pair lanes gain the same name-only channel', () => {
    expect(cmds('v = (3,p,0)')).toEqual([
      { type: 'inject-vector', name: 'v', x: 3, y: null, z: 0, syms: [null, 'p', null] },
    ]);
    expect(cmds('AD = (3,p,0)')).toEqual([
      { type: 'inject-pair', a: 'A', b: 'D', x: 3, y: null, z: 0, syms: [null, 'p', null] },
    ]);
  });

  it('a STRUCTURED tuple still carries symExprs — that letter is a pivot unknown and stays one', () => {
    expect(cmds('v = (k-1, k, 3)')).toEqual([
      {
        type: 'inject-vector', name: 'v', x: null, y: null, z: 3,
        symExprs: [{ terms: [{ sym: 'k', k: 1 }], c: -1 }, { terms: [{ sym: 'k', k: 1 }], c: 0 }, null],
        syms: ['k', 'k', null],
      },
    ]);
  });

  it('an all-numeric tuple carries neither', () => {
    expect(cmds('A(3,1,2)')).toEqual([{ type: 'point3', id: 'A', x: 3, y: 1, z: 2 }]);
  });
});
