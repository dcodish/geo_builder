/**
 * #1945 (ADR-AG-253) — A HEIGHT'S HOST IS ANY RING WITH A SIDE OPPOSITE THE APEX.
 *
 * «טרפז ABCD» · «AE גובה» was refused `cevian-no-triangle` — *"there is no triangle"* about a sentence that
 * never needed one — while 2-D builds the height on the trapezoid, on the parallelogram and on every other ring
 * (measured at `8e0debff` through `parse` + `buildParseCtx` over `replay`). ADR-W-118 B1: one plane-geometry
 * sentence, one verdict, one drawing.
 *
 * Every lock here CALLS the real path — `decideSubmit` (the gate `App.tsx` dispatches) or `derive` (the fold, the
 * solve, the mints) — and then measures the PROPERTY the height states ON THE FIGURE: the foot on the side 2-D
 * drops it to, the right angle there, the ring unmoved. None of them restates the grammar (ADR-W-053).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';

type P = { x: number; y: number };
const SEEDS = [0, 1, 2, 3, 4, 5];

function pts(lines: readonly string[], seed: number): Map<string, P> {
  const d = derive(lines, seed);
  expect(d.faults, `faults at seed ${seed}: ${lines.join(' | ')}`).toEqual([]);
  return new Map(d.figure.points.map((p) => [p.id, { x: p.x, y: p.y }]));
}
const get = (m: Map<string, P>, id: string): P => {
  const p = m.get(id);
  expect(p, `no point ${id}`).toBeDefined();
  return p!;
};
/** `p` is on the LINE through `a`,`b` — where a foot lands (a height's foot may fall outside the side itself). */
const onLine = (p: P, a: P, b: P): boolean =>
  Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y) < 1e-6;
