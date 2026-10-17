/**
 * #2175 ([ADR-715](../../../docs/06-decisions.md#adr-715), amends ADR-544) — AN ANGLE'S VALUE FITS ITS WEDGE.
 *
 * Operator, 2026-10-15 (round #2128): *"note that the beta+30 doesnt look nice on the page"* — at M, side DM ran
 * through «β + 30» and over its arc. The value sat at one distance along the bisector whatever its width and the
 * angle's opening, so a long label at a thin angle spilled over the rays.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { replay } from '@/replay/core';
import { hasMath } from '../../../shell/math';
import { angleArcPoints } from '../../../shell/marks';
import { mathLabelBox } from '../mathMetrics';
import { ANGLE_ARC_R, MIN_MEASURE_FONT_PX, angleValueOffset, buildScene, markScale, placeAngleValue } from '../scene';
import { fitTransform } from '../transform';

type P = { x: number; y: number };
const R = 4; // the renderer's base unit at zoom 1
const FONT = 16; // the renderer's base font at zoom 1
const VP = { width: 800, height: 600, padding: 24 };

/** Every angle value of a figure, placed exactly as `Figure.tsx` places it, with what it must not touch. */
function placedAngleValues(lines: string[], seed = 0) {
  const fig = replay(factsOf(lines as never), seed as never);
  expect(fig.lastError).toBeNull();
  const scene = buildScene(fig.construction, fig.positions, fig.labels);
  const t = fitTransform([...fig.positions.values()], VP);
  const ps = scene.points.map((p) => t.toScreen(p.pos));
  const away = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length };
  return scene.measures
    .filter((m) => m.kind === 'angle' && m.ends)
    .map((m) => {
      const v = t.toScreen(m.pos);
      const [p1, p2] = m.ends!.map((e) => t.toScreen(e));
      const l = Math.hypot(m.dir.x, m.dir.y);
      const dir = { x: m.dir.x / l, y: -m.dir.y / l };
      const k = markScale(Math.min(Math.hypot(p1.x - v.x, p1.y - v.y), Math.hypot(p2.x - v.x, p2.y - v.y)), R);
      const fontSize = Math.max(MIN_MEASURE_FONT_PX, FONT * 1.05 * k);
      const arcR = ANGLE_ARC_R * R * k;
      const box1 = mathLabelBox(m.text, 1, !hasMath(m.text));
      const fit = placeAngleValue({ v, p1, p2, dir, arcR, fontSize, minFont: MIN_MEASURE_FONT_PX, box1, away });
      const d0 = angleValueOffset(R * k, fontSize);
      return { text: m.text, v, p1, p2, arcR, fit, today: { x: v.x + dir.x * d0, y: v.y + dir.y * d0 }, box: { w: box1.w * fit.fontSize, h: box1.h * fit.fontSize } };
    });
}

const inBox = (q: P, c: P, box: { w: number; h: number }) => Math.abs(q.x - c.x) < box.w / 2 && Math.abs(q.y - c.y) < box.h / 2;
/** Does the drawn segment a→b pass through the label's box? (dense sampling: the box is tens of px, a step < 0.5 px) */
function segmentHits(a: P, b: P, c: P, box: { w: number; h: number }) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2) + 1;
  for (let i = 0; i <= n; i++) if (inBox({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, c, box)) return true;
  return false;
}
function arcHits(v: P, p1: P, p2: P, r: number, c: P, box: { w: number; h: number }) {
  const pts = angleArcPoints(v, p1, p2, r, 200);
  return pts.slice(1).some((q, i) => segmentHits(pts[i], q, c, box));
}

const OPERATOR = ['משולש CMD', 'AM חוצה זווית CMD', 'זוית C=α', 'זוית AMD=β+30'];

