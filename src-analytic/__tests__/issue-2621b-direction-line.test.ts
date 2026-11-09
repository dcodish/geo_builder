/**
 * A LINE GIVEN BY ITS DIRECTION ALONE (#2621 B, [ADR-AG-367](../../docs/06c-decisions-analytic.md#adr-ag-367)). Operator,
 * 2026-10-30: *"now we need to build all capabilities"* (the ellipse book, p2-15 and p6-2 ב). Every line reader needed a
 * point or an equation; «ישר המקביל לציר ה-x» is a line with ONE free DOF, its offset, and nothing minted it. It is now
 * `x = c` / `y = c` over the tool's offset symbol: sampled (ADR-052, «הציגו תצורה אחרת» moves it), pinned by a later given.
 * One given per row ([ADR-W-167](../../docs/06w-decisions-workspace.md#adr-w-167)): the book's compound sentences are its
 * rows, and the compound line itself is not read whole.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import p215 from './fixtures/ellipse-book-p2-15-2621.analytic.json';
import p62 from './fixtures/direction-line-p6-2b-2621.analytic.json';

type V = { kind: string; error?: { key: string } & Record<string, unknown> };
function submit(lines: readonly string[]): V[] {
  const accepted: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, accepted, 0) as V;
    if (v.kind === 'record') accepted.push(line);
    return v;
  });
}
const kinds = (lines: readonly string[]) => submit(lines).map((v) => v.kind);
const last = (lines: readonly string[]) => submit(lines).at(-1)!;

/** The first drawn line's resolved coefficients at a seed — a·x + b·y + c = 0. */
function lineAt(lines: readonly string[], seed: number) {
  const curves = derive(lines, seed).figure.curves.filter((q) => q.curve.kind === 'line');
  expect(curves.length).toBeGreaterThan(0);
  return curves[0].curve as unknown as { a: number; b: number; c: number };
}
const offsetOf = (l: { a: number; b: number; c: number }, vertical: boolean) => (vertical ? -l.c / l.a : -l.c / l.b);

const SPELLINGS: Array<[string, boolean]> = [
  ['ישר מאונך לציר ה-x', true],
  ['ישר המאונך לציר ה-x', true],
  ['ישר מקביל לציר ה-y', true],
  ['נתון ישר l המאונך לציר ה-x', true],
  ['נתון ישר l המקביל לציר ה-y', true],
  ['ישר l מאונך לציר ה-x', true],
  ['ישר מקביל לציר ה-x', false],
  ['ישר המקביל לציר ה-x', false],
  ['ישר המאונך לציר ה-y', false],
  ['a line perpendicular to the x-axis', true],
  ['line l parallel to the x-axis', false],
];

