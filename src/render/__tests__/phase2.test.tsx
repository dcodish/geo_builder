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
import { boundsOf, fitTransform, orient } from '../transform';
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

describe('transform — orientation (rotate / flip is an isometry; labels stay upright)', () => {
  const close = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(0, 9);

  it('rotates 90° CCW: (1,0) → (0,1)', () => {
    close(orient({ x: 1, y: 0 }, { rot: Math.PI / 2, flipX: false, flipY: false }), { x: 0, y: 1 });
  });
  it('flips horizontally and vertically', () => {
    close(orient({ x: 2, y: 3 }, { rot: 0, flipX: true, flipY: false }), { x: -2, y: 3 });
    close(orient({ x: 2, y: 3 }, { rot: 0, flipX: false, flipY: true }), { x: 2, y: -3 });
  });
  it('preserves distances (it is an isometry)', () => {
    const o = { rot: 0.7, flipX: true, flipY: false };
    const a = orient({ x: 1, y: 2 }, o);
    const b = orient({ x: 4, y: 6 }, o);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(5, 9); // |(3,4)| = 5
  });
});

describe('scene — figure → primitives', () => {
  it('resolves the F1 square + G into points, segments, and a polygon', () => {
    const { construction, positions } = f1();
    const scene = buildScene(construction, positions);

    expect(scene.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'D', 'G']);
    expect(scene.segments.map((s) => s.id).sort()).toEqual(['seg-AB', 'seg-AD', 'seg-BC', 'seg-CD']);
    expect(scene.polygons).toHaveLength(1);
    expect(scene.polygons[0].points).toHaveLength(4);
    // every scene position is a real coordinate
    expect(scenePositions(scene)).toHaveLength(5);
    for (const p of scenePositions(scene)) {
      expect(isFinite(p.x) && isFinite(p.y)).toBe(true);
    }
  });

  it('places measure labels: a length at the segment midpoint, an angle at the vertex (ADR-031)', () => {
    const { construction, positions } = f1();
    const labels = {
      lengths: [{ a: 'A', b: 'B', text: '3x' }],
      angles: [{ vertex: 'A', ray1: 'B', ray2: 'D', text: '37°' }],
    };
    const scene = buildScene(construction, positions, labels);
    const lenM = scene.measures.find((m) => m.kind === 'length');
    const angM = scene.measures.find((m) => m.kind === 'angle');
    expect(lenM?.text).toBe('3x');
    expect(angM?.text).toBe('37°');
    // the length label sits at the midpoint of A–B
    const a = positions.get('A')!, b = positions.get('B')!;
    expect(lenM!.pos.x).toBeCloseTo((a.x + b.x) / 2, 6);
    expect(lenM!.pos.y).toBeCloseTo((a.y + b.y) / 2, 6);
    // the angle label sits at its vertex A
    expect(angM!.pos).toEqual(positions.get('A'));
    // with no labels argument, no measures are produced
    expect(buildScene(construction, positions).measures).toEqual([]);
  });

  it('points a label into the open side, away from the incident edges', () => {
    // A unit square ABCD. Each corner has two edges 90° apart; the label must go
    // into the opposite (outer) 270° wedge — i.e. diagonally away from the centre.
    const sq = {
      objects: [
        { kind: 'free-point', id: 'A', x: 0, y: 0 },
        { kind: 'free-point', id: 'B', x: 2, y: 0 },
        { kind: 'free-point', id: 'C', x: 2, y: 2 },
        { kind: 'free-point', id: 'D', x: 0, y: 2 },
        { kind: 'segment', id: 'seg-AB', a: 'A', b: 'B' },
        { kind: 'segment', id: 'seg-BC', a: 'B', b: 'C' },
        { kind: 'segment', id: 'seg-CD', a: 'C', b: 'D' },
        { kind: 'segment', id: 'seg-AD', a: 'A', b: 'D' },
      ],
      constraints: [],
    } as const;
    const pos = new Map(sq.objects.filter((o) => 'x' in o).map((o) => [o.id, { x: o.x, y: o.y }]));
    const scene = buildScene(sq as never, pos as never);
    const centre = { x: 1, y: 1 };
    for (const p of scene.points) {
      // the label direction points outward: away from the square's centre
      const out = { x: p.pos.x - centre.x, y: p.pos.y - centre.y };
      expect(p.labelDir.x * out.x + p.labelDir.y * out.y).toBeGreaterThan(0);
    }
    // A at the origin has edges along +x and +y → label heads toward (−,−)
    const A = scene.points.find((p) => p.id === 'A')!;
    expect(A.labelDir.x).toBeLessThan(0);
    expect(A.labelDir.y).toBeLessThan(0);
  });

  it('places a midpoint label perpendicular to its line (two opposite edges)', () => {
    // M on segment A—B, collinear: the only open wedges are the two perpendicular
    // sides, so the label must leave the line (non-zero perpendicular component).
    const con = {
      objects: [
        { kind: 'free-point', id: 'A', x: 0, y: 0 },
        { kind: 'free-point', id: 'B', x: 4, y: 0 },
        { kind: 'on-segment', id: 'M', a: 'A', b: 'B', t: 0.5 },
        { kind: 'segment', id: 'seg-AM', a: 'A', b: 'M' },
        { kind: 'segment', id: 'seg-BM', a: 'B', b: 'M' },
      ],
      constraints: [],
    } as const;
    const pos = new Map<string, { x: number; y: number }>([
      ['A', { x: 0, y: 0 }],
      ['B', { x: 4, y: 0 }],
      ['M', { x: 2, y: 0 }],
    ]);
    const scene = buildScene(con as never, pos as never);
    const M = scene.points.find((p) => p.id === 'M')!;
    expect(Math.abs(M.labelDir.y)).toBeGreaterThan(0.9); // essentially vertical (off the line)
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
  it('emits lines (no fill) and labelled points for F1', () => {
    const { construction, positions } = f1();
    const html = renderToStaticMarkup(<Figure construction={construction} positions={positions} />);

    expect(html).toContain('<svg');
    expect((html.match(/<polygon/g) ?? []).length).toBe(0); // outlines only — no filled polygon
    expect((html.match(/<line/g) ?? []).length).toBe(4); // edges carried by segments
    expect((html.match(/<circle/g) ?? []).length).toBe(5); // 5 points
    // labels present
    for (const id of ['A', 'B', 'C', 'D', 'G']) {
      expect(html).toContain(`>${id}</text>`);
    }
  });

  it('draws a circle (outline) with its inscribed points (Phase 5c)', () => {
    const { construction, positions } = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
    ]);
    // scene exposes the circle with the right radius
    const scene = buildScene(construction, positions);
    expect(scene.circles).toHaveLength(1);
    expect(scene.circles[0].r).toBeCloseTo(5, 9);
    // the fit encloses the circle's extent, not just the two inscribed points
    const xs = scenePositions(scene).map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(10);

    const html = renderToStaticMarkup(<Figure construction={construction} positions={positions} />);
    // one unfilled circle outline + the centre O + 2 inscribed points = 4 <circle>
    expect((html.match(/<circle/g) ?? []).length).toBe(4);
    expect(html).toContain('fill="none"'); // the circle outline is not filled
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
