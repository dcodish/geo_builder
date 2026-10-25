/**
 * #2512 ([ADR-762](../../docs/06-decisions.md#adr-762)) — A SECOND RING ON A CIRCLE IS ITS OWN.
 *
 * Measured at main 045a8546 through the commit door (`decideDeterministic2D` → `commitVerdict`, model mocked to throw):
 * «מעגל O ברדיוס 3» · «משולש ABC חוסם את מעגל O» · «משולש DEF חוסם את מעגל O» drew DEF exactly on ABC (D = A, E = B,
 * F = C), green, at every seed and every «הציגו תצורה אחרת». ADR-115's triangle dual keyed its touch points by the
 * circle alone (`@t-O-0..2`), so the second triangle re-used the first one's touch points, and the engine recorded
 * the pairs as a FORCED coincidence, which `pointsDistinct` admits. A second regular pentagon / hexagon / octagon in
 * the same circle landed on the first, and a regular ring's vertex A landed on a point or diameter end already on
 * the circle, because its pinned θ ignored what the circle already carried.
 *
 * The fix: one tangential-ring emitter for the triangle and the quadrilateral (touch points keyed by circle AND
 * ring, started turned by the circle's rider count), and the n ≥ 5 ring scaffold started turned by the same count
 * on an existing circle. The exact turn is an interim (sampling it is #2528), so this file never pins the angle
 * between two rings — only that they are not coincident.
 */
import { describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));
llmParseMock.mockImplementation(() => {
  throw new Error('LIVE LLM CALLED');
});

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { searchAnotherView, meetsRequirements } from '@/replay/core';
import type { Vec } from '@/engine';

const st = () => useGeoStore.getState();

