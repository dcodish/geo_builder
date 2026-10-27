/**
 * THE CONSTRUCTION LOCUS (#1138, V1b — [ADR-AG-340](../../docs/06c-decisions-analytic.md#adr-ag-340),
 * [ADR-AG-341](../../docs/06c-decisions-analytic.md#adr-ag-341)) — a swept driver, a derived point, and the trace it draws.
 *
 * The plan's locks, through the real door (`decideSubmit` line by line → `derive` → `ask`; the model is never called):
 * the SWEEP RANGE (D7 kind 3) is two `coord-compare` selectors, so it never determines its point and the trace is clipped to
 * it; the carrier sentence «A נקודה (כלשהי) על …»; the exam's own locus questions; the named and role-referenced auxiliary
 * lines of קיץ ב' 2024. Every trace assertion is a PROPERTY of the drawn points checked by independent arithmetic.
 * (Locks 1–2 of the plan — the trace honours a stated restriction — shipped as #1817 and live in its own file.)
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { fmtAnalytic } from '../format';
import summerB from './fixtures/exam-2024sB-locus-1138.analytic.json';
import winter from './fixtures/exam-2024w-locus-1138.analytic.json';
import winterParam from './fixtures/exam-2024w-locus-param-1138.analytic.json';

type P = { x: number; y: number };
const EPS = 1e-6;

/** Submit `seq` line by line through the real decision; every line must record. */
function built(seq: readonly string[]): string[] {
  const lines: string[] = [];
  for (const u of seq) {
    const v = decideSubmit(u, lines, 0, derive(lines, 0));
    expect(v.kind, u).toBe('record');
    if (v.kind === 'record') lines.push(v.line);
  }
  return lines;
}

/** The verdict of the LAST line of `seq` after the others recorded. */
function lastVerdict(seq: readonly string[]) {
  const lines = built(seq.slice(0, -1));
  return decideSubmit(seq[seq.length - 1], lines, 0, derive(lines, 0));
}

const locus = (lines: readonly string[], name: string, seed = 0, q = `המקום הגיאומטרי של ${name}`) => ask(derive(lines, seed), q, fmtAnalytic);
const drawn = (a: ReturnType<typeof locus>): P[] => (a.locus?.components ?? []).flatMap((c) => c.points);
const strokes = (a: ReturnType<typeof locus>): number => (a.locus?.components ?? []).reduce((n, c) => n + 1 + (c.starts?.length ?? 0), 0);

const CIRCLE = ['נקודה A', 'A על המעגל x^2 + y^2 = 4'];

describe('#1138 lock 3 — a sweep range on a free point bounds the trace, never the point’s freedom', () => {
  for (const [label, seq] of [
    ['the symbolic chain', [...CIRCLE, '-1.5 ≤ y_A ≤ 1.5']],
    ['the Hebrew coordinate noun', [...CIRCLE, '-1.5 ≤ שיעור ה-y של A ≤ 1.5']],
    ['two one-sided bounds', [...CIRCLE, 'y_A ≤ 1.5', 'y_A ≥ -1.5']],
    ['the carrier sentence with its range tail', ['A נקודה כלשהי על המעגל x^2 + y^2 = 4 כך ש-−1.5 ≤ y_A ≤ 1.5']],
    // ADR-AG-005 D7's own corpus form, on a named circle.
    ['the exam’s sentence on circle II', ['נתון מעגל II שמשוואתו x^2+y^2=4', 'A היא נקודה כלשהי על מעגל II כך ש-−1.5 ≤ שיעור ה-y של A ≤ 1.5']],
  ] as const) {
    it(`${label}: one DOF left, A moves inside the band, the trace is the two arcs |y| ≤ 1.5`, () => {
      const lines = built(seq);
      const d = derive(lines, 0);
      expect(d.faults).toEqual([]);
      expect(d.figure.carrierDof).toBe(1);
      const ys = [0, 1, 2, 3, 4, 5].map((s) => derive(lines, s).figure.points.find((p) => p.id === 'A')!.y);
      for (const y of ys) expect(Math.abs(y)).toBeLessThanOrEqual(1.5 + EPS);
      expect(new Set(ys.map((y) => y.toFixed(6))).size).toBeGreaterThan(1);
      const a = locus(lines, 'A');
      expect(a.value).toBe('circle · x² + y² = 2²');
      const pts = drawn(a);
      expect(pts.length).toBeGreaterThan(10);
      for (const p of pts) {
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1.5 + 1e-3);
        expect(Math.abs(Math.hypot(p.x, p.y) - 2)).toBeLessThan(1e-6);
      }
      expect(pts.some((p) => p.x > 1)).toBe(true);
      expect(pts.some((p) => p.x < -1)).toBe(true);
      expect(strokes(a)).toBe(2);
    });
  }

  it('the strict chain «-1.5 < y_A < 1.5» reads the same way', () => {
    const lines = built([...CIRCLE, '-1.5 < y_A < 1.5']);
    for (const p of drawn(locus(lines, 'A'))) expect(Math.abs(p.y)).toBeLessThanOrEqual(1.5 + 1e-3);
  });

  it('the value on the left «1 < x_B» is x_B > 1', () => {
    const lines = built(['נקודה B', 'B על הישר y = x', '1 < x_B', 'x_B < 3']);
    const pts = drawn(locus(lines, 'B'));
    expect(pts.length).toBeGreaterThan(10);
    for (const p of pts) expect(p.x).toBeGreaterThan(1 - 1e-3);
  });

  it('without the range the whole circle is drawn (regression guard)', () => {
    const ys = drawn(locus(built(CIRCLE), 'A')).map((p) => p.y);
    expect(Math.max(...ys)).toBeGreaterThan(1.99);
    expect(Math.min(...ys)).toBeLessThan(-1.99);
  });
});

