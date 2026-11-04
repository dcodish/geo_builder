/**
 * A SHAPE'S MEASURES IN THE BOOK'S WORDS, ONE GIVEN PER ROW (#2621 E, [ADR-AG-396](../../docs/06c-decisions-analytic.md#adr-ag-396)).
 * Operator, 2026-10-30: *"now we need to build all capabilities"*; Q1 → A: which side has which length, and which diagonal is on
 * which axis, is an unstated choice «הציגו תצורה אחרת» cycles. The book's compound clauses («מעוין ABCD שצלעו 5, גובהו 4.8
 * ואלכסוניו על הצירים») are read as their rows (ADR-W-167): «גובה המעוין הוא 4.8», «אלכסוני המעוין על הצירים», «האלכסון הגדול
 * של המעוין הוא AC / נמצא על ציר ה-x», «צלעות המשולש הן 13, 14 ו-15».
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import p526 from './fixtures/rhombus-height-p5-26a-2621.analytic.json';
import p424 from './fixtures/rhombus-long-diagonal-p4-24a-2621.analytic.json';
import p528 from './fixtures/triangle-sides-p5-28-2621.analytic.json';

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
type P = { x: number; y: number };
const pts = (lines: readonly string[], seed: number): Record<string, P> =>
  Object.fromEntries(derive(lines, seed).figure.points.map((p) => [p.id, { x: p.x, y: p.y }]));
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);
const onX = (p: P) => Math.abs(p.y) < 1e-6;
const onY = (p: P) => Math.abs(p.x) < 1e-6;
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];

describe('#2621 E — the rhombus height', () => {
  it('«גובה המעוין הוא 4.8» · «הגובה במעוין הוא 4.8» · "the height of the rhombus is 4.8" record; the height holds at 8 seeds', () => {
    for (const s of ['גובה המעוין הוא 4.8', 'הגובה במעוין הוא 4.8', 'the height of the rhombus is 4.8']) {
      const lines = ['נתון מעוין ABCD', 'AB = 5', s];
      expect(kinds(lines), s).toEqual(['record', 'record', 'record']);
      for (const seed of SEEDS) {
        const d = derive(lines, seed);
        const P = Object.fromEntries(d.figure.points.map((p) => [p.id, p]));
        // area ÷ side = the distance between opposite sides.
        const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((k) => P[k]);
        const area = Math.abs((A.x * B.y - B.x * A.y + B.x * C.y - C.x * B.y + C.x * D.y - D.x * C.y + D.x * A.y - A.x * D.y) / 2);
        expect(area / dist(A, B), `${s} @${seed}`).toBeCloseTo(4.8, 5);
      }
    }
  });
  it('the book row set p5-26 א builds (fixture): side 5, height 4.8, diagonals on the axes', () => {
    expect(kinds(p526.lines)).toEqual(p526.lines.map(() => 'record'));
    for (const seed of SEEDS) {
      const P = pts(p526.lines, seed);
      const xs = ['A', 'B', 'C', 'D'].filter((k) => onX(P[k]));
      const ys = ['A', 'B', 'C', 'D'].filter((k) => onY(P[k]));
      expect(xs.length + ys.length, `@${seed}`).toBe(4);
      expect(dist(P.A, P.B)).toBeCloseTo(5, 5);
    }
  });
  it('a rhombus height is not a parallelogram one: «גובה המקבילית» is still asked', () => {
    expect(submit(['נתונה מקבילית ABCD', 'גובה המקבילית הוא 4']).at(-1)!.error?.key).toBe('ambiguous-height');
  });
});

describe('#2621 E — the diagonals on the axes', () => {
  it('«אלכסוני המעוין על הצירים»: AC on one axis and BD on the other, and «הציגו תצורה אחרת» swaps them', () => {
    const lines = ['נתון מעוין ABCD', 'AC = 8', 'BD = 6', 'אלכסוני המעוין על הצירים'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record', 'record']);
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const P = pts(lines, seed);
      const acOnX = onX(P.A) && onX(P.C) && onY(P.B) && onY(P.D);
      const acOnY = onY(P.A) && onY(P.C) && onX(P.B) && onX(P.D);
      expect(acOnX || acOnY, `@${seed}`).toBe(true);
      seen.add(acOnX ? 'x' : 'y');
    }
    expect(seen.size).toBe(2);
  });
  it('a stated axis narrows the choice: «AC על ציר ה-x» pins it', () => {
    const lines = ['נתון מעוין ABCD', 'אלכסוני המעוין על הצירים', 'AC על ציר ה-x'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record']);
    for (const seed of SEEDS) {
      const P = pts(lines, seed);
      expect(onX(P.A) && onX(P.C) && onY(P.B) && onY(P.D), `@${seed}`).toBe(true);
    }
  });
});

describe('#2621 E — the longer / shorter diagonal', () => {
  it('«האלכסון הגדול של המעוין הוא AC»: AC is longer at every seed; a contradicting length is refused naming it', () => {
    const lines = ['נתון מעוין ABCD', 'האלכסון הגדול של המעוין הוא AC'];
    expect(kinds(lines)).toEqual(['record', 'record']);
    for (const seed of SEEDS) {
      const P = pts(lines, seed);
      expect(dist(P.A, P.C), `@${seed}`).toBeGreaterThan(dist(P.B, P.D));
    }
    expect(submit([...lines, 'AC = 4', 'BD = 6']).at(-1)!.error?.key).toBe('unsatisfiable');
    expect(kinds(['נתון מעוין ABCD', 'האלכסון הקטן במעוין הוא BD'])).toEqual(['record', 'record']);
  });
  it('a side is not a diagonal: «האלכסון הגדול של המעוין הוא AB» is refused', () => {
    expect(submit(['נתון מעוין ABCD', 'האלכסון הגדול של המעוין הוא AB']).at(-1)!.error?.key).toBe('not-a-diagonal');
  });
  it('the book row set p4-24 א (fixture): perimeter 20, area 24, the longer diagonal (8) on the x-axis', () => {
    expect(kinds(p424.lines)).toEqual(p424.lines.map(() => 'record'));
    for (const seed of SEEDS) {
      const P = pts(p424.lines, seed);
      const onXPair = onX(P.A) && onX(P.C) ? [P.A, P.C] : [P.B, P.D];
      const other = onXPair[0] === P.A ? [P.B, P.D] : [P.A, P.C];
      expect(onXPair.every(onX), `@${seed}`).toBe(true);
      expect(dist(onXPair[0], onXPair[1]), `@${seed}`).toBeCloseTo(8, 4);
      expect(dist(other[0], other[1]), `@${seed}`).toBeCloseTo(6, 4);
    }
  });
});

describe('#2621 E — three side lengths with no letters', () => {
  it('«צלעות המשולש הן 13, 14 ו-15» records; the three sides are {13,14,15} at every seed, and the assignment cycles', () => {
    expect(kinds(p528.lines)).toEqual(['record', 'record']);
    const seen = new Set<string>();
    for (const seed of [...SEEDS, 8, 9, 10, 11]) {
      const P = pts(p528.lines, seed);
      const s = [dist(P.A, P.B), dist(P.B, P.C), dist(P.C, P.A)];
      expect([...s].sort((a, b) => a - b).map((v) => Number(v.toFixed(5)))).toEqual([13, 14, 15]);
      seen.add(s.map((v) => v.toFixed(0)).join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
  it('the spellings: «אורכי צלעות המשולש ABC הם …», English; a later «BC = 14» pins BC', () => {
    expect(kinds(['נתון משולש ABC', 'אורכי צלעות המשולש ABC הם 13, 14 ו-15'])).toEqual(['record', 'record']);
    expect(kinds(['נתון משולש ABC', 'the sides of the triangle are 13, 14 and 15'])).toEqual(['record', 'record']);
    const lines = ['נתון משולש ABC', 'צלעות המשולש הן 13, 14 ו-15', 'BC = 14'];
    expect(kinds(lines)).toEqual(['record', 'record', 'record']);
    for (const seed of SEEDS) expect(dist(pts(lines, seed).B, pts(lines, seed).C)).toBeCloseTo(14, 5);
  });
});