async function play(lines: string[]) {
  st().clear();
  for (const line of lines) {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D(
      { facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never,
      line,
      /[a-z]{3}/.test(line) ? 'en' : 'he',
    );
    expect(v.kind, `«${line}»`).toBe('commit');
    commitVerdict(v, line);
  }
}

type Fig = ReturnType<typeof replay>;
const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
const pos = (fig: Fig, id: string): Vec => {
  const p = fig.positions.get(id);
  expect(p, `${id} is drawn`).toBeDefined();
  return p as Vec;
};

/** The views a student can reach: the commit seed, then three «הציגו תצורה אחרת» presses (unbounded budget). */
function views(): { fig: Fig; label: string }[] {
  let facts: Fact[] = st().facts;
  let seed = st().seed;
  const out = [{ fig: replay(facts, seed), label: `commit seed ${seed}` }];
  for (let k = 1; k <= 3; k++) {
    const nx = searchAnotherView(facts, seed, undefined, 60_000);
    if (!nx) break;
    facts = nx.facts;
    seed = nx.seed;
    out.push({ fig: replay(facts, seed), label: `press ${k} (seed ${seed})` });
  }
  return out;
}
const seeds = () => Array.from({ length: 9 }, (_, s) => ({ fig: replay(st().facts, s), label: `seed ${s}` }));

/** No vertex of a later figure sits on any vertex of an earlier one. */
function expectDistinct(fig: Fig, groups: string[][], label: string) {
  groups.forEach((later, j) =>
    groups.slice(0, j).forEach((earlier) =>
      later.forEach((a) =>
        earlier.forEach((b) => expect(d(pos(fig, a), pos(fig, b)), `${label}: ${a} is not on ${b}`).toBeGreaterThan(1e-3)),
      ),
    ),
  );
}

/** Every side LINE of the triangle is tangent to O. */
function expectTangential(fig: Fig, [A, B, C]: string[], label: string) {
  const c = fig.circles.get('circle-O')!;
  [[A, B], [B, C], [C, A]].forEach(([p, q]) => {
    const P = pos(fig, p), Q = pos(fig, q);
    const dist = Math.abs((Q.x - P.x) * (P.y - c.center.y) - (P.x - c.center.x) * (Q.y - P.y)) / d(P, Q);
    expect(dist, `${label}: ${p}${q} is tangent to O`).toBeCloseTo(c.r, 4);
  });
}

/** Every vertex on O and every consecutive side equal. */
function expectRegular(fig: Fig, ids: string[], label: string) {
  const c = fig.circles.get('circle-O')!;
  ids.forEach((id) => expect(d(pos(fig, id), c.center), `${label}: ${id} on O`).toBeCloseTo(c.r, 4));
  const side = d(pos(fig, ids[0]), pos(fig, ids[1]));
  ids.forEach((id, i) => expect(d(pos(fig, id), pos(fig, ids[(i + 1) % ids.length])), `${label}: side ${i}`).toBeCloseTo(side, 4));
}

const L = (s: string) => s.split('');
type Kind = 'tri' | 'reg' | 'other';
/** name, lines, the figures in entry order (vertex ids), what each figure is */
const CLASS: [string, string[], string[][], Kind[]][] = [
  ['R0 the report', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'משולש DEF חוסם את מעגל O'], [L('ABC'), L('DEF')], ['tri', 'tri']],
  ['R1 bare circle', ['מעגל O', 'משולש ABC חוסם את מעגל O', 'משולש DEF חוסם את מעגל O'], [L('ABC'), L('DEF')], ['tri', 'tri']],
  ['R2 circle voice', ['מעגל O ברדיוס 3', 'מעגל O חסום במשולש ABC', 'מעגל O חסום במשולש DEF'], [L('ABC'), L('DEF')], ['tri', 'tri']],
  ['R4 English', ['circle O with radius 3', 'triangle ABC circumscribes circle O', 'triangle DEF circumscribes circle O'], [L('ABC'), L('DEF')], ['tri', 'tri']],
  ['R6 three triangles', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'משולש DEF חוסם את מעגל O', 'משולש GHK חוסם את מעגל O'], [L('ABC'), L('DEF'), L('GHK')], ['tri', 'tri', 'tri']],
  ['R13 reversed order', ['מעגל O ברדיוס 3', 'משולש DEF חוסם את מעגל O', 'משולש ABC חוסם את מעגל O'], [L('DEF'), L('ABC')], ['tri', 'tri']],
  ['R14 bare runs', ['מעגל O ברדיוס 3', 'ABC חוסם את מעגל O', 'DEF חוסם את מעגל O'], [L('ABC'), L('DEF')], ['tri', 'tri']],
  ['R15 «חסום ב-»', ['מעגל O ברדיוס 3', 'מעגל O חסום ב-ABC', 'מעגל O חסום ב-DEF'], [L('ABC'), L('DEF')], ['tri', 'tri']],
  ['P1 two plain pentagons', ['מעגל O ברדיוס 3', 'מחומש ABCDE חסום במעגל O', 'מחומש FGHKL חסום במעגל O'], [L('ABCDE'), L('FGHKL')], ['other', 'other']],
  ['P2 regular then plain pentagon', ['מעגל O ברדיוס 3', 'מחומש משוכלל ABCDE חסום במעגל O', 'מחומש FGHKL חסום במעגל O'], [L('ABCDE'), L('FGHKL')], ['reg', 'other']],
  ['P3 the first pentagon mints O', ['מחומש משוכלל ABCDE חסום במעגל O', 'מחומש משוכלל FGHKL חסום במעגל O'], [L('ABCDE'), L('FGHKL')], ['reg', 'reg']],
  ['P4 two regular octagons', ['מעגל O ברדיוס 3', 'מתומן משוכלל ABCDEFGH חסום במעגל O', 'מתומן משוכלל KLMNPQRS חסום במעגל O'], [L('ABCDEFGH'), L('KLMNPQRS')], ['reg', 'reg']],
  ['P5 English pentagons', ['circle O with radius 3', 'regular pentagon ABCDE inscribed in circle O', 'regular pentagon FGHKL inscribed in circle O'], [L('ABCDE'), L('FGHKL')], ['reg', 'reg']],
  ['P7 two regular hexagons', ['מעגל O', 'משושה משוכלל ABCDEF חסום במעגל O', 'משושה משוכלל GHKLMN חסום במעגל O'], [L('ABCDEF'), L('GHKLMN')], ['reg', 'reg']],
  ['P9 a point, then a regular pentagon', ['מעגל O ברדיוס 3', 'נקודה P על מעגל O', 'מחומש משוכלל ABCDE חסום במעגל O'], [['P'], L('ABCDE')], ['other', 'reg']],
  ['P10 a diameter, then a regular hexagon', ['מעגל O ברדיוס 3', 'PQ קוטר במעגל O', 'משושה משוכלל ABCDEF חסום במעגל O'], [L('PQ'), L('ABCDEF')], ['other', 'reg']],
];

