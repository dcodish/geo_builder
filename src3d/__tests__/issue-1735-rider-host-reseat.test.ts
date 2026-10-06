/**
 * #1735 (ADR-3D-306) — A HOST BOUND IS RESTORED, NOT ONLY ENFORCED.
 *
 * «משולש ABC · D על AB · AD = 3» was refused `givens-contradict` on a triangle whose size nobody stated.
 * Every cold start of the pivot converged EXACTLY — with D slid past B (t = 1.2–1.6), because LM's
 * minimum-norm step spends the deficit on the rider's `t` rather than on the figure's scale — and the
 * #820 host check discarded each one, so the empty pool told the student their own givens contradict.
 * Since #1730 «D על AB במרחק 3 מ-A» reads AD = 3, so the same refusal reached the tail spelling in prod.
 *
 * The fix re-seats: an exact candidate discarded only because a bounded rider left its host is pinned
 * back at the rider's seed sample while the gauge / dims adapt, then released and judged by the site's
 * ordinary acceptance. Everything goes through the real submit decision, `decideSubmit3`, and the drawn
 * positions. Class rows: the issue's triage table (§1, §4).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';

type St = { facts: Fact3[]; seed: number };
type P3 = { x: number; y: number; z: number };

/** Submit the lines from an empty canvas at `seed`; returns the last verdict's kind and the state. */
function run(lines: readonly string[], seed: number): { st: St; refusedAt: number; code?: string } {
  let st: St = { facts: [], seed };
  for (let i = 0; i < lines.length; i++) {
    const v = decideSubmit3(st, lines[i]);
    if (v.kind !== 'record') return { st, refusedAt: i, code: v.kind === 'refused' ? v.error.code : v.kind };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1 };
}

const dist = (pos: ReadonlyMap<string, P3>, p: string, q: string): number => {
  const [P, Q] = [pos.get(p)!, pos.get(q)!];
  return Math.hypot(P.x - Q.x, P.y - Q.y, P.z - Q.z);
};

type Row = {
  lines: string[];
  /** [rider, host end, host end] — the rider must lie ON its host segment */
  on: [string, string, string][];
  /** [p, q, length] — every stated length holds in the drawing */
  len: [string, string, number][];
};

/** Builds at every seed, every stated length holds, every rider is on its host; returns the host lengths. */
function buildsOnHost(row: Row, seeds: readonly number[]): number[] {
  const hosts: number[] = [];
  for (const seed of seeds) {
    const r = run(row.lines, seed);
    expect(r.refusedAt, `seed ${seed}: «${row.lines[r.refusedAt]}» refused ${r.code}`).toBe(-1);
    const d = derive3(r.st.facts, r.st.seed);
    for (const f of r.st.facts) expect(d.status[f.id], `seed ${seed}: «${f.utterance}»`).toBe('ok');
    const pos = d.positions;
    for (const [p, q, L] of row.len) expect(dist(pos, p, q), `seed ${seed}: |${p}${q}|`).toBeCloseTo(L, 5);
    for (const [k, a, b] of row.on) {
      expect(Math.abs(dist(pos, a, k) + dist(pos, k, b) - dist(pos, a, b)), `seed ${seed}: ${k} on ${a}${b}`).toBeLessThan(1e-6);
    }
    hosts.push(dist(pos, row.on[0][1], row.on[0][2]));
  }
  return hosts;
}

const SEEDS_4 = [0, 1, 2, 3];
const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);

