/**
 * #1714 (ADR-AG-225) — THE PLANAR MARK CHECKS, written once and asserted by every builder that draws a flat
 * figure (docs/28 §5c).
 *
 * `shell/marks.ts` is the one geometry for a right-angle knee, an angle arc and equal-length hatch ticks. These
 * checks say what each shape IS — measured on the shape, never by re-deriving the arithmetic — so a product lock
 * can hand in the marks its OWN renderer produced (2-D's `<polyline>`s, analytic's scene paths) and a drifted
 * copy, or a renderer that stopped calling the kit, fails here rather than in a student's figure.
 *
 * Test-only data: nothing here is imported by runtime code.
 */
import { describe, expect, it } from 'vitest';
import type { MarkPt } from '../../marks';

const TOL = 1e-6;
const near = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const sub = (a: MarkPt, b: MarkPt): MarkPt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: MarkPt) => Math.hypot(v.x, v.y);
const cross = (a: MarkPt, b: MarkPt) => a.x * b.y - a.y * b.x;
const dot = (a: MarkPt, b: MarkPt) => a.x * b.x + a.y * b.y;
/** Is `p` on the open ray from `v` through `q`? */
const onRay = (p: MarkPt, v: MarkPt, q: MarkPt, tol: number): boolean => {
  const d = sub(q, v);
  const e = sub(p, v);
  return Math.abs(cross(d, e)) <= tol * len(d) * Math.max(1, len(e)) && dot(d, e) > 0;
};
/** The interior angle at `v`, in radians. */
const interior = (v: MarkPt, p1: MarkPt, p2: MarkPt) => {
  const a = sub(p1, v);
  const b = sub(p2, v);
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b)))));
};

/**
 * A KNEE at `v` between the rays to `p1` and `p2`: three corners, the first on one ray and the last on the other
 * at the SAME distance from `v`, the middle the square's far corner (first + last − v). `tol` absorbs a product's
 * own serialisation (analytic writes two decimals).
 */
export function kneeFaults(pts: readonly MarkPt[], v: MarkPt, p1: MarkPt, p2: MarkPt, tol = TOL): string[] {
  if (pts.length !== 3) return [`a knee has 3 corners, got ${pts.length}`];
  const [a, m, b] = pts;
  const out: string[] = [];
  const rays = (onRay(a, v, p1, tol) && onRay(b, v, p2, tol)) || (onRay(a, v, p2, tol) && onRay(b, v, p1, tol));
  if (!rays) out.push('a knee corner is off its ray');
  if (!near(len(sub(a, v)), len(sub(b, v)), tol)) out.push('a knee has unequal legs');
  if (!near(m.x, a.x + b.x - v.x, tol) || !near(m.y, a.y + b.y - v.y, tol)) out.push("a knee's far corner is not the square's");
  return out;
}

/**
 * An ARC at `v` between the rays to `p1` and `p2`: every sample at one radius, its ends on the two rays, and it
 * sweeps the INTERIOR angle — never the reflex complement.
 */
export function arcFaults(pts: readonly MarkPt[], v: MarkPt, p1: MarkPt, p2: MarkPt, tol = TOL): string[] {
  if (pts.length < 3) return [`an arc needs samples, got ${pts.length}`];
  const out: string[] = [];
  const r = len(sub(pts[0], v));
  if (!pts.every((p) => near(len(sub(p, v)), r, tol))) out.push('an arc is not at one radius');
  const ends = (onRay(pts[0], v, p1, tol) && onRay(pts[pts.length - 1], v, p2, tol)) || (onRay(pts[0], v, p2, tol) && onRay(pts[pts.length - 1], v, p1, tol));
  if (!ends) out.push("an arc's ends are off the rays");
  let sweep = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = sub(pts[i - 1], v);
    const b = sub(pts[i], v);
    sweep += Math.atan2(cross(a, b), dot(a, b));
  }
  if (!near(Math.abs(sweep), interior(v, p1, p2), Math.max(tol, 1e-3))) out.push('an arc does not sweep the interior angle');
  return out;
}