describe('#1138 — a non-strict bound admits its own value; a strict one does not', () => {
  it('«y_A ≤ 1.5» holds for A pinned ON the bound, «y_A < 1.5» is refused there', () => {
    expect(lastVerdict(['A(1,1.5)', 'y_A ≤ 1.5']).kind).toBe('record');
    expect(lastVerdict(['A(1,1.5)', 'y_A ≥ 1.5']).kind).toBe('record');
    const strict = lastVerdict(['A(1,1.5)', 'y_A < 1.5']);
    expect(strict).toMatchObject({ kind: 'refused', error: { detail: 'y_A < 1.5' } });
  });

  it('a strict comparison lowers exactly as before (no `closed` key); a non-strict one carries it', () => {
    const strict = parseLine('x_B > 1');
    expect(strict).toMatchObject({ ok: true });
    if (strict.ok) expect(strict.facts).toEqual([{ t: 'selector', sel: { kind: 'coord-compare', id: 'B', axis: 'x', greater: true, rhs: { value: { kind: 'num', value: 1 } } }, src: 'x_B > 1' }]);
    const closed = parseLine('x_B ≥ 1');
    if (closed.ok) expect(closed.facts[0]).toMatchObject({ sel: { closed: true, greater: true } });
    else throw new Error('x_B ≥ 1 did not parse');
    const chain = parseLine('-1.5 ≤ y_A < 1.5');
    if (chain.ok) {
      expect(chain.facts.map((f) => (f.t === 'selector' && f.sel.kind === 'coord-compare' ? [f.sel.greater, f.sel.closed ?? false] : null))).toEqual([
        [true, true],
        [false, false],
      ]);
    } else throw new Error('the chain did not parse');
  });
});

describe('#1138 lock 4 — a range that excludes the whole curve is refused, naming the range line', () => {
  it('«5 ≤ y_A ≤ 6» on the circle of radius 2', () => {
    expect(lastVerdict([...CIRCLE, '5 ≤ y_A ≤ 6'])).toMatchObject({ kind: 'refused', error: { detail: '5 ≤ y_A ≤ 6' } });
  });
});

