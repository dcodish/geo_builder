/**
 * #2632 (ADR-AG-365) — A ROW THAT NAMES A MEASURE THE FIGURE ALREADY HAS DOES NOT MOVE THE FIGURE.
 *
 * Operator: «משולש ABC» · «נקודה M על BC» · «נסמן זוית BAM כ-A1» redrew the figure. Measured at `fb94d176` and
 * re-measured at `a5eaf9e9` (PR #2650, the drawn configuration): every earlier point moved at 24/24 seeds (up to 13.2), for
 * every spelling of the class — «נסמן … כ-», «AB = a», «זווית A = α». 2-D at `fb94d176`: 0/24 (a name for the measure).
 *
 * The cause was the seeding: the symbol was sampled independently of the figure, and stage one held it there, so the
 * vertices were moved until the measure equalled a random number. Now the symbol starts at the figure's own measure
 * (`evaluate.ts` `labelsFromFigure`, `carriers.ts` `labelRows`); a stated range still wins.
 *
 * Every lock CALLS `derive` (parse → fold → evaluate → the display walk) and compares positions.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { anotherConfiguration } from '../app/another';
import { seedNumber, type Seed } from '../engine/evaluate';

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const STILL = 1e-9;

type D = ReturnType<typeof derive>;
const at = (d: D, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  expect(p, `${id} is drawn`).toBeDefined();
  return p!;
};
const dist = (d: D, a: string, b: string) => Math.hypot(at(d, a).x - at(d, b).x, at(d, a).y - at(d, b).y);
const angleDeg = (d: D, v: string, a: string, b: string) => {
  const [pv, pa, pb] = [at(d, v), at(d, a), at(d, b)];
  const ux = pa.x - pv.x, uy = pa.y - pv.y, wx = pb.x - pv.x, wy = pb.y - pv.y;
  return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
};
const symbol = (d: D, s: string): number => (d.figure as unknown as { env: Record<string, number> }).env[s];

/** The largest move of any point the prior lines placed, solving the row from the configuration the prior figure DREW. */
function moved(prior: readonly string[], added: readonly string[], seed: number): { worst: number; after: D } {
  const b = derive(prior, seed);
  const after = derive([...prior, ...added], b.configuration);
  expect(b.faults, `prior faults at seed ${seed}`).toEqual([]);
  expect(after.faults, `faults at seed ${seed}: ${[...prior, ...added].join(' · ')}`).toEqual([]);
  let worst = 0;
  for (const p of b.figure.points) {
    const q = after.figure.points.find((r) => r.id === p.id);
    expect(q, `${p.id} vanished at seed ${seed}`).toBeDefined();
    worst = Math.max(worst, Math.hypot(p.x - q!.x, p.y - q!.y));
  }
  return { worst, after };
}

/** [title, prior, added, the symbol, its measure on the figure] — the triage's table, He + En, plus the givens-prior rows. */
const ROWS: ReadonlyArray<readonly [string, readonly string[], readonly string[], string, (d: D) => number]> = [
  ['the operator’s sequence', ['משולש ABC', 'נקודה M על BC'], ['נסמן זוית BAM כ-A1'], '∠A₁', (d) => angleDeg(d, 'A', 'B', 'M')],
  ['the operator’s sequence (En)', ['triangle ABC', 'point M on BC'], ['denote angle BAM as A1'], '∠A₁', (d) => angleDeg(d, 'A', 'B', 'M')],
  ['a Greek letter for the angle', ['משולש ABC', 'נקודה M על BC'], ['נסמן זוית BAM כ-α'], 'α', (d) => angleDeg(d, 'A', 'B', 'M')],
  ['a triangle’s angle', ['משולש ABC'], ['נסמן זוית BAC כ-α'], 'α', (d) => angleDeg(d, 'A', 'B', 'C')],
  ['a side equal to a letter', ['משולש ABC'], ['AB = a'], 'a', (d) => dist(d, 'A', 'B')],
  ['a side equal to a letter (En)', ['triangle ABC'], ['AB = a'], 'a', (d) => dist(d, 'A', 'B')],
  ['a vertex angle equal to a letter', ['משולש ABC'], ['זווית A = α'], 'α', (d) => angleDeg(d, 'A', 'B', 'C')],
  ['after a stated length', ['משולש ABC', 'AB = 5'], ['זווית A = α'], 'α', (d) => angleDeg(d, 'A', 'B', 'C')],
  ['after two stated lengths', ['משולש ABC', 'AB = 5', 'AC = 7'], ['BC = a'], 'a', (d) => dist(d, 'B', 'C')],
  ['after a stated angle', ['משולש ABC', 'זווית A = 40'], ['AB = a'], 'a', (d) => dist(d, 'A', 'B')],
  ['a cevian’s length', ['משולש ABC', 'D על BC'], ['AD = a'], 'a', (d) => dist(d, 'A', 'D')],
  ['the diagonals’ angle', ['מרובע ABCD', 'M מפגש AC ו-BD'], ['נסמן זוית AMB כ-α'], 'α', (d) => angleDeg(d, 'M', 'A', 'B')],
];

