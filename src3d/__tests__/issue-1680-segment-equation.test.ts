/**
 * #1680 (ADR-3D-391, ADR-3D-392) — ONE READING FOR EVERY UNMARKED SEGMENT EQUATION, and a length sum in 3-D.
 *
 * The operator's rule (2026-10-30, PR #2605, ADR-3D-391 Am. 1), which replaces the 2026-10-04 / 2026-10-13 "ask"
 * rulings for every case it reaches: *"if something is not sure if its a vecotor or length, we should ask if both can
 * be true and if only one can be true, we will assume this is the case"*. So:
 * - only ONE reading can hold → that reading builds, no question (T36, T38, T40, T41, T42);
 * - both hold and give ONE figure → it builds (T39);
 * - both hold and DIFFER, or neither holds → it asks;
 * - a line the figure already states → «already on the figure», no row (T45);
 * - a vector reading draws every vector of the sentence as an arrow (T46).
 * Marked statements and definitions of a new point are unchanged.
 *
 * Every case is driven through the store's `submit`, the student's entry point.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { claimSeeds } from '../engine/claims';
import { derive3, useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();
const P = "מקבילון ABCDA'B'C'D'";
const PYR = 'פירמידה SABCD';
const TRI = 'משולש ABC';

beforeEach(() => st().clear());

const run = (lines: string[]) => {
  st().clear();
  lines.forEach((l) => st().submit(l));
  return { err: st().lastError as { code: string } | null, facts: st().facts.length };
};
const posAt = (seed: number) => derive3(st().facts, seed).positions;
const dist = (pos: ReturnType<typeof posAt>, a: string, b: string) => {
  const p = pos.get(a)!;
  const q = pos.get(b)!;
  return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
};
/** The rider's parameter along its host, at the store's seed. */
const tOf = (x: string, a: string, b: string) => {
  const pos = posAt(st().seed);
  return dist(pos, a, x) / dist(pos, a, b);
};

/** |XY| = k·|ZW| at every claim seed — the length reading holds on the drawn figure. */
const lengthHolds = (x: string, y: string, k: number, z: string, w: string) => {
  for (const seed of claimSeeds(st().seed)) {
    const pos = posAt(seed);
    expect(dist(pos, x, y)).toBeCloseTo(k * dist(pos, z, w), 6);
  }
};
const readingOfLast = () => {
  const facts = st().facts;
  return derive3(facts, st().seed).readings[facts[facts.length - 1].id];
};

describe('#1680 Am. 1 — only ONE reading can hold: it is taken and built, no question', () => {
  it.each([
    // T36: as vectors D would sit at 1.5·AB, off its segment
    [[TRI, 'D על AB', 'AD = 3BD'], ['A', 'D', 3, 'B', 'D']],
    // T38: as vectors D would sit at −¼
    [[TRI, 'D על AB', 'AB = 4DA'], ['A', 'B', 4, 'D', 'A']],
    // T41: as vectors the apex would lie in the base
    [[PYR, 'M אמצע BC', 'SM = 2SA'], ['S', 'M', 2, 'S', 'A']],
    // T42: AE runs along AA', AB does not (this reverses card 11 for this case, by the 2026-10-30 rule)
    [[P, "E על AA'", 'AE = AB'], ['A', 'E', 1, 'A', 'B']],
    // as vectors B and C would be one point (T40's class, in a figure whose lengths can hold it)
    [[TRI, 'AB = AC'], ['A', 'B', 1, 'A', 'C']],
    [[TRI, 'AB = 1AC'], ['A', 'B', 1, 'A', 'C']],
    [[P, "E על AA'", "AE = 2*A'E"], ['A', 'E', 2, "A'", 'E']],
  ] as [string[], [string, string, number, string, string]][])('%j builds as lengths', (lines, [x, y, k, z, w]) => {
    const { err, facts } = run(lines);
    expect(err).toBeNull();
    expect(facts).toBe(lines.length);
    expect(readingOfLast()).toBe('length');
    lengthHolds(x, y, k, z, w);
  });

  it('T36 puts D at ¾ of AB, exactly where «|AD| = 3|BD|» does, and draws no arrow', () => {
    run([TRI, 'D על AB', 'AD = 3BD']);
    expect(tOf('D', 'A', 'B')).toBeCloseTo(0.75, 6);
    expect(derive3(st().facts, st().seed).construction.arrows).toEqual([]);
  });

  it('a negative coefficient has no length reading, so it is a vector', () => {
    const { err } = run([P, "E על AA'", "AE = -A'E"]);
    expect(err).toBeNull();
    expect(tOf('E', 'A', "A'")).toBeCloseTo(0.5, 6);
  });
});

