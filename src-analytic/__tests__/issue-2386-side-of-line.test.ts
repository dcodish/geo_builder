/**
 * #2386 ([ADR-AG-310](../../docs/06c-decisions-analytic.md#adr-ag-310)) — a point's side of a straight line.
 *
 * Operator rulings 2026-10-20: *"above means the y of the point is higher than the y of the other line at that point"*;
 * *"for x=3 example we should refuse as saying its above a different line will mean nothing. for right and left - yes"*.
 *
 * Measured before (3cae7f25): «M מעל הישר KL» and every spelling of it were `not-handled`, and Q1 ג (summer 2024) drew
 * the M BELOW KL, (−0.94, 0.76), at every seed. «M מעל ציר ה-y» was `not-handled` too. Every figure case runs the real
 * path: `decideSubmit` per line, then `derive` at the seeds.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';
import { parseLine } from '../parser/parseAnalytic';
import { analyticI18n } from '../i18n';
import type { InputError } from '../store/useAnalyticStore';
import q1 from './fixtures/exam-2379-q1-above-kl-2386.analytic.json';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const near = (p: { x: number; y: number } | undefined, x: number, y: number) =>
  !!p && Math.abs(p.x - x) < 1e-2 && Math.abs(p.y - y) < 1e-2;
const pointOf = (lines: string[], id: string, seed: number) => derive(lines, seed).figure.points.find((p) => p.id === id);

/** Every line through the real submit decision; the verdict of each. */
function submitAll(lines: readonly string[]): string[] {
  const held: string[] = [];
  return lines.map((l) => {
    const v = decideSubmit(l, held, 0);
    if (v.kind === 'record') held.push(l);
    return v.kind;
  });
}
/** The refusal the last line gets after the others are recorded. */
function refusalOf(lines: readonly string[]): InputError | null {
  const held = lines.slice(0, -1);
  expect(submitAll(held).every((k) => k === 'record'), held.join(' · ')).toBe(true);
  const v = decideSubmit(lines[lines.length - 1], held, 0);
  return v.kind === 'refused' ? v.error : null;
}

const Q1 = q1.lines.slice(0, -1);

describe('#2386 — Q1 ג: «M מעל הישר KL» draws the M above KL', () => {
  it('every fixture line records and the figure builds green', () => {
    expect(submitAll(q1.lines)).toEqual(q1.lines.map(() => 'record'));
    expect(derive(q1.lines, q1.seed).faults).toEqual([]);
  });

  it('M = (−2, 5) at seeds 0–23', () => {
    for (const seed of SEEDS) expect(near(pointOf(q1.lines, 'M', seed), -2, 5), `seed ${seed}`).toBe(true);
  });

  it('«M מתחת לישר KL» draws the other root, (−0.94, 0.76)', () => {
    const lines = [...Q1, 'M מתחת לישר KL'];
    for (const seed of [0, 1, 2, 3]) expect(near(pointOf(lines, 'M', seed), -0.941, 0.765), `seed ${seed}`).toBe(true);
  });

  it('the stated order reversed — the side before the area — draws the same M', () => {
    const lines = [...Q1.slice(0, -1), 'M מעל הישר KL', Q1[Q1.length - 1]];
    expect(submitAll(lines)).toEqual(lines.map(() => 'record'));
    for (const seed of [0, 1, 2, 3, 4, 5]) expect(near(pointOf(lines, 'M', seed), -2, 5), `seed ${seed}`).toBe(true);
  });
});

