/**
 * #909 (ADR-3D-215) — A STATED ANGLE BETWEEN TWO SEGMENTS IS A GIVEN, NOT A QUIZ.
 *
 * `relationTable`'s `'angle|segment|segment'` row has always declared `drive-dims`, but `apply.ts`
 * guarded the pin on `claim.a1 === claim.a2` — because the only pin kind available (`vangle`) is
 * shaped as *vertex + two rays* and cannot express an angle between segments that do not meet. Every
 * other spelling fell out of the drive lane into the claim lane and was refuted against whichever
 * figure the seed happened to produce:
 *
 *     «תיבה ABCDA'B'C'D'» + «הזווית בין AC לבין AB היא 40»    → built, 40.0000°   (a1 === a2)
 *     «תיבה ABCDA'B'C'D'» + «הזווית בין A'C לבין BC' היא 70»  → claim-refuted     ← the defect
 *     «תיבה ABCDA'B'C'D'» + «הזווית בין AC לבין BA היא 40»    → claim-refuted     ← the SAME angle at A
 *
 * The class is "the angle between two segments drives", not "A'C and BC' drive": two space diagonals,
 * an edge against a non-incident diagonal, and the three alternate shared-endpoint spellings are all
 * the same statement, and all of them refused.
 *
 * The fix: a `seg-angle` ScalarPin whose residual is the UNDIRECTED line angle |cos| — deliberately
 * not `cos-angle`'s signed `cosOf`, since the two segments are independent and which endpoint each
 * was written from is arbitrary; |cos| is exactly the quantity `verifyClaim` measures. A shared
 * endpoint in ANY of its four spellings normalizes to `vangle`, which both conditions better and
 * carries the arc/knee the renderer draws.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { rightAngles3 } from '../render/rightAngles';
import { dist3, dot3, norm3, sub3 } from '../engine/vec3';
import type { Positions3 } from '../engine/types';

const state = () => useGeo3.getState();
const submit = (u: string) => state().submit(u);
const build = (steps: string[]) => {
  state().clear();
  for (const u of steps) submit(u);
  return { st: state(), ...derive3(state().facts, state().seed) };
};

/** The verifier's own quantity (claims.ts `angle-seg-eq`): the undirected angle between two lines. */
const segAngle = (pos: Positions3, a1: string, b1: string, a2: string, b2: string) => {
  const d1 = sub3(pos.get(b1)!, pos.get(a1)!);
  const d2 = sub3(pos.get(b2)!, pos.get(a2)!);
  return (Math.acos(Math.min(1, Math.abs(dot3(d1, d2)) / (norm3(d1) * norm3(d2)))) * 180) / Math.PI;
};

const BOX = "תיבה ABCDA'B'C'D'";
const CUBE = "קובייה ABCDA'B'C'D'";
/** Several seeds, per the plan: a drive that only holds at seed 0 is a coincidence. */
const SEEDS = [0, 7, 1013, 2027];

