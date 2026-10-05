/**
 * #1712 (ADR-587) — A STATED MEASURE OUTSIDE THE RANGE ANY CONFIGURATION CAN GIVE IT IS REFUSED BY NAME.
 *
 * Measured on 4d6e3fd6: «משולש ABC» · «∢ABC = -2» COMMITTED (deferred — the ADR-104 flex probe saw the
 * residual move on the free triangle), «זווית ABC = -30» likewise. The predicate is read on the lowered
 * constraint, so it is pinned here directly, then through the engine's step and the replay's pending probe.
 */
import { describe, expect, it } from 'vitest';
import { measureOutOfRange, measureRangeImpossibilityError } from '../metricFeasibility';
import { applyStep, build } from '@/engine';
import type { Command, Constraint } from '@/engine';
import { deferralWorthwhile } from '@/replay/core';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { humanizeError } from '@/i18n/humanizeError';
import i18n from '@/i18n';

const ang = (value: number, extra: Partial<Constraint> = {}): Constraint => ({ type: 'angle', vertex: 'B', ray1: 'A', ray2: 'C', value, ...extra }) as Constraint;
const angBound = (b: { min?: number; max?: number; minStrict?: boolean; maxStrict?: boolean }): Constraint => ({ type: 'angle-bound', vertex: 'B', ray1: 'A', ray2: 'C', ...b });
const lenBound = (b: { min?: number; max?: number; minStrict?: boolean; maxStrict?: boolean }): Constraint => ({ type: 'length-bound', a: 'A', b: 'B', ...b });
const sum = (unit: 'angle' | 'length', coefs: number[], target: number): Constraint =>
  ({ type: 'measure-sum', unit, coefs, target, points: unit === 'angle' ? ['B', 'A', 'C', 'A', 'B', 'C'] : ['A', 'B', 'B', 'C'] }) as Constraint;