/** Rows that were distinct at main and stay so (their verdicts kept). */
const CONTROLS: [string, string[], string[][]][] = [
  ['R3 the first triangle mints O', ['משולש ABC חוסם את מעגל O', 'משולש DEF חוסם את מעגל O'], [L('ABC'), L('DEF')]],
  ['R7 triangle then square', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'ריבוע DEFG חוסם את מעגל O'], [L('ABC'), L('DEFG')]],
  ['R8 square then triangle', ['מעגל O ברדיוס 3', 'ריבוע DEFG חוסם את מעגל O', 'משולש ABC חוסם את מעגל O'], [L('DEFG'), L('ABC')]],
  ['R9 two squares around', ['מעגל O ברדיוס 3', 'ריבוע ABCD חוסם את מעגל O', 'ריבוע EFGH חוסם את מעגל O'], [L('ABCD'), L('EFGH')]],
  ['R10 two quadrilaterals around', ['מעגל O ברדיוס 3', 'מרובע ABCD חוסם את מעגל O', 'מרובע EFGH חוסם את מעגל O'], [L('ABCD'), L('EFGH')]],
  ['R11 two rhombi around', ['מעגל O ברדיוס 3', 'מעוין ABCD חוסם את מעגל O', 'מעוין EFGH חוסם את מעגל O'], [L('ABCD'), L('EFGH')]],
  ['I1 two triangles in', ['מעגל O ברדיוס 3', 'משולש ABC חסום במעגל O', 'משולש DEF חסום במעגל O'], [L('ABC'), L('DEF')]],
  ['I2 two equilateral in', ['מעגל O ברדיוס 3', 'משולש שווה צלעות ABC חסום במעגל O', 'משולש שווה צלעות DEF חסום במעגל O'], [L('ABC'), L('DEF')]],
  ['I3 two squares in', ['מעגל O ברדיוס 3', 'ריבוע ABCD חסום במעגל O', 'ריבוע EFGH חסום במעגל O'], [L('ABCD'), L('EFGH')]],
  ['I6 two rectangles in', ['מעגל O ברדיוס 3', 'מלבן ABCD חסום במעגל O', 'מלבן EFGH חסום במעגל O'], [L('ABCD'), L('EFGH')]],
  ['I7 two quadrilaterals in', ['מעגל O ברדיוס 3', 'מרובע ABCD חסום במעגל O', 'מרובע EFGH חסום במעגל O'], [L('ABCD'), L('EFGH')]],
  ['I8 a triangle in mints O', ['משולש ABC חסום במעגל O', 'משולש DEF חסום במעגל O'], [L('ABC'), L('DEF')]],
  ['I9 a square in mints O', ['ריבוע ABCD חסום במעגל O', 'ריבוע EFGH חסום במעגל O'], [L('ABCD'), L('EFGH')]],
  ['X1 in, then around', ['מעגל O ברדיוס 3', 'משולש ABC חסום במעגל O', 'משולש DEF חוסם את מעגל O'], [L('ABC'), L('DEF')]],
  ['X2 around, then in', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'משולש DEF חסום במעגל O'], [L('ABC'), L('DEF')]],
  ['X3 square in, then around', ['מעגל O ברדיוס 3', 'ריבוע ABCD חסום במעגל O', 'ריבוע EFGH חוסם את מעגל O'], [L('ABCD'), L('EFGH')]],
  ['P6 a regular pentagon, then a point', ['מעגל O ברדיוס 3', 'מחומש משוכלל ABCDE חסום במעגל O', 'נקודה P על מעגל O'], [L('ABCDE'), ['P']]],
  ['P8 a regular pentagon, then a triangle around', ['מעגל O ברדיוס 3', 'מחומש משוכלל ABCDE חסום במעגל O', 'משולש FGH חוסם את מעגל O'], [L('ABCDE'), L('FGH')]],
  ['P11 an equilateral in, then a regular hexagon', ['מעגל O ברדיוס 3', 'משולש שווה צלעות PQR חסום במעגל O', 'משושה משוכלל ABCDEF חסום במעגל O'], [L('PQR'), L('ABCDEF')]],
  ['P12 a regular hexagon, then a point', ['מעגל O ברדיוס 3', 'משושה משוכלל ABCDEF חסום במעגל O', 'נקודה P על מעגל O'], [L('ABCDEF'), ['P']]],
  ['H1 two points on a circle', ['מעגל O ברדיוס 3', 'נקודה A על מעגל O', 'נקודה B על מעגל O'], [['A'], ['B']]],
  ['H2 two points on a segment', ['קטע AB', 'נקודה C על AB', 'נקודה D על AB'], [['C'], ['D']]],
  ['H4 two outside points', ['מעגל O ברדיוס 3', 'נקודה P מחוץ למעגל', 'נקודה Q מחוץ למעגל'], [['P'], ['Q']]],
  ['H5 two equilateral triangles on AB', ['קטע AB', 'משולש שווה צלעות ABC', 'משולש שווה צלעות ABD'], [['C'], ['D']]],
  ['H6 two squares on AB', ['קטע AB', 'ריבוע ABCD', 'ריבוע ABEF'], [L('CD'), L('EF')]],
  ['H7 two diameters', ['מעגל O ברדיוס 3', 'AB קוטר במעגל O', 'CD קוטר במעגל O'], [L('AB'), L('CD')]],
  ['H8 two chords', ['מעגל O ברדיוס 3', 'AB מיתר במעגל O', 'CD מיתר במעגל O'], [L('AB'), L('CD')]],
];