describe('#1735 — a rider length on a figure of unstated size builds, the rider on its host', () => {
  it('the reported case «משולש ABC · D על AB · AD = 3» builds at all 24 seeds, and the size varies with the seed', () => {
    const hosts = buildsOnHost({ lines: ['משולש ABC', 'D על AB', 'AD = 3'], on: [['D', 'A', 'B']], len: [['A', 'D', 3]] }, SEEDS_24);
    // ADR-052: the unstated size is a free DOF, not a default — AB is ≥ 3 and differs across seeds
    for (const h of hosts) expect(h).toBeGreaterThanOrEqual(3 - 1e-6);
    expect(Math.max(...hosts) - Math.min(...hosts)).toBeGreaterThan(0.5);
  }, 600_000);

  it.each<[string, Row]>([
    ['|AD| = 3', { lines: ['משולש ABC', 'D על AB', '|AD| = 3'], on: [['D', 'A', 'B']], len: [['A', 'D', 3]] }],
    ['the #1730 tail from A', { lines: ['משולש ABC', 'D על AB במרחק 3 מ-A'], on: [['D', 'A', 'B']], len: [['A', 'D', 3]] }],
    ['the #1730 tail from B', { lines: ['משולש ABC', 'D על AB במרחק 3 מ-B'], on: [['D', 'A', 'B']], len: [['B', 'D', 3]] }],
    ['AC = 5 then AD = 7 (AB must grow past 7)', { lines: ['משולש ABC', 'AC = 5', 'D על BC', 'AD = 7'], on: [['D', 'B', 'C']], len: [['A', 'D', 7], ['A', 'C', 5]] }],
    ['BD = 3 on BC', { lines: ['משולש ABC', 'D על BC', 'BD = 3'], on: [['D', 'B', 'C']], len: [['B', 'D', 3]] }],
    ['a box edge rider', { lines: ["תיבה ABCDA'B'C'D'", 'E על AB', 'AE = 3'], on: [['E', 'A', 'B']], len: [['A', 'E', 3]] }],
    ['a quadrilateral side rider', { lines: ['מרובע ABCD', 'E על AB', 'AE = 3'], on: [['E', 'A', 'B']], len: [['A', 'E', 3]] }],
    ['a pyramid lateral-edge rider', { lines: ['פירמידה SABCD שבסיסה מקבילית', 'E על SA', 'SE = 4'], on: [['E', 'S', 'A']], len: [['S', 'E', 4]] }],
    ['two riders, two lengths', { lines: ['משולש ABC', 'D על AB', 'E על BC', 'AD = 3', 'CE = 4'], on: [['D', 'A', 'B'], ['E', 'B', 'C']], len: [['A', 'D', 3], ['C', 'E', 4]] }],
  ])('%s builds at seeds 0–3 with the rider on its host', (_name, row) => {
    buildsOnHost(row, SEEDS_4);
  }, 600_000);

  it('the dims-only (similarity-invariant) site: «זווית ACD = 100» after «D על AB» opens the triangle, D stays on AB', () => {
    for (const seed of SEEDS_4) {
      const r = run(['משולש ABC', 'D על AB', 'זווית ACD = 100'], seed);
      expect(r.refusedAt, `seed ${seed}: ${r.code}`).toBe(-1);
      const pos = derive3(r.st.facts, r.st.seed).positions;
      expect(Math.abs(dist(pos, 'A', 'D') + dist(pos, 'D', 'B') - dist(pos, 'A', 'B'))).toBeLessThan(1e-6);
      const [A, C, D] = ['A', 'C', 'D'].map((k) => pos.get(k)!);
      const u = { x: A.x - C.x, y: A.y - C.y, z: A.z - C.z };
      const v = { x: D.x - C.x, y: D.y - C.y, z: D.z - C.z };
      const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / (Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z));
      expect((Math.acos(cos) * 180) / Math.PI).toBeCloseTo(100, 3);
    }
  }, 600_000);

  it('entry order does not matter: AB = 5 stated before or after the rider length draws the same lengths', () => {
    const row = { on: [['D', 'A', 'B']] as [string, string, string][], len: [['A', 'D', 3], ['A', 'B', 5]] as [string, string, number][] };
    buildsOnHost({ ...row, lines: ['משולש ABC', 'AB = 5', 'D על AB', '|AD| = 3'] }, SEEDS_4);
    buildsOnHost({ ...row, lines: ['משולש ABC', 'D על AB', 'AD = 3', 'AB = 5'] }, SEEDS_4);
  }, 600_000);
});

describe('#1735 — the re-seat invents nothing: a true contradiction stays refused', () => {
  it.each<[string, string[]]>([
    ['AB = 5 · D on AB · AD = 7', ['משולש ABC', 'AB = 5', 'D על AB', 'AD = 7']],
    ['a box with AB = 2 · E on AB · AE = 3', ["תיבה ABCDA'B'C'D'", 'AB = 2', 'E על AB', 'AE = 3']],
  ])('%s is refused on its last line', (_name, lines) => {
    for (const seed of SEEDS_4) {
      const r = run(lines, seed);
      expect(r.refusedAt, `seed ${seed}`).toBe(lines.length - 1);
      expect(r.code).toBe('givens-contradict');
    }
  }, 600_000);
});
