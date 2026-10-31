/**
 * A CROSSING OF TWO LINES THAT ARE ONE LINE NAMES NO POINT (#2613, ADR-AG-349) — the positional member of ADR-AG-140.
 *
 * Book p10 ex. 9 (the ellipse sweep, 2026-10-30): P on x²/16 + y²/12 = 1, N its foot on the x-axis, l1 through N
 * parallel to PO, l2 through P parallel to the x-axis, M = l1 ∩ l2. The true locus is M = (2x₀, y₀), the ellipse
 * x²/64 + y²/12 = 1 alone. Measured at 216cf8bb: «אליפסה · ישר» (the x-axis beside the ellipse) at 8 of seeds 0–11,
 * «ישר · y = 0» alone at seed 4, blank at 1, 5 and 8. At P = (±4, 0) l1 and l2 are both the x-axis; the walk
 * collected that common line as a component, or turned onto it at (±8, 0).
 *
 * Operator ruling 2026-10-30 (Q1 → A): such a crossing is refused in the figure too, with ADR-AG-140's sentence, and
 * the locus walk ends at such a configuration. Seed sweeps per ADR-AG-144.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { crossingHasNoPoint } from '../engine/evaluate';
import type { Construction } from '../engine/types';
import { fmtAnalytic } from '../format';
import saved from './fixtures/issue-2613-p10-9-locus.analytic.json';

type P = { x: number; y: number };
const SEEDS = Array.from({ length: 24 }, (_, i) => i);

const kindWord = ((k: string, n: number) =>
  n > 1
    ? ({ line: 'שני ישרים', circle: 'שני מעגלים' } as Record<string, string>)[k]
    : ({ line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה' } as Record<string, string>)[k]) as never;

const answer = (lines: readonly string[], q: string, seed: number) => ask(derive([...lines], seed), q, fmtAnalytic, kindWord);

const BOOK = saved.lines;
const REST = BOOK.slice(1);
const M_LINE = BOOK[BOOK.length - 1];

/** Every line through the REAL submit door; returns the recorded lines and the first refusal, if any. */
function submitAll(lines: readonly string[], seed: number): { acc: string[]; refused?: { line: string; key: string } } {
  const acc: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as { kind: string; line?: string; error?: { key: string } };
    if (v.kind !== 'record') return { acc, refused: { line, key: v.error?.key ?? v.kind } };
    acc.push(v.line ?? line);
  }
  return { acc };
}

describe('#2613 — p10-9: the locus of M is the ellipse alone, at every configuration', () => {
  it.each(SEEDS)('seed %i: the saved figure records line by line', (seed) => {
    expect(submitAll(BOOK, seed).refused).toBeUndefined();
  });

  it.each(SEEDS)('seed %i: «אליפסה · x²/64 + y²/12 = 1»', (seed) => {
    expect(answer(BOOK, 'המקום הגיאומטרי של M', seed).value).toBe('אליפסה · x²/64 + y²/12 = 1');
  });

  it.each(SEEDS)('seed %i: one component, every drawn point on the ellipse, both sides of y = 0, the shown M on it', (seed) => {
    const a = answer(BOOK, 'המקום הגיאומטרי של M', seed);
    const comps = a.locus?.components ?? [];
    expect(comps).toHaveLength(1);
    const pts: P[] = comps[0].points;
    for (const p of pts) expect(Math.abs((p.x * p.x) / 64 + (p.y * p.y) / 12 - 1), `(${p.x}, ${p.y})`).toBeLessThan(1e-3);
    expect(pts.some((p) => p.y > 1)).toBe(true);
    expect(pts.some((p) => p.y < -1)).toBe(true);
    // ADR-AG-086: the point the figure shows lies on the trace drawn for it.
    const m = derive([...BOOK], seed).figure.points.find((q) => q.id === 'M')!;
    expect(Math.min(...pts.map((p) => Math.hypot(p.x - m.x, p.y - m.y)))).toBeLessThan(0.5);
  });

  it.each(SEEDS.slice(0, 6))('seed %i: symbolic a and b — an ellipse, never a line', (seed) => {
    const v = answer(['נתונה אליפסה שמשוואתה x^2/a^2+y^2/b^2=1', ...REST], 'המקום הגיאומטרי של M', seed).value;
    expect(v).not.toBeNull();
    expect(v!.startsWith('אליפסה')).toBe(true);
    expect(v).not.toMatch(/ישר/);
  });

  it.each(SEEDS.slice(0, 6))('seed %i: the circle twin x² + y² = 25 — «אליפסה · x²/100 + y²/25 = 1»', (seed) => {
    expect(answer(['נתון מעגל שמשוואתו x^2+y^2=25', 'P נקודה על המעגל', ...REST.slice(1)], 'המקום הגיאומטרי של M', seed).value).toBe(
      'אליפסה · x²/100 + y²/25 = 1',
    );
  });
});

