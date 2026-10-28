/**
 * #2392 + #2390 §3 ([ADR-AG-313](../../docs/06c-decisions-analytic.md#adr-ag-313)) — THE COMMON TANGENT IS A NAMED LINE.
 *
 * Operator, on #2379: *"things that are missing, i need to add to the tool since this is an exam I give my students"*.
 * Q3 ג writes «הישר l משיק לשני מעגלים N1 ו- N2 בנקודות P ו- Q בהתאמה» and «הישר l חותך את ציר ה- y בנקודה הנמצאת מעל
 * ציר ה- x»: the line has a name, and the axis side picks the tangent without a point.
 *
 * - every common tangent is drawn as a LINE with its equation row (two candidate lines listed «… או …»);
 * - «הישר l משיק …» (and its split and English forms) is the same common tangent, named l;
 * - «נסמן את הישר PQ ב-l» names the line through P and Q;
 * - «הישר X חותך את ציר ה-y מעל / מתחת לציר ה-x», «… ציר ה-x מימין / משמאל לציר ה-y», «… החלק החיובי / השלילי …»
 *   keep the configurations whose crossing is on that side, and add no point.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { panelKnowledge } from '../app/panelRows';
import { ask } from '../app/ask';
import { derive, type Derivation } from '../engine/derive';
import saved from './fixtures/exam-2379-q3-c-named-tangent-2392.analytic.json';
import route from './fixtures/exam-2379-q3-route-2392.analytic.json';

type Pt = { id: string; x: number; y: number };

function record(lines: readonly string[], seed = 0): { ok: true; d: Derivation } | { ok: false; line: string; kind: string; key?: string } {
  const acc: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as { kind: string; line?: string; error?: { key?: string } };
    if (v.kind !== 'record') return { ok: false, line, kind: v.kind, key: v.error?.key };
    acc.push(v.line ?? line);
  }
  return { ok: true, d: derive(acc, seed) };
}

function built(lines: readonly string[], seed = 0): Derivation {
  const r = record(lines, seed);
  if (!r.ok) throw new Error(`«${r.line}»: ${r.kind} (${r.key})`);
  expect(r.d.faults).toEqual([]);
  return r.d;
}

const at = (d: Derivation, id: string): Pt => {
  const p = (d.figure.points as Pt[]).find((q) => q.id === id);
  expect(p, `${id} missing`).toBeDefined();
  return p!;
};
const fmt = (v: number) => String(Math.round(v * 1e6) / 1e6);
const answer = (d: Derivation, q: string) => ask(d, q, fmt).value;
/** The panel's row for `id`: its one equation, or its options, as `[a, b, c]` scaled so a = 3. */
const row = (d: Derivation, id: string) => panelKnowledge(d).curves.find((c) => c.id === id);
const asTriple = (k: unknown): number[] => {
  const l = k as { kind: string; a: number; b: number; c: number };
  expect(l.kind).toBe('line');
  return [l.a, l.b, l.c].map((v) => Math.round((v * 3) / l.a * 1e6) / 1e6);
};

const Q3F = ['נתון מעגל שמרכזו N1(-4,-12) ורדיוסו 10', 'נתון מעגל שמרכזו N2(12,0) ורדיוסו 10'];
const L14 = [3, -4, 14];
const L86 = [3, -4, -86];

describe('#2392 — the saved question (Q3 ג, fixed centres, the exam’s own spacing) builds and verifies', () => {
  it('l is 3x − 4y + 14 = 0, P(−10,−4) on N1, Q(6,8) on N2, and no point was added', () => {
    const d = built(saved.lines, saved.seed);
    expect(answer(d, 'משוואת הישר l')).toBe('3x - 4y + 14 = 0');
    expect([at(d, 'P').x, at(d, 'P').y, at(d, 'Q').x, at(d, 'Q').y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-10, -4, 6, 8]);
    expect((d.figure.points as Pt[]).map((p) => p.id).sort()).toEqual(['N1', 'N2', 'P', 'Q']);
    expect(asTriple(row(d, 'line-l')!.known)).toEqual(L14);
  });

  it('with «A(4,-6)», «שטח המשולש APQ» is 100', () => {
    const d = built([...saved.lines, 'A(4,-6)']);
    expect(answer(d, 'שטח המשולש APQ')).toBe('100');
  });
});

