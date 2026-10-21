/**
 * #2397 ([ADR-AG-322](../../docs/06c-decisions-analytic.md#adr-ag-322)) — TWO CIRCLES INTRODUCED BEFORE THEY ARE
 * DESCRIBED: the pair a tangency sentence draws, and «המעגל האחד / האחר» describing it.
 *
 * Operator ruling, 2026-10-20 (#2397): *"it should be accepted as a first sentance too"* — «נתונים שני מעגלים המשיקים זה
 * לזה מבחוץ» is accepted as the first line, before the circles are described; the circles described later are those two.
 *
 * Two classes. (1) A sentence whose subject is "the two circles", typed before any circle exists, was refused, because
 * the plural tangency resolved its pair through its own resolver (no "none → draw" arm); it now lowers through the one
 * slot resolver the plural crossing uses. (2) A statement describing a circle the tool drew did not make that drawn circle
 * the described one — it drew another, or reported a false contradiction; a drawn circle now takes a stated equation
 * every way it was drawn, carrying what was already said about it, and «האחד / האחר» names it by order.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import saved from './fixtures/exam-2379-q2-printed-order-2397.analytic.json';

type Pt = { id: string; x: number; y: number };
type Verdict = { kind: string; line?: string; error?: { key?: string; host?: { found?: number; need?: number } } };

function submit(lines: readonly string[], seed = 0): { verdicts: Verdict[]; acc: string[] } {
  const acc: string[] = [];
  const verdicts: Verdict[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, acc, seed) as Verdict;
    verdicts.push(v);
    if (v.kind === 'record') acc.push(v.line ?? line);
  }
  return { verdicts, acc };
}
function built(lines: readonly string[], seed = 0) {
  const { verdicts, acc } = submit(lines, seed);
  verdicts.forEach((v, i) => expect(v.kind, `«${lines[i]}» → ${v.kind} ${v.error?.key ?? ''}`).toBe('record'));
  const d = derive(acc, seed);
  expect(d.faults).toEqual([]);
  expect(d.figure.unsatisfied).toEqual([]);
  return d;
}
type D = ReturnType<typeof derive>;
const pt = (d: D, id: string): Pt => {
  const p = (d.figure.points as Pt[]).find((q) => q.id === id);
  expect(p, `${id} missing`).toBeDefined();
  return p!;
};
/** Every drawn circle as centre and radius. */
const circlesOf = (d: D) =>
  d.figure.curves
    .map((c) => c.curve)
    .filter((c): c is Extract<typeof c, { kind: 'circle' }> => c.kind === 'circle')
    .map((c) => ({ cx: c.cx, cy: c.cy, r: c.r }));
const gap = (p: { cx: number; cy: number; r: number }, q: { cx: number; cy: number; r: number }) => Math.hypot(p.cx - q.cx, p.cy - q.cy);
/** The two circles touch from outside (d = r1 + r2) or from inside (d = |r1 − r2|). */
function expectTouching(d: D, kind: 'external' | 'internal') {
  const cs = circlesOf(d);
  expect(cs).toHaveLength(2);
  const [p, q] = cs;
  const want = kind === 'external' ? p.r + q.r : Math.abs(p.r - q.r);
  expect(Math.abs(gap(p, q) - want)).toBeLessThan(1e-6 * Math.max(1, want));
}
const SEEDS24 = Array.from({ length: 24 }, (_, i) => i);

const L1 = 'נתונים שני מעגלים המשיקים זה לזה מבחוץ .';
const D1 = 'מרכזו של המעגל האחד הוא בנקודה M ומשוואתו היא (x − a)² + y² = r² , a הוא פרמטר חיובי .';
const D2 = 'מרכזו של המעגל האחר הוא בנקודה N ומשוואתו היא (x − 13)² + y² = R² .';
const L4 = 'אורכו של הקטע המחבר את מרכזי המעגלים הוא 9 , והיחס בין אורכי הרדיוסים של המעגלים הוא 1:2 , r < R .';
const L5 = 'נתון כי a < 13 .';