/** `count` ticks across a–b: each perpendicular to it, the set centred on its midpoint, every tick `2·half` long. */
export function tickFaults(ticks: ReadonlyArray<readonly [MarkPt, MarkPt]>, a: MarkPt, b: MarkPt, count: number, half: number, tol = TOL): string[] {
  if (ticks.length !== count) return [`expected ${count} ticks, got ${ticks.length}`];
  const out: string[] = [];
  const d = sub(b, a);
  if (!ticks.every(([p, q]) => Math.abs(dot(sub(q, p), d)) <= tol * len(d) * len(sub(q, p)))) out.push('a tick is not perpendicular');
  if (!ticks.every(([p, q]) => near(len(sub(q, p)), 2 * half, tol))) out.push('a tick has the wrong length');
  const mids = ticks.map(([p, q]) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }));
  const c = { x: mids.reduce((s, m) => s + m.x, 0) / mids.length, y: mids.reduce((s, m) => s + m.y, 0) / mids.length };
  if (!near(c.x, (a.x + b.x) / 2, tol) || !near(c.y, (a.y + b.y) / 2, tol)) out.push('the ticks are not centred on the segment');
  return out;
}

/** The kit under test — `shell/marks` itself, or a deliberately broken stub (the meta-lock). */
export interface MarkKit {
  knee(v: MarkPt, p1: MarkPt, p2: MarkPt, s: number): MarkPt[];
  arc(v: MarkPt, p1: MarkPt, p2: MarkPt, r: number): MarkPt[];
  ticks(a: MarkPt, b: MarkPt, count: number, half: number, spacing: number): Array<[MarkPt, MarkPt]>;
}

/** Corners in every quadrant, acute and obtuse, both ray orders — SCREEN space (y down), as products draw. */
export const CORNERS: ReadonlyArray<{ name: string; v: MarkPt; p1: MarkPt; p2: MarkPt }> = [
  { name: 'right, axis-aligned', v: { x: 100, y: 100 }, p1: { x: 160, y: 100 }, p2: { x: 100, y: 40 } },
  { name: 'acute 30°', v: { x: 50, y: 200 }, p1: { x: 250, y: 200 }, p2: { x: 50 + 200 * Math.cos(Math.PI / 6), y: 200 - 200 * Math.sin(Math.PI / 6) } },
  { name: 'obtuse 135°, reversed rays', v: { x: 300, y: 300 }, p1: { x: 300 - 80, y: 300 - 80 }, p2: { x: 400, y: 300 } },
  { name: 'across the ±π seam', v: { x: 0, y: 0 }, p1: { x: -100, y: 10 }, p2: { x: -100, y: -10 } },
];

export function markKitFaults(kit: MarkKit): string[] {
  const out: string[] = [];
  for (const c of CORNERS) {
    out.push(...kneeFaults(kit.knee(c.v, c.p1, c.p2, 12), c.v, c.p1, c.p2).map((f) => `${c.name}: ${f}`));
    out.push(...arcFaults(kit.arc(c.v, c.p1, c.p2, 20), c.v, c.p1, c.p2).map((f) => `${c.name}: ${f}`));
  }
  for (const count of [1, 2, 3]) {
    const a = { x: 10, y: 20 };
    const b = { x: 130, y: 70 };
    out.push(...tickFaults(kit.ticks(a, b, count, 5, 4), a, b, count, 5).map((f) => `${count} ticks: ${f}`));
  }
  return out;
}

/** The shared suite, run by `shell/__tests__/mark-geometry-1714.test.ts` against the real kit. */
export function markKitSuite(name: string, kit: MarkKit): void {
  describe(`${name} — the planar mark geometry (#1714)`, () => {
    it('a knee, an arc and ticks are what a textbook draws, at every corner', () => {
      expect(markKitFaults(kit)).toEqual([]);
    });
  });
}

/** Parse SVG path data / polyline points into screen points (`M…L…` or `x,y x,y`). */
export function pointsOf(d: string): MarkPt[] {
  return [...d.matchAll(/(-?[\d.]+(?:e-?\d+)?)[ ,](-?[\d.]+(?:e-?\d+)?)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}
