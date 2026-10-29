/**
 * #1782 (ADR-3D-393) — A GIVEN THAT READS A FREE CARRIER DRIVES THE FIGURE, RIGID OR NOT.
 *
 * «קובייה ABCD · AB = 2 · E על AB · AE = 1» was refused `claim-refuted` at every seed: the cube has no free shape
 * dims, and every drive-or-check decision in `apply.ts` asked `freeDims(c) > 0`, so the length on the rider was
 * judged against E's SAMPLED place and the student was told to check their arithmetic. The predicate is now the
 * statement's reach (`statementReachesFreeDof3`): a point it names, or a point one of those is built from, carries
 * a drivable parameter of the carrier table. Everything goes through the real submit decision, `decideSubmit3`, and
 * the drawn positions; the predicate is called, never re-implemented.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { statementReachesFreeDof3 } from '../engine/apply';

type St = { facts: Fact3[]; seed: number };
type P3 = { x: number; y: number; z: number };
type Refusal = { code: string; stated?: string; others?: string[] };

/** Submit the lines from an empty canvas at `seed`. */
function run(lines: readonly string[], seed: number): { st: St; refusedAt: number; error?: Refusal } {
  let st: St = { facts: [], seed };
  for (let i = 0; i < lines.length; i++) {
    const v = decideSubmit3(st, lines[i]);
    if (v.kind !== 'record') return { st, refusedAt: i, error: v.kind === 'refused' ? (v.error as Refusal) : { code: v.kind } };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1 };
}

const dist = (pos: ReadonlyMap<string, P3>, p: string, q: string): number => {
  const [P, Q] = [pos.get(p)!, pos.get(q)!];
  return Math.hypot(P.x - Q.x, P.y - Q.y, P.z - Q.z);
};
const angleAt = (pos: ReadonlyMap<string, P3>, v: string, p: string, q: string): number => {
  const [V, P, Q] = [pos.get(v)!, pos.get(p)!, pos.get(q)!];
  const u = [P.x - V.x, P.y - V.y, P.z - V.z];
  const w = [Q.x - V.x, Q.y - V.y, Q.z - V.z];
  const dot = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  return (Math.acos(dot / (Math.hypot(...u) * Math.hypot(...w))) * 180) / Math.PI;
};

type Row = {
  lines: string[];
  /** [rider, host end, host end] — the rider must lie ON its host segment */
  on: [string, string, string][];
  /** [p, q, length] — every stated length holds in the drawing */
  len?: [string, string, number][];
  /** [vertex, p, q, degrees] */
  ang?: [string, string, string, number][];
};

/** Builds at every seed, every fact green, every stated value holds, every rider is on its host. */
function builds(row: Row, seeds: readonly number[]): ReadonlyMap<string, P3>[] {
  const out: ReadonlyMap<string, P3>[] = [];
  for (const seed of seeds) {
    const r = run(row.lines, seed);
    expect(r.refusedAt, `seed ${seed}: «${row.lines[r.refusedAt]}» refused ${r.error?.code}`).toBe(-1);
    const d = derive3(r.st.facts, r.st.seed);
    for (const f of r.st.facts) expect(d.status[f.id], `seed ${seed}: «${f.utterance}»`).toBe('ok');
    const pos = d.positions;
    for (const [p, q, L] of row.len ?? []) expect(dist(pos, p, q), `seed ${seed}: |${p}${q}|`).toBeCloseTo(L, 5);
    for (const [v, p, q, deg] of row.ang ?? []) expect(angleAt(pos, v, p, q), `seed ${seed}: ∠${p}${v}${q}`).toBeCloseTo(deg, 4);
    for (const [k, a, b] of row.on) {
      expect(Math.abs(dist(pos, a, k) + dist(pos, k, b) - dist(pos, a, b)), `seed ${seed}: ${k} on ${a}${b}`).toBeLessThan(1e-6);
    }
    out.push(pos);
  }
  return out;
}

const SEEDS_4 = [0, 1, 2, 3];
const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);
const REPORT = ['קובייה ABCD', 'AB = 2', 'E על AB', 'AE = 1'];