describe("#909 — «הזווית בין A'C לבין BC' היא 70» DRIVES the figure", () => {
  beforeEach(() => state().clear());

  it("the operator's exact sequence builds, and the angle MEASURES 70 at every seed", () => {
    const { st, construction } = build([BOX, "הזווית בין A'C לבין BC' היא 70"]);
    expect(st.lastError, 'the given is honoured, not refuted').toBeNull();
    expect(st.facts).toHaveLength(2);
    for (const seed of SEEDS) {
      const { positions } = resolve3(construction, seed);
      expect(segAngle(positions, "A'", 'C', 'B', "C'"), `seed ${seed}`).toBeCloseTo(70, 4);
    }
  });

  it('lowers to a seg-angle PIN — the drive lane, not the claim lane', () => {
    const { construction } = build([BOX, "הזווית בין A'C לבין BC' היא 70"]);
    expect(construction.scalarPins).toEqual([{ kind: 'seg-angle', a1: "A'", b1: 'C', a2: 'B', b2: "C'", deg: 70 }]);
    expect(construction.claims.filter((c) => c.type === 'angle-seg-eq')).toHaveLength(0);
  });

  it('THE CLASS — every disjoint segment pair drives, on every carrier', () => {
    const cases: [string, string, [string, string, string, string], number][] = [
      ['two space diagonals', "הזווית בין AC' לבין BD' היא 55", ['A', "C'", 'B', "D'"], 55],
      ['edge vs non-incident diagonal', "הזווית בין AB לבין A'C' היא 30", ['A', 'B', "A'", "C'"], 30],
      ['two face diagonals', "הזווית בין A'C לבין BC' היא 62", ["A'", 'C', 'B', "C'"], 62],
    ];
    for (const [name, u, m, deg] of cases) {
      const { st, construction } = build([BOX, u]);
      expect(st.lastError, name).toBeNull();
      for (const seed of SEEDS) {
        const { positions } = resolve3(construction, seed);
        expect(segAngle(positions, ...m), `${name} @ seed ${seed}`).toBeCloseTo(deg, 4);
      }
    }
  });

  it('a PYRAMID carrier too — the fix is not keyed on the solid kind', () => {
    const { st, construction } = build(['פירמידה ABCDS שבסיסה ריבוע', 'הזווית בין SA לבין BC היא 60']);
    expect(st.lastError).toBeNull();
    for (const seed of SEEDS) {
      const { positions } = resolve3(construction, seed);
      expect(segAngle(positions, 'S', 'A', 'B', 'C'), `seed ${seed}`).toBeCloseTo(60, 4);
    }
  });

  it('TWO angle givens hold at once', () => {
    const { st, construction } = build([BOX, "הזווית בין A'C לבין BC' היא 70", "הזווית בין AC' לבין BD' היא 55"]);
    expect(st.lastError).toBeNull();
    for (const seed of SEEDS) {
      const { positions } = resolve3(construction, seed);
      expect(segAngle(positions, "A'", 'C', 'B', "C'"), `seed ${seed}`).toBeCloseTo(70, 4);
      expect(segAngle(positions, 'A', "C'", 'B', "D'"), `seed ${seed}`).toBeCloseTo(55, 4);
    }
  });

  it('an angle is similarity-INVARIANT — it composes with a stated size instead of fighting it', () => {
    const { st, construction } = build([BOX, "הזווית בין A'C לבין BC' היא 70", 'AB = 5']);
    expect(st.lastError).toBeNull();
    const { positions } = resolve3(construction, 0);
    expect(dist3(positions.get('A')!, positions.get('B')!), '|AB| still 5').toBeCloseTo(5, 4);
    expect(segAngle(positions, "A'", 'C', 'B', "C'"), 'and the angle still 70').toBeCloseTo(70, 4);
  });
});

describe('#909 — all four SHARED-ENDPOINT spellings state one angle', () => {
  beforeEach(() => state().clear());

  it('each builds and measures 40 — three of the four were refuted before', () => {
    for (const [u, m] of [
      ['הזווית בין AC לבין AB היא 40', ['A', 'C', 'A', 'B']], // a1 === a2 — the one that worked
      ['הזווית בין AC לבין BA היא 40', ['A', 'C', 'B', 'A']], // a1 === b2
      ['הזווית בין CA לבין AB היא 40', ['C', 'A', 'A', 'B']], // b1 === a2
      ['הזווית בין CA לבין BA היא 40', ['C', 'A', 'B', 'A']], // b1 === b2
    ] as [string, [string, string, string, string]][]) {
      const { st, construction } = build([BOX, u]);
      expect(st.lastError, u).toBeNull();
      for (const seed of SEEDS) {
        const { positions } = resolve3(construction, seed);
        expect(segAngle(positions, ...m), `«${u}» @ seed ${seed}`).toBeCloseTo(40, 4);
      }
    }
  });

  it('all four normalize to ONE vangle pin at the shared vertex — same pin, so the arc is drawn', () => {
    const expected = { kind: 'vangle', vertex: 'A', deg: 40 };
    for (const u of ['הזווית בין AC לבין AB היא 40', 'הזווית בין AC לבין BA היא 40', 'הזווית בין CA לבין AB היא 40', 'הזווית בין CA לבין BA היא 40']) {
      const { construction } = build([BOX, u]);
      expect(construction.scalarPins, u).toHaveLength(1);
      expect(construction.scalarPins[0], u).toMatchObject(expected);
      // the two rays are B and C in some order — the vertex is what must not drift
      const pin = construction.scalarPins[0] as { p: string; q: string };
      expect([pin.p, pin.q].sort(), u).toEqual(['B', 'C']);
    }
  });

  it('UNCHANGED GUARD — the a1 === a2 route is byte-identical to before the fix', () => {
    const { st, construction } = build([BOX, 'הזווית בין AC לבין AB היא 40']);
    expect(st.lastError).toBeNull();
    expect(construction.scalarPins).toEqual([{ kind: 'vangle', vertex: 'A', p: 'C', q: 'B', deg: 40 }]);
  });
});