describe('#2621 B — a line given by its direction alone', () => {
  it('every spelling records and draws one line, ∥ or ⊥ as stated at 8 seeds, its offset moving between seeds', () => {
    for (const [s, vertical] of SPELLINGS) {
      expect(kinds([s]), s).toEqual(['record']);
      const offsets = new Set<string>();
      for (let seed = 0; seed < 8; seed++) {
        const l = lineAt([s], seed);
        // Vertical: x = c (b = 0); horizontal: y = c (a = 0).
        expect(Math.abs(vertical ? l.b : l.a), s).toBeLessThan(1e-9);
        offsets.add(offsetOf(l, vertical).toFixed(6));
      }
      expect(offsets.size, s).toBeGreaterThan(1);
    }
  });

  it('its crossings are the named-line crossing row: P and Q on the curve and on the line, at every seed', () => {
    const lines = ['נתונה אליפסה שמשוואתה x^2/16+y^2/12=1', 'נתון ישר l המקביל לציר ה-x', 'הישר l חותך את האליפסה בנקודות P ו-Q'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record']);
    const ys = new Set<string>();
    for (let seed = 0; seed < 8; seed++) {
      const pts = derive(lines, seed).figure.points;
      const P = pts.find((p) => p.id === 'P')!;
      const Q = pts.find((p) => p.id === 'Q')!;
      expect(P.y).toBeCloseTo(Q.y, 6);
      expect(P.x).not.toBeCloseTo(Q.x, 3);
      for (const p of [P, Q]) expect(p.x ** 2 / 16 + p.y ** 2 / 12).toBeCloseTo(1, 6);
      ys.add(P.y.toFixed(6));
    }
    expect(ys.size).toBeGreaterThan(1);
  });

  it('two unnamed sentences are two lines; the same sentence again adds nothing', () => {
    const two = ['ישר מאונך לציר ה-x', 'ישר המאונך לציר ה-x'];
    expect(kinds(two)).toEqual(['record', 'record']);
    expect(derive(two, 0).figure.curves.filter((q) => q.curve.kind === 'line')).toHaveLength(2);
    expect(kinds(['ישר מאונך לציר ה-x', 'ישר מאונך לציר ה-x'])).toEqual(['record', 'already-follows']);
  });

  it('the side is its own row, and holds at every seed; a given that contradicts it is refused naming that given', () => {
    const right = ['נתון ישר l המאונך לציר ה-x', 'הישר l חותך את ציר ה-x בנקודה הנמצאת מימין לציר ה-y'];
    expect(kinds(right)).toEqual(['record', 'record']);
    for (let seed = 0; seed < 8; seed++) expect(offsetOf(lineAt(right, seed), true)).toBeGreaterThan(0);
    const above = ['נתון ישר l המקביל לציר ה-x', 'הישר l חותך את ציר ה-y בנקודה הנמצאת מעל ציר ה-x'];
    expect(kinds(above)).toEqual(['record', 'record']);
    for (let seed = 0; seed < 8; seed++) expect(offsetOf(lineAt(above, seed), false)).toBeGreaterThan(0);
    const v = last([...right, 'A(-2,1)', 'A על l']);
    expect(v.kind).toBe('refused');
    expect(v.error?.detail).toBe('A על l');
  });

  it('one given per row (ADR-W-167): the compound book sentences are not read whole', () => {
    const ellipse = 'נתונה אליפסה שמשוואתה x^2/16+y^2/12=1';
    expect(last([ellipse, 'ישר המקביל לציר ה-x חותך את האליפסה בנקודות P ו-Q']).kind).toBe('refused');
    expect(last(['ישר המאונך לציר ה-x, שעובר מימין לראשית הצירים']).kind).toBe('refused');
    expect(derive([ellipse, 'ישר המקביל לציר ה-x חותך את האליפסה בנקודות P ו-Q'], 0).figure.curves.filter((q) => q.curve.kind === 'line')).toHaveLength(0);
  });

  it('a named line the figure has keeps its reading: the relation about it, as before', () => {
    expect(last(['נתון ישר l: y=3', 'ישר l מקביל לציר ה-x']).kind).toBe('already-follows');
    expect(last(['נתון ישר l: y=2x+1', 'ישר l מקביל לציר ה-x']).error?.key).toBe('unsatisfiable');
    expect(derive(['נתון ישר l: y=2x+1', 'ישר l מאונך לציר ה-y'], 0).figure.curves.filter((q) => q.curve.kind === 'line')).toHaveLength(1);
  });

  it('a later given pins the offset, and its equation is then knowledge (p6-2 ב\'s rows)', () => {
    expect(kinds(p62.lines)).toEqual(p62.lines.map(() => 'record'));
    for (let seed = 0; seed < 4; seed++) {
      const d = derive(p62.lines, seed);
      expect(ask(d, 'משוואת הישר l', fmtAnalytic).value).toBe('x - 3 = 0');
      expect(ask(d, 'CD', fmtAnalytic).value).toBe('24/5');
    }
  });

  // #2731 (ADR-AG-451; operator 2026-11-10, "if there are 2 possible answers, we give them and anything else we leave open"):
  // three ellipses meet p2-15's givens (foci on the x-axis — the book's — and two with foci on the y-axis), so the equation
  // is open; the first drawing is still the book's ellipse. The three are locked in issue-2731-determined-roots.test.ts.
  it('the book\'s p2-15, one given per row, records, draws the book\'s ellipse first, and leaves the equation open (three ellipses)', () => {
    expect(kinds(p215.lines)).toEqual(p215.lines.map(() => 'record'));
    const d = derive(p215.lines, 0);
    expect(ask(d, 'משוואת האליפסה', fmtAnalytic)).toEqual({ question: 'משוואת האליפסה', value: null });
    const e = d.figure.curves.find((q) => q.curve.kind === 'ellipse')!.curve as unknown as { a: number; b: number };
    expect(e.a).toBeCloseTo(8, 6);
    expect(e.b).toBeCloseTo(Math.sqrt(48), 6);
  });

  // Ruled since (judged q-2621-parallel; ADR-AG-367 Am. 1): the single row draws a true parallel (issue-2621-side-parallel.test.ts);
  // the compound row with its crossing is still not read whole (ADR-W-167).
  it('a direction given by a line: the single row reads, the compound row with its crossing does not', () => {
    expect(last(['A(0,0)', 'B(2,1)', 'נתון מעגל x^2+y^2=25', 'ישר המקביל ל-AB חותך את המעגל בנקודות P ו-Q']).kind).toBe('refused');
    expect(last(['A(0,0)', 'B(2,1)', 'ישר המקביל ל-AB']).kind).toBe('record');
  });
});
