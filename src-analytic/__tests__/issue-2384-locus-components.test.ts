/**
 * THE LOCUS TRACER WALKS THE CARRIERS (#2384, ADR-AG-308) — closure in carrier space, discovery independent of the
 * sampler, one component per curve.
 *
 * Exam Q1 (summer 2024; #2379), section ג: circles I and II with centres K and L, the tangents at A and B meeting at
 * M, and «שטח המשולש KLM הוא 9». Measured at 3cae7f25: «המקום הגיאומטרי של M» answered «ישר · x − 4y + 4 = 0»
 * at seeds 0–2, «שני ישרים» with no equations at 3–4, and drew a 33-point stretch marked closed. The true set is
 * four rays on two lines: each line minus its chord inside circle I.
 *
 * Three defects of one class (the tracer judged its progress in the TRACED POINT's plane while the walk lives in
 * the CARRIER space): closure was tested on the image, so a walk that folded back past its own start stopped;
 * discovery reached other components only through the figure's sampler, which almost never lands on the far rays;
 * and every walk became its own component, so one line could print twice.
 *
 * Seed sweeps per ADR-AG-144: a 2/24 pass must not read as done.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { locusOf } from '../engine/locus';
import { fmtAnalytic } from '../format';
import saved from './fixtures/issue-2384-q1-area-locus.analytic.json';

type P = { x: number; y: number };
const SEEDS = Array.from({ length: 24 }, (_, i) => i);

/** The he kind words App.tsx injects, singular and the union's plural. */
const kindWord = ((k: string, n: number) =>
  n > 1
    ? ({ line: 'שני ישרים', circle: 'שני מעגלים' } as Record<string, string>)[k]
    : ({ line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה' } as Record<string, string>)[k]) as never;

const answer = (lines: readonly string[], name: string, seed: number) =>
  ask(derive([...lines], seed), `המקום הגיאומטרי של ${name}`, fmtAnalytic, kindWord);

const Q1 = saved.lines.slice(0, 9);
const AREA = saved.lines;
const TWO_LINES = 'שני ישרים:\nx - 4y + 22 = 0\nx - 4y + 4 = 0';

/** Every line of the fixture through the REAL submit door, recorded as the student's Enter records it. */
function recordsAll(lines: readonly string[], seed: number): string[] {
  const acc: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as { kind: string; line?: string };
    expect(v.kind, `«${line}» at seed ${seed}`).toBe('record');
    acc.push(v.line ?? line);
  }
  return acc;
}

const onL1 = (p: P) => Math.abs(p.x - 4 * p.y + 4) / Math.hypot(1, 4) < 0.02;
const onL2 = (p: P) => Math.abs(p.x - 4 * p.y + 22) / Math.hypot(1, 4) < 0.02;

describe('#2384 — Q1 ג: the area locus is both lines, at every configuration', () => {
  it('the saved figure records line by line', () => {
    expect(recordsAll(AREA, saved.seed)).toHaveLength(AREA.length);
  });

  it.each(SEEDS)('seed %i: «שני ישרים: x − 4y + 22 = 0 / x − 4y + 4 = 0»', (seed) => {
    expect(answer(AREA, 'M', seed).value).toBe(TWO_LINES);
  });

  it.each(SEEDS)('seed %i: the drawn pieces cover all four rays, none closed, none inside circle I', (seed) => {
    const a = answer(AREA, 'M', seed);
    const comps = a.locus?.components ?? [];
    expect(comps).toHaveLength(2);
    for (const c of comps) expect(c.closed).toBe(false);
    const pts = comps.flatMap((c) => c.points);
    // M has both tangents only outside circle I (centre K(3,4), radius 3): nothing is drawn through the chord.
    for (const p of pts) expect(Math.hypot(p.x - 3, p.y - 4)).toBeGreaterThan(3 - 1e-6);
    // The four rays: x − 4y + 4 = 0 leaves circle I at x = 1.53 and x = 5.53; x − 4y + 22 = 0 at 0.47 and 4.47.
    expect(pts.some((p) => onL1(p) && p.x < 1)).toBe(true);
    expect(pts.some((p) => onL1(p) && p.x > 6)).toBe(true);
    expect(pts.some((p) => onL2(p) && p.x < 0)).toBe(true);
    expect(pts.some((p) => onL2(p) && p.x > 5)).toBe(true);
  });

  it('every walked piece is open: no stretch of a line is a closed curve', () => {
    for (const seed of [0, 1, 2]) {
      const d = derive([...AREA], seed);
      const res = locusOf(d.construction, 'M', [d.seed, d.seed + 1], d.box);
      expect(res?.components).toHaveLength(2);
      for (const cp of res!.components) {
        expect(cp.trace.closed).toBe(false);
        expect(cp.trace.pieces.length).toBeGreaterThanOrEqual(2);
        for (const pc of cp.trace.pieces) expect(pc.closed).toBe(false);
      }
    }
  });
});

describe('#2384 — one component per curve: a line is never printed twice', () => {
  it.each(SEEDS)('seed %i: Q1 + «MA = MB» answers ONE line, «ישר · 4x + y + 3 = 0»', (seed) => {
    expect(answer([...Q1, 'MA = MB'], 'M', seed).value).toBe('ישר · 4x + y + 3 = 0');
  });

  it('no union answer of these figures repeats an equation', () => {
    for (const lines of [AREA, [...Q1, 'MA = MB'], [...Q1, 'MA = MB', 'M על הישר 4x+y+3=0']]) {
      for (const seed of SEEDS.slice(0, 6)) {
        const v = answer(lines, 'M', seed).value;
        if (!v || !v.includes('\n')) continue;
        const eqs = v.split('\n').slice(1);
        expect(new Set(eqs).size, `${v} at seed ${seed}`).toBe(eqs.length);
      }
    }
  });
});

describe('#2384 — controls: what the tracer already answered stays answered', () => {
  it.each(SEEDS)('seed %i: the free-point reference «K(3,4) L(-5,2) נקודה M» + the area: both lines', (seed) => {
    expect(answer(['K(3,4)', 'L(-5,2)', 'נקודה M', 'שטח המשולש KLM הוא 9'], 'M', seed).value).toBe(TWO_LINES);
  });

  it('#1500’s tangent pair keeps exactly its two components', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const a = answer(['משולש OMG', 'O(0,0)', 'M(2,6)', 'MH גובה לצלע OG', 'MH=6'], 'G', seed);
      expect(a.value, `seed ${seed}`).toBe('שני ישרים:\n3x + 4y = 0\ny = 0');
      expect(a.locus?.components).toHaveLength(2);
    }
  });

  it.each(SEEDS)('seed %i: a circle locus («A(0,0)» «נקודה M» «MA = 5») still closes', (seed) => {
    const a = answer(['A(0,0)', 'נקודה M', 'MA = 5'], 'M', seed);
    expect(a.value).toBe('מעגל · x² + y² = 5²');
    expect(a.locus?.components).toHaveLength(1);
    expect(a.locus!.components[0].closed).toBe(true);
  });

  it('a DERIVED traced point (G the midpoint of EK, E on a circle) still traces its one closed circle', () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const a = answer(['O(0,0)', 'K(6,0)', 'נתון מעגל שמשוואתו x^2+y^2=9', 'E על המעגל', 'G אמצע EK'], 'G', seed);
      expect(a.value, `seed ${seed}`).toBe('מעגל · (x − 3)² + y² = 9/4');
      expect(a.locus?.components).toHaveLength(1);
      expect(a.locus!.components[0].closed).toBe(true);
    }
  });
});