describe('#909 — the REFUSALS the drive must not swallow', () => {
  beforeEach(() => state().clear());

  it('a DETERMINED figure still verifies the answer: a cube forces 90, so 70 is refuted', () => {
    const wrong = build([CUBE, "הזווית בין A'C לבין BC' היא 70"]);
    expect(wrong.st.lastError, 'the verify-your-answer register is preserved').toEqual({ code: 'claim-refuted' });
    const right = build([CUBE, "הזווית בין A'C לבין BC' היא 90"]);
    expect(right.st.lastError, 'and the true value is accepted').toBeNull();
  });

  it('two CONTRADICTORY angles name both statements — never a silent best-effort', () => {
    const { st } = build([BOX, "הזווית בין A'C לבין BC' היא 70", "הזווית בין A'C לבין BC' היא 30"]);
    expect(st.lastError).toMatchObject({ code: 'givens-contradict', stated: "הזווית בין A'C לבין BC' היא 30" });
    expect((st.lastError as { others: string[] }).others).toContain("הזווית בין A'C לבין BC' היא 70");
  });

  it('a value outside (0°, 90°] is refused — the relation is the LINE angle', () => {
    for (const deg of [0, 91, 120]) {
      const { st } = build([BOX, `הזווית בין A'C לבין BC' היא ${deg}`]);
      expect(st.lastError, `${deg}°`).toMatchObject({ code: 'givens-contradict' });
    }
  });

  /**
   * The issue's proposed lock said 20° must REFUSE, on a measured «achievable range» of 47.76°–89.95°.
   * That range was measured over SAMPLED boxes, not achievable ones: with a = |AB| small and c = |AA'|
   * small against b = |AD|, cos = |b²−c²| / (√(a²+b²+c²)·√(b²+c²)) → 1. Refusing 20° would have been
   * exactly the ADR-052 cardinal sin — treating the tool's own sampled proportions as a given the
   * student never stated. So 20° is honoured, and what this locks is that the box it produces is a
   * LEGAL box, checked against the closed form rather than against the engine's own opinion.
   */
  it('a value that needs an extreme box is HONOURED, and the box is still a box', () => {
    const { st, construction } = build([BOX, "הזווית בין A'C לבין BC' היא 20"]);
    expect(st.lastError).toBeNull();
    const { positions: p } = resolve3(construction, 0);
    const [u, v, w] = [
      sub3(p.get('B')!, p.get('A')!),
      sub3(p.get('D')!, p.get('A')!),
      sub3(p.get("A'")!, p.get('A')!),
    ];
    for (const [n, x, y] of [['AB^AD', u, v], ["AB^AA'", u, w], ["AD^AA'", v, w]] as const) {
      expect(Math.abs(dot3(x, y)) / (norm3(x) * norm3(y)), `${n} is a right angle`).toBeLessThan(1e-6);
    }
    // the independent closed form for a rectangular box, not the engine's own measurement
    const [a, b, c] = [norm3(u), norm3(v), norm3(w)];
    const cf = Math.abs(b * b - c * c) / (Math.sqrt(a * a + b * b + c * c) * Math.sqrt(b * b + c * c));
    expect((Math.acos(cf) * 180) / Math.PI, 'closed form agrees with the drive').toBeCloseTo(20, 3);
  });
});

describe('#909 — a stated right angle is still DRAWN', () => {
  beforeEach(() => state().clear());

  /**
   * The two base diagonals share no endpoint — so they take the new pin — but they DO meet, which is
   * what the knee needs (`rightAngles3` marks a ⟂ only where it genuinely meets; a skew pair stays
   * unmarked by design, the R³ honesty rule). Before the fix the mark came off the RECORDED CLAIM;
   * the drive removes that claim, so without the `seg-angle` arm this figure would build the right
   * angle and stop drawing it.
   */
  it('90° between two crossing segments still emits a knee, now off the PIN', () => {
    const { st, construction, resolved } = build([BOX, 'הזווית בין AC לבין BD היא 90']);
    expect(st.lastError).toBeNull();
    expect(construction.scalarPins[0]).toMatchObject({ kind: 'seg-angle', deg: 90 });
    const marks = rightAngles3(construction, resolved, 1.5);
    expect(marks.length, 'the stated ⟂ produces a knee').toBeGreaterThan(0);
  });

  it('and the base really is driven square by it', () => {
    const { construction } = build([BOX, 'הזווית בין AC לבין BD היא 90']);
    for (const seed of SEEDS) {
      const { positions } = resolve3(construction, seed);
      expect(segAngle(positions, 'A', 'C', 'B', 'D'), `seed ${seed}`).toBeCloseTo(90, 4);
      expect(dist3(positions.get('A')!, positions.get('B')!), `seed ${seed}: a rhombus base`).toBeCloseTo(
        dist3(positions.get('A')!, positions.get('D')!),
        4,
      );
    }
  });
});
