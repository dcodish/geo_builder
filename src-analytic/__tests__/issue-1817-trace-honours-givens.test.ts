/**
 * THE TRACE HONOURS THE GIVENS (#1817, ADR-AG-245) — the locus walk judges every step with the configuration's own
 * validity predicate.
 *
 * Operator, 2026-10-06: a point restricted by the student's own inequalities («x_B > 1» · «x_B < 3», «שיעור ה-y של B
 * חיובי») was SHOWN inside the region, while its locus was drawn across the whole carrier curve — 106 of 160 drawn
 * points on «B על הישר y = x» had x outside (1, 3), and the whole lower half of חורף 2024's parabola was drawn under
 * «y_B > 0». The walk produced positions without passing them through validity; the canvas drew one configuration
 * that did.
 *
 * Every assertion is a PROPERTY checked by independent arithmetic on the drawn points (never through
 * `admissibleAt`), and every figure goes through the real `derive → ask` path — the locks call, they do not
 * reproduce (the plan's eight locks, in order).
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { drawnLoci } from '../app/answers';
import { derive } from '../engine/derive';
import { locusOf } from '../engine/locus';
import { fmtAnalytic } from '../format';

type P = { x: number; y: number };

/** The he kind words App.tsx injects, singular and plural. */
const kindWord = ((k: string, n: number) =>
  n > 1
    ? ({ line: 'שני ישרים', circle: 'שני מעגלים' } as Record<string, string>)[k]
    : ({ line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה' } as Record<string, string>)[k]) as never;

const answer = (lines: string[], name: string, seed = 0) =>
  ask(derive(lines, seed), `המקום הגיאומטרי של ${name}`, fmtAnalytic, kindWord);

/** Every drawn position of the answer's locus, all components and strokes. */
const drawn = (a: ReturnType<typeof answer>): P[] => (a.locus?.components ?? []).flatMap((c) => c.points);

/** The drawn strokes of one component: `points` split at `starts` — what the renderer lifts the pen across. */
const strokes = (c: { points: P[]; starts?: number[] }): P[][] => {
  const cuts = [0, ...(c.starts ?? []), c.points.length];
  return cuts.slice(0, -1).map((s, i) => c.points.slice(s, cuts[i + 1]));
};

const EPS = 1e-9;

const LINE_1_3 = ['נקודה B', 'B על הישר y = x', 'x_B > 1', 'x_B < 3'];
const LINE_1_3_PERMUTED = ['נקודה B', 'x_B > 1', 'x_B < 3', 'B על הישר y = x'];
const LINE_1_3_EN = ['point B', 'B on the line y = x', 'x_B > 1', 'x_B < 3'];
const WINTER_2024 = [
  'A(2,0)',
  'במשולש ישר זווית ABC (∢BAC = 90°)',
  'שיעור ה-x של הקדקוד B הוא -2',
  'הצלע BC מקבילה לציר ה-x',
  'הנקודה M היא אמצע הצלע BC',
];

describe('#1817 lock 1 — a coordinate range on a line: the trace is the segment', () => {
  for (const [label, seq] of [
    ['as typed', LINE_1_3],
    ['selectors typed before the carrier line', LINE_1_3_PERMUTED],
    ['English', LINE_1_3_EN],
  ] as const) {
    it(`${label}: every drawn point has 1 < x < 3, one stroke, ends at x = 1 and x = 3, row unchanged`, () => {
      const d = derive([...seq], 0);
      const a = ask(d, 'המקום הגיאומטרי של B', fmtAnalytic, kindWord);
      expect(a.value).toBe('ישר · x - y = 0');
      const comps = a.locus?.components ?? [];
      expect(comps).toHaveLength(1);
      expect(comps[0].starts).toBeUndefined();
      const pts = drawn(a);
      expect(pts.length).toBeGreaterThan(10);
      for (const p of pts) {
        expect(p.x).toBeGreaterThan(1 - EPS);
        expect(p.x).toBeLessThan(3 + EPS);
        expect(Math.abs(p.x - p.y)).toBeLessThan(1e-6);
      }
      // The ends are REFINED onto the boundary (bisection), not left up to a step short.
      const span = Math.hypot(d.box.maxX - d.box.minX, d.box.maxY - d.box.minY);
      const xs = pts.map((p) => p.x);
      expect(Math.min(...xs) - 1).toBeLessThan(1e-3 * span);
      expect(3 - Math.max(...xs)).toBeLessThan(1e-3 * span);
    });
  }
});

describe('#1817 lock 2 — חורף 2024: «שיעור ה-y של B חיובי» draws the upper half of y² = 8x', () => {
  for (const sel of ['שיעור ה-y של B חיובי', 'y_B > 0']) {
    it(`«${sel}»: every drawn point has y > 0; the row is the carrier's`, () => {
      const a = answer([...WINTER_2024, sel], 'M');
      expect(a.value).toBe('פרבולה · y² = 8x');
      const pts = drawn(a);
      expect(pts.length).toBeGreaterThan(10);
      for (const p of pts) {
        expect(p.y).toBeGreaterThan(0);
        expect(Math.abs(p.y * p.y - 8 * p.x)).toBeLessThan(1e-3 * Math.max(1, Math.abs(8 * p.x)));
      }
    });
  }

  it('regression guard: without the selector both halves are drawn', () => {
    const pts = drawn(answer(WINTER_2024, 'M'));
    expect(pts.some((p) => p.y > 1)).toBe(true);
    expect(pts.some((p) => p.y < -1)).toBe(true);
  });
});

describe('#1817 lock 3 — a circle restricted by region: the allowed arc, one stroke', () => {
  const CIRCLE = ['נקודה A', 'A על המעגל x^2 + y^2 = 4'];

  it('«A ברביע הראשון»: one arc, every point with x > 0 and y > 0', () => {
    const a = answer([...CIRCLE, 'A ברביע הראשון'], 'A');
    expect(a.value).toBe('מעגל · x² + y² = 2²');
    const comps = a.locus?.components ?? [];
    expect(comps).toHaveLength(1);
    expect(comps[0].starts).toBeUndefined();
    expect(comps[0].closed).toBe(false);
    for (const p of drawn(a)) {
      expect(p.x).toBeGreaterThan(-EPS);
      expect(p.y).toBeGreaterThan(-EPS);
      expect(Math.abs(Math.hypot(p.x, p.y) - 2)).toBeLessThan(1e-6);
    }
  });

  it('«y_A > 0»: a semicircle, one stroke', () => {
    const a = answer([...CIRCLE, 'y_A > 0'], 'A');
    const comps = a.locus?.components ?? [];
    expect(comps).toHaveLength(1);
    expect(comps[0].starts).toBeUndefined();
    const pts = drawn(a);
    for (const p of pts) expect(p.y).toBeGreaterThan(-EPS);
    // It IS the half circle, not a scrap of it: both ends reach the x-axis.
    expect(Math.min(...pts.map((p) => p.x))).toBeLessThan(-1.99);
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(1.99);
  });

  it('«x_A > 1»: the arc ACROSS the walk’s start is joined into one stroke (the wrap-join)', () => {
    const a = answer([...CIRCLE, 'x_A > 1'], 'A');
    const comps = a.locus?.components ?? [];
    expect(comps).toHaveLength(1);
    expect(comps[0].starts).toBeUndefined();
    const pts = drawn(a);
    for (const p of pts) expect(p.x).toBeGreaterThan(1 - EPS);
    // Both ends of the arc (y = ±√3) are reached.
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThan(-1.7);
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(1.7);
    // One stroke means consecutive drawn points are neighbours on the arc — no chord across the excluded side.
    for (let i = 1; i < pts.length; i += 1) expect(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)).toBeLessThan(0.5);
  });
});

describe('#1817 lock 4 — «D על הצלע AB»: the locus of a point on a side is the side', () => {
  it('every drawn D has 0 ≤ x ≤ 4', () => {
    const a = answer(['A(0,0)', 'B(4,0)', 'נקודה D', 'D על הצלע AB'], 'D');
    const pts = drawn(a);
    expect(pts.length).toBeGreaterThan(5);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(-EPS);
      expect(p.x).toBeLessThan(4 + EPS);
    }
  });

  it('a DERIVED point downstream of it: N the midpoint of DK has 0 ≤ x ≤ 2', () => {
    const a = answer(['A(0,0)', 'B(4,0)', 'K(0,4)', 'נקודה D', 'D על הצלע AB', 'N אמצע DK'], 'N');
    const pts = drawn(a);
    expect(pts.length).toBeGreaterThan(5);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(-EPS);
      expect(p.x).toBeLessThan(2 + EPS);
      expect(Math.abs(p.y - 2)).toBeLessThan(1e-6);
    }
  });
});

