/**
 * WHEN A PIN HAS TWO ROOTS, THE PANEL LISTS BOTH (#1036).
 *
 * Operator, 2026-09-15: *"if the area is given, the options for point C (on the data panel) should
 * be shown"*.
 *
 * «הבחן בין שני מקרים» appears about six times in the forty «lines and points» exercises: the exam is
 * not asking for AN answer, it is asking the student to notice there are two and produce both.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { isKnowledge, knownOptions } from '../engine/evaluate';

/** The issue's own figure: C slides on a line, and an area of 7 pins it to two places. */
const TWO_ROOTS = ['A(4,0)', 'B(0,-2)', 'C נמצאת על הישר 4x-y-9=0', 'שטח המשולש ABC הוא 7'];

const positions = (lines: string[], id: string) => {
  const d = derive(lines, 0);
  return knownOptions(d.construction, (f) => {
    const p = f.points.find((q) => q.id === id);
    return p ? [p.x, p.y] : null;
  });
};

describe('#1036 — the SET is knowledge even though neither member is', () => {
  it('finds both roots of the operator’s own figure', () => {
    const opts = positions(TWO_ROOTS, 'C');
    expect(opts).not.toBeNull();
    expect(opts).toHaveLength(2);
    expect(opts!.map((v) => v.map((n) => Number(n.toFixed(3))))).toEqual([
      [1, -5],
      [3, 3],
    ]);
  });

  it('pairs the coordinates, which is the whole reason it reads a VECTOR', () => {
    /**
     * Asked per component it would answer `x ∈ {1,3}` and `y ∈ {-5,3}` — four options for a point
     * that is only ever (1,-5) or (3,3), two of them false. The point is the unit of the answer.
     */
    const opts = positions(TWO_ROOTS, 'C')!;
    for (const [x, y] of opts) {
      expect([x, y].map((n) => Number(n.toFixed(3)))).not.toEqual([1, 3]);
      expect([x, y].map((n) => Number(n.toFixed(3)))).not.toEqual([3, -5]);
    }
  });

  it('neither member is knowledge on its own — which is why they are a set', () => {
    const d = derive(TWO_ROOTS, 0);
    const kx = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === 'C')?.x ?? null);
    expect(kx.known).toBe(false);
  });

  it('and the set is the SAME at every configuration', () => {
    // Cycling permutes which member is drawn and changes the set not at all — that invariance is
    // exactly what makes printing it honest.
    const first = JSON.stringify(positions(TWO_ROOTS, 'C')!.map((v) => v.map((n) => n.toFixed(3))));
    for (const seed of [1, 2, 5]) {
      const d = derive(TWO_ROOTS, seed);
      const again = knownOptions(d.construction, (f) => {
        const p = f.points.find((q) => q.id === 'C');
        return p ? [p.x, p.y] : null;
      })!;
      expect(JSON.stringify(again.map((v) => v.map((n) => n.toFixed(3)))), `seed ${seed}`).toBe(first);
    }
  });

  it('is not offered for a DETERMINED point — that is isKnowledge’s answer', () => {
    expect(positions(['A(4,0)', 'B(0,-2)'], 'A')).toBeNull();
  });

  it('nor for a CONTINUOUS family, however free', () => {
    // A point sliding along a line takes a new value at almost every seed. It has infinitely many
    // positions, and a list of four of them would be a lie about the shape of the answer.
    expect(positions(['משולש ABC'], 'A')).toBeNull();
    expect(positions(['נקודה P על הישר y=x'], 'P')).toBeNull();
    expect(positions(['C ברביע השלישי'], 'C')).toBeNull();
  });
});
