/**
 * #2395 ([ADR-AG-311](../../docs/06c-decisions-analytic.md#adr-ag-311)) — a stated distinctness.
 *
 * Measured before (f5c0605f, #2386's tip): «N1 ≠ N2», «המעגלים N1 ו-N2 שונים», «הישרים l1 ו-l2 שונים», «A ≠ B» and the
 * other spellings were all `not-handled`. Q2 (summer 2022) drew its two common tangents l1 and l2 as ONE line at seeds
 * 0, 2, 3, 5 of 0–7; Q3 drew N1 = N2 at every seed. Every figure case runs the real path: `decideSubmit`, then `derive`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';
import { curvesCoincide } from '../engine/evaluate';
import { parseLine } from '../parser/parseAnalytic';
import type { InputError } from '../store/useAnalyticStore';
import q2 from './fixtures/exam-2379-q2-two-tangents-2395.analytic.json';
import q3 from './fixtures/exam-2379-q3-distinct-2395.analytic.json';

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const near = (p: { x: number; y: number } | undefined, x: number, y: number) =>
  !!p && Math.abs(p.x - x) < 1e-2 && Math.abs(p.y - y) < 1e-2;

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

describe('#2395 — Q2 ד: «הישרים l1 ו-l2 שונים» draws the two common tangents as two lines', () => {
  it('every fixture line records and the figure builds green', () => {
    expect(submitAll(q2.lines)).toEqual(q2.lines.map(() => 'record'));
    expect(derive(q2.lines, q2.seed).faults).toEqual([]);
  });

  it('l1 ≠ l2 at seeds 0–23', () => {
    for (const seed of SEEDS) {
      const d = derive(q2.lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const l1 = d.figure.curves.find((c) => c.id === 'line-l1')!.curve;
      const l2 = d.figure.curves.find((c) => c.id === 'line-l2')!.curve;
      expect(curvesCoincide(l1, l2, new Map(d.figure.points.map((p) => [p.id, p])), 0.01), `seed ${seed}`).toBe(false);
    }
  });

  it('«l1 ≠ l2» (the symbol) reads the same', () => {
    const lines = [...q2.lines.slice(0, -1), 'l1 ≠ l2'];
    expect(submitAll(lines)).toEqual(lines.map(() => 'record'));
    for (const seed of [0, 2, 3, 5]) {
      const d = derive(lines, seed);
      const [l1, l2] = ['line-l1', 'line-l2'].map((id) => d.figure.curves.find((c) => c.id === id)!.curve);
      expect(curvesCoincide(l1, l2, new Map(d.figure.points.map((p) => [p.id, p])), 0.01), `seed ${seed}`).toBe(false);
    }
  });
});

/*
 * Q3 needs #2381 (independent two-way choices always take the same option): at this tip every configuration has
 * N1 = N2, so the distinctness given — honestly — makes the figure unsatisfiable, as «N1 משמאל ל-N2» already does.
 * The fixture is written and kept; the orchestrator un-skips this block on the batch tip once #2381 has landed.
 */
describe.skip('#2395 — Q3 ב (waits on #2381: two-way choices always take the same option)', () => {
  it('every fixture line records; N1 = (−4, −12) and N2 = (12, 0) at seeds 0–23', () => {
    expect(submitAll(q3.lines)).toEqual(q3.lines.map(() => 'record'));
    for (const seed of SEEDS) {
      const d = derive(q3.lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(near(d.figure.points.find((p) => p.id === 'N1'), -4, -12), `N1 at seed ${seed}`).toBe(true);
      expect(near(d.figure.points.find((p) => p.id === 'N2'), 12, 0), `N2 at seed ${seed}`).toBe(true);
    }
  });

  it('«N1 ≠ N2» (the centres) keeps the circles apart at seeds 0–23', () => {
    const lines = [...q3.lines.slice(0, 6), 'N1 ≠ N2'];
    expect(submitAll(lines)).toEqual(lines.map(() => 'record'));
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const [a, b] = ['N1', 'N2'].map((id) => d.figure.points.find((p) => p.id === id)!);
      expect(Math.hypot(a.x - b.x, a.y - b.y), `seed ${seed}`).toBeGreaterThan(1);
    }
  });
});

describe('#2395 — every spelling parses, to the right noun', () => {
  it.each([
    ['N1 ≠ N2', ['N1', 'N2'], undefined],
    ['N1 != N2', ['N1', 'N2'], undefined],
    ['A ≠ B', ['A', 'B'], undefined],
    ['l1 ≠ l2', ['l1', 'l2'], undefined],
    ['P ו-Q שונות', ['P', 'Q'], undefined],
    ['הנקודות N1 ו-N2 שונות', ['N1', 'N2'], 'point'],
    ['נקודות P ו-Q שונות', ['P', 'Q'], 'point'],
    ['P ו-Q הן נקודות שונות', ['P', 'Q'], 'point'],
    ['המעגלים N1 ו-N2 שונים', ['N1', 'N2'], 'circle'],
    ['מעגלים N1 ו-N2 שונים', ['N1', 'N2'], 'circle'],
    ['הישרים l1 ו-l2 שונים', ['l1', 'l2'], 'line'],
    ['l1 ו-l2 הם ישרים שונים', ['l1', 'l2'], 'line'],
    ['P and Q are distinct', ['P', 'Q'], undefined],
    ['P and Q are different points', ['P', 'Q'], 'point'],
    ['the circles N1 and N2 are distinct', ['N1', 'N2'], 'circle'],
    ['the lines l1 and l2 are different', ['l1', 'l2'], 'line'],
  ] as const)('%s', (sentence, names, noun) => {
    expect(parseLine(sentence)).toEqual({
      ok: true,
      facts: [{ t: 'distinct-of', names: [...names], ...(noun ? { noun } : {}), src: sentence }],
    });
  });
});