describe('#1817 lock 5 — «MA > 5»: the allowed set is two rays, and the walk crosses the gap', () => {
  const SEQ = ['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB', 'MA > 5'];

  it('one component drawn as TWO strokes, every point with |y| > 3; the row still reads one line', () => {
    const a = answer(SEQ, 'M');
    expect(a.value).toBe('ישר · x - 4 = 0');
    const comps = a.locus?.components ?? [];
    expect(comps).toHaveLength(1);
    const ss = strokes(comps[0]);
    expect(ss).toHaveLength(2);
    for (const p of drawn(a)) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(5 - EPS);
    // One stroke above the gap, one below — neither bridges it.
    const sides = ss.map((s) => Math.sign(s[0].y));
    expect(new Set(sides)).toEqual(new Set([1, -1]));
    for (const s of ss) for (const p of s) expect(Math.sign(p.y)).toBe(Math.sign(s[0].y));
    // The renderer is handed the lift: two strokes, so two `M` commands in one path.
    const loci = drawnLoci([a]);
    expect(loci).toHaveLength(1);
    expect(loci[0].starts).toEqual(comps[0].starts);
  });

  it('the engine result: the walk is the whole line, the pieces are the rays', () => {
    const d = derive(SEQ, 0);
    const res = locusOf(d.construction, 'M', [d.seed, d.seed + 1], d.box)!;
    expect(res.components).toHaveLength(1);
    const t = res.components[0].trace;
    expect(t.points.some((p) => Math.abs(p.y) < 3)).toBe(true); // the walk crossed the gap
    expect(t.pieces).toHaveLength(2);
  });
});