describe('#2386 — every spelling reads the right side', () => {
  type Line = { k: 'points'; a: string; b: string } | { k: 'curve'; id: string };
  const KL: Line = { k: 'points', a: 'K', b: 'L' };
  const L1: Line = { k: 'curve', id: 'line-l1' };
  const rows: Array<[string, 'x' | 'y', boolean, Line]> = [];
  // The word, with «ל» glued to the noun («לישר») or hyphened to a bare operand («ל-KL»), as students write it.
  const words: Array<[string, 'x' | 'y', boolean]> = [['מעל', 'y', true], ['מתחת', 'y', false], ['מימין', 'x', true], ['משמאל', 'x', false]];
  const operands: Array<[string, string, Line]> = [['הישר KL', 'לישר KL', KL], ['KL', 'ל-KL', KL], ['הישר l1', 'לישר l1', L1]];
  for (const [w, axis, greater] of words) {
    for (const [bare, glued, line] of operands) {
      const tails = w === 'מעל' ? [bare, glued] : [glued];
      for (const tail of tails) {
        rows.push([`M ${w} ${tail}`, axis, greater, line]);
        rows.push([`M נמצאת ${w} ${tail}`, axis, greater, line]);
      }
    }
  }
  rows.push(['M above the line KL', 'y', true, KL], ['M is below the line KL', 'y', false, KL]);
  rows.push(['M lies to the right of line l1', 'x', true, L1], ['M is to the left of KL', 'x', false, KL]);
  it.each(rows)('%s', (sentence, axis, greater, line) => {
    const r = parseLine(sentence);
    expect(r.ok, sentence).toBe(true);
    if (!r.ok) return;
    expect(r.facts).toEqual([{ t: 'selector', sel: { kind: 'line-compare', id: 'M', line, axis, greater }, src: sentence }]);
  });

  it("a restatement with the line's letters swapped is absorbed («LK» is «KL»)", () => {
    const lines = ['K(3,4)', 'L(-5,2)', 'נקודה M', 'M מעל הישר KL'];
    expect(submitAll(lines)).toEqual(['record', 'record', 'record', 'record']);
    expect(decideSubmit('M מעל הישר LK', lines, 0).kind).not.toBe('record');
  });
});

describe('#2386 — the class: free figures, slanted lines, both orientations', () => {
  it('right of a slanted named line: «נתון ישר l: y=2x» · «P מימין לישר l» — x_P > y_P/2 at seeds 0–23, freedom kept', () => {
    const lines = ['נתון ישר l: y=2x', 'נקודה P', 'P מימין לישר l'];
    expect(submitAll(lines)).toEqual(['record', 'record', 'record']);
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(reportedDof(d.construction, d.figure.carrierDof), `dof at seed ${seed}`).toBe(2);
      const P = d.figure.points.find((p) => p.id === 'P')!;
      expect(P.x, `seed ${seed}`).toBeGreaterThan(P.y / 2);
    }
  });

  it('two roots across a slanted line: x²+y²=25 and y=x−1 — «left of y=2x» picks (−3, −4), «right of» picks (4, 3)', () => {
    // Against y = 2x: x_ℓ(3) = 1.5 < 4 (right of it), x_ℓ(−4) = −2 > −3 (left of it).
    const base = ['נתון מעגל שמשוואתו x^2+y^2=25', 'נתון ישר l: y=2x', 'נקודה P', 'P על המעגל', 'P על הישר y=x-1'];
    for (const [word, x, y] of [['משמאל', -3, -4], ['מימין', 4, 3]] as const) {
      const lines = [...base, `P ${word} לישר l`];
      expect(submitAll(lines), word).toEqual(lines.map(() => 'record'));
      for (const seed of [0, 1, 2, 3, 4, 5]) expect(near(pointOf(lines, 'P', seed), x, y), `${word} seed ${seed}`).toBe(true);
    }
  });

  it('a free point above a line through two fixed points is seeded and drawn above it at seeds 0–23, dof 2', () => {
    const lines = ['K(3,4)', 'L(-5,2)', 'נקודה M', 'M מעל הישר KL'];
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(reportedDof(d.construction, d.figure.carrierDof)).toBe(2);
      const M = d.figure.points.find((p) => p.id === 'M')!;
      expect(M.y, `seed ${seed}`).toBeGreaterThan(4 + (M.x - 3) / 4);
    }
  });

  it('a line through two FREE points is never refused — the vertical configurations are just not valid', () => {
    const lines = ['נקודה K', 'נקודה L', 'נקודה M', 'M מעל הישר KL'];
    expect(submitAll(lines)).toEqual(['record', 'record', 'record', 'record']);
    for (const seed of SEEDS.slice(0, 8)) expect(derive(lines, seed).faults, `seed ${seed}`).toEqual([]);
  });
});

