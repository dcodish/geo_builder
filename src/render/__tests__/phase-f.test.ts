/**
 * Phase F (renderer/UX) — the pure pieces (see ADR-207):
 *  F4/REN-5  fit hysteresis: the view keeps its transform while the figure still fits, refits on
 *            overflow or gross shrink (view stability = the engine's stability, applied on screen).
 *  F7/REN-7  label placement: two coincident points may not STACK their labels (placed labels are
 *            obstacles for the next).
 * The pointer/pinch wiring and the export strip are DOM/browser behaviours — covered by the
 * operator's manual device pass (documented in the ADR), not headless tests.
 */
import { describe, it, expect } from 'vitest';
import { fitTransform, keepOrRefit } from '../transform';
import { chooseLabelDirs } from '../Figure';
import type { Vec } from '@/engine';

const VP = { width: 600, height: 600, padding: 48 };

describe('F4 — fit hysteresis (keepOrRefit)', () => {
  const square: Vec[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('no previous transform → adopt the fresh fit', () => {
    const fresh = fitTransform(square, VP);
    expect(keepOrRefit(null, fresh, square, VP)).toBe(fresh);
  });

  it('a small extension INSIDE the band keeps the previous transform (existing points do not move on screen)', () => {
    const prev = fitTransform(square, VP);
    // one new point slightly outside the old bounds — still fits within the eaten padding, staying clear of the
    // label-reserve margin (at the prev scale of ~50 px/unit, x=10.2 lands ~38 px from the edge — inside the band)
    const grown = [...square, { x: 10.2, y: 5 }];
    const fresh = fitTransform(grown, VP);
    const kept = keepOrRefit(prev, fresh, grown, VP);
    expect(kept).toBe(prev); // the view did NOT jump
    // and the existing points' screen positions are literally unchanged
    for (const p of square) {
      expect(kept.toScreen(p)).toEqual(prev.toScreen(p));
    }
  });

  it('a vertex drifting within a LABEL width of the edge forces a refit (so its letter stays visible)', () => {
    // The kept transform must not let a boundary vertex sit so close to the edge that its label clips — the
    // "figure too large / top nodes not visible" report (ADR-262 follow-up). x=10.6 lands ~18 px from the edge,
    // inside the reserved label margin (28 px) yet outside the old 8 px band, so keeping is wrong: refit.
    const prev = fitTransform(square, VP);
    const grown = [...square, { x: 10.6, y: 5 }];
    const fresh = fitTransform(grown, VP);
    expect(keepOrRefit(prev, fresh, grown, VP)).toBe(fresh); // refit, not kept
  });

  it('an extension far past the viewport forces a refit', () => {
    const prev = fitTransform(square, VP);
    const grown = [...square, { x: 60, y: 5 }]; // 6× the old span — overflows any padding slack
    const fresh = fitTransform(grown, VP);
    expect(keepOrRefit(prev, fresh, grown, VP)).toBe(fresh);
  });

  it('a gross SHRINK (fresh fit would zoom in a lot) forces a refit', () => {
    const prev = fitTransform(square, VP);
    const tiny: Vec[] = [
      { x: 4, y: 4 },
      { x: 6, y: 4 },
      { x: 6, y: 6 },
      { x: 4, y: 6 },
    ]; // the figure collapsed to a fifth of its span — keeping the old fit wastes the screen
    const fresh = fitTransform(tiny, VP);
    expect(fresh.scale).toBeGreaterThan(prev.scale * 1.6);
    expect(keepOrRefit(prev, fresh, tiny, VP)).toBe(fresh);
  });
});

describe('F7/REN-7 — labels of coincident points do not stack', () => {
  it('two points at the SAME screen position pick different label directions', () => {
    const at: Vec = { x: 300, y: 300 };
    const pts = [
      { id: 'N', screen: at, seed: { x: 1, y: 0 } },
      { id: 'O', screen: at, seed: { x: 1, y: 0 } }, // same seed too — the worst case (a forced coincidence)
    ];
    const dirs = chooseLabelDirs(pts, [], [], 12, 9);
    const n = dirs.get('N')!;
    const o = dirs.get('O')!;
    const labelDist = Math.hypot((n.x - o.x) * 12, (n.y - o.y) * 12);
    expect(labelDist).toBeGreaterThan(6); // visibly separated, not superimposed
  });
});