describe('#1817 lock 6 — an order between measures («MA < 3»)', () => {
  it('every drawn point has |MA| < 3', () => {
    const pts = drawn(answer(['A(0,0)', 'B(4,0)', 'נקודה M', 'MA = MB', 'MA < 3'], 'M'));
    expect(pts.length).toBeGreaterThan(5);
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeLessThan(3 + EPS);
  });
});

describe('#1817 lock 7 — every configuration «הציגו תצורה אחרת» reaches draws an admissible trace', () => {
  for (let seed = 0; seed <= 5; seed += 1) {
    it(`seed ${seed}`, () => {
      const a = answer(LINE_1_3, 'B', seed);
      const pts = drawn(a);
      expect(pts.length).toBeGreaterThan(10);
      for (const p of pts) {
        expect(p.x).toBeGreaterThan(1 - EPS);
        expect(p.x).toBeLessThan(3 + EPS);
      }
      const w = drawn(answer([...WINTER_2024, 'שיעור ה-y של B חיובי'], 'M', seed));
      expect(w.length).toBeGreaterThan(10);
      for (const p of w) expect(p.y).toBeGreaterThan(0);
    });
  }
});

describe('#1817 lock 8 — an unrestricted locus is unchanged: one stroke, the whole walk', () => {
  for (const [lines, name, row] of [
    [['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], 'M', 'ישר · x - 4 = 0'],
    [['A(-9,0)', 'B(41,0)', 'נקודה P', 'PA מאונך ל-PB'], 'P', 'מעגל · (x − 16)² + y² = 25²'],
  ] as const) {
    it(`${lines.join(' · ')}`, () => {
      for (const seed of [0, 1, 2]) {
        const d = derive([...lines], seed);
        const a = ask(d, `המקום הגיאומטרי של ${name}`, fmtAnalytic, kindWord);
        expect(a.value).toBe(row);
        const res = locusOf(d.construction, name, [d.seed, d.seed + 1], d.box)!;
        for (const [i, cp] of res.components.entries()) {
          // The drawing IS the walk — same points, same closure — exactly as before the clip existed.
          expect(cp.trace.pieces).toEqual([{ points: cp.trace.points, closed: cp.trace.closed }]);
          expect(a.locus!.components[i].points).toEqual(cp.trace.points);
          expect(a.locus!.components[i].starts).toBeUndefined();
        }
      }
    });
  }

  it('the measured extents of main are kept (bisector y ∈ [−36.96, 25.05], circle on diameter AB closed)', () => {
    const m = drawn(answer(['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], 'M'));
    expect(Math.min(...m.map((p) => p.y))).toBeCloseTo(-36.961, 2);
    expect(Math.max(...m.map((p) => p.y))).toBeCloseTo(25.05, 2);
    const c = answer(['A(-9,0)', 'B(41,0)', 'נקודה P', 'PA מאונך ל-PB'], 'P');
    expect(c.locus!.components[0].closed).toBe(true);
    expect(c.locus!.components[0].points).toHaveLength(68);
  });
});
