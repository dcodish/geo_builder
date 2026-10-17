/**
 * Issue #1855 (ADR-3D-355): a figure that shares no point with another carries its own similarity.
 *
 * The instance (measured on main @ b0e9dbea): «משולש ABC · משולש DEF · DE = 2 · AB = 5» refused the second
 * length `givens-contradict` at every seed, in either order; «AB ∥ DE» came back `claim-refuted`; and the two
 * triangles alone drew |AB| = |DE| = 1 with AB ∥ DE at every seed. Every solid is built canonically with its
 * first edge = 1 and the pivot carries ONE gauge, so the relative size, orientation and placement of two
 * separate figures was a fixed default (ADR-052), not a free DOF.
 *
 * The fix: every solid after the first appends its own similarity `[ln s, w, t]` to its dims — sampled by the
 * one seeded sampler, driven by the pivot like any shape dim, counted by `freeDims` / `freeDofCount3`.
 *
 * Locks: the reported sequence in both orders and with the length before the second declaration; square +
 * triangle; cube + triangle; «AB ∥ DE»; the free relative size and angle across seeds; the stated lengths
 * drawn; the DOF count; and the one-solid figure bit-identical to before the change (seed 0).
 */
import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, type Fact3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { freeDofCount3 } from '../engine/evaluate';
import { freeDims } from '../engine/apply';
import { cross3, dist3, dot3, norm3, sub3, type Vec3 } from '../engine/vec3';

const SEEDS = 24;

/** Decide `lines` in order at `seed`; throws naming the first line that does not record. */
function build(lines: readonly string[], seed: number): Fact3[] {
  let facts: Fact3[] = [];
  let n = 0;
  for (const line of lines) {
    const v = decideDeterministic3({ facts, seed }, line, () => `f${++n}`);
    if (v.kind !== 'record') throw new Error(`«${line}» @${seed}: ${v.kind} ${JSON.stringify((v as { error?: unknown }).error ?? '')}`);
    facts = v.facts;
  }
  return facts;
}

const at = (pos: Map<string, Vec3>, id: string): Vec3 => {
  const p = pos.get(id);
  if (!p) throw new Error(`no position for ${id}`);
  return p;
};

describe('#1855 a length on each of two separate figures builds, at seeds 0–23', () => {
  it.each([
    [['משולש ABC', 'משולש DEF', 'DE = 2', 'AB = 5'], ['A', 'B', 5], ['D', 'E', 2]],
    [['משולש ABC', 'משולש DEF', 'AB = 5', 'DE = 2'], ['A', 'B', 5], ['D', 'E', 2]],
    [['משולש ABC', 'AB = 5', 'משולש DEF', 'DE = 2'], ['A', 'B', 5], ['D', 'E', 2]],
    [['ריבוע ABCD', 'משולש EFG', 'AB = 4', 'EF = 7'], ['A', 'B', 4], ['E', 'F', 7]],
    [['קובייה ABCDA1B1C1D1', 'משולש EFG', 'AB = 4', 'EF = 7'], ['A', 'B', 4], ['E', 'F', 7]],
  ] as const)('%j', (lines, [a1, b1, l1], [a2, b2, l2]) => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const facts = build(lines, seed);
      const d = derive3(facts, seed);
      for (const f of facts) expect(d.status[f.id], `@${seed}`).toBe('ok');
      expect(dist3(at(d.positions, a1), at(d.positions, b1)), `|${a1}${b1}| @${seed}`).toBeCloseTo(l1, 6);
      expect(dist3(at(d.positions, a2), at(d.positions, b2)), `|${a2}${b2}| @${seed}`).toBeCloseTo(l2, 6);
    }
  });

  it('both stated lengths are drawn on the figure', () => {
    const facts = build(['משולש ABC', 'משולש DEF', 'DE = 2', 'AB = 5'], 0);
    const d = derive3(facts, 0);
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);
    const labelled = scene.measures.map((m) => [m.a, m.b].sort().join(''));
    expect(labelled).toEqual(expect.arrayContaining(['AB', 'DE']));
  });
});

describe('#1855 a relation between two separate figures is driven, not checked', () => {
  it('«AB ∥ DE» records and the segments are parallel, at seeds 0–23', () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const facts = build(['משולש ABC', 'משולש DEF', 'AB ∥ DE'], seed);
      const d = derive3(facts, seed);
      for (const f of facts) expect(d.status[f.id], `@${seed}`).toBe('ok');
      const u = sub3(at(d.positions, 'B'), at(d.positions, 'A'));
      const v = sub3(at(d.positions, 'E'), at(d.positions, 'D'));
      expect(norm3(cross3(u, v)) / (norm3(u) * norm3(v)), `@${seed}`).toBeLessThan(1e-6);
    }
  });
});

describe('#1855 the relative size and orientation of two separate figures are FREE (ADR-052)', () => {
  it('«משולש ABC · משולש DEF»: |AB|/|DE| and the angle between AB and DE vary across seeds', () => {
    const ratios = new Set<string>();
    const angles = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed++) {
      const d = derive3(build(['משולש ABC', 'משולש DEF'], seed), seed);
      const u = sub3(at(d.positions, 'B'), at(d.positions, 'A'));
      const v = sub3(at(d.positions, 'E'), at(d.positions, 'D'));
      ratios.add((norm3(u) / norm3(v)).toFixed(3));
      angles.add(Math.acos(Math.max(-1, Math.min(1, dot3(u, v) / (norm3(u) * norm3(v))))).toFixed(3));
    }
    expect(ratios.size).toBeGreaterThan(SEEDS / 2);
    expect(angles.size).toBeGreaterThan(SEEDS / 2);
  });

  it('the freedom is counted: 7 more dims and 7 more DOFs for the second figure', () => {
    const one = derive3(build(['משולש ABC'], 0), 0);
    const two = derive3(build(['משולש ABC', 'משולש DEF'], 0), 0);
    expect(freeDims(two.construction) - 2 * freeDims(one.construction)).toBe(7);
    expect(freeDofCount3(two.construction, two.resolved) - 2 * freeDofCount3(one.construction, one.resolved)).toBe(7);
  });
});

describe('#1855 a one-solid figure is bit-identical (positions captured on main @ b0e9dbea, seed 0)', () => {
  it.each([
    [['קובייה ABCDA1B1C1D1'], { A: [0, 0, 0], B: [1, 0, 0], C: [1, 1, 0], D: [0, 1, 0], A1: [0, 0, 1], B1: [1, 0, 1], C1: [1, 1, 1], D1: [0, 1, 1] }],
    [['פירמידה ישרה SABCD שבסיסה ריבוע'], { A: [0, 0, 0], B: [1, 0, 0], C: [1, 1, 0], D: [0, 1, 0], S: [0.5, 0.5, 0.9664285738021136] }],
    [['משולש ABC', 'AB = 5', '∠ABC = 50°'], { A: [-1.548942034641968e-8, -4.1908037355747276e-8, 0], B: [4.99999998451058, -6.882400909235252e-8, 0], C: [1.7887343897665533, 3.8270372823254806, 0] }],
  ] as const)('%j', (lines, expected) => {
    const d = derive3(build(lines, 0), 0);
    for (const [id, [x, y, z]] of Object.entries(expected)) {
      const p = at(d.positions, id);
      expect(p.x, `${id}.x`).toBeCloseTo(x, 12);
      expect(p.y, `${id}.y`).toBeCloseTo(y, 12);
      expect(p.z, `${id}.z`).toBeCloseTo(z, 12);
    }
  });
});