describe('#1138 — the carrier sentence «A נקודה (כלשהי) על …» is the incidence', () => {
  it('«A נקודה כלשהי על המעגל x^2 + y^2 = 4»: the circle’s locus', () => {
    expect(locus(built(['A נקודה כלשהי על המעגל x^2 + y^2 = 4']), 'A').value).toBe('circle · x² + y² = 2²');
  });
  it('«A נקודה על המעגל» with exactly one circle in the figure', () => {
    expect(locus(built(['המעגל x^2 + y^2 = 4', 'A נקודה על המעגל']), 'A').value).toBe('circle · x² + y² = 2²');
  });
  it('«A נקודה על המעגל» with two circles is refused, never a pick', () => {
    expect(lastVerdict(['המעגל x^2 + y^2 = 4', 'המעגל x^2 + y^2 = 9', 'A נקודה על המעגל']).kind).toBe('refused');
  });
  it('«P נקודה על הצלע AB» and «P היא נקודה על הישר y = x» read as their incidence (2-D reads the first)', () => {
    const seg = built(['A(0,0)', 'B(4,0)', 'P נקודה על הצלע AB']);
    expect(derive(seg, 0).figure.carrierDof).toBe(1);
    expect(locus(built(['P היא נקודה על הישר y = x']), 'P').value).toBe('line · x - y = 0');
  });
  it('a tail that is not a range declines the whole line rather than being absorbed', () => {
    expect(lastVerdict(['A נקודה כלשהי על המעגל x^2 + y^2 = 4 כך ש-AB = 3']).kind).toBe('refused');
  });
});

describe('#1138 lock 5 — the exam’s locus questions answer the locus row', () => {
  it('«משוואת המקום הגיאומטרי שעליו נמצאות כל הנקודות M» on חורף 2024 (a = 2), and «הביעו באמצעות a את …»', () => {
    for (const q of [
      'משוואת המקום הגיאומטרי שעליו נמצאות כל הנקודות M',
      'הביעו באמצעות a את משוואת המקום הגיאומטרי שעליו נמצאות כל הנקודות M',
      'המקום הגיאומטרי שעליו נמצאים כל הנקודות M',
    ]) {
      const a = locus(winter.lines, 'M', 0, q);
      expect(a.value, q).toBe('parabola · y² = 8x');
      expect(a.missing, q).toBeUndefined();
    }
  });
  it('with the parameter a, «הביעו באמצעות a את …» answers the kind (the symbolic half is #1186)', () => {
    const plain = locus(winterParam.lines, 'M');
    const expressed = locus(winterParam.lines, 'M', 0, 'הביעו באמצעות a את משוואת המקום הגיאומטרי שעליו נמצאות כל הנקודות M');
    expect(expressed.value).toBe('parabola');
    expect({ ...expressed, question: '' }).toEqual({ ...plain, question: '' });
  });
  it("«הראו כי המקום הגיאומטרי של כל הנקודות G הוא פרבולה ומצאו את משוואתו» on the קיץ ב' 24 property figure", () => {
    const lines = built(['K(1,0)', 'נקודה E', 'E על הישר x = -1', 'נקודה G', 'GE = GK', 'GE מקביל לציר x']);
    for (const q of [
      'הראו כי המקום הגיאומטרי של כל הנקודות G הוא פרבולה ומצאו את משוואתו',
      'הראו כי המקום הגיאומטרי של כל הנקודות G נמצא על פרבולה, ומצאו את משוואתה',
    ]) expect(locus(lines, 'G', 0, q).value, q).toBe('parabola · y² = 4x');
  });
  it('the stated kind is not verified: «הראו כי … הוא מעגל» answers the parabola it is', () => {
    expect(locus(winter.lines, 'M', 0, 'הראו כי המקום הגיאומטרי של כל הנקודות M הוא מעגל').value).toBe('parabola · y² = 8x');
  });
  it('«הביעו באמצעות a את» before a question that is not the locus keeps that question’s own reading', () => {
    expect(locus(winter.lines, 'M', 0, 'הביעו באמצעות a את שיעורי M').unreadable).toBe(true);
  });
});

