/**
 * Issue #345 (ADR-397) — a configuration in which a COMMITTED step did not hold is not displayable.
 *
 * `meetsRequirements` is the predicate every config search consults (`findValidConfig`, `resample`,
 * `firstSatisfyingSeed`, the shared detection sampler, and the corpus seed-sweep oracle). It judged the
 * geometry — extension directions, crossings within segments, distinctness, convexity — and the
 * verifier's `violations`, but it never asked the most basic question: *does the figure satisfy its own
 * commands?*
 *
 * So a seed where a stated given settled `over-constrained` was still offered to the student by "show
 * another configuration", with the given silently not applying. On the two-tangent-circles figure of
 * `common-tangent-two-circles` (the reported instance), seeds 0–1 landed |O2M| = 16 while seeds 2–3
 * left it at ~2.9 / ~1.25 with the step refused — and all four were called displayable.
 *
 * This is the cross-seed escape class (ADR-085/098/127/166) one level up: not a requirement the sampler
 * forgot, but the step statuses themselves.
 *
 * REPRODUCTION HISTORY: the original seed-split figure was the two-tangent-circles one; ADR-400 (the
 * tail's warm-start basin retry, #359) HEALED it — every seed now builds the closed form — which this
 * file's vacuous-guard correctly refused to ignore. The lock now uses the same figure as the ADR-398
 * attribution lock: a square with E on AB and |CE| = 5.2, whose split survives every rescue tier by
 * construction (a bounded 1-D root that does not exist at some sampled sides cannot be retried into
 * existence). The healed figure keeps its own every-seed lock in `basin-ownership.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenarios-harness';
import { meetsRequirements, replay, type Fact } from '@/store/geoStore';
import { circleVariantsHold } from '@/replay/core';
import { circlePairVariantCase } from '@/engine/variants';
import type { Command } from '@/engine/types';

const SQUARE_CE = ['ריבוע ABCD', 'נקודה E על AB', 'CE=5.2'];

describe('#345 — displayability requires the figure to satisfy its own commands', () => {
  it('a seed whose committed step is over-constrained is NOT displayable', () => {
    const facts = factsOf(SQUARE_CE);
    const dist = (a?: { x: number; y: number }, b?: { x: number; y: number }) =>
      a && b ? Math.hypot(a.x - b.x, a.y - b.y) : NaN;

    let good = 0;
    let refusedAndHidden = 0;
    for (let seed = 0; seed < 8; seed++) {
      const fig = replay(facts, seed);
      const allOk = facts.every((f) => !f.enabled || fig.status[f.id] === 'ok');
      const displayable = meetsRequirements(facts, seed);

      // THE invariant: never displayable while a committed step failed.
      expect(displayable && !allOk, `seed ${seed} must not be displayable with a failed step`).toBe(false);

      if (allOk) {
        good++;
        // a config whose steps all hold really does honour the stated size given
        expect(dist(fig.positions.get('C'), fig.positions.get('E')), `seed ${seed}: |CE| = 5.2`).toBeCloseTo(5.2, 2);
      } else {
        refusedAndHidden++;
        expect(displayable, `seed ${seed} is correctly hidden`).toBe(false);
      }
    }
    // the figure is genuinely seed-split — the test would be vacuous if every seed built
    expect(good, 'some seeds build correctly').toBeGreaterThan(0);
    expect(refusedAndHidden, 'and some fail — this figure is the reported seed-split').toBeGreaterThan(0);
  });

  it('a healthy figure is unaffected — every seed still displayable', () => {
    const facts = factsOf(['ריבוע ABCD', 'נקודה G על AD', 'זווית GBA = 37']);
    for (let seed = 0; seed < 4; seed++) {
      const fig = replay(facts, seed);
      if (facts.every((f) => !f.enabled || fig.status[f.id] === 'ok')) {
        expect(meetsRequirements(facts, seed), `seed ${seed} stays displayable`).toBe(true);
      }
    }
  });

  it('a DISABLED failing row does not make a config undisplayable (it is not part of the figure)', () => {
    const facts = factsOf(['ריבוע ABCD']);
    const withDisabled = [
      ...facts,
      // a fact that could never build, but switched off by the student
      { id: 'x.0', utterance: 'bogus', group: 'gX', cmd: { type: 'segment', a: 'Q', b: 'Z' }, enabled: false } as (typeof facts)[number],
    ];
    expect(meetsRequirements(withDisabled, 0)).toBe(meetsRequirements(facts, 0));
  });
});

/**
 * #2240 ([ADR-804](../../../docs/06-decisions.md#adr-804)) — the unstated two-circle configuration is a view floor:
 * `circleVariantsHold` (a `meetsRequirements` member) keeps every view of «שני מעגלים» in the case its variant stands
 * for (`circlePairVariantCase`), passes the tangency boundary, and yields to a stated position or a named crossing.
 */
