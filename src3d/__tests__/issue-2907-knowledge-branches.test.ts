/**
 * #2907 (ADR-3D-498) — THE KNOWLEDGE SAMPLES REACH EVERY ADMISSIBLE BRANCH OF A FREE LANE.
 *
 * pipeline-lock: the checks are panel rows («או» options) and the knowledge sample set itself; a fixture walk asserts
 * neither, so the operator-path sequence is replayed here.
 *
 * The 2019 exam cube (scenarios3's «2019 קיץ Q2») with its first row deleted leaves A′, C′ and D free. «A'K : A'C = 2 : 3»
 * with K = (2, 4, 2) on the line A′C then has two roots: A′ = (6, 0, 6) (K between A′ and C, |A′C| = 6√3) and
 * A′ = (6/5, 24/5, 6/5) (A′ between K and C, |A′C| = 6√3/5); in the second, BC′ ⟂ A′C and the plane BC′D through K are met
 * by choosing C′ and D. Every cold start puts a free point's coordinates at the seed's one sample, so every pool held the
 * first root only, and every knowledge gate, which judges agreement across the pools, read it as the only one. `main`
 * withheld A′ only because its samples disagreed at the 1e-6 level (solver imprecision); an exact solve (#2894 item A)
 * printed «|A′C| = 6√3».
 *
 * The fix: the pivot's BRANCH FAN reaches a determined free point's other roots from the found solution, the records of
 * the admissible set (`pointRoots`, `symRoots`) carry them, and the read-back sampler stands on each one. The drawing's
 * pick never takes one, so no figure is redrawn.
 */
import { describe, expect, it } from 'vitest';
import { dataView, panelSeeds3 } from '../engine/dataView';
import { knowledgeSamples3 } from '../engine/evaluate';
import { claimSeeds } from '../engine/claims';
import { answerQuery } from '../engine/queries';
import { decideSubmit3, derive3, useGeo3, type Fact3 } from '../store/store3';
import type { Seed3 } from '../engine/components3';

type St = { facts: Fact3[]; seed: Seed3 };
const HE = ['קובייה ABCD', 'B(0,0,0)', 'A(6,0,0)', 'C(0,6,0)', "שיעור ה-z של B' חיובי", "הזווית בין A'C לבין BC' היא 90", "הישר A'C חותך את המישור BC'D בנקודה K", 'K = (2, 4, 2)', "A'K : A'C = 2 : 3"];
const EN = ['cube ABCD', 'B(0,0,0)', 'A(6,0,0)', 'C(0,6,0)', "the z-coordinate of B' is positive", "the angle between A'C and BC' is 90", "line A'C cuts plane BC'D at K", 'K = (2, 4, 2)', "A'K : A'C = 2 : 3"];
const BOTH = "A'(6, 0, 6) או (6/5, 24/5, 6/5)";

function build(lines: readonly string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    if (v.kind !== 'record') throw new Error(`«${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}
/** ✕ on the first row («קובייה ABCD») — the store's own `remove`, on the store the student typed into. */
function withoutCube(lines: readonly string[]): St {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
  for (const l of lines) {
    useGeo3.getState().submit(l);
    if (useGeo3.getState().lastError) throw new Error(`«${l}»: ${JSON.stringify(useGeo3.getState().lastError)}`);
  }
  useGeo3.getState().remove(useGeo3.getState().facts[0].id);
  const { facts, seed, lastError } = useGeo3.getState();
  if (lastError) throw new Error(JSON.stringify(lastError));
  return { facts, seed };
}
const near = (p: { x: number; y: number; z: number } | undefined, q: [number, number, number]): boolean =>
  !!p && Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]) < 1e-3; // the pool's anchored solves stop near, not at, a root

describe('#2907 — the cube deleted: A′ has two roots, and the panel says so', () => {
  const st = withoutCube(HE);
  const c = derive3(st.facts, st.seed).construction;

  it('every read-back sample set holds BOTH roots of A′ at every panel seed', () => {
    for (const seed of [0, 1, 5]) {
      const samples = knowledgeSamples3(derive3(st.facts, seed).construction, panelSeeds3(seed), { readback: true });
      const a = samples.map((r) => r.positions.get("A'"));
      expect(a.some((p) => near(p, [6, 0, 6])), `seed ${seed}`).toBe(true);
      expect(a.some((p) => near(p, [1.2, 4.8, 1.2])), `seed ${seed}`).toBe(true);
      // and nothing else: every sample's A′ is one of the two
      expect(a.every((p) => near(p, [6, 0, 6]) || near(p, [1.2, 4.8, 1.2])), `seed ${seed}`).toBe(true);
    }
  }, 240_000);

  it('the panel prints A′ as its two options, K as the given, and no length A′C', () => {
    for (const seed of [0, 1]) {
      const p = dataView(derive3(st.facts, seed).construction, seed);
      expect(p.points, `seed ${seed}`).toContain(BOTH);
      expect(p.points, `seed ${seed}`).toContain('K(2, 4, 2)');
      expect(JSON.stringify(p).includes('6√3'), `seed ${seed}`).toBe(false);
    }
  }, 240_000);

  it('the ask lane agrees: A′ reads its two options; |A′C| is not one number', () => {
    const a = answerQuery(c, "A'", st.seed);
    expect(a.answer).toBe('(6, 0, 6) או (6/5, 24/5, 6/5)');
    const len = answerQuery(c, "|A'C|", st.seed);
    expect(len.answer === null || !/^6√3$/.test(String(len.answer))).toBe(true);
  }, 240_000);

  // measured on main (4440a620): the cold starts themselves reach the second root at seed 2 — the drawing is main's at every seed
  it('the drawing never stands on a fanned root: A′ is drawn where main draws it, seed by seed', () => {
    const MAIN: [number, number, number][] = [[6, 0, 6], [6, 0, 6], [1.2, 4.8, 1.2], [6, 0, 6], [6, 0, 6], [6, 0, 6]];
    MAIN.forEach((want, seed) => expect(near(derive3(st.facts, seed).positions.get("A'"), want), `seed ${seed}`).toBe(true));
  }, 240_000);

  it('the plain sampler (claims, narrowing) stands on the drawn configurations only: one sample per seed', () => {
    expect(knowledgeSamples3(c, claimSeeds(st.seed))).toHaveLength(claimSeeds(st.seed).length);
  }, 240_000);
});

describe('#2907 — the class: the same figure in English', () => {
  it('reads the same two options', () => {
    const st = withoutCube(EN);
    expect(dataView(derive3(st.facts, st.seed).construction, st.seed).points).toContain(BOTH);
  }, 240_000);
});

describe('#2907 — controls: a figure the givens fix keeps every value', () => {
  it('with the cube, A′ is (6, 0, 6) and nothing is offered in its place', () => {
    const st = build(HE);
    const p = dataView(derive3(st.facts, st.seed).construction, st.seed);
    expect(p.points).toContain("A'(6, 0, 6)");
    expect(p.points.some((r) => r.includes('או'))).toBe(false);
  }, 240_000);
});