describe('#2386 — refusals, each its own case', () => {
  const VERTICAL_HE = 'לישר אנכי אין «מעל» — נסו «מימין ל-» או «משמאל ל-»';

  it("«נתון ישר l: x=3» · «M מעל הישר l» — the operator's ruled sentence", () => {
    const e = refusalOf(['נתון ישר l: x=3', 'נקודה M', 'M מעל הישר l']);
    expect(e?.key).toBe('side-of-vertical');
    expect(errorText(e!, t)).toBe(VERTICAL_HE);
    expect(errorText(e!, tEn)).toBe('A vertical line has no «above» — try «to the right of» or «to the left of»');
  });

  it('K(3,4) · L(3,−2) · «M מעל הישר KL» — a vertical line through two letters', () => {
    const e = refusalOf(['K(3,4)', 'L(3,-2)', 'נקודה M', 'M מעל הישר KL']);
    expect(e?.key).toBe('side-of-vertical');
    expect(errorText(e!, t)).toBe(VERTICAL_HE);
  });

  it('«M מתחת לציר ה-y» — the y-axis is a vertical line', () => {
    const e = refusalOf(['נקודה M', 'M מתחת לציר ה-y']);
    expect(e?.key).toBe('side-of-vertical');
    expect(errorText(e!, t)).toBe('לישר אנכי אין «מתחת» — נסו «מימין ל-» או «משמאל ל-»');
  });

  it('«M מעל ציר ה-y»', () => {
    expect(errorText(refusalOf(['נקודה M', 'M מעל ציר ה-y'])!, t)).toBe(VERTICAL_HE);
  });

  it('«נתון ישר l: y=2» · «M מימין לישר l» — the horizontal mirror', () => {
    const e = refusalOf(['נתון ישר l: y=2', 'נקודה M', 'M מימין לישר l']);
    expect(e?.key).toBe('side-of-horizontal');
    expect(errorText(e!, t)).toBe('לישר אופקי אין «מימין ל-» — נסו «מעל» או «מתחת»');
    expect(errorText(e!, tEn)).toBe('A horizontal line has no «to the right of» — try «above» or «below»');
  });

  it('«M משמאל לציר ה-x» — the x-axis is a horizontal line', () => {
    expect(errorText(refusalOf(['נקודה M', 'M משמאל לציר ה-x'])!, t)).toBe('לישר אופקי אין «משמאל ל-» — נסו «מעל» או «מתחת»');
  });

  it('a determined M below KL · «M מעל הישר KL» is `unsatisfiable`, naming the sentence', () => {
    const e = refusalOf(['K(3,4)', 'L(-5,2)', 'M(0,0)', 'M מעל הישר KL']);
    expect(e).toMatchObject({ key: 'unsatisfiable', detail: 'M מעל הישר KL' });
  });

  it('«K מעל הישר KL» is `repeated-vertex`', () => {
    expect(refusalOf(['K(3,4)', 'L(-5,2)', 'K מעל הישר KL'])?.key).toBe('repeated-vertex');
  });

  it('a line name the figure has not got is `unknown-reference`', () => {
    expect(refusalOf(['נקודה M', 'M מעל הישר l'])).toMatchObject({ key: 'unknown-reference', detail: 'l' });
  });

  it("«הישר» with an operand that is no line («M מעל הישר y=2x+1») is `bad-operand`, the slope rule's refusal", () => {
    expect(parseLine('M מעל הישר y=2x+1')).toMatchObject({ ok: false, code: 'bad-operand' });
  });
});

describe('#2386 — controls unchanged', () => {
  it.each([
    ['D מעל A', { kind: 'coord-compare', id: 'D', axis: 'y', greater: true, rhs: { point: 'A' } }],
    ['N1 משמאל ל-N2', { kind: 'coord-compare', id: 'N1', axis: 'x', greater: false, rhs: { point: 'N2' } }],
    ['M מעל ציר ה-x', { kind: 'coord-compare', id: 'M', axis: 'y', greater: true, rhs: { value: { kind: 'num', value: 0 } } }],
  ])('%s', (sentence, sel) => {
    expect(parseLine(sentence)).toEqual({ ok: true, facts: [{ t: 'selector', sel, src: sentence }] });
  });

  it('«שיפוע הישר KL שלילי» on a vertical KL stays `unsatisfiable`', () => {
    expect(refusalOf(['K(3,4)', 'L(3,-2)', 'שיפוע הישר KL שלילי'])?.key).toBe('unsatisfiable');
  });

  it("a sentence whose operand is not a line is not this rule's («M מעל המעגל» stays `not-handled`)", () => {
    expect(parseLine('M מעל המעגל')).toMatchObject({ ok: false, code: 'not-handled' });
  });
});