describe('#1712 — the range predicate, one constraint at a time', () => {
  it('an angle value outside [0°, 180°] is impossible; the endpoints and everything inside are not', () => {
    for (const v of [-2, -30, -0.5, 180.5, 200, 360]) expect(measureOutOfRange(ang(v))?.unit, `∠ = ${v}`).toBe('angle');
    for (const v of [0, 0.1, 37, 90, 179.9, 180]) expect(measureOutOfRange(ang(v)), `∠ = ${v}`).toBeNull();
  });

  it('an ARC measure keeps its own window (the arc reader owns it) — never read as a vertex angle', () => {
    expect(measureOutOfRange(ang(200, { arcOf: 'circle-O' } as Partial<Constraint>))).toBeNull();
  });

  it('an angle bound whose window misses [0°, 180°] is impossible, strictness respected', () => {
    expect(measureOutOfRange(angBound({ min: 200 }))).not.toBeNull();
    expect(measureOutOfRange(angBound({ min: 180 }))).not.toBeNull(); // «> 180»
    expect(measureOutOfRange(angBound({ min: 180, minStrict: false }))).toBeNull(); // «≥ 180» — a flat angle
    expect(measureOutOfRange(angBound({ max: -5 }))).not.toBeNull();
    expect(measureOutOfRange(angBound({ max: 0 }))).not.toBeNull(); // «< 0»
    expect(measureOutOfRange(angBound({ max: 0, maxStrict: false }))).toBeNull();
    expect(measureOutOfRange(angBound({ min: 170 }))).toBeNull();
    expect(measureOutOfRange(angBound({ min: 40, max: 90 }))).toBeNull();
  });

  it('a negative length, or a length window below zero, is impossible; a bounded positive window is not (cat-2d-087)', () => {
    expect(measureOutOfRange({ type: 'distance', a: 'A', b: 'B', value: -3 })?.unit).toBe('length');
    expect(measureOutOfRange({ type: 'distance', a: 'A', b: 'B', value: 0 })).toBeNull();
    expect(measureOutOfRange({ type: 'distance', a: 'A', b: 'B', value: 5 })).toBeNull();
    expect(measureOutOfRange(lenBound({ max: -1 }))).not.toBeNull();
    expect(measureOutOfRange(lenBound({ max: 0 }))).not.toBeNull();
    expect(measureOutOfRange(lenBound({ min: 5, max: 9 }))).toBeNull();
    expect(measureOutOfRange(lenBound({ min: 1000 }))).toBeNull();
  });

  it('a same-sign measure sum is impossible only against a target of the other sign — its upper bound is not read', () => {
    expect(measureOutOfRange(sum('angle', [1, 1], -10))?.unit).toBe('angle');
    expect(measureOutOfRange(sum('length', [-1, -1], 4))?.unit).toBe('length');
    expect(measureOutOfRange(sum('angle', [1, 1], 100))).toBeNull();
    expect(measureOutOfRange(sum('angle', [1, 1], 400))).toBeNull(); // an arc sum lowers to this very shape
    expect(measureOutOfRange(sum('angle', [1, -1], -10))).toBeNull(); // «∠A − ∠B = −10» is a figure
  });

  it('the wire message names the statement and is humanised in both languages', () => {
    const raw = measureRangeImpossibilityError(measureOutOfRange(ang(-2))!);
    expect(raw).toBe('impossible: ∠ABC = -2° — an angle measures between 0° and 180°');
    const strip = (s: string) => s.replace(/[⁦-⁩]/g, '');
    const he = strip(humanizeError(raw, (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string));
    const en = strip(humanizeError(raw, (k, o) => i18n.t(k, { ...o, lng: 'en' }) as string));
    expect(he).toContain('∠ABC = -2°');
    expect(he).toContain('בין 0° ל-180°');
    expect(en).toContain('∠ABC = -2°');
    expect(en).toContain('between 0° and 180°');
    const len = strip(humanizeError(measureRangeImpossibilityError(measureOutOfRange({ type: 'distance', a: 'A', b: 'B', value: -3 })!), (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string));
    expect(len).toContain('|AB| = -3');
    expect(len).toContain('אורך אינו יכול להיות שלילי');
  });
});

describe('#1712 — through the engine step and the replay deferral probe', () => {
  const tri = build([{ type: 'triangle', ids: ['A', 'B', 'C'] } as Command]).construction;

  it('the step refuses before the ladder (pre:impossible), with the range message', () => {
    for (const value of [-2, -30]) {
      const r = applyStep(tri, { type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value });
      expect(r.ok, `∠ABC = ${value}`).toBe(false);
      expect(r.ladder).toEqual(['pre:impossible']);
      expect(!r.ok && r.error).toMatch(/an angle measures between 0° and 180°$/);
    }
    // An over-180° INTERIOR angle of a declared polygon keeps ADR-538's angle-sum sentence (its lock,
    // angle-sum-feasibility.test.ts); off a polygon the range prover names it.
    const tri200 = applyStep(tri, { type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 200 });
    expect(!tri200.ok && tri200.error).toMatch(/^impossible: the angles of ABC sum to 200°/);
    const rays = build([{ type: 'segment', a: 'B', b: 'A' }, { type: 'segment', a: 'B', b: 'C' }] as Command[]).construction;
    const off = applyStep(rays, { type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 200 });
    expect(off.ladder).toEqual(['pre:impossible']);
    expect(!off.ok && off.error).toBe('impossible: ∠ABC = 200° — an angle measures between 0° and 180°');
    expect(applyStep(tri, { type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 70 }).ok).toBe(true);
  });

  it('the deferral probe no longer files an out-of-range angle as PENDING (it did: the residual moves)', () => {
    const facts = factsOf(['משולש ABC']);
    expect(deferralWorthwhile(facts, [{ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: -2 }])).toBe(false);
    expect(deferralWorthwhile(facts, [{ type: 'set-distance', a: 'A', b: 'B', value: -3 }])).toBe(false);
  });
});
