/**
 * Phase-2 acceptance gate (docs/09-implementation-plan.md §Phase 2).
 * Transform unit tests, scene-builder "figure → expected nodes", and a
 * DOM-free static render of <Figure> (react-dom/server — no jsdom needed).
 * Fixtures reuse the Phase-1 F1 (square + point on a side) and F2 (two-branch)
 * constructions so the renderer is validated against real engine output.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Command } from '@/engine/types';
import { build, cycleAlternative, evaluate, emptyConstruction, applyStep } from '@/engine';
import { boundsOf, fitTransform } from '../transform';
import { buildScene, scenePositions } from '../scene';
import { Figure } from '../Figure';

const VP = { width: 600, height: 600, padding: 48 };

/** F1: square ABCD (5×5, origin at A) + G on AD. */
function f1() {
  const r1 = applyStep(emptyConstruction(), { type: 'square', ids: ['A', 'B', 'C', 'D'] });
  const r2 = applyStep(r1.construction, { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 });
  if (!r2.ok) throw new Error(r2.error);
  return r2;
}

describe('transform — bounds', () => {
  it('computes axis-aligned bounds', () => {
    expect(boundsOf([{ x: 1, y: 2 }, { x: -3, y: 5 }, { x: 4, y: -1 }])).toEqual({
      minX: -3,
      minY: -1,
      maxX: 4,
      maxY: 5,
    });
  });

  it('falls back to a unit box when empty', () => {
    expect(boundsOf([])).toEqual({ minX: -1, minY: -1, maxX: 1, maxY: 1 });
  });
});

describe('transform — fit', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 5 },
    { x: 0, y: 5 },
  ];

  it('fits isotropically, centred, with Y flipped', () => {
    const t = fitTransform(square, VP);
    // avail = 600 - 96 = 504; scale = 504 / 5
    expect(t.scale).toBeCloseTo(504 / 5, 9);
    // bottom-left math corner → bottom-left screen; top-right math → top-right screen
    expect(t.toScreen({ x: 0, y: 0 })).toEqual({ x: 48, y: 552 });
    expect(t.toScreen({ x: 5, y: 5 })).toEqual({ x: 552, y: 48 });
    // math-up renders as smaller screen-y (up)
    expect(t.toScreen({ x: 0, y: 5 }).y).toBeLessThan(t.toScreen({ x: 0, y: 0 }).y);
  });

  it('keeps the scale isotropic for a non-square aspect (fits the larger span)', () => {
    const wide = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 2 },
    ];
    const t = fitTransform(wide, VP);
    expect(t.scale).toBeCloseTo(504 / 10, 9); // width-bound
    const a = t.toScreen({ x: 0, y: 0 });
    const b = t.toScreen({ x: 10, y: 0 });
    const c = t.toScreen({ x: 10, y: 2 });
    // same scale on both axes: 10 units wide ↔ 2 units tall in the same ratio
    expect(Math.abs(b.x - a.x) / 10).toBeCloseTo(Math.abs(a.y - c.y) / 2, 6);
  });

  it('centres a lone point instead of pinning it to a corner', () => {
    const t = fitTransform([{ x: 3, y: 3 }], VP);
    const s = t.toScreen({ x: 3, y: 3 });
    expect(s.x).toBeCloseTo(300, 6);
    expect(s.y).toBeCloseTo(300, 6);
    expect(isFinite(t.scale)).toBe(true);
  });
});

describe('scene — figure → primitives', () => {
  it('resolves the F1 square + G into points, segments, and a polygon', () => {
    const { construction, positions } = f1();
    const scene = buildScene(construction, positions);

    expect(scene.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'D', 'G']);
    expect(scene.segments.map((s) => s.id).sort()).toEqual(['seg-AB', 'seg-BC', 'seg-CD', 'seg-DA']);
    expect(scene.polygons).toHaveLength(1);
    expect(scene.polygons[0].points).toHaveLength(4);
    // every scene position is a real coordinate
    expect(scenePositions(scene)).toHaveLength(5);
    for (const p of scenePositions(scene)) {
      expect(isFinite(p.x) && isFinite(p.y)).toBe(true);
    }
  });

  it('skips objects whose endpoints have no computed position', () => {
    // A segment referencing a missing point must not be drawn at a bogus spot.
    const construction = {
      objects: [
        { kind: 'free-point', id: 'A', x: 0, y: 0 },
        { kind: 'segment', id: 'seg-AX', a: 'A', b: 'X' },
      ],
      constraints: [],
    } as const;
    const scene = buildScene(construction as never, new Map([['A', { x: 0, y: 0 }]]));
    expect(scene.points.map((p) => p.id)).toEqual(['A']);
    expect(scene.segments).toHaveLength(0);
  });
});

describe('Figure — static SVG render (no DOM)', () => {
  it('emits a polygon, four segments, and labelled points for F1', () => {
    const { construction, positions } = f1();
    const html = renderToStaticMarkup(<Figure construction={construction} positions={positions} />);

    expect(html).toContain('<svg');
    expect((html.match(/<polygon/g) ?? []).length).toBe(1);
    expect((html.match(/<line/g) ?? []).length).toBe(4);
    expect((html.match(/<circle/g) ?? []).length).toBe(5); // 5 points
    // labels present
    for (const id of ['A', 'B', 'C', 'D', 'G']) {
      expect(html).toContain(`>${id}</text>`);
    }
  });

  it('renders both alternative branches of the F2 construction differently', () => {
    const base: Command[] = [
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 6, y: 0 },
      { type: 'point-by-distances', id: 'C', from1: 'A', dist1: 5, from2: 'B', dist2: 5, branch: 0 },
    ];
    const { construction, positions } = build(base);
    const flipped = cycleAlternative(construction, 'C');
    const fpos = evaluate(flipped);
    if (!fpos.ok) throw new Error(fpos.error);

    const a = renderToStaticMarkup(<Figure construction={construction} positions={positions} />);
    const b = renderToStaticMarkup(<Figure construction={flipped} positions={fpos.positions} />);
    // C flips across AB → the rendered markup differs between branches
    expect(a).not.toEqual(b);
  });
});