describe('#2397 — the exam in its printed order (the operator’s exact sequence) builds green and verifies', () => {
  it('the fixture records line by line at seeds 0 and 1; M at (4, 0), the circles tangent from outside', () => {
    for (const seed of [0, 1]) {
      const d = built(saved.lines, seed);
      expect(pt(d, 'M').x).toBeCloseTo(4, 5);
      expect(pt(d, 'M').y).toBeCloseTo(0, 5);
      expect(pt(d, 'N').x).toBeCloseTo(13, 5);
      expectTouching(d, 'external');
      // Two circles, the drawn pair described — no third or fourth circle.
      expect(d.construction.objects.filter((o) => o.id.startsWith('curve-anon'))).toEqual([]);
    }
  });
});

describe('#2397 — the first-line pair sentences draw two circles, centres unnamed', () => {
  const external = ['נתונים שני מעגלים המשיקים זה לזה מבחוץ', 'שני מעגלים משיקים מבחוץ', 'המעגלים משיקים מבחוץ', 'two circles are externally tangent', 'the two circles touch each other externally'];
  for (const s of external) {
    it(`«${s}» on an empty canvas: two circles touching from outside at 24 seeds`, () => {
      for (const seed of SEEDS24) {
        const d = built([s], seed);
        expectTouching(d, 'external');
        expect(d.figure.points).toEqual([]);
      }
    });
  }
  it('«שני מעגלים משיקים מבפנים»: two circles touching from inside at 24 seeds', () => {
    for (const seed of SEEDS24) expectTouching(built(['שני מעגלים משיקים מבפנים'], seed), 'internal');
  });
  it('«שני מעגלים משיקים מבחוץ בנקודה T»: T is on both circles', () => {
    for (const seed of [0, 1, 2]) {
      const d = built(['שני מעגלים משיקים מבחוץ בנקודה T'], seed);
      const T = pt(d, 'T');
      for (const c of circlesOf(d)) expect(Math.abs(Math.hypot(T.x - c.cx, T.y - c.cy) - c.r)).toBeLessThan(1e-6);
    }
  });
});

describe('#2397 — twin equality: the first line is «שני מעגלים» + «המעגלים משיקים …»', () => {
  const snap = (d: D) => ({
    constraints: d.construction.constraints,
    circles: circlesOf(d).map((c) => [c.cx, c.cy, c.r].map((v) => Math.round(v * 1e6) / 1e6)),
  });
  const rows: Array<[string, string[]]> = [
    ['נתונים שני מעגלים המשיקים זה לזה מבחוץ', ['שני מעגלים', 'המעגלים משיקים מבחוץ']],
    ['שני מעגלים משיקים מבפנים', ['שני מעגלים', 'המעגלים משיקים מבפנים']],
  ];
  for (const [first, twin] of rows) {
    it(`«${first}» ≡ ${twin.map((t) => `«${t}»`).join(' · ')}`, () => {
      for (const seed of [0, 1]) expect(snap(built([first], seed))).toEqual(snap(built(twin, seed)));
    });
  }
});

