/**
 * Driven-solver STABILITY HARNESS (gate for the Wave-2/3 solver & carrier rework — ADR-045).
 *
 * A golden snapshot of the *chosen configuration* of a curated set of figures that exercise every
 * carrier kind and every solver path (derived corners, free vertices, perp-offset / rotated /
 * scaled-offset shape scalars, free-vertex-driven, on-segment parametric, on-circle spread,
 * on-segment-solved). The campaign's invariant checks only assert constraints HOLD — they accept
 * any valid drawing — so they cannot catch a refactor that quietly converges a driven figure to a
 * DIFFERENT valid configuration. This snapshot can: any change in a figure's coordinates fails it,
 * forcing a deliberate review (and an explicit `-u` only when the change is intended).
 *
 * Build is pure + deterministic (seed 0), so coordinates are reproducible to 4 dp.
 */
import { describe, it, expect } from 'vitest';
import type { Command } from '@/engine';
import { build, evaluate } from '@/engine';

const r4 = (n: number) => {
  const v = Math.round(n * 1e4) / 1e4;
  return v === 0 ? 0 : v; // normalise -0 → 0 so the snapshot is stable
};

/** Evaluated positions as a sorted, rounded {id: [x, y]} object — or the error. */
function snap(cmds: Command[]): Record<string, [number, number]> | { error: string } {
  const e = evaluate(build(cmds).construction);
  if (!e.ok) return { error: e.error };
  const out: Record<string, [number, number]> = {};
  for (const [id, v] of [...e.positions.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    out[id] = [r4(v.x), r4(v.y)];
  }
  return out;
}

// Each figure exercises a distinct carrier/solver path the rework touches.
const FIGURES: { name: string; cmds: Command[] }[] = [
  { name: 'square (rigid, derived corners)', cmds: [{ type: 'square', ids: ['A', 'B', 'C', 'D'] }] },
  { name: 'parallelogram (free vertices, undriven)', cmds: [{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }] },
  { name: 'trapezoid (scaled-offset)', cmds: [{ type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }] },
  {
    name: 'rectangle + |AD|=7 (perp-offset shape scalar driven)',
    cmds: [{ type: 'rectangle', ids: ['A', 'B', 'C', 'D'] }, { type: 'set-distance', a: 'A', b: 'D', value: 7 }],
  },
  {
    name: 'rhombus + angle DAB=70 (rotated shape scalar driven)',
    cmds: [{ type: 'rhombus', ids: ['A', 'B', 'C', 'D'] }, { type: 'set-angle', vertex: 'A', ray1: 'B', ray2: 'D', value: 70 }],
  },
  {
    name: 'parallelogram + |AB|=|AC| (free-vertex driven)',
    cmds: [{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }, { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' }],
  },
  {
    name: 'triangle + E on AC at 0.4 (on-segment parametric)',
    cmds: [{ type: 'triangle', ids: ['A', 'B', 'C'] }, { type: 'point-on-segment', id: 'E', a: 'A', b: 'C', t: 0.4 }],
  },
  {
    name: 'circle O r5 + inscribed A,B,C (on-circle golden spread)',
    cmds: [
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
    ],
  },
  {
    name: 'square + P on AB + angle DPC=50 (on-segment-solved, branch 0)',
    cmds: [
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'point-on-segment', id: 'P', a: 'A', b: 'B' },
      { type: 'set-angle', vertex: 'P', ray1: 'D', ray2: 'C', value: 50 },
    ],
  },
  // ── COUPLED-BLOCK path (≥2 driven parametric carriers, evaluate.ts resolveDriven) ──
  // The Wave-2/3 gate previously had NO figure on this path — every figure above routes through
  // the 1-DOF / free-vertex / mixed solvers. R5 Pass 2 merges this path into resolveMixedCarriers,
  // so these two pin its CHOSEN configuration (incl. the far-branch grid-scan seeding the merge must
  // preserve). Both drive two on-circle thetas jointly (a chord length on free-on-circle ends).
  {
    name: 'circle O r5 + A,B on-circle + |AB|=7 (coupled: 2 on-circle, 1 chord constraint)',
    cmds: [
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'set-distance', a: 'A', b: 'B', value: 7 },
    ],
  },
  {
    name: 'circle O r5 + A,B,C on-circle + |AB|=6 + |BC|=6 (coupled: 2 chord constraints)',
    cmds: [
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'B', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
      { type: 'set-distance', a: 'A', b: 'B', value: 6 },
      { type: 'set-distance', a: 'B', b: 'C', value: 6 },
    ],
  },
];

describe('driven-solver stability snapshot (Wave-2/3 gate)', () => {
  for (const fig of FIGURES) {
    it(fig.name, () => {
      expect(snap(fig.cmds)).toMatchSnapshot();
    });
  }
});
