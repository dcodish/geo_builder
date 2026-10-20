/**
 * #2431 ([ADR-AG-317](../../docs/06c-decisions-analytic.md#adr-ag-317)) — a line named by restatement is that line to
 * every slot that takes a line.
 *
 * Measured before (main 17168818, this file's rows through `decideSubmit`): after «נתון ישר 2x-y+3=0» · «נתון הישר l1:
 * 2x-y+3=0» the line keeps its content-derived id and only its label says l1, so «הישר AB מקביל לישר l1», «C על הישר l1»,
 * «שיפוע הישר l1 שלילי», «C נקודת החיתוך של הישר l1 עם ציר ה-x», «A מעל הישר l1» and «המעגל M משיק לישר l1» were refused
 * `unknown-reference l1`, and «ישר דרך A מקביל לישר l1» RECORDED with no fault and drew nothing. Exam Q1 ב(1) in its
 * named spelling was refused the same way.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import type { InputError } from '../store/useAnalyticStore';
import q1 from './fixtures/exam-2379-q1-named-perpendicular-2431.analytic.json';

/** Every line through the real submit decision; the verdict of each. */
function submitAll(lines: readonly string[]): string[] {
  const held: string[] = [];
  return lines.map((l) => {
    const v = decideSubmit(l, held, 0);
    if (v.kind === 'record') held.push(l);
    return v.kind;
  });
}
function refusalOf(lines: readonly string[]): InputError | null {
  const held = lines.slice(0, -1);
  expect(submitAll(held).every((k) => k === 'record'), held.join(' · ')).toBe(true);
  const v = decideSubmit(lines[lines.length - 1], held, 0);
  return v.kind === 'refused' ? v.error : null;
}
const SEEDS = [0, 1, 2, 3];
const point = (lines: readonly string[], seed: number, id: string) => derive(lines, seed).figure.points.find((p) => p.id === id)!;

/** The line gets its name by restatement, in both languages: the narrowing path (#1342). */
const NARROWED = {
  he: ['נקודה A', 'נקודה B', 'נתון ישר 2x-y+3=0', 'נתון הישר l1: 2x-y+3=0'],
  en: ['point A', 'point B', 'the line 2x-y+3=0', 'the line l1: 2x-y+3=0'],
};
const onL1 = (p: { x: number; y: number }) => Math.abs(2 * p.x - p.y + 3) < 1e-6;

describe('#2431 — the setup: the name rides the label, the id stays content-derived', () => {
  for (const [lang, setup] of Object.entries(NARROWED)) {
    it(`${lang}: one line, labelled l1, with an anonymous id`, () => {
      expect(submitAll(setup)).toEqual(setup.map(() => 'record'));
      const lines = derive(setup, 0).figure.curves.filter((c) => c.curve.kind === 'line');
      expect(lines).toHaveLength(1);
      expect(lines[0].label.name).toBe('l1');
      expect(lines[0].id).not.toBe('line-l1');
    });
  }
});