/** The cosine between the two directions — 0 at a right angle. */
const cos = (a: P, b: P, c: P, d: P): number => {
  const u = { x: b.x - a.x, y: b.y - a.y };
  const v = { x: d.x - c.x, y: d.y - c.y };
  return (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
};

const verdict = (lines: readonly string[]) => {
  const prior: string[] = [];
  let last: ReturnType<typeof decideSubmit> | null = null;
  for (const line of lines) {
    last = decideSubmit(line, prior, 0);
    if (last.kind === 'record') prior.push(last.line);
  }
  return last!;
};
const key = (lines: readonly string[]): string => {
  const v = verdict(lines);
  return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
};

/** The height from `apex` to `foot` really is one: the foot on the side's line, and the right angle there. */
function expectHeight(m: Map<string, P>, apex: string, foot: string, u: string, v: string, why: string) {
  expect(onLine(get(m, foot), get(m, u), get(m, v)), `${why}: ${foot} on ${u}${v}`).toBe(true);
  expect(Math.abs(cos(get(m, apex), get(m, foot), get(m, u), get(m, v))), `${why}: ⟂`).toBeLessThan(1e-6);
}

describe('#1945 — «AE גובה» on every ring that has a side opposite A', () => {
  /** The ring, the height sentence, and the side 2-D drops it to (measured at `8e0debff`). */
  const RINGS: ReadonlyArray<readonly [string, readonly string[], string, string, [string, string]]> = [
    ['trapezoid — the parallel base (ADR-169)', ['טרפז ABCD', 'AE גובה'], 'A', 'E', ['D', 'C']],
    ['isosceles trapezoid', ['טרפז שווה שוקיים ABCD', 'AE גובה'], 'A', 'E', ['D', 'C']],
    ['parallelogram — the ring’s first opposite side', ['מקבילית ABCD', 'AE גובה'], 'A', 'E', ['B', 'C']],
    ['rectangle', ['מלבן ABCD', 'AE גובה'], 'A', 'E', ['B', 'C']],
    ['square', ['ריבוע ABCD', 'AE גובה'], 'A', 'E', ['B', 'C']],
    ['rhombus', ['מעוין ABCD', 'AE גובה'], 'A', 'E', ['B', 'C']],
    ['kite', ['דלתון ABCD', 'AE גובה'], 'A', 'E', ['B', 'C']],
    ['plain quadrilateral', ['מרובע ABCD', 'AE גובה'], 'A', 'E', ['B', 'C']],
    ['pentagon', ['מחומש ABCDE', 'AF גובה'], 'A', 'F', ['B', 'C']],
    ['hexagon', ['משושה ABCDEF', 'AG גובה'], 'A', 'G', ['B', 'C']],
    ['triangle — the CONTROL, unchanged', ['משולש ABC', 'AE גובה'], 'A', 'E', ['B', 'C']],
    // The apex is not always the first letter: the trapezoid's base follows the apex's own parallel.
    ['trapezoid, apex B', ['טרפז ABCD', 'BE גובה'], 'B', 'E', ['D', 'C']],
    ['trapezoid, apex C', ['טרפז ABCD', 'CE גובה'], 'C', 'E', ['A', 'B']],
    ['trapezoid, apex D', ['טרפז ABCD', 'DE גובה'], 'D', 'E', ['A', 'B']],
    ['parallelogram, apex B', ['מקבילית ABCD', 'BE גובה'], 'B', 'E', ['C', 'D']],
    // The apex named, the foot minted (#1240 / ADR-AG-211's H).
    ['trapezoid, the foot minted', ['טרפז ABCD', 'גובה מ-A'], 'A', 'H', ['D', 'C']],
    ['parallelogram, the foot minted', ['מקבילית ABCD', 'גובה מ-A'], 'A', 'H', ['B', 'C']],
    // The other spellings of the same sentence reach the same lowering, so they land on the same side.
    ['trapezoid, the copula', ['טרפז ABCD', 'AE הוא הגובה'], 'A', 'E', ['D', 'C']],
    ['trapezoid, English', ['trapezoid ABCD', 'AE is the altitude'], 'A', 'E', ['D', 'C']],
    ['quadrilateral, English', ['quadrilateral ABCD', 'AE is the altitude'], 'A', 'E', ['B', 'C']],
  ];

  for (const [why, lines, apex, foot, [u, v]] of RINGS) {
    it(`${why}: the height is drawn to ${u}${v}, at every seed`, () => {
      expect(key(lines), why).toBe('record');
      for (const seed of SEEDS) expectHeight(pts(lines, seed), apex, foot, u, v, `${why} @${seed}`);
    });
  }

  it('the trapezoid’s height lands where the coordinates say it must', () => {
    const lines = ['נקודה A(0,0)', 'נקודה B(6,0)', 'נקודה C(5,3)', 'נקודה D(1,3)', 'טרפז ABCD', 'AE גובה'];
    expect(key(lines)).toBe('record');
    const m = pts(lines, 0);
    expect(get(m, 'E').x).toBeCloseTo(0, 6);
    expect(get(m, 'E').y).toBeCloseTo(3, 6);
  });

  it('the parallelogram’s height lands where the coordinates say it must', () => {
    const lines = ['נקודה A(0,0)', 'נקודה B(6,0)', 'נקודה C(7,3)', 'נקודה D(1,3)', 'מקבילית ABCD', 'AE גובה'];
    expect(key(lines)).toBe('record');
    const m = pts(lines, 0);
    expectHeight(m, 'A', 'E', 'B', 'C', 'the parallelogram at its coordinates');
    expect(get(m, 'E').x).toBeCloseTo(5.4, 6);
    expect(get(m, 'E').y).toBeCloseTo(-1.8, 6);
  });

  it('adding the height never moves a PINNED ring (stability)', () => {
    const PINS: ReadonlyArray<readonly [string, readonly string[]]> = [
      ['טרפז ABCD', ['נקודה A(0,0)', 'נקודה B(6,0)', 'נקודה C(5,3)', 'נקודה D(1,3)']],
      ['מקבילית ABCD', ['נקודה A(0,0)', 'נקודה B(6,0)', 'נקודה C(7,3)', 'נקודה D(1,3)']],
      ['מרובע ABCD', ['נקודה A(0,0)', 'נקודה B(6,0)', 'נקודה C(5,4)', 'נקודה D(1,3)']],
      ['משולש ABC', ['נקודה A(0,0)', 'נקודה B(6,0)', 'נקודה C(2,4)']],
    ];
    for (const [ring, pins] of PINS) {
      for (const seed of SEEDS) {
        const before = pts([...pins, ring], seed);
        const after = pts([...pins, ring, 'AE גובה'], seed);
        for (const [id, p] of before) {
          expect({ id, x: +get(after, id).x.toFixed(9), y: +get(after, id).y.toFixed(9) }).toEqual({
            id,
            x: +p.x.toFixed(9),
            y: +p.y.toFixed(9),
          });
        }
      }
    }
  });
});

describe('#1945 — what the widened host does NOT change', () => {
  it('the triangle control draws exactly what the explicit side draws', () => {
    for (const seed of SEEDS) {
      const bare = pts(['משולש ABC', 'AE גובה'], seed);
      const stated = pts(['משולש ABC', 'AE גובה לצלע BC'], seed);
      expect([...bare].map(([k, p]) => [k, +p.x.toFixed(9), +p.y.toFixed(9)])).toEqual(
        [...stated].map(([k, p]) => [k, +p.x.toFixed(9), +p.y.toFixed(9)]),
      );
    }
  });

  it('`cevian-no-triangle` still fires where there is no side opposite the apex', () => {
    expect(key(['נקודה A', 'AD גובה'])).toBe('refused:cevian-no-triangle');
    expect(key(['נקודה A(0,0)', 'נקודה B(4,0)', 'הקטע AB', 'AD גובה'])).toBe('refused:cevian-no-triangle');
    expect(key(['מעגל שמשוואתו x^2+y^2=25', 'נקודה A(5,0)', 'AD גובה'])).toBe('refused:cevian-no-triangle');
  });

  it('the MEDIAN keeps the triangle-only host, because 2-D defers it on a ring', () => {
    // Measured at `8e0debff`: «מקבילית ABCD» · «AE תיכון» is `not-handled` in 2-D — no deterministic reading to
    // follow — so analytic keeps its honest refusal rather than inventing one of the ring's several midpoints.
    expect(key(['טרפז ABCD', 'AE תיכון'])).toBe('refused:cevian-no-triangle');
    expect(key(['מקבילית ABCD', 'AE תיכון'])).toBe('refused:cevian-no-triangle');
    expect(key(['מרובע ABCD', 'AE תיכון'])).toBe('refused:cevian-no-triangle');
    expect(key(['טרפז ABCD', 'תיכון מ-A'])).toBe('refused:cevian-no-triangle');
    // The triangle's median, and a named side on the ring, are untouched.
    expect(key(['משולש ABC', 'AE תיכון'])).toBe('record');
    expect(key(['טרפז ABCD', 'AE תיכון לצלע DC'])).toBe('record');
  });

  it('two shapes that give the apex different sides still ASK (#1684 / ADR-AG-209)', () => {
    expect(key(['משולש ABC', 'משולש ABD', 'AE גובה'])).toBe('refused:ambiguous-cevian');
    // 2-D asks here too (measured at `8e0debff`: `ambiguous-cevian`, shapes ABCD / ABC) — before the widened
    // host analytic skipped the quadrilateral and silently drew the triangle's height.
    expect(key(['מרובע ABCD', 'משולש ABC', 'AE גובה'])).toBe('refused:ambiguous-cevian');
  });

  it('the foot the figure already places names its own side (ADR-AG-222)', () => {
    const lines = ['נקודה A(0,0)', 'נקודה B(6,0)', 'נקודה C(5,3)', 'נקודה D(1,3)', 'טרפז ABCD', 'נקודה E על BC', 'AE גובה'];
    expect(key(lines)).toBe('record');
    const m = pts(lines, 0);
    expectHeight(m, 'A', 'E', 'B', 'C', 'the stated foot keeps its own side');
    // Two triangles, the foot on one of them: the #1662 narrowing is unchanged by the widened host.
    expect(key(['משולש ABC', 'משולש ABD', 'נקודה E על BC', 'AE גובה'])).toBe('record');
  });

  it('a degenerate height is refused by what is wrong with it, not as a missing triangle', () => {
    // «AE גובה לצלע AB» names the apex's own side: the role's own incidence, refused by name (#1231).
    expect(key(['טרפז ABCD', 'AE גובה לצלע AB'])).toBe('refused:degenerate-role');
    /*
     * «AB גובה» on a trapezoid says the height from A lands ON the vertex B, which the ring's own parallel base
     * contradicts: `unsatisfiable`, naming the statement, where before the widened host it was the (wrong)
     * `cevian-no-triangle`. 2-D emits the same statement and draws it (measured at `8e0debff`: the foot command
     * puts B on DC); this tree refuses rather than drawing a figure its givens cannot hold (#1231's posture).
     */
    expect(key(['טרפז ABCD', 'AB גובה'])).toBe('refused:unsatisfiable');
  });
});