describe('#2613 — the figure: a crossing of two lines that are one line is refused with ADR-AG-140’s sentence', () => {
  it.each(SEEDS.slice(0, 6))('seed %i: «P(4,0)» then the construction — M’s line is refused `self-crossing`', (seed) => {
    const r = submitAll([BOOK[0], 'P(4,0)', ...REST.slice(1)], seed);
    expect(r.refused).toEqual({ line: M_LINE, key: 'self-crossing' });
  });

  it.each(SEEDS.slice(0, 6))('seed %i: two parallels to the y-axis meet only by coinciding — refused, P is not moved', (seed) => {
    const lines = [
      BOOK[0],
      'P נקודה על האליפסה',
      'O ראשית הצירים',
      'דרך P עובר ישר l2 מקביל לציר ה-y',
      'דרך O עובר ישר l1 מקביל לציר ה-y',
      'M נקודת החיתוך של הישר l1 עם הישר l2',
    ];
    const r = submitAll(lines, seed);
    expect(r.refused).toEqual({ line: lines[5], key: 'self-crossing' });
  });

  it('the structural member keeps its parse-time refusal (ADR-AG-140)', () => {
    const r = submitAll(['A(0,0)', 'B(4,1)', 'P נקודת החיתוך של הישר AB עם הישר BA'], 0);
    expect(r.refused?.key).toBe('self-crossing');
  });

  it('a crossing of two lines that DO meet still records (control)', () => {
    const r = submitAll(['A(0,0)', 'B(4,0)', 'C(0,3)', 'D(4,3)', 'P נקודת החיתוך של הישר AD עם הישר BC'], 0);
    expect(r.refused).toBeUndefined();
  });
});

describe('#2613 — the predicate: two straights that coincide here, and nothing else', () => {
  const base: Construction = { params: [], objects: [], constraints: [], selectors: [] };
  const at = new Map([
    ['A', { x: 0, y: 0 }],
    ['B', { x: 4, y: 0 }],
    ['M', { x: 1, y: 0 }],
  ]);
  const withRows = (...rows: Construction['constraints']): Construction => ({ ...base, constraints: rows });

  it('coincident lines (one by coefficients, one through two points) — no point', () => {
    const c = withRows({ t: 'on-line', id: 'M', a: 0, b: 2, c: 0 }, { t: 'on-line-2pt', id: 'M', a: 'A', b: 'B' } as never);
    expect(crossingHasNoPoint(c, at, {}, 'M')).toBe(true);
  });

  it('parallel lines apart — not this predicate (they have no crossing at all; the incidences say so)', () => {
    const c = withRows({ t: 'on-line', id: 'M', a: 0, b: 1, c: 0 }, { t: 'on-line', id: 'M', a: 0, b: 1, c: -3 });
    expect(crossingHasNoPoint(c, at, {}, 'M')).toBe(false);
  });

  it('two lines that cross — a point', () => {
    const c = withRows({ t: 'on-line', id: 'M', a: 0, b: 1, c: 0 }, { t: 'on-line', id: 'M', a: 1, b: 0, c: -1 });
    expect(crossingHasNoPoint(c, at, {}, 'M')).toBe(false);
  });

  it('a line tangent to a circle — a tangency IS a point', () => {
    // The circle (x − 1)² + y² = 1 as the fold builds it, and y = 1, its tangent at (1, 1).
    const circle = derive(['נתון מעגל שמשוואתו (x-1)^2+y^2=1'], 0).construction;
    const k = circle.objects.find((o) => o.kind === 'curve')!;
    const c: Construction = {
      ...circle,
      constraints: [{ t: 'on-line', id: 'M', a: 0, b: 1, c: -1 }, { t: 'on-curve', id: 'M', curve: k.id } as never],
    };
    const touch = new Map([...at, ['M', { x: 1, y: 1 }]]);
    expect(crossingHasNoPoint(c, touch, {}, 'M')).toBe(false);
    // …and the same row with a SECOND line in the circle's place is judged (the predicate reads the pair at all).
    const twin: Construction = { ...c, constraints: [c.constraints[0], { t: 'on-line', id: 'M', a: 0, b: 3, c: -3 }] };
    expect(crossingHasNoPoint(twin, touch, {}, 'M')).toBe(true);
  });

  it('one incidence is not a crossing', () => {
    expect(crossingHasNoPoint(withRows({ t: 'on-line', id: 'M', a: 0, b: 1, c: 0 }), at, {}, 'M')).toBe(false);
  });
});