describe('#2392 — every spelling of the named common tangent is the same tangent, named l', () => {
  const spellings = [
    'הישר l משיק לשני מעגלים N1 ו- N2 בנקודות P ו- Q בהתאמה',
    'הישר l משיק למעגלים N1 ו-N2 בנקודות P ו-Q בהתאמה',
    'הישר l משיק למעגלים N1 ו-N2 בנקודות P ו-Q',
    'הישר l משיק לשני המעגלים N1 ו-N2 בנקודות P ו-Q בהתאמה',
    'הישר l משיק לשני המעגלים בנקודות P ו-Q',
    'הישר l משיק למעגל N1 בנקודה P ולמעגל N2 בנקודה Q',
    'the line l is tangent to circles N1 and N2 at P and Q respectively',
    'the line l is tangent to the circles N1 and N2 at P and Q',
    'the line l is tangent to circle N1 at P and to circle N2 at Q',
  ];
  for (const s of spellings) {
    it(`«${s}»: P on N1, Q on N2, line-l drawn and listed with its two options`, () => {
      const d = built([...Q3F, s]);
      const [N1, N2, P, Q] = ['N1', 'N2', 'P', 'Q'].map((id) => at(d, id));
      expect(Math.hypot(P.x - N1.x, P.y - N1.y)).toBeCloseTo(10, 6);
      expect(Math.hypot(Q.x - N2.x, Q.y - N2.y)).toBeCloseTo(10, 6);
      const drawn = d.figure.curves.find((c) => c.id === 'line-l');
      expect(drawn?.label.name).toBe('l');
      const r = row(d, 'line-l')!;
      expect(r.known).toBeNull();
      expect(r.options!.map(asTriple).sort((u, v) => v[2] - u[2])).toEqual([L14, L86]);
    });
  }

  it('«הישר l …» when l is already a line: the touches are stated on it, and no second line is drawn', () => {
    const d = built([...Q3F, 'הישר l: 3x-4y+14=0', 'הישר l משיק למעגלים N1 ו-N2 בנקודות P ו-Q']);
    expect(d.figure.curves.filter((c) => c.curve.kind === 'line').map((c) => c.id)).toEqual(['line-l']);
    expect([at(d, 'P').x, at(d, 'P').y, at(d, 'Q').x, at(d, 'Q').y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-10, -4, 6, 8]);
  });

  it('a name the figure holds as a line already built is refused, and nothing is drawn twice («הישר l: …» after the tangent)', () => {
    const r = record([...Q3F, 'הישר l משיק למעגלים N1 ו-N2 בנקודות P ו-Q', 'הישר l: y=2x']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.key).toBe('name-kind-clash');
  });
});

describe('#2390 §3 — «PQ משיק משותף …» is a full line with its row; the at-form is unchanged', () => {
  it('two candidate lines are listed «… או …» before a given picks one, one after', () => {
    const before = built([...Q3F, 'PQ משיק משותף למעגלים N1 ו-N2']);
    const r = row(before, 'line-PQ')!;
    expect(before.figure.curves.find((c) => c.id === 'line-PQ')?.label.name).toBe('PQ');
    expect(r.options!.map(asTriple).sort((u, v) => v[2] - u[2])).toEqual([L14, L86]);
    const after = built([...Q3F, 'PQ משיק משותף למעגלים N1 ו-N2', 'הישר PQ חותך את ציר ה-y מעל ציר ה-x']);
    expect(asTriple(row(after, 'line-PQ')!.known)).toEqual(L14);
  });

  it('«… חותך את ציר ה- y בנקודה B» still mints B(0, 3.5), unchanged', () => {
    const d = built([...Q3F, 'PQ משיק משותף למעגלים N1 ו-N2', 'הישר PQ חותך את ציר ה- y בנקודה B']);
    expect(at(d, 'B').x).toBeCloseTo(0, 6);
    expect(at(d, 'B').y).toBeCloseTo(3.5, 6);
  });

  it('the at-form «AB משיק משותף … בנקודה T» draws its one line-AB, as before', () => {
    const d = built(['נתון מעגל שמרכזו M(4,0) ורדיוסו 3', 'נתון מעגל שמרכזו N(13,0) ורדיוסו 6', 'המעגלים משיקים בנקודה T', 'AB משיק משותף למעגלים M ו-N בנקודה T']);
    expect(d.figure.curves.filter((c) => c.curve.kind === 'line').map((c) => c.id)).toEqual(['line-AB']);
    expect(answer(d, 'משוואת הישר AB')).toBe('x - 7 = 0');
  });
});

describe('#2392 — «נסמן את הישר PQ ב-l»', () => {
  it('on the drawn common tangent: the line is now l, and «הישר l …» refers to it', () => {
    const d = built([...Q3F, 'PQ משיק משותף למעגלים N1 ו-N2', 'נסמן את הישר PQ ב-l', 'הישר l חותך את החלק החיובי של ציר ה-y']);
    expect(d.figure.curves.find((c) => c.curve.kind === 'line')?.label.name).toBe('l');
    expect(answer(d, 'משוואת הישר l')).toBe('3x - 4y + 14 = 0');
  });

  it.each(['נסמן ב-l את הישר PQ', 'denote the line PQ by l'])('the other spellings: «%s»', (s) => {
    const d = built([...Q3F, 'PQ משיק משותף למעגלים N1 ו-N2', s]);
    expect(d.figure.curves.find((c) => c.curve.kind === 'line')?.label.name).toBe('l');
  });

  it('on a segment only: the line through it is drawn, named l', () => {
    const d = built(['A(1,2)', 'B(3,5)', 'AB', 'נסמן את הישר AB ב-l']);
    expect(answer(d, 'משוואת הישר l')).toBe('3x - 2y + 1 = 0');
  });

  // ⚠ #1467 (ADR-AG-342; ruling 2026-09-27 "Create everywhere + notice"): a missing point of the pair is created.
  it('a pair the figure lacks has its missing point created', () => {
    const r = record(['A(1,2)', 'נסמן את הישר AB ב-l']);
    expect(r.ok).toBe(true);
  });

  it('a name another line already has is refused', () => {
    const r = record(['A(1,2)', 'B(3,5)', 'הישר l: y=x', 'נסמן את הישר AB ב-l']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.key).toBe('name-kind-clash');
  });

  it('a line that already carries a student name is refused a second one', () => {
    const r = record(['A(1,2)', 'B(3,5)', 'הישר AB', 'נסמן את הישר AB ב-l', 'נסמן את הישר AB ב-l2']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.key).toBe('name-kind-clash');
  });
});

