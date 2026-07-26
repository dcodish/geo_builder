/**
 * #349 (ADR-3D-089): an OBLIQUE prism over ANY base — obliqueness is a MODIFIER of a prism kind, not a
 * base-specific template.
 *
 * Prod evidence (log-triage 2026-07-26): one user typed `מנסרה שבסיסה משולש` five times and
 * `מנסרה משולשת` once, every one bouncing off the `oblique-prism` guidance. The refusal was never a
 * geometric limit — ADR-3D-078 refused because the ONLY oblique template was `parallelepiped`, hard-wired
 * to a 4-vertex parallelogram base, and inventing an unstated "right" is forbidden (ADR-052/ADR-3D-058).
 *
 * What this locks:
 *  1. the reported utterances build, oblique, He+En;
 *  2. the tilt is a genuine free DOF (the top ring is the base translated by ONE lateral vector that
 *     is NOT vertical, and it varies across seeds) — never a silently-right prism;
 *  3. «המנסרה ישרה» straightens a TRIANGULAR prism exactly as it straightens a מקבילון (the shared
 *     flag-clearing path), dropping 2 DOF;
 *  4. `מקבילון` still behaves exactly as before — the proof the general path subsumes the special one;
 *  5. the DOF cue is monotone: stating rightness never increases the count.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { freeDofCount3 } from '../engine/evaluate';
import { derive3, useGeo3 } from '../store/store3';
import type { Vec3 } from '../engine/vec3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
const dof = () => freeDofCount3(derived().construction, derived().resolved);

const sub = (p: Vec3, q: Vec3): Vec3 => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const dot = (v: Vec3, w: Vec3) => v.x * w.x + v.y * w.y + v.z * w.z;

/** Every vertical edge of a prism, as vectors base→top (they are all equal iff it is a prism at all). */
function laterals(seed: number, base: string[]): Vec3[] {
  const pos = derive3(state().facts, seed).positions;
  return base.map((id) => sub(pos.get(`${id}'`)!, pos.get(id)!));
}

describe('#349 — the reported utterances build oblique', () => {
  beforeEach(reset);

  for (const u of ['מנסרה שבסיסה משולש', 'מנסרה משולשת', 'prism with a triangle base', 'triangular prism']) {
    it(`«${u}» builds a triangular prism with a free tilt`, () => {
      submit(u);
      expect(state().lastError).toBeNull();
      const w = laterals(state().seed, ['A', 'B', 'C']);
      // it IS a prism: one lateral vector shared by every vertical edge
      for (const v of w.slice(1)) {
        expect(v.x).toBeCloseTo(w[0].x, 9);
        expect(v.y).toBeCloseTo(w[0].y, 9);
        expect(v.z).toBeCloseTo(w[0].z, 9);
      }
      // and it is OBLIQUE: the lateral is not vertical, i.e. it has a real in-base-plane component
      expect(Math.hypot(w[0].x, w[0].y)).toBeGreaterThan(1e-3);
    });
  }

  it('the tilt is a genuine free DOF — it varies across seeds (ADR-052, never a fixed default)', () => {
    submit('מנסרה שבסיסה משולש');
    const tilts = [0, 1, 2, 3].map((seed) => {
      const w = laterals(seed, ['A', 'B', 'C'])[0];
      return `${w.x.toFixed(4)},${w.y.toFixed(4)}`;
    });
    expect(new Set(tilts).size).toBeGreaterThan(1);
  });

  it('an equilateral-base oblique prism keeps its stated base shape at every seed', () => {
    submit('מנסרה שבסיסה משולש שווה צלעות');
    expect(state().lastError).toBeNull();
    for (const seed of [0, 1, 2]) {
      const pos = derive3(state().facts, seed).positions;
      const [A, B, C] = ['A', 'B', 'C'].map((id) => pos.get(id)!);
      expect(len(sub(B, A)), `seed ${seed}`).toBeCloseTo(len(sub(C, B)), 6);
      expect(len(sub(B, A)), `seed ${seed}`).toBeCloseTo(len(sub(A, C)), 6);
    }
  });

  it('a general-QUAD base builds oblique too (prism4g + the modifier)', () => {
    expect(parse3('מנסרה שבסיסה מרובע')).toEqual({
      ok: true,
      commands: [{ type: 'solid', kind: 'prism4g', oblique: true, ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] }],
    });
  });
});

describe('#349 — «המנסרה ישרה» straightens ANY oblique prism (the shared flag-clearing path)', () => {
  beforeEach(reset);

  it('a triangular prism: the lateral becomes ⟂ the base, and 2 DOF drop', () => {
    submit('מנסרה שבסיסה משולש');
    expect(state().lastError).toBeNull();
    const obliqueDof = dof();
    submit('המנסרה ישרה');
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(obliqueDof - 2); // w (3) → height (1)
    const pos = derived().positions;
    const [A, B, C] = ['A', 'B', 'C'].map((id) => pos.get(id)!);
    const w = sub(pos.get("A'")!, A);
    const ab = sub(B, A);
    const ac = sub(C, A);
    expect(Math.abs(dot(w, ab)) / (len(w) * len(ab))).toBeLessThan(1e-9);
    expect(Math.abs(dot(w, ac)) / (len(w) * len(ac))).toBeLessThan(1e-9);
  });

  it('re-declaring the SAME prism as right is the M1 statement, not a dropped given (#199 shape)', () => {
    submit('מנסרה שבסיסה משולש');
    const obliqueDof = dof();
    submit('מנסרה ישרה שבסיסה משולש'); // same kind + ids, tilt now stated
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(obliqueDof - 2); // straightened, NOT silently ignored
  });

  it('the DOF cue is monotone non-increasing when rightness is stated', () => {
    submit('מנסרה משולשת');
    const before = dof();
    submit('המנסרה ישרה');
    expect(dof()).toBeLessThanOrEqual(before);
  });
});

describe('#349 — מקבילון is unchanged (the general path subsumes the special one)', () => {
  beforeEach(reset);

  it('builds oblique with 5 DOF, one shared lateral vector, and straightens to 3', () => {
    submit("מקבילון ABCDA'B'C'D'");
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(5); // parallelogram base (dx,dy) + free lateral w (wx,wy,wz)
    const w = laterals(state().seed, ['A', 'B', 'C', 'D']);
    for (const v of w.slice(1)) {
      expect(v.x).toBeCloseTo(w[0].x, 9);
      expect(v.y).toBeCloseTo(w[0].y, 9);
      expect(v.z).toBeCloseTo(w[0].z, 9);
    }
    submit('המנסרה ישרה');
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(3);
  });

  it('a pentagon/hexagon base still gets the guidance (its template would assert unstated regularity)', () => {
    expect(parse3('מנסרה שבסיסה מחומש').ok).toBe(false);
    expect(parse3('מנסרה שבסיסה משושה').ok).toBe(false);
  });
});