describe('#2431 — every slot that takes a line resolves l1', () => {
  const rows: Array<[string, string, (lines: string[]) => void]> = [
    ['he', 'הישר AB מקביל לישר l1', (lines) => {
      for (const seed of SEEDS) {
        const [a, b] = [point(lines, seed, 'A'), point(lines, seed, 'B')];
        expect((b.y - a.y) / (b.x - a.x), `seed ${seed}`).toBeCloseTo(2, 6);
      }
    }],
    ['en', 'AB is parallel to l1', (lines) => {
      const [a, b] = [point(lines, 0, 'A'), point(lines, 0, 'B')];
      expect((b.y - a.y) / (b.x - a.x)).toBeCloseTo(2, 6);
    }],
    ['he', 'הישר AB מאונך לישר l1', (lines) => {
      const [a, b] = [point(lines, 0, 'A'), point(lines, 0, 'B')];
      expect((b.y - a.y) / (b.x - a.x)).toBeCloseTo(-0.5, 6);
    }],
    ['he', 'C על הישר l1', (lines) => {
      for (const seed of SEEDS) expect(onL1(point(lines, seed, 'C')), `seed ${seed}`).toBe(true);
    }],
    ['en', 'C is on the line l1', (lines) => expect(onL1(point(lines, 0, 'C'))).toBe(true)],
    ['he', 'C נקודת החיתוך של הישר l1 עם ציר ה-x', (lines) => {
      const c = point(lines, 0, 'C');
      expect(c.x).toBeCloseTo(-1.5, 6);
      expect(c.y).toBeCloseTo(0, 6);
    }],
    ['he', 'A מעל הישר l1', (lines) => {
      for (const seed of SEEDS) {
        const a = point(lines, seed, 'A');
        expect(a.y > 2 * a.x + 3, `seed ${seed}`).toBe(true);
      }
    }],
    ['he', 'שיפוע הישר l1 חיובי', () => undefined],
  ];
  for (const [lang, sentence, check] of rows) {
    it(`${lang}: «${sentence}» records and holds`, () => {
      const lines = [...NARROWED[lang as 'he' | 'en'], sentence];
      expect(submitAll(lines)).toEqual(lines.map(() => 'record'));
      expect(derive(lines, 0).faults).toEqual([]);
      check(lines);
    });
  }

  it('«שיפוע הישר l1 שלילי» is judged against l1 itself — its slope is 2, so it is refused naming the sentence', () => {
    expect(refusalOf([...NARROWED.he, 'שיפוע הישר l1 שלילי'])).toMatchObject({ key: 'unsatisfiable' });
  });

  it('«A מעל הישר l1» on a VERTICAL line named by restatement gets the ruled no-such-side refusal (ADR-AG-310)', () => {
    const e = refusalOf(['נתון ישר x=2', 'נתון הישר l1: x=2', 'A(1,1)', 'A מעל הישר l1']);
    expect(e).toMatchObject({ key: 'side-of-vertical', side: 'above' });
  });

  it('a tangency to l1: «המעגל M משיק לישר l1» pins the radius to the distance from M', () => {
    const lines = [...NARROWED.he, 'נתון מעגל שמרכזו M(0,0) ורדיוסו r', 'המעגל M משיק לישר l1'];
    expect(submitAll(lines)).toEqual(lines.map(() => 'record'));
    const circle = derive(lines, 0).figure.curves.find((c) => c.curve.kind === 'circle')!.curve;
    expect(circle.kind === 'circle' && circle.r).toBeCloseTo(3 / Math.sqrt(5), 6);
  });

  for (const [lang, sentence] of [['he', 'ישר דרך A מקביל לישר l1'], ['he', 'דרך A עובר ישר מקביל לישר l1'], ['en', 'a line through A parallel to l1']] as const) {
    it(`${lang}: «${sentence}» is DRAWN, parallel to l1 through A (it recorded and drew nothing)`, () => {
      const lines = [...NARROWED[lang], sentence];
      expect(submitAll(lines)).toEqual(lines.map(() => 'record'));
      const d = derive(lines, 0);
      expect(d.faults).toEqual([]);
      const drawn = d.figure.curves.filter((c) => c.stated && c.curve.kind === 'line');
      expect(drawn).toHaveLength(2);
      const made = drawn.find((c) => c.label.name !== 'l1')!.curve;
      const a = point(lines, 0, 'A');
      if (made.kind !== 'line') throw new Error('not a line');
      expect(made.a * a.x + made.b * a.y + made.c).toBeCloseTo(0, 6);
      expect(-made.a / made.b).toBeCloseTo(2, 6);
    });
  }
});

describe('#2431 — a line that does not exist is refused, never recorded and dropped', () => {
  it('«ישר דרך A מקביל לישר l7» with no l7 → unknown-reference naming l7', () => {
    const e = refusalOf([...NARROWED.he, 'ישר דרך A מקביל לישר l7']);
    expect(e).toMatchObject({ key: 'unknown-reference', detail: 'l7' });
  });
  it('«ישר דרך A מקביל ל-CD» with no C → unknown-reference naming C', () => {
    const e = refusalOf([...NARROWED.he, 'ישר דרך A מקביל ל-CD']);
    expect(e).toMatchObject({ key: 'unknown-reference', detail: 'C' });
  });
  it('«הישר AB מקביל לישר l7» stays unknown-reference l7', () => {
    const e = refusalOf([...NARROWED.he, 'הישר AB מקביל לישר l7']);
    expect(e).toMatchObject({ key: 'unknown-reference', detail: 'l7' });
  });
});

describe('#2431 — a line named directly is unchanged', () => {
  it('«נתון הישר l1: 2x-y+3=0» · «ישר דרך A מקביל לישר l1» draws the line, as before', () => {
    const lines = ['A(1,2)', 'נתון הישר l1: 2x-y+3=0', 'ישר דרך A מקביל לישר l1'];
    expect(submitAll(lines)).toEqual(lines.map(() => 'record'));
    expect(derive(lines, 0).figure.curves.filter((c) => c.stated && c.curve.kind === 'line')).toHaveLength(2);
  });
});

describe('#2431 — exam Q1 ב(1) in its named spelling', () => {
  it('every fixture line records and the figure builds green', () => {
    expect(submitAll(q1.lines)).toEqual(q1.lines.map(() => 'record'));
    expect(derive(q1.lines, q1.seed).faults).toEqual([]);
  });
  it('the line the exam calls l1 is the carrier of «M על הישר 4x+y+3=0», promoted and named: one line', () => {
    const lines = derive(q1.lines, 0).figure.curves.filter((c) => c.curve.kind === 'line' && c.label.name === 'l1');
    expect(lines).toHaveLength(1);
    expect(lines[0].stated).toBe(true);
  });
  it('a wrong relation, «הישר l1 מקביל ל-KL», is refused as contradictory, naming the sentence', () => {
    const e = refusalOf([...q1.lines.slice(0, -1), 'הישר l1 מקביל ל-KL']);
    expect(e?.key).toBe('unsatisfiable');
  });
});
