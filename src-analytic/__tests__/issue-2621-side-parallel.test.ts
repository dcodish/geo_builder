/**
 * TWO LINE ROWS LEFT ON #2621 ([ADR-AG-367](../../docs/06c-decisions-analytic.md#adr-ag-367) Am. 1), one given per row (ADR-W-167):
 *
 * - «הישר l עובר מימין לראשית הצירים» (the book's p6-2 ב; the session's `chose-2621-side`, ADR-W-174): the side of the origin an
 *   AXIS-PARALLEL line passes, read only for such a line.
 * - «ישר המקביל ל-AB» (judged q-2621-parallel, 2026-11-02): a TRUE parallel to AB whose offset is a free DOF «הציגו תצורה
 *   אחרת» moves — deliberately not 2-D's reading, which drops the relation (#2669). Its crossing is the next row.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import p62 from './fixtures/side-of-origin-p6-2b-2621.analytic.json';
import pab from './fixtures/parallel-to-ab-2621.analytic.json';

type V = { kind: string; error?: { key: string } };
function submit(lines: readonly string[]): V[] {
  const accepted: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, accepted, 0) as V;
    if (v.kind === 'record') accepted.push(line);
    return v;
  });
}
const kinds = (lines: readonly string[]) => submit(lines).map((v) => v.kind);
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
const line0 = (lines: readonly string[], seed: number) =>
  derive(lines, seed).figure.curves.find((q) => q.curve.kind === 'line')!.curve as unknown as { a: number; b: number; c: number };

describe('#2621 — «הישר l עובר מימין לראשית הצירים»', () => {
  it('a vertical line passes right (left) of the origin at every seed', () => {
    for (const [side, sign] of [['מימין', 1], ['משמאל', -1]] as const) {
      const lines = ['נתון ישר l המאונך לציר ה-x', `הישר l עובר ${side} לראשית הצירים`];
      expect(kinds(lines)).toEqual(['record', 'record']);
      for (const seed of SEEDS) {
        const l = line0(lines, seed);
        expect(Math.sign(-l.c / l.a), `${side} @${seed}`).toBe(sign);
      }
    }
  });
  it('a horizontal line passes above / below; English reads the same', () => {
    expect(kinds(['נתון ישר l המקביל לציר ה-x', 'הישר l נמצא מתחת לראשית הצירים'])).toEqual(['record', 'record']);
    for (const seed of SEEDS) {
      const l = line0(['נתון ישר l המקביל לציר ה-x', 'הישר l נמצא מתחת לראשית הצירים'], seed);
      expect(-l.c / l.b).toBeLessThan(0);
    }
    expect(kinds(['נתון ישר l המאונך לציר ה-x', 'line l passes to the left of the origin'])).toEqual(['record', 'record']);
  });
  it('a side the line has no crossing for, or a slanted line, is refused naming the sentence', () => {
    expect(submit(['נתון ישר l המאונך לציר ה-x', 'הישר l עובר מעל לראשית הצירים']).at(-1)!.error?.key).toBe('out-of-scope');
    expect(submit(['הישר l: y=2x+1', 'הישר l עובר מימין לראשית הצירים']).at(-1)!.error?.key).toBe('out-of-scope');
    expect(submit(['הישר l: x=-3', 'הישר l עובר מימין לראשית הצירים']).at(-1)!.error?.key).toBe('unsatisfiable');
  });
  it('the book row set p6-2 ב (fixture): l is x = 3 and CD = 24/5', () => {
    expect(kinds(p62.lines)).toEqual(p62.lines.map(() => 'record'));
    const d = derive(p62.lines, 0);
    expect(ask(d, 'משוואת הישר l', fmtAnalytic).value).toBe('x - 3 = 0');
    expect(ask(d, 'CD', fmtAnalytic).value).toBe('24/5');
  });
});

describe('#2621 — «ישר המקביל ל-AB», a true parallel at a free offset', () => {
  const BASE = ['נתון מעגל שמשוואתו x^2+y^2=25', 'A(0,0)', 'B(1,2)'];
  it('every spelling records; the line is ∥ AB at 8 seeds and its offset moves between them', () => {
    for (const s of ['ישר המקביל ל-AB', 'נתון ישר l המקביל ל-AB', 'ישר l מקביל לקטע AB', 'line l parallel to AB']) {
      const lines = [...BASE, s];
      expect(kinds(lines), s).toEqual(['record', 'record', 'record', 'record']);
      const offsets = new Set<string>();
      for (const seed of SEEDS) {
        const l = line0(lines, seed);
        // ∥ AB, AB's direction (1, 2): the normal (a, b) is ⊥ to it.
        expect(Math.abs(l.a * 1 + l.b * 2) / Math.hypot(l.a, l.b), `${s} @${seed}`).toBeLessThan(1e-6);
        offsets.add((l.c / Math.hypot(l.a, l.b)).toFixed(4).replace('-0.0000', '0.0000'));
      }
      expect(offsets.size, s).toBeGreaterThan(1);
    }
  });
  it('a vertical AB has a vertical parallel', () => {
    const lines = ['A(1,0)', 'B(1,5)', 'נתון ישר l המקביל ל-AB'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record']);
    for (const seed of SEEDS) {
      const l = line0(lines, seed);
      expect(Math.abs(l.b) / Math.hypot(l.a, l.b)).toBeLessThan(1e-6);
    }
  });
  it('the fixture: its crossings P and Q lie on the circle and on a line ∥ AB', () => {
    expect(kinds(pab.lines)).toEqual(pab.lines.map(() => 'record'));
    for (const seed of SEEDS) {
      const pts = Object.fromEntries(derive(pab.lines, seed).figure.points.map((p) => [p.id, p]));
      const { P, Q } = pts;
      for (const p of [P, Q]) expect(p.x ** 2 + p.y ** 2).toBeCloseTo(25, 5);
      // PQ ∥ AB: the cross product of (Q − P) with (1, 2) is 0.
      expect((Q.x - P.x) * 2 - (Q.y - P.y) * 1).toBeCloseTo(0, 5);
    }
  });
});