describe('#2240 — circleVariantsHold, the bare pair’s configuration floor', () => {
  const anyRec = (variant: number, admits?: ('meet' | 'disjoint' | 'contained')[]) =>
    ({ type: 'set-circle-position', relation: 'any', a: 'circle-O', b: 'circle-P', variant, ...(admits ? { admits } : {}) }) as Command;
  const factOf = (cmd: Command) => ({ id: 'f1', cmd, enabled: true, source: '' }) as unknown as Fact;
  const view = (d: number, rO: number, rP: number, requirements: object[] = [], objects: object[] = []) =>
    ({
      circles: new Map([['circle-O', { center: { x: 0, y: 0 }, r: rO }], ['circle-P', { center: { x: d, y: 0 }, r: rP }]]),
      construction: { objects, constraints: [], requirements },
    }) as never;
  it('circlePairVariantCase: the index names a case over what the sentence admits; null for every other command', () => {
    expect([0, 1, 2, 3, -1].map((v) => circlePairVariantCase(anyRec(v)))).toEqual(['meet', 'disjoint', 'contained', 'meet', 'contained']);
    expect([0, 1, 2].map((v) => circlePairVariantCase(anyRec(v, ['meet', 'disjoint'])))).toEqual(['meet', 'disjoint', 'meet']);
    expect(circlePairVariantCase({ type: 'set-circle-position', relation: 'disjoint', a: 'circle-O', b: 'circle-P' } as Command)).toBeNull();
    expect(circlePairVariantCase({ type: 'point', id: 'A', x: 0, y: 0 } as Command)).toBeNull();
  });
  it('a view strictly in another case’s region is rejected; its own case passes (either circle inside)', () => {
    const cut = view(4, 3, 2);
    const apart = view(8, 3, 2);
    const nested = view(0.5, 3, 2);
    const nestedOther = view(0.5, 2, 3);
    const grid = [cut, apart, nested, nestedOther].map((fig) => [0, 1, 2].map((v) => circleVariantsHold([factOf(anyRec(v))], fig)));
    expect(grid).toEqual([
      [true, false, false],
      [false, true, false],
      [false, false, true],
      [false, false, true],
    ]);
  });
  it('the tangency boundary passes every case (ADR-645’s ruler): a later statement may force a touch', () => {
    for (const fig of [view(5, 3, 2), view(5 * (1 + 1e-4), 3, 2), view(1, 3, 2)]) for (const v of [0, 1, 2]) expect(circleVariantsHold([factOf(anyRec(v))], fig)).toBe(true);
    expect(circleVariantsHold([factOf(anyRec(1))], view(5 * 0.99, 3, 2))).toBe(false); // beyond the ruler: crossing
  });
  it('yields to a stated position of the pair or a named crossing; a disabled record and a missing circle are not judged', () => {
    const cut = (req: object[] = [], objs: object[] = []) => view(4, 3, 2, req, objs);
    expect(circleVariantsHold([factOf(anyRec(1))], cut([{ kind: 'circle-position', relation: 'tangent', a: 'circle-P', b: 'circle-O', at: 'T', external: true }]))).toBe(true);
    expect(circleVariantsHold([factOf(anyRec(2))], cut([], [{ kind: 'circle-circle', id: 'X', circle1: 'circle-P', circle2: 'circle-O', branch: 0 }]))).toBe(true);
    expect(circleVariantsHold([factOf(anyRec(1))], cut([{ kind: 'circle-position', relation: 'disjoint', a: 'circle-Q', b: 'circle-O' }]))).toBe(false); // another pair
    expect(circleVariantsHold([{ ...factOf(anyRec(1)), enabled: false }], cut())).toBe(true);
    expect(circleVariantsHold([factOf({ ...anyRec(1), b: 'circle-Z' } as Command)], cut())).toBe(true);
  });
  it('meetsRequirements carries the floor: bare «שני מעגלים» at every variant × seed 0–7 meets it exactly where its case holds', () => {
    const base = factsOf(['שני מעגלים']);
    const i = base.findIndex((f) => circlePairVariantCase(f.cmd) !== null);
    expect(i).toBeGreaterThanOrEqual(0);
    let rejected = 0;
    for (const v of [0, 1, 2])
      for (let seed = 0; seed < 8; seed++) {
        const facts = base.map((f, j) => (j === i ? { ...f, cmd: { ...(f.cmd as Command), variant: v } as Command } : f));
        const fig = replay(facts, seed);
        if (!circleVariantsHold(facts, fig)) rejected++;
        expect(meetsRequirements(facts, seed), `v${v} s${seed}`).toBe(circleVariantsHold(facts, fig));
      }
    expect(rejected, "the sampler does leave the seated case at some seeds (measured: 6 of 24 at 4a06aae9), so the floor is not vacuous").toBeGreaterThan(0);
  });
});
