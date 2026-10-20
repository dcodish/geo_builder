/**
 * #2390 §1–2 ([ADR-AG-314](../../docs/06c-decisions-analytic.md#adr-ag-314)) — EVERY COMMON TANGENT IN ONE SENTENCE,
 * EACH NAMED; THE TANGENT AT THE TOUCHING CIRCLES' COMMON POINT.
 *
 * Operator ruling, 2026-10-20: *"we should name them so the user can refer to them later. this is good practice in
 * general"*. «כל המשיקים המשותפים לשני המעגלים» draws 4 / 3 / 2 / 1 lines by how the pair sits, named by the student or
 * l1, l2, … (external first); a circle inside the other is refused with 2-D's sentence; a pair the givens leave unsettled
 * goes to the model as before. Every drawn line is checked INDEPENDENTLY here — its distance from each centre is that
 * circle's radius — never through the engine's closed form (ADR-W-053).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { errorText } from '../app/errorText';
import { derive, type Derivation } from '../engine/derive';
import { analyticI18n } from '../i18n';
import all from './fixtures/exam-2379-q2-b-all-common-tangents-2390.analytic.json';
import touchQ from './fixtures/exam-2379-q2-c-touch-tangent-2390.analytic.json';

type Pt = { id: string; x: number; y: number };
type Verdict = { kind: string; line?: string; canonical?: string; error?: { key?: string; detail?: string } };

function record(lines: readonly string[], seed = 0): { ok: true; d: Derivation } | { ok: false; line: string; v: Verdict } {
  const acc: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as Verdict;
    if (v.kind !== 'record') return { ok: false, line, v };
    acc.push(v.line ?? line);
  }
  return { ok: true, d: derive(acc, seed) };
}

function built(lines: readonly string[], seed = 0): Derivation {
  const r = record(lines, seed);
  if (!r.ok) throw new Error(`«${r.line}»: ${r.v.kind} (${r.v.error?.key})`);
  expect(r.d.faults).toEqual([]);
  return r.d;
}

type Line = { id: string; name: string; a: number; b: number; c: number };
const linesOf = (d: Derivation): Line[] =>
  d.figure.curves.flatMap((cu) => (cu.curve.kind === 'line' ? [{ id: cu.id, name: cu.label.name, a: cu.curve.a, b: cu.curve.b, c: cu.curve.c }] : []));
const circlesOf = (d: Derivation) => d.figure.curves.flatMap((cu) => (cu.curve.kind === 'circle' ? [cu.curve] : []));
const distTo = (l: Line, x: number, y: number) => Math.abs(l.a * x + l.b * y + l.c) / Math.hypot(l.a, l.b);

/** Every line is tangent to both circles, and no two lines are one. */
function expectCommonTangents(d: Derivation, n: number) {
  const ls = linesOf(d);
  expect(ls).toHaveLength(n);
  const [p, q] = circlesOf(d);
  for (const l of ls) {
    expect(Math.abs(distTo(l, p.cx, p.cy) - p.r)).toBeLessThan(1e-9 * Math.max(1, p.r));
    expect(Math.abs(distTo(l, q.cx, q.cy) - q.r)).toBeLessThan(1e-9 * Math.max(1, q.r));
  }
  for (let i = 0; i < ls.length; i++) {
    for (let j = i + 1; j < ls.length; j++) {
      const same = Math.abs(ls[i].a * ls[j].b - ls[i].b * ls[j].a) < 1e-9 && Math.abs(ls[i].a * ls[j].c - ls[i].c * ls[j].a) < 1e-9;
      expect(same, `${ls[i].name} and ${ls[j].name} are one line`).toBe(false);
    }
  }
}

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const tHe = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);
const fmt = (v: number) => String(Math.round(v * 1e6) / 1e6);
const answer = (d: Derivation, q: string) => ask(d, q, fmt).value;
const SEEDS = Array.from({ length: 24 }, (_, i) => i);

const APART = ['נתון מעגל שמרכזו O(0,0) ורדיוסו 2', 'נתון מעגל שמרכזו K(10,0) ורדיוסו 3'];
const EXT = ['נתון מעגל שמרכזו M(4,0) ורדיוסו 3', 'נתון מעגל שמרכזו N(13,0) ורדיוסו 6'];
const CROSS = ['נתון מעגל שמרכזו O(0,0) ורדיוסו 5', 'נתון מעגל שמרכזו K(6,0) ורדיוסו 4'];
const INT = ['נתון מעגל שמרכזו O(0,0) ורדיוסו 5', 'נתון מעגל שמרכזו K(3,0) ורדיוסו 2'];
const NESTED = ['נתון מעגל שמרכזו O(0,0) ורדיוסו 5', 'נתון מעגל שמרכזו K(1,0) ורדיוסו 1'];
const SET = 'כל המשיקים המשותפים לשני המעגלים';