describe('#2512 — a second figure on a circle is drawn as its own figure', () => {
  for (const [name, lines, groups, kinds] of CLASS) {
    it(`${name}: distinct at seeds 0–8 and on every «הציגו תצורה אחרת», each figure what it says`, async () => {
      await play(lines);
      expect(meetsRequirements(st().facts, st().seed), 'the commit view meets every given').toBe(true);
      const commit = replay(st().facts, st().seed);
      expect(commit.coincidences ?? [], 'no coincidence is recorded').toEqual([]);
      for (const { fig, label } of [...seeds(), ...views()]) {
        expect(fig.lastError, label).toBeNull();
        expectDistinct(fig, groups, label);
        groups.forEach((g, i) => {
          if (kinds[i] === 'tri') expectTangential(fig, g, label);
          if (kinds[i] === 'reg') expectRegular(fig, g, label);
        });
      }
    });
  }

  for (const [name, lines, groups] of CONTROLS) {
    it(`control ${name}: commits and stays distinct`, async () => {
      await play(lines);
      for (const { fig, label } of [...seeds(), ...views()]) expectDistinct(fig, groups, label);
    });
  }
});

describe('#2512 — stability: the second ring never moves the first', () => {
  const STABLE: [string, string[], string[]][] = [
    ['R0', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'משולש DEF חוסם את מעגל O'], L('ABC')],
    ['R6', ['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O', 'משולש DEF חוסם את מעגל O', 'משולש GHK חוסם את מעגל O'], L('ABCDEF')],
    ['P3', ['מחומש משוכלל ABCDE חסום במעגל O', 'מחומש משוכלל FGHKL חסום במעגל O'], L('ABCDE')],
    ['P7', ['מעגל O', 'משושה משוכלל ABCDEF חסום במעגל O', 'משושה משוכלל GHKLMN חסום במעגל O'], L('ABCDEF')],
    ['P9', ['מעגל O ברדיוס 3', 'נקודה P על מעגל O', 'מחומש משוכלל ABCDE חסום במעגל O'], ['P']],
    ['P10', ['מעגל O ברדיוס 3', 'PQ קוטר במעגל O', 'משושה משוכלל ABCDEF חסום במעגל O'], L('PQ')],
  ];
  for (const [name, lines, earlier] of STABLE) {
    it(`${name}: at seed 0 the last line moves no earlier point and keeps the circle`, async () => {
      await play(lines.slice(0, -1));
      const before = replay(st().facts, 0);
      await play(lines);
      const after = replay(st().facts, 0);
      earlier.forEach((id) => expect(d(pos(before, id), pos(after, id)), `${id} did not move`).toBeLessThan(1e-9));
      const [b, a] = [before.circles.get('circle-O')!, after.circles.get('circle-O')!];
      expect(d(a.center, b.center)).toBeLessThan(1e-9);
      expect(a.r).toBeCloseTo(b.r, 9);
    });
  }
  for (const [name, lines, earlier] of STABLE.filter(([n]) => n === 'P3' || n === 'P7')) {
    it(`${name}: at seeds 0–8 a second regular ring moves no vertex of the first`, async () => {
      await play(lines.slice(0, -1));
      const before = seeds();
      await play(lines);
      seeds().forEach(({ fig, label }, s) =>
        earlier.forEach((id) => expect(d(pos(before[s].fig, id), pos(fig, id)), `${label}: ${id} did not move`).toBeLessThan(1e-9)),
      );
    });
  }
});