describe('#2395 — the class', () => {
  it('two free points + «P ≠ Q» keep their four degrees of freedom', () => {
    const lines = ['נקודה P', 'נקודה Q', 'P ≠ Q'];
    expect(submitAll(lines)).toEqual(['record', 'record', 'record']);
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      expect(reportedDof(d.construction, d.figure.carrierDof), `seed ${seed}`).toBe(4);
    }
  });

  it('two crossings of one line and one circle, stated different, are the two roots at every seed', () => {
    const lines = ['נתון מעגל שמשוואתו x^2+y^2=25', 'נקודה P', 'נקודה Q', 'P על המעגל', 'Q על המעגל', 'P על הישר y=x-1', 'Q על הישר y=x-1', 'P ≠ Q'];
    expect(submitAll(lines)).toEqual(lines.map(() => 'record'));
    for (const seed of SEEDS.slice(0, 8)) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const [p, q] = ['P', 'Q'].map((id) => d.figure.points.find((t) => t.id === id)!);
      expect((near(p, -3, -4) && near(q, 4, 3)) || (near(p, 4, 3) && near(q, -3, -4)), `seed ${seed}`).toBe(true);
    }
  });

  it('a restatement in the other order is absorbed', () => {
    const lines = ['נקודה P', 'נקודה Q', 'P ≠ Q'];
    expect(submitAll(lines)).toEqual(['record', 'record', 'record']);
    expect(decideSubmit('Q ≠ P', lines, 0).kind).not.toBe('record');
  });

  it('the judge: lines by direction and offset, circles by centre and radius, kinds never mixed', () => {
    const at = new Map([['A', { x: 0, y: 0 }], ['B', { x: 10, y: 10 }]]);
    expect(curvesCoincide({ kind: 'line', a: 1, b: -1, c: 0 }, { kind: 'line', a: -2, b: 2, c: 0 }, at, 0.1)).toBe(true);
    expect(curvesCoincide({ kind: 'line', a: 1, b: -1, c: 0 }, { kind: 'line', a: 1, b: -1, c: 1 }, at, 0.1)).toBe(false);
    expect(curvesCoincide({ kind: 'line', a: 1, b: -1, c: 0 }, { kind: 'line', a: 1, b: 1, c: 0 }, at, 0.1)).toBe(false);
    expect(curvesCoincide({ kind: 'circle', cx: 0, cy: 0, r: 5 }, { kind: 'circle', cx: 0, cy: 0, r: 5 }, at, 0.1)).toBe(true);
    expect(curvesCoincide({ kind: 'circle', cx: 0, cy: 0, r: 5 }, { kind: 'circle', cx: 0, cy: 0, r: 6 }, at, 0.1)).toBe(false);
    expect(curvesCoincide({ kind: 'circle', cx: 0, cy: 0, r: 5 }, { kind: 'line', a: 1, b: -1, c: 0 }, at, 0.1)).toBe(false);
  });
});

describe('#2395 — refusals, each its own case', () => {
  it('«A(1,2)» · «B(1,2)» · «A ≠ B» is `unsatisfiable`, naming the sentence', () => {
    expect(refusalOf(['A(1,2)', 'B(1,2)', 'A ≠ B'])).toMatchObject({ key: 'unsatisfiable', detail: 'A ≠ B' });
  });

  it('two lines the givens make equal + «l1 ≠ l2» is `unsatisfiable`', () => {
    const lines = ['A(0,1)', 'B(1,3)', 'נתון ישר l1: y=2x+1', 'נתון ישר l2: y=mx+n', 'A על l2', 'B על l2', 'l1 ≠ l2'];
    expect(refusalOf(lines)).toMatchObject({ key: 'unsatisfiable', detail: 'l1 ≠ l2' });
  });

  it('two equal circles + «המעגלים N1 ו-N2 שונים» is `unsatisfiable`', () => {
    const lines = ['נתון מעגל שמרכזו N1(0,0) ורדיוסו 5', 'נתון מעגל שמרכזו N2(0,0) ורדיוסו 5', 'המעגלים N1 ו-N2 שונים'];
    expect(refusalOf(lines)).toMatchObject({ key: 'unsatisfiable', detail: 'המעגלים N1 ו-N2 שונים' });
  });

  it('«N1 ≠ N1» is `repeated-vertex`', () => {
    expect(parseLine('N1 ≠ N1')).toMatchObject({ ok: false, code: 'repeated-vertex' });
  });

  it('a name the figure has not got is `unknown-reference`, naming it', () => {
    expect(refusalOf(['נקודה P', 'P ≠ Q'])).toMatchObject({ key: 'unknown-reference', detail: 'Q', expected: 'point' });
    expect(refusalOf(['נתון מעגל שמרכזו N1 ורדיוסו 10', 'המעגלים N1 ו-N2 שונים'])).toMatchObject({
      key: 'unknown-reference',
      detail: 'N2',
      expected: 'circle',
    });
  });
});

describe('#2395 — controls unchanged', () => {
  it('«C ו-D בצדדים שונים של AB» stays the line-side reading', () => {
    const r = parseLine('C ו-D בצדדים שונים של AB');
    expect(r.ok && r.facts.some((f) => f.t === 'selector' && f.sel.kind === 'line-side')).toBe(true);
  });

  it('«a ≠ 0» stays a parameter domain', () => {
    expect(parseLine('a ≠ 0')).toEqual({ ok: true, facts: [{ t: 'param', sym: 'a', domain: { exclude: [0] }, src: 'a ≠ 0' }] });
  });
});
