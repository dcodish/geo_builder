/**
 * Constraint-identity regimes (S0.5 of docs/24 — the docs/23 "two identity regimes" finding).
 *
 * REFERENCE identity is the ownership regime: a directive's constraint must be the very object in
 * `constraints[]` (the orphan sweep, carrier counts, and recruiter case-(D) key by reference).
 * CONTENT identity (`constraintKey`) is the dedup regime. This test locks both: the interning
 * invariant holds on canonical figures across the mutating solve paths (eager drive, M1
 * reinterpretation, the recruiter), and a structural clone at a directive boundary — the silent
 * failure mode this slice exists to catch — is DETECTED, not absorbed.
 */
import { describe, expect, it } from 'vitest';
import { applyStep, emptyConstruction } from '../step';
import { constraintKey, unownedDirectiveConstraints } from '../solve';
import type { Command, Constraint, Construction, GeoObject } from '../types';

const run = (cmds: Command[]): Construction => {
  let cur = emptyConstruction();
  for (const cmd of cmds) {
    const r = applyStep(cur, cmd);
    expect(r.ok, r.ok ? '' : `step ${cmd.type}: ${(r as { error: string }).error}`).toBe(true);
    cur = r.construction;
  }
  return cur;
};

describe('constraintKey (content identity, the dedup regime)', () => {
  it('is equal for structurally identical constraints and distinct otherwise', () => {
    const a: Constraint = { type: 'distance', a: 'A', b: 'B', value: 5 };
    const b: Constraint = { type: 'distance', a: 'A', b: 'B', value: 5 };
    const c: Constraint = { type: 'distance', a: 'A', b: 'C', value: 5 };
    expect(constraintKey(a)).toBe(constraintKey(b));
    expect(constraintKey(a)).not.toBe(constraintKey(c));
  });
});

describe('the interning invariant (reference identity, the ownership regime)', () => {
  it('holds after an eager driven constraint', () => {
    const c = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'point-on-segment', id: 'D', a: 'B', b: 'C', t: 0.3 },
      { type: 'set-angle', vertex: 'A', ray1: 'B', ray2: 'D', value: 20 },
    ]);
    expect(unownedDirectiveConstraints(c)).toEqual([]);
  });

  it('holds after an M1 reinterpretation (driven coincide)', () => {
    const c = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'point-on-segment', id: 'D', a: 'B', b: 'C', t: 0.3 },
      { type: 'midpoint', id: 'D', a: 'B', b: 'C' },
    ]);
    expect(unownedDirectiveConstraints(c)).toEqual([]);
  });

  it('holds after the recruiter reconfigures carriers (ADR-103 figure)', () => {
    const c = run([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, autoCenter: true },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, autoCenter: true },
      { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
      { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1, avoid: 'A' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-P' },
      { type: 'extend-onto-circle', id: 'D', a: 'C', b: 'A', circle: 'circle-O' },
      { type: 'set-distance', a: 'C', b: 'D', value: 36 },
    ] as Command[]);
    expect(unownedDirectiveConstraints(c)).toEqual([]);
  });

  it('DETECTS a structurally-cloned directive (the silent failure mode)', () => {
    const c = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'point-on-segment', id: 'D', a: 'B', b: 'C', t: 0.3 },
      { type: 'set-angle', vertex: 'A', ray1: 'B', ray2: 'D', value: 20 },
    ]);
    expect(unownedDirectiveConstraints(c)).toEqual([]); // healthy before
    const cloned: Construction = {
      ...c,
      objects: c.objects.map((o): GeoObject => {
        const sv = (o as { solve?: { constraint: Constraint; branch: number } }).solve;
        if (!sv) return o;
        return { ...o, solve: { ...sv, constraint: JSON.parse(JSON.stringify(sv.constraint)) } } as GeoObject;
      }),
    };
    expect(unownedDirectiveConstraints(cloned).length).toBeGreaterThan(0);
  });
});
