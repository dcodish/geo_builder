/**
 * Negative-space property layer (hardening Pillar 3 / ADR-047 Tier B) — the missing correctness gate
 * for a teaching tool: a CONTRADICTORY given must be REJECTED (prior figure kept), never silently
 * accepted into a figure that violates it (the cardinal sin — a student would reason off a wrong drawing).
 *
 * Generative + seeded (the project's committed methodology, no fast-check dependency): for many random
 * FULLY-PINNED triangles (3 explicit-coordinate points = 0 DOF, so every measure is DETERMINED), across
 * several coordinate SCALES (folding in the ADR-047 threshold-agreement probe — tolerance must behave the
 * same at span ≈1, 50, 1000):
 *   • appending the TRUE distance/angle is ACCEPTED and verifies clean (no false rejection), and
 *   • appending a CONTRADICTING distance/angle is REJECTED with the prior figure intact (no false accept).
 */
import { describe, it, expect } from 'vitest';
import type { Command, Vec } from '../types';
import { applyStep, build } from '../step';
import { evaluate } from '../evaluate';
import { checkGivens } from '../verify';
import { dist, angleDeg } from '../geometry';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A pinned point (free-point with explicit coords → `pinned`, 0 DOF). */
const pin = (id: string, x: number, y: number): Command => ({ type: 'free-point', id, x, y });

/** A random non-degenerate pinned triangle at the given coordinate scale. */
function randomTriangle(r: () => number, scale: number): { cmds: Command[]; A: Vec; B: Vec; C: Vec } {
  const rc = () => (r() * 2 - 1) * scale;
  let A: Vec, B: Vec, C: Vec;
  do {
    A = { x: rc(), y: rc() };
    B = { x: rc(), y: rc() };
    C = { x: rc(), y: rc() };
  } while (
    dist(A, B) < 0.2 * scale ||
    dist(B, C) < 0.2 * scale ||
    dist(A, C) < 0.2 * scale ||
    Math.abs((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)) < 0.05 * scale * scale // near-collinear
  );
  return { cmds: [pin('A', A.x, A.y), pin('B', B.x, B.y), pin('C', C.x, C.y)], A, B, C };
}

const SCALES = [1, 50, 1000];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('negative-space — a contradictory given is rejected; a true given is accepted (every scale)', () => {
  for (const scale of SCALES) {
    for (const seed of SEEDS) {
      it(`scale ${scale}, seed ${seed}: distance & angle, true vs contradiction`, () => {
        const r = rng(seed * 7919 + scale);
        const { cmds, A, B, C } = randomTriangle(r, scale);
        const { construction } = build(cmds);
        const base = evaluate(construction);
        expect(base.ok, 'pinned triangle builds').toBe(true);
        if (!base.ok) return;

        // ── DISTANCE ──
        const dAB = dist(A, B);
        // true |AB| → accepted, verifies clean
        const trueDist: Command = { type: 'set-distance', a: 'A', b: 'B', value: dAB };
        const rd = applyStep(construction, trueDist);
        expect(rd.ok, `true |AB|=${dAB.toFixed(2)} accepted`).toBe(true);
        if (rd.ok) {
          const e = evaluate(rd.construction);
          if (e.ok) expect(checkGivens([...cmds, trueDist], e.positions, e.circles)).toEqual([]);
        }
        // contradicting |AB| (1.5× + a scale-proportional bump, safely past tolerance) → rejected, prior kept
        const badDist: Command = { type: 'set-distance', a: 'A', b: 'B', value: dAB * 1.5 + 10 * scale };
        const bd = applyStep(construction, badDist);
        expect(bd.ok, `contradictory |AB| must be REJECTED (the points are pinned)`).toBe(false);
        expect(bd.construction, 'prior figure kept on rejection').toBe(construction);

        // ── ANGLE ──
        const aBAC = angleDeg(A, B, C); // ∠BAC at vertex A
        const trueAng: Command = { type: 'set-angle', vertex: 'A', ray1: 'B', ray2: 'C', value: aBAC };
        const ra = applyStep(construction, trueAng);
        expect(ra.ok, `true ∠BAC=${aBAC.toFixed(2)}° accepted`).toBe(true);
        const badVal = aBAC < 120 ? aBAC + 40 : aBAC - 40; // a clearly different, still-valid angle
        const badAng: Command = { type: 'set-angle', vertex: 'A', ray1: 'B', ray2: 'C', value: badVal };
        const ba = applyStep(construction, badAng);
        expect(ba.ok, `contradictory ∠BAC must be REJECTED`).toBe(false);
        expect(ba.construction, 'prior figure kept on rejection').toBe(construction);
      });
    }
  }
});