describe('#1680 Am. 1 — both readings can hold and DIFFER, or neither can: it asks, and commits nothing', () => {
  it.each([
    // a parallelogram (vectors) or two equal sides (lengths)
    [['מרובע ABCD', 'AB = DC'], { code: 'ambiguous-vector-length' }],
    [['מרובע ABCD', 'AB = CD'], { code: 'ambiguous-vector-length' }],
    // the engine draws a quadrilateral with A, B, D in line, so both readings build, and they differ
    [['מרובע ABCD', 'AB = 2 AD'], { code: 'ambiguous-vector-length', a1: 'A', b1: 'B', a2: 'A', b2: 'D', c: 2 }],
    // T40: «פירמידה SABCD» is a regular pyramid, so AB (a side) and AC (a diagonal) are never equal either: NEITHER
    // reading can hold, a case the 2026-10-30 rule does not cover, so it keeps asking (reported for a ruling)
    [[PYR, 'AB = 1AC'], { code: 'ambiguous-vector-length' }],
    [[PYR, 'AB = ½CD'], { code: 'ambiguous-vector-length', a1: 'A', b1: 'B', a2: 'C', b2: 'D', c: 0.5 }],
    // neither reading places E (t = 2 either way)
    [[P, "E על AA'", "AE = 2AA'"], { code: 'ambiguous-vector-length', a1: 'A', b1: 'E', a2: 'A', b2: "A'", c: 2 }],
    // a stated t = ⅔ contradicted under both readings
    [[P, "E על AA' כך ש-AE = 2EA'", "AE = 3EA'"], { code: 'ambiguous-vector-length', a1: 'A', b1: 'E', a2: 'E', b2: "A'", c: 3 }],
  ])('%j asks', (lines, expected) => {
    run(lines.slice(0, -1));
    const before = st().facts.length;
    const { err, facts } = run(lines);
    expect(err).toEqual(expected);
    expect(facts, 'nothing is committed').toBe(before);
  });
});

describe('#1680 Am. 1 — T45: a line the figure already states is «already on the figure», and adds no row', () => {
  it.each([
    [[P, "E על AA' כך ש-AE = 2EA'", "AE = 2EA'"]],
    [[PYR, 'M אמצע BC', 'BM = MC']],
  ])('%j', (lines) => {
    run(lines.slice(0, -1));
    const before = st().facts.length;
    st().submit(lines[lines.length - 1]);
    expect(st().lastError).toBeNull();
    expect(st().lastNotice).toEqual({ code: 'already-stated' });
    expect(st().facts.length).toBe(before);
  });
});

describe('#1680 Am. 1 — T46: a vector reading draws every vector of the sentence as an arrow', () => {
  it('«BE = EC» on an empty canvas draws BE and EC', () => {
    expect(run(['BE = EC']).err).toBeNull();
    expect(derive3(st().facts, st().seed).construction.arrows).toEqual(expect.arrayContaining([['B', 'E'], ['E', 'C']]));
  });
  it('«AK = 2AD» (a definition) draws AK and AD', () => {
    expect(run([P, 'AK = 2AD']).err).toBeNull();
    expect(derive3(st().facts, st().seed).construction.arrows).toEqual(expect.arrayContaining([['A', 'K'], ['A', 'D']]));
  });
});

