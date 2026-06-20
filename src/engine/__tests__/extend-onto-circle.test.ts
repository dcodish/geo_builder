/**
 * `extend-onto-circle` (ADR-054) — "המשך AC חותך מעגל P בנקודה D": a DIRECTIONAL extension onto a
 * circle. D is a new on-circle point that is (a) collinear with A,C and (b) BEYOND the 2nd letter
 * (order A→C→D), with a FREE-radius circle adapting so the extension actually reaches it.
 *
 * Contrast with `line-circle-intersection` (an order-agnostic chord that avoids a shared endpoint):
 * here the SIDE matters and the figure resizes when no extension root exists at the seed radius.
 */
import { describe, it, expect } from 'vitest';
import { build, evaluate, checkGivens } from '@/engine';
import type { AnyCommand, Command, Id, Vec } from '@/engine';

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const at = (pos: Map<Id, Vec>, id: Id): Vec => {
  const v = pos.get(id);
  if (!v) throw new Error(`no position for ${id}`);
  return v;
};
/** Signed projection of `p` onto the ray a→b, in units of |a→b| (a↦0, b↦1). */
const proj = (a: Vec, b: Vec, p: Vec): number => {
  const dx = b.x - a.x, dy = b.y - a.y;
  return ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
};
/** Twice the signed area — 0 ⇔ collinear (normalised by the figure span). */
const collinear = (a: Vec, b: Vec, c: Vec) => {
  const span = Math.max(dist(a, b), dist(b, c), dist(a, c));
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / (span * span);
};

describe('extend-onto-circle — directional extension onto a circle', () => {
  it('D is picked on the FAR side of C, not the near crossing — without resizing the circle', () => {
    // Line AC; circle P at (7, 0.5) radius 1.5 meets line AC at x≈5.59 (BETWEEN A and C=6.5) and x≈8.41
    // (BEYOND C). The order constraint A→C→D must select the FAR crossing — the whole point of directional
    // `המשך`, which an order-agnostic chord would get wrong. And since a valid root exists at the seed
    // radius, the free radius must STAY PUT (1.5), never collapse onto the near crossing (ADR-054).
    const cmds: AnyCommand[] = [
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'C', x: 6.5, y: 0 },
      { type: 'free-point', id: 'P', x: 7, y: 0.5 }, // the centre — placed before the circle so it isn't auto-fitted
      { type: 'circle', id: 'circle-P', center: 'P', radius: 1.5, freeRadius: true },
      { type: 'extend-onto-circle', id: 'D', a: 'A', b: 'C', circle: 'circle-P' },
    ];
    const { positions } = build(cmds);
    const A = at(positions, 'A'), C = at(positions, 'C'), D = at(positions, 'D'), P = at(positions, 'P');
    expect(collinear(A, C, D), 'A,C,D collinear').toBeLessThan(1e-2);
    expect(proj(A, C, D), 'D is beyond C (the far crossing, not the near one)').toBeGreaterThan(1);
    expect(D.x, 'D on the far side of the centre').toBeGreaterThan(P.x);
    expect(dist(P, D), 'circle kept its seed radius (no collapse onto the near crossing)').toBeCloseTo(1.5, 1);
  });

  it('a FREE-radius circle GROWS so the extension reaches it (no root at the seed radius)', () => {
    // Line AC is the x-axis; circle P is centred OFF the line at (5,3) with seed radius 1, so the line
    // MISSES the circle entirely (distance 3 > 1). Honouring the extension REQUIRES growing the radius
    // to ≈3 (tangent at (5,0), which is beyond C) — the "adapt the figure" semantics (ADR-052).
    const cmds: AnyCommand[] = [
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'C', x: 1, y: 0 },
      { type: 'free-point', id: 'P', x: 5, y: 3 },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 1, freeRadius: true },
      { type: 'extend-onto-circle', id: 'D', a: 'A', b: 'C', circle: 'circle-P' },
    ];
    const { positions } = build(cmds);
    const A = at(positions, 'A'), C = at(positions, 'C'), D = at(positions, 'D'), P = at(positions, 'P');
    expect(collinear(A, C, D), 'A,C,D collinear (line reaches the resized circle)').toBeLessThan(1e-2);
    expect(dist(P, D), 'radius grew past the seed (1) to reach the line').toBeGreaterThan(2.5);
    expect(proj(A, C, D), 'D beyond C').toBeGreaterThan(1);
  });

  it('the GIVENS VERIFIER reports no violations — D really is on the circle (green = verified)', () => {
    // A directional extension onto a free-radius circle, checked by the verifier (ADR-053): it re-derives
    // on-circle membership from the commands and checks it against the final coordinates, so "no error"
    // can't hide a D that floated off the circle (the ADR-053 failure class). Closes the "green ≠ correct"
    // loop for `extend-onto-circle` short of the in-browser eyeball.
    const program: AnyCommand[] = [
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'C', x: 6.5, y: 0 },
      { type: 'free-point', id: 'P', x: 7, y: 0.5 },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 1.5, freeRadius: true },
      { type: 'extend-onto-circle', id: 'D', a: 'A', b: 'C', circle: 'circle-P' },
    ];
    const { construction } = build(program);
    const ev = evaluate(construction);
    expect(ev.ok, 'figure builds').toBe(true);
    if (!ev.ok) return;
    expect(checkGivens(program as Command[], ev.positions, ev.circles), 'D genuinely on circle P — no givens violated').toEqual([]);
  });
});