describe('#1782 — a rider length on a rigid cube drives the rider', () => {
  it('the reported case builds at all 24 seeds with E at the midpoint of AB', () => {
    builds({ lines: REPORT, on: [['E', 'A', 'B']], len: [['A', 'E', 1], ['A', 'B', 2], ['E', 'B', 1]] }, SEEDS_24);
  }, 600_000);

  it('the reversed order («AE = 1» took the size first) builds the same figure', () => {
    const fwd = builds({ lines: REPORT, on: [['E', 'A', 'B']], len: [['A', 'E', 1]] }, SEEDS_4);
    const rev = builds({ lines: ['קובייה ABCD', 'E על AB', 'AE = 1', 'AB = 2'], on: [['E', 'A', 'B']], len: [['A', 'E', 1], ['A', 'B', 2]] }, SEEDS_4);
    for (let i = 0; i < SEEDS_4.length; i++) {
      for (const [id, p] of fwd[i]) {
        const q = rev[i].get(id);
        if (!q) continue;
        expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), `seed ${SEEDS_4[i]}: ${id}`).toBeLessThan(1e-6);
      }
    }
  }, 600_000);

  it.each<[string, Row]>([
    ['AE = 1.5', { lines: ["קובייה ABCDA'B'C'D'", 'AB = 2', 'E על AB', 'AE = 1.5'], on: [['E', 'A', 'B']], len: [['A', 'E', 1.5], ['A', 'B', 2]] }],
    ['a distance from another vertex, DE = 2.5', { lines: ["קובייה ABCDA'B'C'D'", 'AB = 2', 'E על AB', 'DE = 2.5'], on: [['E', 'A', 'B']], len: [['D', 'E', 2.5], ['A', 'B', 2]] }],
    ['a distance between two riders, EF = 2.5', { lines: ["קובייה ABCDA'B'C'D'", 'AB = 2', 'E על AB', 'F על CD', 'EF = 2.5'], on: [['E', 'A', 'B'], ['F', 'C', 'D']], len: [['E', 'F', 2.5], ['A', 'B', 2]] }],
    ["a length to the top face, A'E = 2.5", { lines: ["קובייה ABCDA'B'C'D'", 'AB = 2', 'E על AB', "A'E = 2.5"], on: [['E', 'A', 'B']], len: [["A'", 'E', 2.5], ['A', 'B', 2]] }],
    ['an angle with no size, ∠ADE = 30', { lines: ["קובייה ABCDA'B'C'D'", 'E על AB', 'זווית ADE = 30'], on: [['E', 'A', 'B']], ang: [['D', 'A', 'E', 30]] }],
    ['the volume first, then AE = 1', { lines: ["קובייה ABCDA'B'C'D'", 'נפח הקובייה = 8', 'E על AB', 'AE = 1'], on: [['E', 'A', 'B']], len: [['A', 'E', 1], ['A', 'B', 2]] }],
    ['a midpoint of a rider reaches the rider, AM = 0.25', { lines: ['קובייה ABCD', 'AB = 2', 'E על AB', 'M אמצע AE', 'AM = 0.25'], on: [['E', 'A', 'B'], ['M', 'A', 'E']], len: [['A', 'M', 0.25], ['A', 'E', 0.5]] }],
    ['a perpendicular between two riders, DE ⊥ EF', { lines: ["קובייה ABCDA'B'C'D'", 'E על AB', 'F על BC', 'DE ⊥ EF'], on: [['E', 'A', 'B'], ['F', 'B', 'C']], ang: [['E', 'D', 'F', 90]] }],
  ])('%s builds on the cube at 4 seeds', (_name, row) => {
    builds(row, SEEDS_4);
  }, 600_000);

  it('the box control is unchanged', () => {
    builds({ lines: ["תיבה ABCDA'B'C'D'", 'AB = 2', 'E על AB', 'AE = 1'], on: [['E', 'A', 'B']], len: [['A', 'E', 1], ['A', 'B', 2]] }, SEEDS_4);
  }, 600_000);
});

describe('#1782 — a given no position can meet is still refused', () => {
  it('«AE = 3» on an edge of 2 is refused naming «AE = 3», with «AB = 2» beside it', () => {
    for (const seed of SEEDS_4) {
      const r = run(['קובייה ABCD', 'AB = 2', 'E על AB', 'AE = 3'], seed);
      expect(r.refusedAt, `seed ${seed}`).toBe(3);
      expect(r.error?.code).toBe('givens-contradict');
      expect(r.error?.stated).toBe('AE = 3');
      expect(r.error?.others).toContain('AB = 2');
    }
  }, 600_000);

  it('«CE ⊥ DE» with E on AB (the angle CED is always acute) is refused', () => {
    for (const seed of SEEDS_4) {
      const r = run(["קובייה ABCDA'B'C'D'", 'E על AB', 'CE ניצב ל-DE'], seed);
      expect(r.refusedAt, `seed ${seed}`).toBe(2);
      expect(r.error?.code).toBe('givens-contradict');
    }
  }, 600_000);

  it('«|AB| = 4 · |AC| = 10» on the cube stays the verify-your-answer refusal', () => {
    const r = run(["קובייה ABCDA'B'C'D'", '|AB| = 4', '|AC| = 10'], 0);
    expect(r.refusedAt).toBe(2);
    expect(r.error?.code).toBe('claim-refuted');
  }, 600_000);

  it('«AC = 10» after the rider drove is checked against the size «AB = 2» fixed, the same refusal', () => {
    for (const seed of SEEDS_4) {
      const r = run(['קובייה ABCD', 'AB = 2', 'E על AB', 'AE = 1', 'AC = 10'], seed);
      expect(r.refusedAt, `seed ${seed}`).toBe(4);
      expect(r.error?.code).toBe('claim-refuted');
    }
  }, 600_000);
});

describe('#1782 — the predicate is the statement’s reach', () => {
  const cube = (lines: string[]) => derive3(run(lines, 0).st.facts, 0).construction;
  it('reads a rider, a point built from a rider, and free dims — never a rigid edge', () => {
    const c = cube(['קובייה ABCD', 'E על AB', 'M אמצע AE']);
    expect(statementReachesFreeDof3(c, { type: 'length-eq', a: 'A', b: 'E', value: 1 })).toBe(true);
    expect(statementReachesFreeDof3(c, { type: 'length-eq', a: 'D', b: 'M', value: 1 })).toBe(true);
    expect(statementReachesFreeDof3(c, { type: 'length-eq', a: 'A', b: 'B', value: 2 })).toBe(false);
    expect(statementReachesFreeDof3(c, { type: 'length-eq', a: 'A', b: 'C', value: 2 })).toBe(false);
    const box = cube(["תיבה ABCDA'B'C'D'"]);
    expect(statementReachesFreeDof3(box, { type: 'length-eq', a: 'A', b: 'B', value: 2 })).toBe(true);
  });
});