describe('#2632 — a row naming a measure leaves the figure where it is, at 24 seeds', () => {
  for (const [title, prior, added, sym, measure] of ROWS) {
    it(`${title}: ${prior.join(' · ')} + ${added.join(' · ')}`, () => {
      for (const seed of SEEDS) {
        const { worst, after } = moved(prior, added, seed);
        expect(worst, `seed ${seed}`).toBeLessThan(STILL);
        // the letter takes the value the figure shows
        expect(Math.abs(symbol(after, sym) - measure(after)), `${sym} at seed ${seed}`).toBeLessThan(1e-6);
      }
    });
  }
});

describe('#2632 — «הציגו תצורה אחרת» still changes the figure, and the letter with it (ADR-052)', () => {
  /** The configurations reached by pressing the button `n` times from configuration 0. */
  const walk = (lines: readonly string[], n: number): Seed[] => {
    const out: Seed[] = [0];
    let at: Seed = 0;
    for (let i = 0; i < n; i += 1) {
      const next = anotherConfiguration(lines, at);
      if (!next.found) break;
      at = next.seed;
      out.push(at);
    }
    return out;
  };
  it('the operator’s figure reaches as many configurations as the figure before the name, and A1 varies across them', () => {
    const prior = ['משולש ABC', 'נקודה M על BC'];
    const lines = [...prior, 'נסמן זוית BAM כ-A1'];
    const before = new Set(walk(prior, 6).map((s) => seedNumber(s)));
    const seeds = walk(lines, 6);
    expect(new Set(seeds.map((s) => seedNumber(s))).size).toBeGreaterThanOrEqual(before.size);
    const values = new Set(seeds.map((s) => symbol(derive(lines, s), '∠A₁').toFixed(4)));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('#2632 — what stays a real given', () => {
  it('«AB = a» · «AC = a»: the second row reads a letter already named — both rows hold, at 24 seeds', () => {
    for (const seed of SEEDS) {
      const d = derive(['משולש ABC', 'AB = a', 'AC = a'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(Math.abs(dist(d, 'A', 'B') - symbol(d, 'a')), `AB = a, seed ${seed}`).toBeLessThan(1e-6);
      expect(Math.abs(dist(d, 'A', 'C') - symbol(d, 'a')), `AC = a, seed ${seed}`).toBeLessThan(1e-6);
    }
  });
  it('a stated range wins: «α < 30» · «משולש ABC» · «∢ABC = α» keeps α under 30 and the angle equal to it, at 24 seeds', () => {
    for (const seed of SEEDS) {
      const d = derive(['α < 30', 'משולש ABC', '∢ABC = α'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(symbol(d, 'α'), `seed ${seed}`).toBeLessThan(30);
      // a solved row: held to the solver's tolerance, not exactly
      expect(Math.abs(angleDeg(d, 'B', 'A', 'C') - symbol(d, 'α')), `seed ${seed}`).toBeLessThan(1e-4);
    }
  });
});