describe('#2390 — the saved questions (Q2 ב and ג) build and verify', () => {
  it('Q2 ב: l1: x − 2.83y + 5 = 0, l2: x + 2.83y + 5 = 0, l3: x − 7 = 0', () => {
    const d = built(all.lines, all.seed);
    expectCommonTangents(d, 3);
    expect(['l1', 'l2', 'l3'].map((n) => answer(d, `משוואת הישר ${n}`))).toEqual(['x - 2.83y + 5 = 0', 'x + 2.83y + 5 = 0', 'x - 7 = 0']);
  });

  it('Q2 ג: the tangent at the common point is l1: x − 7 = 0, and the ask answers it', () => {
    const d = built(touchQ.lines, touchQ.seed);
    expect(linesOf(d).map((l) => l.name)).toEqual(['l1']);
    expect(answer(d, 'משוואת הישר l1')).toBe('x - 7 = 0');
    expect(answer(d, 'משוואת המשיק העובר בנקודה המשותפת לשני המעגלים')).toBe('x - 7 = 0');
    expect(answer(d, 'מצאו את משוואת המשיק העובר בנקודה המשותפת לשני המעגלים')).toBe('x - 7 = 0');
  });

  it.each(SEEDS)('Q2 at seed %i: the internal pair merges into exactly one touch line (3 lines, never 2 or 4)', (seed) => {
    expectCommonTangents(built(all.lines, seed), 3);
  });

  it('Q2 before «a < 13» (both roots of a are externally tangent): still three lines', () => {
    expectCommonTangents(built(all.lines.filter((l) => l !== 'a < 13')), 3);
  });
});

describe('#2390 — the count follows how the pair sits', () => {
  it.each([
    ['apart (fixed)', APART, 4],
    ['externally tangent (fixed)', EXT, 3],
    ['crossing (fixed)', CROSS, 2],
    ['internally tangent (fixed)', INT, 1],
    ['«שני מעגלים זרים»', ['שני מעגלים זרים'], 4],
    ['«שני מעגלים נחתכים»', ['שני מעגלים נחתכים'], 2],
  ] as const)('%s → %i', (_, prefix, n) => {
    expectCommonTangents(built([...prefix, SET]), n);
  });

  it.each([
    ['«המשיקים המשותפים לשני המעגלים»', 'המשיקים המשותפים לשני המעגלים'],
    ['«כל המשיקים המשותפים למעגלים O ו-K»', 'כל המשיקים המשותפים למעגלים O ו-K'],
    ['English, all', 'all the common tangents of the two circles'],
    ['English, named circles', 'the common tangents of circles O and K'],
  ])('%s', (_, s) => {
    expectCommonTangents(built([...APART, s]), 4);
  });

  it('a circle inside the other: refused with 2-D’s sentence', () => {
    const r = record([...NESTED, SET]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.v.error?.key).toBe('no-common-tangent');
    expect(errorText(r.v.error as never, tHe)).toBe('למעגל המוכל בתוך מעגל אין אף משיק משותף.');
    expect(errorText(r.v.error as never, tEn)).toBe('A circle contained inside another has no common tangent at all.');
  });

  it('«מעגל P מוכל בתוך מעגל O»: refused the same way', () => {
    const r = record(['מעגל O', 'מעגל P מוכל בתוך מעגל O', SET]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.v.error?.key).toBe('no-common-tangent');
  });

  it.each([
    ['«שני מעגלים»', ['שני מעגלים']],
    ['«המעגלים משיקים» with no מבחוץ / מבפנים', ['מעגל M', 'מעגל N', 'המעגלים משיקים']],
  ])('unsettled — %s: not decided here, sent on as before (not-handled)', (_, prefix) => {
    const r = record([...prefix, SET]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.v.error?.key).toBe('not-handled');
  });
});

describe('#2390 — the names (the ruling)', () => {
  it('the tool names them l1, l2, … external first', () => {
    const d = built([...APART, SET]);
    expect(linesOf(d).map((l) => l.name)).toEqual(['l1', 'l2', 'l3', 'l4']);
  });

  it.each([
    ['«הישר l1: y=10»', 'הישר l1: y=10'],
    ['«ישר 1: y=10»', 'ישר 1: y=10'],
  ])('a line already called l1 (%s) is skipped: l2 … l5', (_, taken) => {
    const d = built([...APART, taken, SET]);
    expect(linesOf(d).slice(1).map((l) => l.name)).toEqual(['l2', 'l3', 'l4', 'l5']); // the first line is the stated one
  });

  it('the student’s names', () => {
    const d = built([...CROSS, 'המשיקים המשותפים l1 ו-l2 לשני המעגלים']);
    expect(linesOf(d).map((l) => l.name)).toEqual(['l1', 'l2']);
  });

  it('a count of names that does not match the pair is refused «לא נמצאה תצורה…»', () => {
    const r = record([...CROSS, 'המשיקים המשותפים l1, l2 ו-l3 לשני המעגלים']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.v.error?.key).toBe('unsatisfiable');
  });

  it('a name the figure already holds is refused', () => {
    const r = record([...CROSS, 'הישר l1: y=10', 'המשיקים המשותפים l1 ו-l2 לשני המעגלים']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.v.error?.key).toBe('name-kind-clash');
  });

  it('a later «הישר l2 …» means that tangent; a new «הישר l1: …» is refused as a name already taken', () => {
    const d = built([...CROSS, SET, 'הישר l2 חותך את ציר ה-y מתחת לציר ה-x', 'E נקודת החיתוך של הישרים l1 ו-l2']);
    expect(at(d, 'E').x).toBeCloseTo(30, 6); // l1, l2: x ± 5.92y − 30 = 0 meet on the line of centres
    const r = record([...CROSS, SET, 'הישר l1: y=2x']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.v.error?.key).toBe('name-kind-clash');
  });
});

