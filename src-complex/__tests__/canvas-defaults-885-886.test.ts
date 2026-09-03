/**
 * #885 + #886 — what the DEFAULT complex canvas draws, and how big it draws it.
 *
 * Both reported together, playing round #878 (T13), on «z^6 = 1» — the tool's most canonical figure:
 *
 *   #886  "why does the complex tool now show the line between O and the point. it should only draw
 *          the points."  → the radius arrows were the last enrichment left in the default canvas.
 *          Ruled: move them behind a toggle (not delete) — «Oz2» already draws one on demand.
 *   #885  "the zoom is wrong too. it can be bigger on screen."  → `Math.max(3, …)` was a hard floor,
 *          so a unit-modulus figure was drawn in a view spanning 7.5.
 *
 * Neither was caused by that round — both verified identical on `main` beforehand.
 */
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { buildScene } from '../scene/scene';

const sceneOf = (lines: string[]) => buildScene(deriveLines(lines, 0, 0) as never) as never as {
  extent: number;
  radii: readonly unknown[];
  points: readonly unknown[];
  shapes: readonly { label: string }[];
};

describe('#885 — the view fits the content', () => {
  it('«z^6 = 1» is no longer drawn a quarter-size: the extent tracks modulus 1, not the old floor of 3', () => {
    const { extent } = sceneOf(['z^6 = 1']);
    expect(extent).toBeCloseTo(1.25, 6); // 1 × the 1.25 margin
    expect(extent, 'the old hard floor produced 3.75').toBeLessThan(2);
  });

  it('a bigger figure still fits — the margin is a ratio, not a constant', () => {
    expect(sceneOf(['z1 = 3+4i']).extent).toBeCloseTo(5 * 1.25, 6);
  });

  it('a CIRCLE still fits fully — the case the floor was really guarding', () => {
    // the guard `reach` provides: centre + radius, not just the plotted numbers
    const { extent } = sceneOf(['z1 = 1+0i', 'המעגל שמרכזו O ורדיוסו 8']);
    expect(extent, 'the circle must not run off the edge').toBeGreaterThanOrEqual(8);
  });

  it('an EMPTY figure keeps a sane default frame — nothing to fit to', () => {
    expect(sceneOf([]).extent).toBeCloseTo(3 * 1.25, 6);
  });
});

describe('#886 — the default canvas draws points, not radius arrows', () => {
  it('the scene still BUILDS the radii — only the ink is gated, like every other layer', () => {
    expect(sceneOf(['z^6 = 1']).radii.length, 'the toggle turns them on without a re-derive').toBe(6);
  });

  it('«Oz2» draws its own segment — the per-point form the ruling relies on', () => {
    const shapes = sceneOf(['z^6 = 1', 'Oz2']).shapes;
    expect(shapes.map((s) => s.label)).toContain('Oz2');
  });

  it('…and it does so independently of the toggle — it is a stated object, not a layer', () => {
    // the segment is a `shape`, which no `layers.*` flag gates; the radii are `radii`, which one does
    const s = sceneOf(['z^6 = 1', 'Oz2']);
    expect(s.shapes.length).toBe(1);
    expect(s.radii.length).toBe(6);
  });
});