describe('#2175 — the operator’s «β + 30» at a thin angle', () => {
  for (const seed of [0, 1, 2, 3, 4, 5]) {
    it(`seed ${seed}: the label crosses neither side of its angle nor its arc`, () => {
      const beta = placedAngleValues(OPERATOR, seed).find((m) => m.text.includes('β'))!;
      expect(beta).toBeDefined();
      expect(segmentHits(beta.v, beta.p1, beta.fit, beta.box), 'ray 1').toBe(false);
      expect(segmentHits(beta.v, beta.p2, beta.fit, beta.box), 'ray 2').toBe(false);
      expect(arcHits(beta.v, beta.p1, beta.p2, beta.arcR, beta.fit, beta.box), 'arc').toBe(false);
      // …and stays inside the angle's own corner: the side joining the two ray ends is not crossed either.
      expect(segmentHits(beta.p1, beta.p2, beta.fit, beta.box), 'closing side').toBe(false);
      // …and it is still M's: nearer M than half the shorter side, never beside another corner.
      const room = Math.min(Math.hypot(beta.p1.x - beta.v.x, beta.p1.y - beta.v.y), Math.hypot(beta.p2.x - beta.v.x, beta.p2.y - beta.v.y));
      expect(Math.hypot(beta.fit.x - beta.v.x, beta.fit.y - beta.v.y)).toBeLessThan(room / 2);
    });
  }

  it('the defect was real: at the old spot the box DID cross a side (the lock is not vacuous)', () => {
    const beta = placedAngleValues(OPERATOR, 0).find((m) => m.text.includes('β'))!;
    expect(beta.fit.fit).not.toBe('today');
    expect(segmentHits(beta.v, beta.p1, beta.today, beta.box) || segmentHits(beta.v, beta.p2, beta.today, beta.box)).toBe(true);
  });
});

describe('#2175 — a short value keeps today’s position (no layout churn)', () => {
  it('«α» at C in the operator’s figure is exactly where it was', () => {
    for (const seed of [0, 1, 2]) {
      const a = placedAngleValues(OPERATOR, seed).find((m) => m.text === 'α')!;
      expect(a.fit.fit).toBe('today');
      expect(a.fit.x).toBeCloseTo(a.today.x, 9);
      expect(a.fit.y).toBeCloseTo(a.today.y, 9);
    }
  });

  it('«40°» in a plain triangle is exactly where it was, at full size', () => {
    for (const m of placedAngleValues(['משולש ABC', '∠ABC = 40'])) {
      expect(m.fit.fit).toBe('today');
      expect(m.fit.x).toBeCloseTo(m.today.x, 9);
      expect(m.fit.fontSize).toBeCloseTo(FONT * 1.05, 9);
    }
  });
});

describe('#2175 — the rule itself (synthetic wedges)', () => {
  const v = { x: 0, y: 0 };
  const wedge = (deg: number, side: number) => {
    const h = (deg * Math.PI) / 360;
    return { v, p1: { x: side * Math.cos(h), y: side * Math.sin(h) }, p2: { x: side * Math.cos(h), y: -side * Math.sin(h) }, dir: { x: 1, y: 0 } };
  };
  const box1 = mathLabelBox('β + 30', 1);
  const base = { arcR: ANGLE_ARC_R * R, fontSize: 16.8, minFont: MIN_MEASURE_FONT_PX, box1 };

  it('a wide angle: today', () => expect(placeAngleValue({ ...wedge(120, 400), ...base }).fit).toBe('today'));
  it('a thin angle with long sides: moved out along the bisector, full size', () => {
    const f = placeAngleValue({ ...wedge(20, 600), ...base });
    expect(f.fit).toBe('outward');
    expect(f.y).toBeCloseTo(0, 9);
    expect(f.x).toBeGreaterThan(angleValueOffset(R, 16.8));
    expect(f.fontSize).toBe(16.8);
  });
  it('a thin angle with short sides: smaller, never below the floor', () => {
    const f = placeAngleValue({ ...wedge(20, 150), ...base });
    expect(f.fit).toBe('shrunk');
    expect(f.fontSize).toBeLessThan(16.8);
    expect(f.fontSize).toBeGreaterThanOrEqual(MIN_MEASURE_FONT_PX);
  });
  it('a needle: still shown — beside the arc, outside the wedge, on the side away from the figure', () => {
    const f = placeAngleValue({ ...wedge(2, 120), ...base, away: { x: 60, y: 50 } });
    expect(f.fit).toBe('outside');
    expect(Number.isFinite(f.x) && Number.isFinite(f.y)).toBe(true);
    expect(f.fontSize).toBe(16.8);
    expect(f.y).toBeLessThan(0); // the figure lies below (y > 0), so the label goes above the upper ray
    const box = { w: box1.w * f.fontSize, h: box1.h * f.fontSize };
    const w = wedge(2, 120);
    expect(segmentHits(v, w.p1, f, box) || segmentHits(v, w.p2, f, box)).toBe(false);
  });
});