describe('#1680 — a marked statement is a vector, unchanged', () => {
  it.each([
    [[PYR, 'AB⃗ = 2AD⃗']],
    [[PYR, 'וקטור AB = 2 וקטור AD']],
  ])('%j is verified as a vector, never asked', (lines) => {
    expect(run(lines).err?.code).toBe('claim-refuted');
  });
});

describe('#1680 — a segment equation that DEFINES a new point builds as a vector (ruling 2026-10-13)', () => {
  const vecHolds = (from: string, to: string, k: number, p: string, q: string) => {
    for (const seed of claimSeeds(st().seed)) {
      const pos = posAt(seed);
      const [F, T, Pp, Q] = [pos.get(from)!, pos.get(to)!, pos.get(p)!, pos.get(q)!];
      expect(T.x - F.x).toBeCloseTo(k * (Q.x - Pp.x), 6);
      expect(T.y - F.y).toBeCloseTo(k * (Q.y - Pp.y), 6);
      expect(T.z - F.z).toBeCloseTo(k * (Q.z - Pp.z), 6);
    }
  };
  it.each([
    [[P, 'AK = AD'], ['A', 'K', 1, 'A', 'D']],
    [[P, 'KA = AD'], ['K', 'A', 1, 'A', 'D']],
    [[P, 'AD = AK'], ['A', 'K', 1, 'A', 'D']],
    [[P, 'AK = 2AD'], ['A', 'K', 2, 'A', 'D']],
    [[P, "N אמצע CC'", "A'K = DN"], ["A'", 'K', 1, 'D', 'N']],
    [[P, "N אמצע CC'", "A'K = 4/5 DN"], ["A'", 'K', 0.8, 'D', 'N']],
  ] as [string[], [string, string, number, string, string]][])('%j builds K', (lines, [f, t, k, p, q]) => {
    const { err, facts } = run(lines);
    expect(err).toBeNull();
    expect(facts).toBe(lines.length);
    vecHolds(f, t, k, p, q);
  });
});

describe('#1680 / #1783 — a segment equation that PLACES a free rider builds where its readings agree (T35, T39)', () => {
  it.each([
    [[P, "E על AA'", "AE = EA'"], ['E', 'A', "A'"], 0.5],
    [[P, "E על AA'", "EA' = AE"], ['E', 'A', "A'"], 0.5],
    [[P, "E על AA'", "A'E = EA"], ['E', 'A', "A'"], 0.5],
    [[P, "E על AA'", "AE = 2EA'"], ['E', 'A', "A'"], 2 / 3],
    // T36 and T38: only the length reading can hold
    [[TRI, 'D על AB', 'AD = 3BD'], ['D', 'A', 'B'], 0.75],
    [[TRI, 'D על AB', 'AB = 4DA'], ['D', 'A', 'B'], 0.25],
    [[PYR, 'E על SA', 'SE = EA'], ['E', 'S', 'A'], 0.5],
    [[TRI, 'D על AB', 'AD = DB'], ['D', 'A', 'B'], 0.5],
    [[TRI, 'D על AB', 'AD = 3DB'], ['D', 'A', 'B'], 0.75],
    [[TRI, 'D על AB', 'DB = 3AD'], ['D', 'A', 'B'], 0.25],
    [[TRI, 'D על AB', 'AB = 4AD'], ['D', 'A', 'B'], 0.25],
  ] as [string[], [string, string, string], number][])('%j places the rider', (lines, [x, a, b], t) => {
    const { err, facts } = run(lines);
    expect(err).toBeNull();
    expect(facts).toBe(lines.length);
    expect(tOf(x, a, b)).toBeCloseTo(t, 6);
  });
});

/**
 * THE CLASS TEST for "one predicate": the plain form and its explicit `1·` twin get one verdict, in every row
 * above — the two used to be read by two different code paths.
 */