describe('#2392 — where a line crosses an axis, with no point made', () => {
  // y = 1.5x + 0.5: the y-axis at y = 0.5 (above), the x-axis at x = −1/3 (left).
  const SLANT = ['A(1,2)', 'B(3,5)', 'הישר AB'];
  const holds = [
    'הישר AB חותך את ציר ה-y בנקודה הנמצאת מעל ציר ה-x',
    'הישר AB חותך את ציר ה-y מעל ציר ה-x',
    'הישר AB חותך את ציר ה- y בנקודה הנמצאת מעל לציר ה- x',
    'הישר AB חותך את ציר ה-x בנקודה הנמצאת משמאל לציר ה-y',
    'הישר AB חותך את החלק החיובי של ציר ה-y',
    'הישר AB חותך את החלק השלילי של ציר ה-x',
    'line AB crosses the y-axis above the x-axis',
    'line AB crosses the x-axis to the left of the y-axis',
    'line AB crosses the positive part of the y-axis',
  ];
  it.each(holds)('«%s» holds on y = 1.5x + 0.5 and adds no point', (s) => {
    const d = built([...SLANT, s]);
    expect((d.figure.points as Pt[]).map((p) => p.id).sort()).toEqual(['A', 'B']);
  });

  const fails = [
    'הישר AB חותך את ציר ה-y בנקודה הנמצאת מתחת לציר ה-x',
    'הישר AB חותך את ציר ה-x מימין לציר ה-y',
    'הישר AB חותך את החלק השלילי של ציר ה-y',
    'line AB crosses the y-axis below the x-axis',
  ];
  it.each(fails)('«%s» holds in no configuration: refused «לא נמצאה תצורה…»', (s) => {
    const r = record([...SLANT, s]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.key).toBe('unsatisfiable');
  });

  it('a line parallel to the y-axis meets it nowhere: refused «לא נמצאה תצורה…»', () => {
    const r = record(['A(1,2)', 'B(1,5)', 'הישר AB', 'הישר AB חותך את ציר ה-y מעל ציר ה-x']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.key).toBe('unsatisfiable');
  });

  it('a side that names no side of that crossing («ציר ה-y … מימין לציר ה-y») is not this sentence', () => {
    const r = record([...SLANT, 'הישר AB חותך את ציר ה-y מימין לציר ה-y']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).not.toBe('record');
  });

  it('«מתחת» picks the other common tangent: 3x − 4y − 86 = 0, P(2,−20), Q(18,−8)', () => {
    const d = built([...Q3F, 'הישר l משיק למעגלים N1 ו-N2 בנקודות P ו-Q', 'הישר l חותך את ציר ה-y בנקודה הנמצאת מתחת לציר ה-x']);
    expect(answer(d, 'משוואת הישר l')).toBe('3x - 4y - 86 = 0');
    expect([at(d, 'P').x, at(d, 'P').y, at(d, 'Q').x, at(d, 'Q').y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([2, -20, 18, -8]);
  });
});


describe('#2379 Q3 — the exam’s own route through ג (N1 and N2 from «משיקים למעגל M בנקודה A»)', () => {
  // Skipped until #2381 (independent two-way choices take the same option, so N2 is drawn on N1 and «N1 משמאל ל-N2»
  // is refused) and #2382 (a tangency re-declares a stated radius and the panel blanks) land: measured here at the
  // stream's tip, the route stops at «N1 משמאל ל-N2» `unsatisfiable`. Whichever of them lands last un-skips this lock.
  it('builds through «הישר l …» and «… מעל ציר ה- x»: l = 3x − 4y + 14 = 0, P(−10,−4), Q(6,8) (needs #2381, #2382)', () => {
    const d = built(route.lines, route.seed);
    expect(answer(d, 'משוואת הישר l')).toBe('3x - 4y + 14 = 0');
    expect([at(d, 'P').x, at(d, 'P').y, at(d, 'Q').x, at(d, 'Q').y].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-10, -4, 6, 8]);
  });
});