describe('#2397 — order independence (the class test)', () => {
  const figure = (d: D) => ({
    M: [pt(d, 'M').x, pt(d, 'M').y],
    N: [pt(d, 'N').x, pt(d, 'N').y],
    radii: circlesOf(d).map((c) => c.r).sort((a, b) => a - b),
  });
  const close = (a: ReturnType<typeof figure>, b: ReturnType<typeof figure>) => {
    for (const k of ['M', 'N', 'radii'] as const) a[k].forEach((v, i) => expect(v).toBeCloseTo(b[k][i], 5));
  };
  it('the printed order draws the fixture order’s figure (M, N, both radii, the tangency) at seeds 0 and 1', () => {
    for (const seed of [0, 1]) {
      const printed = built([L1, D1, D2, L4, L5], seed);
      const fixture = built([D1, D2, L1, L4, L5], seed);
      close(figure(printed), figure(fixture));
      expectTouching(printed, 'external');
    }
  });
  it('pair · D2 · D1 («האחר» first names the first, by order) draws the same figure', () => {
    for (const seed of [0, 1]) close(figure(built([L1, D2, D1, L4, L5], seed)), figure(built([D1, D2, L1, L4, L5], seed)));
  });
  it('«נתונים שני מעגלים» · D1 · D2 · «המעגלים משיקים מבחוץ» draws the same figure', () => {
    for (const seed of [0, 1]) close(figure(built(['נתונים שני מעגלים', D1, D2, 'המעגלים משיקים מבחוץ', L4, L5], seed)), figure(built([D1, D2, L1, L4, L5], seed)));
  });
  it('«שני מעגלים נחתכים בנקודות A ו-B» · D1 · D2 (crossing equations): A and B on both described circles', () => {
    const lines = ['שני מעגלים נחתכים בנקודות A ו-B', 'מרכזו של המעגל האחד הוא בנקודה M ומשוואתו היא x^2 + y^2 = 25', 'מרכזו של המעגל האחר הוא בנקודה N ומשוואתו היא (x − 6)² + y² = 25'];
    for (const seed of [0, 1, 2, 3]) {
      const d = built(lines, seed);
      expect(circlesOf(d)).toHaveLength(2);
      for (const id of ['A', 'B']) {
        const p = pt(d, id);
        expect(Math.abs(Math.hypot(p.x, p.y) - 5)).toBeLessThan(1e-6);
        expect(Math.abs(Math.hypot(p.x - 6, p.y) - 5)).toBeLessThan(1e-6);
      }
    }
  });
});

describe('#2397 — carry-over: what a statement said about a drawn circle is kept', () => {
  it('a stated radius agrees with the equation: records; disagrees: conflicting-restatement', () => {
    const head = ['שני מעגלים', 'O מרכז המעגל', 'רדיוס המעגל O הוא 5'];
    const ok = built([...head, 'משוואת המעגל O היא (x-1)^2+y^2=25']);
    expect(pt(ok, 'O').x).toBeCloseTo(1, 9);
    const { verdicts } = submit([...head, 'משוואת המעגל O היא (x-1)^2+y^2=16']);
    expect(verdicts.at(-1)).toMatchObject({ kind: 'refused', error: { key: 'conflicting-restatement' } });
  });
  it('«שני מעגלים זרים» · two disjoint descriptions: apart at every seed', () => {
    const lines = ['שני מעגלים זרים', 'מרכזו של המעגל האחד הוא בנקודה M ומשוואתו היא x^2 + y^2 = 4', 'מרכזו של המעגל האחר הוא בנקודה N ומשוואתו היא (x − 10)² + y² = 9'];
    for (const seed of SEEDS24) {
      const d = built(lines, seed);
      const [p, q] = circlesOf(d);
      expect(gap(p, q)).toBeGreaterThan(p.r + q.r);
      expect(pt(d, 'N').x).toBeCloseTo(10, 6);
    }
  });
  it('«שני מעגלים זרים» · descriptions that overlap: refused, never drawn wrong', () => {
    const { verdicts } = submit(['שני מעגלים זרים', 'מרכזו של המעגל האחד הוא בנקודה M ומשוואתו היא x^2 + y^2 = 4', 'מרכזו של המעגל האחר הוא בנקודה N ומשוואתו היא (x − 3)² + y² = 9']);
    expect(verdicts.at(-1)!.kind).toBe('refused');
  });
  it('«נתון מעגל» · «משוואת המעגל היא (x-1)^2+y^2=4»: records (R140)', () => {
    const d = built(['נתון מעגל', 'משוואת המעגל היא (x-1)^2+y^2=4']);
    const [only, ...more] = circlesOf(d);
    expect(more).toEqual([]);
    expect(only.cx).toBeCloseTo(1, 9);
    expect(only.cy).toBeCloseTo(0, 9);
    expect(only.r).toBeCloseTo(2, 9);
  });
  it('the touch-drawn circle still takes its equation (ADR-AG-204)', () => {
    built(['הישר y=0 משיק למעגל בנקודה A', 'משוואת המעגל היא (x-1)^2+(y-2)^2=4']);
  });
});

