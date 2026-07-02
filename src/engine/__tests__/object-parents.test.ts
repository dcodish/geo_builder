/**
 * D1 / ENG-1 (ADR-191) — `evaluate`'s coupled-solve cycle detection walks the FULL object graph via the
 * exhaustive `objectParents`, replacing a hand-scraped field list (`PT_FIELDS`) that silently dropped
 * `to` / `toward` / `line` / `circle1/circle2` edges and never chased line specs.
 *
 * The dropped edges meant a solved-on-segment point coupled to another point THROUGH such an edge went
 * undetected → it stayed closed-form → the topological evaluator hit an unresolvable cycle and errored
 * "unresolved dependencies" instead of promoting the pair to the numeric joint solver.
 */
import { describe, it, expect } from 'vitest';
import { evaluate, objectParents } from '@/engine';
import type { Construction, GeoObject } from '@/engine';

describe('objectParents — exhaustive object→references (retires PT_FIELDS)', () => {
  it('includes the edges the old field-scrape dropped (to / toward / line / circle1,circle2)', () => {
    const perp: GeoObject = { kind: 'perp-offset', id: 'P', anchor: 'A', from: 'A', to: 'E', dist: 4 };
    expect(objectParents(perp)).toContain('E'); // `to` — was missed

    const radial: GeoObject = { kind: 'radial-toward', id: 'T', circle: 'circle-O', toward: 'Q' };
    expect(objectParents(radial)).toEqual(expect.arrayContaining(['circle-O', 'Q'])); // `toward` — was missed

    const lc: GeoObject = { kind: 'line-circle', id: 'X', line: 'line-AB', circle: 'circle-O', branch: 0 };
    expect(objectParents(lc)).toEqual(expect.arrayContaining(['line-AB', 'circle-O'])); // `line`/`circle` — missed

    const cc: GeoObject = { kind: 'circle-circle', id: 'Y', circle1: 'circle-O', circle2: 'circle-P', branch: 0 };
    expect(objectParents(cc)).toEqual(expect.arrayContaining(['circle-O', 'circle-P'])); // circle1/circle2 — missed

    // and it chases a line's spec (a cycle through a line∩... edge is now reachable)
    const line: GeoObject = { kind: 'line', id: 'line-CE', spec: { via: 'through', a: 'C', b: 'E' } };
    expect(objectParents(line)).toEqual(expect.arrayContaining(['C', 'E']));
  });

  it('resolves a solved-on-segment point coupled to a perp-offset through its `to` edge (was: unresolved deps)', () => {
    // E rides segment A→B (solved); the distance E→P places it; P = perp-offset whose `to` is E.
    // So E ⇄ P: E's constraint references P, P structurally references E (`to`). |E→P| = 5 ⇒ t = 0.3.
    const c: Construction = {
      objects: [
        { kind: 'free-point', id: 'A', x: 0, y: 0 },
        { kind: 'free-point', id: 'B', x: 10, y: 0 },
        { kind: 'perp-offset', id: 'P', anchor: 'A', from: 'A', to: 'E', dist: 4 },
        {
          kind: 'on-segment-solved',
          id: 'E',
          a: 'A',
          b: 'B',
          constraint: { type: 'distance', a: 'E', b: 'P', value: 5 },
          branch: 0,
          t0: 0.5,
        },
      ],
      constraints: [{ type: 'distance', a: 'E', b: 'P', value: 5 }],
    };

    const r = evaluate(c);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const E = r.positions.get('E')!;
    const P = r.positions.get('P')!;
    // E landed on the segment at t = 0.3 → (3, 0); |E→P| = 5.
    expect(E.x).toBeCloseTo(3, 3);
    expect(E.y).toBeCloseTo(0, 6);
    expect(Math.hypot(E.x - P.x, E.y - P.y)).toBeCloseTo(5, 3);
  });
});