describe('#1680 — «X = Y» and «X = 1·Y» are one sentence', () => {
  it.each([
    [[TRI], 'AB = AC', 'AB = 1AC'],
    [['מרובע ABCD'], 'AB = CD', 'AB = 1·CD'],
    [[PYR, 'M אמצע BC'], 'BM = MC', 'BM = 1MC'],
    [[P], 'AK = AD', 'AK = 1AD'],
    [[P, "N אמצע CC'"], "A'K = DN", "A'K = 1·DN"],
    [[P, "E על AA'"], "AE = EA'", "AE = 1EA'"],
    [[P, "E על AA'"], 'AE = AB', 'AE = 1AB'],
    [[PYR, 'E על SA'], 'SE = EA', 'SE = 1EA'],
    [[TRI, 'D על AB'], 'AD = DB', 'AD = 1DB'],
    [[TRI, 'D על AB'], 'AD = BD', 'AD = 1BD'],
    [[PYR], 'AB = BA', 'AB = 1BA'],
  ])('%j: «%s» ≡ «%s»', (ctx, plain, unit) => {
    const a = run([...ctx, plain]);
    const b = run([...ctx, unit]);
    expect(b).toEqual(a);
  });
});

describe('#1680 arm (c) — a sum of segment lengths reads in 3-D (2-D’s set-measure-sum, ADR-3D-392)', () => {
  const sumAt = (terms: [string, string, number][]) =>
    claimSeeds(st().seed).map((seed) => {
      const pos = posAt(seed);
      return terms.reduce((acc, [a, b, c]) => acc + c * dist(pos, a, b), 0);
    });

  it.each([
    [['משולש ABC', 'AB + BC = 10'], [['A', 'B', 1], ['B', 'C', 1]], 10],
    [['משולש ABC', 'AB - BC = 2'], [['A', 'B', 1], ['B', 'C', -1]], 2],
    [['משולש ABC', 'AB + BC + CA = 12'], [['A', 'B', 1], ['B', 'C', 1], ['C', 'A', 1]], 12],
    [['משולש ABC', '2AB + BC = 10'], [['A', 'B', 2], ['B', 'C', 1]], 10],
    [['משולש ABC', '|AB| + |BC| = 10'], [['A', 'B', 1], ['B', 'C', 1]], 10],
    [['triangle ABC', 'AB + BC = 10'], [['A', 'B', 1], ['B', 'C', 1]], 10],
  ] as [string[], [string, string, number][], number][])('%j builds, and the sum holds at every claim seed', (lines, terms, value) => {
    const { err, facts } = run(lines);
    expect(err).toBeNull();
    expect(facts).toBe(lines.length);
    for (const s of sumAt(terms)) expect(s).toBeCloseTo(value, 6);
  });

  it('«הציגו תצורה אחרת» still changes the triangle (the sum fixes one number, not the shape)', () => {
    run(['משולש ABC', 'AB + BC = 10']);
    const before = dist(posAt(st().seed), 'A', 'B');
    st().resample();
    expect(st().lastError).toBeNull();
    const pos = posAt(st().seed);
    expect(dist(pos, 'A', 'B') + dist(pos, 'B', 'C')).toBeCloseTo(10, 6);
    expect(Math.abs(dist(pos, 'A', 'B') - before)).toBeGreaterThan(1e-6);
  });

  it('a sum the other givens contradict refuses, naming the statement', () => {
    const { err, facts } = run(['משולש ABC', 'AB = 3', 'BC = 4', 'AB + BC = 10']);
    expect(err).not.toBeNull();
    expect(facts).toBe(3);
  });

  it('pair terms on both sides stay the vector equation (X7), and a radical target is not taken, as in 2-D', () => {
    expect(run(['משולש ABC', 'AB + BC = AC']).err?.code).not.toBe('not-understood');
    expect(run(['משולש ABC', 'AB + BC = 2√3']).err?.code).toBe('not-understood');
  });
});