describe('#2512 — a lone ring on its circle draws exactly as before (measured at main 045a8546, seed 0)', () => {
  const HEAD: [string[], Record<string, [number, number]>][] = [
    [['מעגל O ברדיוס 3', 'משולש ABC חוסם את מעגל O'], { A: [0.739706, 5.954228], B: [-5.526366, -2.33651], C: [4.78666, -3.617718] }],
    [['מחומש משוכלל ABCDE חסום במעגל O'], { A: [0, 5], B: [-4.755283, 1.545085], C: [-2.938926, -4.045085], D: [2.938926, -4.045085], E: [4.755283, 1.545085] }],
    [['מעגל O ברדיוס 3', 'מחומש משוכלל ABCDE חסום במעגל O'], { A: [0, 3], B: [-2.85317, 0.927051], C: [-1.763356, -2.427051], D: [1.763356, -2.427051], E: [2.85317, 0.927051] }],
    [['מעגל O ברדיוס 3', 'מחומש ABCDE חסום במעגל O'], { A: [0, 3], B: [-2.663656, 1.380195], C: [-2.301057, -1.924873], D: [1.119597, -2.783254], E: [2.966201, 0.449056] }],
  ];
  for (const [lines, want] of HEAD) {
    it(lines.join(' · '), async () => {
      await play(lines);
      const fig = replay(st().facts, 0);
      for (const [id, [x, y]] of Object.entries(want)) {
        expect(pos(fig, id).x, `${id}.x`).toBeCloseTo(x, 5);
        expect(pos(fig, id).y, `${id}.y`).toBeCloseTo(y, 5);
      }
    });
  }
});
