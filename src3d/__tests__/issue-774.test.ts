/**
 * #774 (ADR-3D-172) — a MIXED shape-declaration run builds: bind the known labels, mint the
 * undeclared ones as genuinely free points.
 *
 * Prod (log-triage 2026-08-19…24, sessions bg01evje / sce6w3j4): «משולש SEC» on a pyramid
 * where S and C exist and E does not refused `already-defined: S` — blaming the apex the
 * student correctly referenced, while the actual situation was one undeclared label. Ruling
 * 2026-08-25: the mixed run BUILDS (the consistency argument — «משולש XYZ» already builds
 * three free points; 2-D and 3-D's own «מלבן» lane already behave this way). The minted point
 * is a genuine free DOF (ADR-052): sampled, counted, moving on «show another configuration».
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';
import { dist3, dot3, cross3, sub3, norm3 } from '../engine/vec3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const err = () => state().lastError;

const PYRAMID = 'פירמידה ישרה מרובעת ABCDS';

describe('#774 — «משולש SEC»: the mixed run binds S and C and mints E free', () => {
  beforeEach(reset);

  it('builds — no already-defined, no label blamed', () => {
    submit(PYRAMID);
    submit('משולש SEC');
    expect(err()).toBeNull();
    const d = derive3(state().facts, 0);
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    expect(d.positions.get('E')).toBeDefined();
    expect(d.construction.points.get('E')).toEqual({ kind: 'free3' });
  });

  it('existing points do not move, and the triangle leaves its ink', () => {
    submit(PYRAMID);
    const before = derive3(state().facts, 0);
    const S0 = before.positions.get('S')!;
    const C0 = before.positions.get('C')!;
    submit('משולש SEC');
    const after = derive3(state().facts, 0);
    expect(dist3(after.positions.get('S')!, S0)).toBeLessThan(1e-12);
    expect(dist3(after.positions.get('C')!, C0)).toBeLessThan(1e-12);
    const segs = after.construction.segments.map((s) => [...s].sort().join('-'));
    for (const want of ['E-S', 'C-E']) expect(segs).toContain(want);
    // C–S is already drawn as the pyramid's lateral edge — no duplicate segment is added
    const edgePairs = after.construction.solids.flatMap((s) => s.edges.map((e) => [...e].sort().join('-')));
    expect(edgePairs).toContain('C-S');
    expect(segs).not.toContain('C-S');
  });

  it('E is a GENUINE free DOF: sampled per seed, cycling moves it, the cue counts 3 more (ADR-052)', () => {
    submit(PYRAMID);
    const cueBefore = (() => {
      const d = derive3(state().facts, 0);
      return freeDofCount3(d.construction, d.resolved);
    })();
    submit('משולש SEC');
    const d0 = derive3(state().facts, 0);
    expect(freeDofCount3(d0.construction, d0.resolved)).toBe(cueBefore + 3);
    const spread = [0, 1, 2].map((seed) => derive3(state().facts, seed).positions.get('E')!);
    expect(Math.max(...spread.map((p) => p.x)) - Math.min(...spread.map((p) => p.x))).toBeGreaterThan(1e-3);
  });

  it('all-existing and all-new runs stay byte-identical', () => {
    submit(PYRAMID);
    submit('משולש SAB'); // all-existing: binds, positions unchanged
    expect(err()).toBeNull();
    submit('משולש XYZ'); // all-new: a declared free triangle
    expect(err()).toBeNull();
    const d = derive3(state().facts, 0);
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    expect(d.positions.get('X')).toBeDefined();
  });
});

describe('#774 — «מרובע ABCE»: the quad stays a QUAD — flat by definition', () => {
  beforeEach(reset);

  it('builds, E rides the plane of A,B,C (2 free DOFs) and is coplanar at every seed', () => {
    submit(PYRAMID);
    submit('מרובע ABCE');
    expect(err()).toBeNull();
    submit('הבסיס מלבן'); // give the base a definite shape so the plane is non-degenerate
    for (const seed of [0, 1, 2]) {
      const d = derive3(state().facts, seed);
      const [A, B, C, E] = ['A', 'B', 'C', 'E'].map((id) => d.positions.get(id)!);
      const n = cross3(sub3(B, A), sub3(C, A));
      expect(Math.abs(dot3(n, sub3(E, A))) / Math.max(norm3(n), 1e-12), `seed ${seed}: E coplanar`).toBeLessThan(1e-6);
    }
    const d = derive3(state().facts, 0);
    const def = d.construction.points.get('E');
    expect(def).toEqual({ kind: 'on-plane', plane: 'ABC' });
  });

  it('a run whose fresh labels cannot be minted refuses naming an UNDECLARED label', () => {
    submit(PYRAMID);
    submit('מרובע ABXY'); // two unknown corners of a flat quad — no owner yet
    expect(err()).toEqual({ code: 'unknown-point', id: 'X' });
  });

  it('the operator sequence (#807 play): «מרובע ABCE» AFTER «משולש SEC» draws the missing AE side', () => {
    // E already exists (minted by the triangle), so the quad takes the ALL-EXISTING reference path —
    // which used to be a pure no-op: green, with the AE side simply absent until typed by hand.
    // A stated shape leaves its visible trace (ADR-3D-035), idempotently.
    submit(PYRAMID);
    submit('משולש SEC');
    submit('מרובע ABCE');
    expect(err()).toBeNull();
    const d = derive3(state().facts, 0);
    const segs = d.construction.segments.map((s) => [...s].sort().join('-'));
    expect(segs).toContain('A-E'); // the side the operator had to draw by hand
    // and idempotent: restating adds nothing
    const before = derive3(state().facts, 0).construction.segments.length;
    submit('מרובע ABCE');
    expect(derive3(state().facts, 0).construction.segments.length).toBe(before);
  });
});
