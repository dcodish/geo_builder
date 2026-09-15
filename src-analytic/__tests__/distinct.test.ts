/**
 * A SHAPE'S VERTICES ARE DISTINCT POINTS (#1077).
 *
 * Found while checking the operator's report that «משוואת האלכסון המשני היא y=-x+2» was unsupported:
 * the sentence parsed, and the kite it was about had collapsed — `B` and `D` drawn at one point.
 *
 * The measurement is the test. A single configuration proves nothing here, because the defect was a
 * BASIN the solver falls into for some starting points and not others: the kite collapsed in 25 of 60
 * configurations on its own and 51 of 60 with a diagonal given, while a square never did.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';

/** The closest two named points, as a FRACTION of the figure's own span — the scale-free measure. */
const closestFraction = (lines: string[], seed: number): number => {
  const ps = derive(lines, seed).figure.points;
  if (ps.length < 2) return Infinity;
  let closest = Infinity;
  for (let i = 0; i < ps.length; i += 1) {
    for (let j = i + 1; j < ps.length; j += 1) {
      closest = Math.min(closest, Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y));
    }
  }
  const span = Math.max(
    1e-9,
    Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x)),
    Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y)),
  );
  return closest / span;
};

const collapses = (lines: string[], seeds = 60): number => {
  let n = 0;
  for (let seed = 0; seed < seeds; seed += 1) if (closestFraction(lines, seed) < 0.01) n += 1;
  return n;
};

describe('#1077 — no shape is drawn collapsed', () => {
  it('the operator’s own case: a kite with its secondary diagonal given', () => {
    // 51 of 60 before.
    expect(collapses(['דלתון ABCD', 'משוואת האלכסון המשני היא y=-x+2'])).toBe(0);
  });

  it('and the kite on its own, which was the real defect', () => {
    // 25 of 60 before. «דלתון ABCD» lowers to |AB|=|AD| and |CB|=|CD|, and BOTH hold trivially when
    // B and D are the same point — a genuine solution of the stated constraints, and a smooth
    // minimum the solver is happy to find.
    expect(collapses(['דלתון ABCD'])).toBe(0);
  });

  it('every other noun in the registry, over sixty configurations each', () => {
    for (const line of [
      'מקבילית ABCD',
      'מלבן ABCD',
      'ריבוע ABCD',
      'מעוין ABCD',
      'טרפז ABCD',
      'טרפז שווה שוקיים ABCD',
      'משולש ABC',
      'משולש ישר-זווית ABC',
      'משולש שווה שוקיים ABC',
      'משולש שווה צלעות ABC',
    ]) {
      expect(collapses([line]), line).toBe(0);
    }
  });

  it('consumes NO freedom — it is a region, not a given', () => {
    // D7's second kind. A quadrilateral has eight degrees of freedom whether or not its vertices are
    // required to be different, and a DOF cue that dropped here would be lying.
    const d = derive(['מרובע ABCD'], 0);
    expect(reportedDof(d.construction, d.figure.carrierDof)).toBe(8);
  });

  it('is recorded once per shape, over its own vertices', () => {
    const d = derive(['דלתון ABCD'], 0);
    expect(d.construction.selectors).toEqual([{ kind: 'distinct', ids: ['A', 'B', 'C', 'D'] }]);
  });

  it('leaves a figure whose points the STUDENT placed together alone', () => {
    // The selector is about a shape's own vertices. Two points a student pins close together are
    // their own business, and nothing here may move or refuse them.
    const d = derive(['A(0,0)', 'B(0.001,0)'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.points).toHaveLength(2);
  });
});