const at = (d: Derivation, id: string): Pt => {
  const p = (d.figure.points as Pt[]).find((q) => q.id === id);
  expect(p, `${id} missing`).toBeDefined();
  return p!;
};

describe('#2390 — the tangent at the touching circles’ common point', () => {
  it.each([
    'המשיק העובר בנקודה המשותפת לשני המעגלים',
    'המשיק בנקודת ההשקה של המעגלים',
    'המשיק המשותף בנקודת ההשקה',
    'the tangent through the common point of the two circles',
    'the common tangent at the touch point',
  ])('«%s» on externally tangent circles: one line, x = 7', (s) => {
    const d = built([...EXT, s]);
    expectCommonTangents(d, 1);
    expect(answer(d, 'משוואת הישר l1')).toBe('x - 7 = 0');
  });

  it('named by the student: «המשיק l העובר בנקודה המשותפת לשני המעגלים»', () => {
    const d = built([...EXT, 'המשיק l העובר בנקודה המשותפת לשני המעגלים']);
    expect(linesOf(d).map((l) => l.name)).toEqual(['l']);
  });

  it('internally tangent circles: x = 5', () => {
    const d = built([...INT, 'המשיק העובר בנקודה המשותפת לשני המעגלים']);
    expect(answer(d, 'משוואת הישר l1')).toBe('x - 5 = 0');
  });

  it('touching circles of an unstated kind («המעגלים משיקים בנקודה T»): the tangent passes through T', () => {
    const d = built(['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T', 'המשיק המשותף בנקודת ההשקה']);
    const [l] = linesOf(d);
    const T = at(d, 'T');
    expect(distTo(l, T.x, T.y)).toBeLessThan(1e-6);
  });

  it.each([
    ['crossing', CROSS],
    ['apart', APART],
  ] as const)('%s circles: not decided here (not-handled), as before', (_, prefix) => {
    const r = record([...prefix, 'המשיק העובר בנקודה המשותפת לשני המעגלים']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.v.error?.key).toBe('not-handled');
  });

  it('the ask before any touch tangent is drawn: missing, as before', () => {
    const d = built(EXT);
    expect(ask(d, 'משוואת המשיק העובר בנקודה המשותפת לשני המעגלים', fmt).missing).toBeDefined();
  });
});

describe('#2390 — the exam’s Q2 ב sentence is taught', () => {
  it.each([
    'סרטטו במערכת צירים אחת סקיצה של שני המעגלים ושל כל המשיקים המשותפים לשני המעגלים',
    'שרטטו במערכת צירים אחת סקיצה של שני המעגלים ושל כל המשיקים המשותפים לשני המעגלים',
  ])('«%s» → «כל המשיקים המשותפים לשני המעגלים»', (s) => {
    const prefix = all.lines.slice(0, -1);
    const acc: string[] = [];
    for (const l of prefix) {
      const v = decideSubmit(l, acc, 0) as Verdict;
      acc.push(v.line ?? l);
    }
    const v = decideSubmit(s, acc, 0) as Verdict;
    expect(v.kind).toBe('teach');
    expect(v.canonical).toBe(SET);
  });

  it('«סרטטו» (ס) teaches like «שרטטו»: «סרטטו את המשיק למעגל M בנקודה A»', () => {
    const acc = ['נתון מעגל שמרכזו M(0,0) ורדיוסו 5', 'A(5,0)'];
    const v = decideSubmit('סרטטו את המשיק למעגל M בנקודה A', acc, 0) as Verdict;
    expect(v.kind).toBe('teach');
  });
});

describe('#2390 — stability: the circles and every earlier point stay put; no configuration changes a family', () => {
  it.each([0, 1, 2, 3])('seed %i', (seed) => {
    const before = built([...EXT, 'A(0,5)'], seed);
    const after = built([...EXT, 'A(0,5)', SET], seed);
    for (const id of ['M', 'N', 'A']) {
      const p = at(before, id);
      const q = at(after, id);
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(1e-9);
    }
    expect(linesOf(after).map((l) => [l.a, l.b, l.c].map(fmt))).toEqual(linesOf(built([...EXT, 'A(0,5)', SET], 0)).map((l) => [l.a, l.b, l.c].map(fmt)));
  });
});