describe('#2397 — naming by order on a tangent pair', () => {
  it('external pair · «O מרכז המעגל» · «P מרכז המעגל»: both named', () => {
    const d = built(['שני מעגלים משיקים מבחוץ', 'O מרכז המעגל', 'P מרכז המעגל']);
    expect(Math.hypot(pt(d, 'O').x - pt(d, 'P').x, pt(d, 'O').y - pt(d, 'P').y)).toBeGreaterThan(1e-3);
  });
  it('«המעגלים משיקים» (no side) · «O מרכז המעגל»: named', () => {
    built(['שני מעגלים', 'המעגלים משיקים', 'O מרכז המעגל']);
  });
  it('internal pair · «O מרכז המעגל»: asks which (ambiguous-shape), as 2-D asks', () => {
    expect(submit(['שני מעגלים משיקים מבפנים', 'O מרכז המעגל']).verdicts.at(-1)).toMatchObject({ kind: 'refused', error: { key: 'ambiguous-shape' } });
  });
  it('internal pair · «מרכזו של המעגל האחד …»: asks which', () => {
    expect(submit(['שני מעגלים משיקים מבפנים', 'מרכזו של המעגל האחד הוא בנקודה M ומשוואתו היא x^2 + y^2 = 25']).verdicts.at(-1)).toMatchObject({
      kind: 'refused',
      error: { key: 'ambiguous-shape' },
    });
  });
});

describe('#2397 — stability: a point unrelated to the circles never moves', () => {
  it('a free «נקודה Q» stated before D1 keeps its coordinates through D1 and D2', () => {
    for (const seed of [0, 1]) {
      const before = built([L1, 'נקודה Q'], seed);
      const after1 = built([L1, 'נקודה Q', D1], seed);
      const after2 = built([L1, 'נקודה Q', D1, D2], seed);
      for (const d of [after1, after2]) {
        expect(pt(d, 'Q').x).toBeCloseTo(pt(before, 'Q').x, 9);
        expect(pt(d, 'Q').y).toBeCloseTo(pt(before, 'Q').y, 9);
      }
    }
  });
});

describe('#2397 — controls (unchanged)', () => {
  it('one circle + the pair sentence: ambiguous-shape (found 1, need 2)', () => {
    expect(submit(['נתון מעגל שמרכזו M ורדיוסו 3', 'נתונים שני מעגלים המשיקים זה לזה מבחוץ']).verdicts.at(-1)).toMatchObject({
      kind: 'refused',
      error: { key: 'ambiguous-shape', host: { found: 1, need: 2 } },
    });
  });
  it('three circles + the pair sentence: ambiguous-shape (found 3)', () => {
    expect(submit(['מעגל O', 'מעגל P', 'מעגל Q', 'המעגלים משיקים מבחוץ']).verdicts.at(-1)).toMatchObject({ kind: 'refused', error: { key: 'ambiguous-shape', host: { found: 3 } } });
  });
  it('«נתון מעגל שמרכזו M ומשוואתו …» after the pair (no ordinal) is a third circle (ADR-AG-219)', () => {
    const d = built(['שני מעגלים משיקים מבחוץ', 'נתון מעגל שמרכזו M ומשוואתו x^2 + y^2 = 4']);
    expect(circlesOf(d)).toHaveLength(3);
  });
  it('the fixture order (T23) records as before', () => {
    const d = built([D1, D2, L1, L4, L5]);
    expect(pt(d, 'M').x).toBeCloseTo(4, 5);
  });
  it('«מרכזו של המעגל האחד …» on an empty canvas is the twin «M מרכז המעגל …» (#2391 row 10)', () => {
    const one = built(['מרכזו של המעגל האחד הוא בנקודה M ומשוואתו היא (x − 4)² + y² = 9']);
    const twin = built(['M מרכז המעגל (x − 4)² + y² = 9']);
    expect(circlesOf(one)).toEqual(circlesOf(twin));
    expect(pt(one, 'M')).toEqual(pt(twin, 'M'));
  });
  it('English: "one of the circles is centred at M with equation …" describes the drawn pair', () => {
    const d = built(['two circles are externally tangent', 'one of the circles is centred at M with equation x^2 + y^2 = 4']);
    expect(circlesOf(d)).toHaveLength(2);
    expect(pt(d, 'M').x).toBeCloseTo(0, 9);
  });
});