describe("#1138 lock 6 — קיץ ב' 2024: the named auxiliary lines, and the lines by their role", () => {
  it('the fixture records line by line, and the locus of G is y² = 4x at seeds 0–2', () => {
    built(summerB.lines);
    for (const seed of [0, 1, 2]) {
      const d = derive(summerB.lines, seed);
      expect(d.faults).toEqual([]);
      expect(locus(summerB.lines, 'G', seed).value).toBe('parabola · y² = 4x');
      for (const p of drawn(locus(summerB.lines, 'G', seed))) expect(Math.abs(p.y * p.y - 4 * p.x)).toBeLessThan(1e-4 * Math.max(1, Math.abs(p.x)));
    }
  });

  it('the role spelling «G נקודת החיתוך של הישר המקביל עם האנך האמצעי» — the same parabola', () => {
    const lines = built(['M(1,2)', 'K(1,0)', 'נקודה E', 'E על הישר x = -1', 'דרך E עובר ישר מקביל לציר ה-x', 'אנך אמצעי ל-EK', 'G נקודת החיתוך של הישר המקביל עם האנך האמצעי']);
    expect(locus(lines, 'G').value).toBe('parabola · y² = 4x');
  });

  it('the English spellings: «line l1 through E parallel to the x-axis», «l2 is the perpendicular bisector of EK»', () => {
    const lines = built(['M(1,2)', 'K(1,0)', 'point E', 'E on the line x = -1', 'line l1 through E parallel to the x-axis', 'l2 is the perpendicular bisector of EK', 'G is the intersection of line l1 and line l2']);
    expect(locus(lines, 'G').value).toBe('parabola · y² = 4x');
  });

  it('the line-first spellings name the line too: «ישר l1 דרך E מקביל לציר ה-x», «הישר l2 הוא האנך האמצעי לקטע EK»', () => {
    const lines = built(['K(1,0)', 'נקודה E', 'E על הישר x = -1', 'ישר l1 דרך E מקביל לציר ה-x', 'הישר l2 הוא האנך האמצעי לקטע EK', 'G נקודת החיתוך של הישר l1 עם הישר l2']);
    expect(locus(lines, 'G').value).toBe('parabola · y² = 4x');
  });

  it('two parallel lines: «הישר המקביל» is refused naming both, and the taught sentence records', () => {
    const ctx = ['K(1,0)', 'נקודה E', 'E על הישר x = -1', 'דרך E עובר ישר l1 מקביל לציר ה-x', 'דרך K עובר ישר l3 מקביל לציר ה-y', 'אנך אמצעי ל-EK'];
    const v = lastVerdict([...ctx, 'G נקודת החיתוך של הישר המקביל עם האנך האמצעי']);
    expect(v).toMatchObject({ kind: 'refused', error: { key: 'ambiguous-shape', host: { kind: 'line', found: 2, candidates: ['l1', 'l3'] } } });
    const lines = built([...ctx, 'G נקודת החיתוך של הישר l1 המקביל עם האנך האמצעי']);
    expect(locus(lines, 'G').value).toBe('parabola · y² = 4x');
  });

  it('a line drawn unnamed and then named is ONE line, which takes the name; the unnamed restatement is known', () => {
    const ctx = ['K(1,0)', 'נקודה E', 'E על הישר x = -1'];
    const lines = built([...ctx, 'האנך האמצעי לקטע EK', 'l2 הוא האנך האמצעי ל-EK', 'דרך E עובר ישר מקביל לציר ה-x', 'G נקודת החיתוך של הישר l2 עם הישר המקביל']);
    const lineAts = derive(lines, 0).construction.objects.filter((o) => o.kind === 'line-at');
    expect(lineAts).toHaveLength(2);
    expect(lineAts.filter((o) => o.kind === 'line-at' && o.name === 'l2')).toHaveLength(1);
    expect(locus(lines, 'G').value).toBe('parabola · y² = 4x');
    expect(lastVerdict([...ctx, 'l2 אנך אמצעי ל-EK', 'אנך אמצעי ל-EK']).kind).toBe('already-known');
  });

  it('no parallel line: «הישר המקביל» is refused, never a guess', () => {
    expect(lastVerdict(['K(1,0)', 'נקודה E', 'G נקודת החיתוך של הישר המקביל עם האנך האמצעי'])).toMatchObject({
      kind: 'refused',
      error: { key: 'ambiguous-shape', host: { kind: 'line', found: 0 } },
    });
  });
});

describe('#1138 lock 7 — חורף 2024: the exam’s sentences, with a = 2 and with the parameter', () => {
  it('a = 2: every line records, the locus of M is y² = 8x at seeds 0–1', () => {
    built(winter.lines);
    for (const seed of [0, 1]) expect(locus(winter.lines, 'M', seed).value).toBe('parabola · y² = 8x');
  });
  it('with a: every line records, the locus of M is a parabola (the kind)', () => {
    built(winterParam.lines);
    expect(locus(winterParam.lines, 'M').value).toBe('parabola');
  });
});
