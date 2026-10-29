/**
 * #1680 (ADR-3D-391, ADR-3D-392) — ONE READING FOR EVERY UNMARKED SEGMENT EQUATION, and a length sum in 3-D.
 *
 * The operator's rulings:
 * - 2026-10-04: in 3-D an unmarked segment name on both sides of an equation, with or without a coefficient
 *   («AB = AC», «AB = CD», «AB = 2AD», «AB = ½CD»), asks «length or vector?». It is a vector only when marked.
 * - 2026-10-13 (card 12, option A): *"A new point or a point on a segment never asks."* «AK = AD» builds like
 *   «AK = 2AD»; every other unmarked segment equation keeps asking.
 * - 2026-10-13 (card 11): «E על AA'» then «AE = AB» keeps asking — the point-on-a-segment exemption applies only
 *   when the vector reading can hold.
 *
 * Before this, the reading depended on which code path parsed the sentence: the parser asked about the plain
 * form before any rule ran (blind to the figure), and the apply guard asked about `k ≠ 1` with exemptions of its
 * own — so «AB = 1AC» was asked about by nobody and refuted, and «AK = AD» asked while «AK = 2AD» built.
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

describe('#1680 — every other unmarked segment equation asks length-or-vector', () => {
  it.each([
    [[TRI, 'AB = AC'], { code: 'ambiguous-vector-length' }],
    [['מרובע ABCD', 'AB = CD'], { code: 'ambiguous-vector-length' }],
    [['מרובע ABCD', 'AB = 2 AD'], { code: 'ambiguous-vector-length', a1: 'A', b1: 'B', a2: 'A', b2: 'D', c: 2 }],
    [[PYR, 'AB = ½CD'], { code: 'ambiguous-vector-length', a1: 'A', b1: 'B', a2: 'C', b2: 'D', c: 0.5 }],
    // the hole: «AB = 1AC» was the parser's shape for nobody, so it fell to the vector claim and was refuted
    [[PYR, 'AB = 1AC'], { code: 'ambiguous-vector-length' }],
    [[PYR, 'AB = 1·AC'], { code: 'ambiguous-vector-length' }],
    // a midpoint is already placed — this sentence places nothing, so it asks (it was refuted against the sample)
    [[PYR, 'M אמצע BC', 'SM = 2SA'], { code: 'ambiguous-vector-length', a1: 'S', b1: 'M', a2: 'S', b2: 'A', c: 2 }],
    [[PYR, 'M אמצע BC', 'BM = 1MC'], { code: 'ambiguous-vector-length' }],
    [[PYR, 'M אמצע BC', 'BM = MC'], { code: 'ambiguous-vector-length' }],
    // card 11: a rider whose vector reading cannot hold keeps asking
    [[P, "E על AA'", 'AE = AB'], { code: 'ambiguous-vector-length' }],
    [[P, "E על AA'", 'AE = 2AB'], { code: 'ambiguous-vector-length', a1: 'A', b1: 'E', a2: 'A', b2: 'B', c: 2 }],
    // a rider whose vector reading only a FLAT triangle would hold (D the midpoint of AC, on AB) asks — never «the triangle would be flat»
    [[TRI, 'D על AB', 'AD = DC'], { code: 'ambiguous-vector-length' }],
    // neither reading places E (t = 2): the sentence places nothing, so it asks like every other one
    [[P, "E על AA'", "AE = 2AA'"], { code: 'ambiguous-vector-length', a1: 'A', b1: 'E', a2: 'A', b2: "A'", c: 2 }],
  ])('%j asks', (lines, expected) => {
    const before = (() => {
      run(lines.slice(0, -1));
      return st().facts.length;
    })();
    const { err, facts } = run(lines);
    expect(err).toEqual(expected);
    expect(facts, 'nothing is committed').toBe(before);
  });

  it('the c = 1 forms carry no pairs, so they show the generic wording, as «AB = AC» always did', () => {
    expect(run([PYR, 'AB = 1AC']).err).toEqual(run([PYR, 'AB = AC']).err);
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

describe('#1680 / #1783 — a segment equation that PLACES a free rider builds where the vector reading holds', () => {
  it.each([
    [[P, "E על AA'", "AE = EA'"], ['E', 'A', "A'"], 0.5],
    [[P, "E על AA'", "EA' = AE"], ['E', 'A', "A'"], 0.5],
    [[P, "E על AA'", "A'E = EA"], ['E', 'A', "A'"], 0.5],
    [[P, "E על AA'", "AE = 2EA'"], ['E', 'A', "A'"], 2 / 3],
    [[PYR, 'E על SA', 'SE = EA'], ['E', 'S', 'A'], 0.5],
    // the whole-host form: both readings put E on A' (the plan's «AE = AA'» line)
    [[P, "E על AA'", "AE = AA'"], ['E', 'A', "A'"], 1],
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
