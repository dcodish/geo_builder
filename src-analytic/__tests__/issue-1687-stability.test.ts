/**
 * #1687 (ADR-AG-348) — ADDING A SENTENCE MOVES WHAT IT INTRODUCED, NOT WHAT WAS ALREADY THERE.
 *
 * Operator: «משולש ABC» then «D על BC» redrew the whole triangle. Measured at `caf00532` through `derive` (the figure
 * the canvas shows), at the same seed before and after the line: an existing vertex moved at 24/24 seeds (up to
 * 13.1), the raw solve moved B and C at 24/24 (up to 2.9), and the walk landed seeds 0–7 on one figure — 11 distinct
 * figures over 24 seeds against 17 for the bare triangle, so «הציגו תצורה אחרת» did nothing over that stretch.
 * 2-D at the same commit: 0/24 on every row below (a point-on-object is evaluated after its parents).
 *
 * Every lock CALLS `derive` (parse → fold → evaluate → the display walk) and compares positions; none re-implements
 * the stage. The class rows are the triage's table (2026-10-05), each in Hebrew and English.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { evaluate, figureSignature } from '../engine/evaluate';

const SEEDS = Array.from({ length: 24 }, (_, i) => i);

/** The largest move of any point the prior lines placed, from the prior figure to the figure with `added`, at one seed. */
function moved(prior: readonly string[], added: readonly string[], seed: number, raw = false): number {
  const b = derive(prior, seed);
  const a = derive([...prior, ...added], seed);
  expect(b.faults, `prior faults at seed ${seed}: ${prior.join(' | ')}`).toEqual([]);
  expect(a.faults, `faults at seed ${seed}: ${[...prior, ...added].join(' | ')}`).toEqual([]);
  const before = raw ? evaluate(b.construction, seed) : b.figure;
  const after = raw ? evaluate(a.construction, seed) : a.figure;
  let worst = 0;
  for (const p of before.points) {
    const q = after.points.find((r) => r.id === p.id);
    expect(q, `${p.id} vanished at seed ${seed}`).toBeDefined();
    worst = Math.max(worst, Math.hypot(p.x - q!.x, p.y - q!.y));
  }
  return worst;
}

function expectStill(prior: readonly string[], added: readonly string[]) {
  for (const seed of SEEDS) {
    expect(moved(prior, added, seed), `shown, seed ${seed}: ${prior.join(' · ')} + ${added.join(' · ')}`).toBeLessThan(1e-9);
    expect(moved(prior, added, seed, true), `raw solve, seed ${seed}: ${prior.join(' · ')} + ${added.join(' · ')}`).toBeLessThan(1e-9);
  }
}

describe('#1687 — the operator’s sequence', () => {
  it('«משולש ABC» → «D על BC»: A, B and C stay exactly where they were, at 24 seeds', () => {
    expectStill(['משולש ABC'], ['D על BC']);
  });
  it('D is on the side BC (strictly between B and C) at every seed', () => {
    for (const seed of SEEDS) {
      const f = derive(['משולש ABC', 'D על BC'], seed).figure;
      const at = (id: string) => f.points.find((p) => p.id === id)!;
      const [b, c, d] = [at('B'), at('C'), at('D')];
      const cross = (c.x - b.x) * (d.y - b.y) - (c.y - b.y) * (d.x - b.x);
      const len = Math.hypot(c.x - b.x, c.y - b.y);
      const t = ((d.x - b.x) * (c.x - b.x) + (d.y - b.y) * (c.y - b.y)) / (len * len);
      expect(Math.abs(cross) / len, `seed ${seed}`).toBeLessThan(1e-6);
      expect(t, `seed ${seed}`).toBeGreaterThan(0);
      expect(t, `seed ${seed}`).toBeLessThan(1);
    }
  });
});

describe('#1687 — the class: a sentence that introduces a free point tied to earlier free points', () => {
  const ROWS: ReadonlyArray<readonly [string, readonly string[], readonly string[]]> = [
    ['a point on a side', ['משולש ABC'], ['D על הצלע BC']],
    ['a point on the line', ['משולש ABC'], ['D על הישר BC']],
    ['the altitude, foot named', ['משולש ABC'], ['AD גובה לצלע BC']],
    ['the median, foot named', ['משולש ABC'], ['AD תיכון לצלע BC']],
    ['the bisector, the vertex alone', ['משולש ABC'], ['AD חוצה זווית A']],
    ['the bisector, three letters', ['משולש ABC'], ['AD חוצה את הזווית BAC']],
    ['two points on two sides', ['משולש ABC'], ['D על AB', 'E על AC']],
    ['a point on a quadrilateral’s side', ['מרובע ABCD'], ['E על AB']],
    ['the diagonals’ crossing', ['מרובע ABCD'], ['M מפגש AC ו-BD']],
    ['a free vertex beside stated ones', ['A(0,0)', 'B(6,0)', 'נקודה C', 'משולש ABC'], ['D על BC']],
    ['after a stated length', ['משולש ABC', 'AB=5'], ['D על BC']],
  ];
  for (const [title, prior, added] of ROWS) {
    it(`${title}: ${prior.join(' · ')} + ${added.join(' · ')}`, () => expectStill(prior, added));
  }

  const EN: ReadonlyArray<readonly [string, readonly string[], readonly string[]]> = [
    ['a point on a side (en)', ['triangle ABC'], ['D on BC']],
    ['a point on the line (en)', ['triangle ABC'], ['D on the line BC']],
    ['two points on two sides (en)', ['triangle ABC'], ['D on AB', 'E on AC']],
    ['a point on a quadrilateral’s side (en)', ['quadrilateral ABCD'], ['E on AB']],
  ];
  for (const [title, prior, added] of EN) {
    it(`${title}: ${prior.join(' · ')} + ${added.join(' · ')}`, () => expectStill(prior, added));
  }
});

describe('#1687 — controls: a sentence that does constrain the earlier figure still moves it', () => {
  it('«AB=5» on a free triangle moves A or B at some seed', () => {
    expect(SEEDS.some((seed) => moved(['משולש ABC'], ['AB=5'], seed) > 1e-3)).toBe(true);
  });
  it('a derived point never moved anything, and still does not: «M אמצע AB»', () => {
    for (const seed of SEEDS) expect(moved(['משולש ABC'], ['M אמצע AB'], seed)).toBeLessThan(1e-9);
  });
});

describe('#1687 — ADR-052: «הציגו תצורה אחרת» still reaches every configuration the triangle had', () => {
  const distinct = (lines: readonly string[], ids: readonly string[]) =>
    new Set(
      SEEDS.map((seed) => {
        const f = derive(lines, seed).figure;
        return ids.map((id) => f.points.find((p) => p.id === id)!).map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(';');
      }),
    ).size;
  it('«משולש ABC» · «D על BC» reaches as many triangles over 24 seeds as «משולש ABC» alone', () => {
    const alone = distinct(['משולש ABC'], ['A', 'B', 'C']);
    expect(alone).toBeGreaterThanOrEqual(12);
    expect(distinct(['משולש ABC', 'D על BC'], ['A', 'B', 'C'])).toBe(alone);
  });
  it('and D itself moves along BC between configurations', () => {
    const sigs = new Set(SEEDS.map((seed) => figureSignature(derive(['משולש ABC', 'D על BC'], seed).figure)));
    expect(sigs.size).toBeGreaterThanOrEqual(12);
  });
});
