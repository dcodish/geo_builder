/**
 * #475 — an angle's VALUE must never be drawn under its own arc.
 *
 * The mark and the number were tuned independently in `Figure.tsx` (arc at 6.5·r, value at 4.2·r), so the
 * value sat INSIDE the arc: at a tight vertex the two overprinted, and where the vertex is on the figure's
 * frame the number was clipped against it. The operator hit both at once on «זווית GBA = 37» at B.
 *
 * The fix is not a nicer number, it is that the two now derive from ONE anchor. This locks the relation
 * rather than the values, so re-tuning either stays honest.
 */
import { describe, expect, it } from 'vitest';
import { ANGLE_ARC_R, angleValueOffset } from '../scene';

describe('#475 — the value sits OUTSIDE the arc', () => {
  it.each([
    [1, 10],
    [2, 12],
    [0.5, 8],
    [3, 20],
    [1.5, 14],
  ])('r=%s fontSize=%s', (r, fontSize) => {
    expect(angleValueOffset(r, fontSize)).toBeGreaterThan(ANGLE_ARC_R * r);
  });

  it('clears the arc by roughly a glyph, so the number is not merely touching it', () => {
    // A hair outside would still overprint the stroke; the gap must scale with the TEXT, not with r.
    for (const fontSize of [8, 12, 20]) {
      expect(angleValueOffset(1, fontSize) - ANGLE_ARC_R).toBeGreaterThan(fontSize * 0.4);
    }
  });

  it('grows with BOTH the figure scale and the font — neither alone', () => {
    expect(angleValueOffset(2, 12)).toBeGreaterThan(angleValueOffset(1, 12));
    expect(angleValueOffset(1, 20)).toBeGreaterThan(angleValueOffset(1, 12));
  });
});
