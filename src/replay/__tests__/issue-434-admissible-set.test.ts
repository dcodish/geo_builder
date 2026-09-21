/**
 * #434 ([ADR-509](../../../docs/06-decisions.md#adr-509)) — a DETERMINED figure's knowledge pool is its
 * ADMISSIBLE SET, not one sample.
 *
 * The knowledge gates trusted `freeDofCount === 0` off ONE drawing. A count is arithmetic and can lie
 * (ADR-424's class): «AB=BC=8» alone read 0 and printed ∠ABC = 31° on the canvas — an angle no given
 * fixed (seed 1 says 21°, seed 3 says 39°). And a seed can never reach a BRANCH or a right-angle SEAT,
 * so a figure that is genuinely rigid at each seat still printed one seat's |AB| as knowledge while the
 * other seat — admissible, one «הציגו תצורה אחרת» press away — gives a different number.
 *
 * The shared sample core now enumerates the admissible set of a determined figure — seeds {s, s+1, s+2}
 * × every branch/seat rewrite `meetsRequirements` accepts (the button's own bar) — and the gates trust
 * the MEASURED `determined` flag (count 0 AND the set complete) instead of the count alone. Locks run
 * both directions: a value withheld returns the moment a given pins it.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { admissibleRewrites, ADMISSIBLE_REWRITE_CAP, ADMISSIBLE_SEEDS, computeValues, detectAll, firstSatisfyingSeed, replay, samplingJobs, sharedSamples } from '@/replay/core';
import { detectRelationsAcross, freeDofCount } from '@/engine';
import type { Fact } from '@/store/geoStore';

const canvasAngle = (facts: Fact[], vertex: string, a: string, b: string) =>
  detectAll(facts).relations.definiteAngles.find((x) => x.vertex === vertex && [x.a, x.b].sort().join('') === [a, b].sort().join(''));
const canvasLength = (facts: Fact[], a: string, b: string) =>
  detectAll(facts).relations.definiteLengths.find((x) => [x.a, x.b].sort().join('') === [a, b].sort().join(''));
const panelRows = (facts: Fact[], kind: string) =>
  (computeValues(facts).rows as { kind: string; ids?: string[]; value?: number; note?: string }[]).filter((r) => r.kind === kind && r.note !== 'undetermined');

describe('#434 — the count lies, the admissible set does not (the seed axis)', () => {
  const isosceles = ['AB=BC=8'];

  it('«AB=BC=8» alone prints NO ∠ABC — and since #1264 the count no longer lies about it either', () => {
    const facts = factsOf(isosceles);
    // When this lock was written the count read 0 here — «AB=BC=8» lowers to an `equal` PLUS two
    // distances, and the equal is implied by the distances, so the per-row tally over-subtracted (the
    // ADR-424 class). ADR-536 (#1264) made the accountant subtract the RANK of the constraint system, so
    // the count is now the honest 1 (an isosceles triangle up to similarity has one shape parameter) and
    // the pool is the ordinary under-determined one. The withheld angle below is the #434 promise; it
    // now holds for the honest reason rather than despite the count.
    expect(freeDofCount(replay(facts, 0).construction), 'the count that used to lie').toBe(1);
    const pool = sharedSamples(facts);
    expect(pool.determined, 'one shape DOF left — not determined').toBe(false);
    expect(pool.samples.length, 'an honest under-determined pool').toBeGreaterThanOrEqual(ADMISSIBLE_SEEDS);
    expect(canvasAngle(facts, 'B', 'A', 'C'), 'the 31° that was one seed’s accident').toBeUndefined();
    expect(panelRows(facts, 'angle'), 'no angle row either').toHaveLength(0);
    // …while the two STATED lengths still print — they are the same in every configuration.
    expect(canvasLength(facts, 'A', 'B')?.value).toBeCloseTo(8, 6);
    expect(canvasLength(facts, 'B', 'C')?.value).toBeCloseTo(8, 6);
  });

  it('…and ∠ABC returns the moment «זווית ABC = 40» pins it (the other direction)', () => {
    const facts = factsOf([...isosceles, 'זווית ABC = 40']);
    expect(canvasAngle(facts, 'B', 'A', 'C')?.valueDeg).toBeCloseTo(40, 3);
    const rows = panelRows(facts, 'angle');
    expect(rows.some((r) => r.ids?.join('') === 'ABC' && Math.abs((r.value ?? 0) - 40) < 1e-3), 'panel ∠ABC = 40').toBe(true);
  });
});

describe('#434 — the SEAT axis: a right angle the student never placed is an admissible alternative', () => {
  // The bagrut quarter-circle figure (scenario quarter-circle-in-right-triangle-any-end-order): rigid at
  // each seat, but the seat at B — admissible, one press away — gives |AB| = 11.18 against 18.03.
  const quarter = ['ABC משולש ישר זוית', 'AC=15', 'BC=10', 'O על AC', 'D על AB', 'OCD רבע מעגל'];

  it('enumerates the three seats as the discrete rewrites (identity first)', () => {
    const facts = factsOf(quarter);
    const rw = admissibleRewrites(facts, replay(facts, firstSatisfyingSeed(facts)).construction);
    expect(rw, 'under the cap').not.toBeNull();
    expect(rw![0], 'element 0 is the current facts').toBe(facts);
    const rots = rw!.map((fc) => (fc.find((f) => f.cmd.type === 'right-triangle')!.cmd as { rot?: number }).rot ?? 0).sort();
    expect(rots, 'rot 0, 1 and 2 exactly once each').toEqual([0, 1, 2]);
  });

  it('|AB| is withheld while the seat is unstated; the stated givens still print', () => {
    const facts = factsOf(quarter);
    expect(freeDofCount(replay(facts, 0).construction)).toBe(0);
    expect(canvasLength(facts, 'A', 'B'), '18.03 is one seat’s number').toBeUndefined();
    expect(panelRows(facts, 'length').map((r) => r.ids?.join('')).sort(), 'the two givens remain').toEqual(['AC', 'BC']);
    // the seat at B is a genuine alternative: it meets every requirement and joins the pool
    const pool = sharedSamples(facts);
    expect(pool.determined).toBe(true);
    expect(pool.samples.length, 'identity seeds + the admissible seat’s seeds').toBeGreaterThan(ADMISSIBLE_SEEDS);
  }, 300_000);

  it('…and |AB| = 18.03 returns once «זווית ACB = 90» pins the seat', () => {
    const facts = factsOf([...quarter, 'זווית ACB = 90']);
    expect(canvasLength(facts, 'A', 'B')?.value).toBeCloseTo(18.03, 1);
    expect(panelRows(facts, 'length').some((r) => r.ids?.join('') === 'AB'), 'panel |AB|').toBe(true);
  }, 120_000);
});

describe('#434 — the BRANCH axis: the other tangent point is an admissible alternative', () => {
  // The two-tangents figure with |AO| pinned (without it ∠BAD is not knowledge on ANY axis — |AO| is a
  // free length the count misses, measured: three seeds give three values).
  const tangent = ['מעגל O', 'מנקודה A מחוץ למעגל מעבירים משיק לנקודה D', 'B על המעגל', 'AB', 'AO', 'BO', 'DO', 'AB=√2R', 'BO=R', 'AO=2R'];

  it('∠BAD is withheld while D’s branch is unstated — the mirror tangent point is admissible', () => {
    const facts = factsOf(tangent);
    const rw = admissibleRewrites(facts, replay(facts, firstSatisfyingSeed(facts)).construction);
    expect(rw!.length, 'identity + the other tangent branch').toBe(2);
    expect(canvasAngle(facts, 'A', 'B', 'D'), 'the angle that flips with the branch').toBeUndefined();
    // the seat-free, branch-free angles still print
    expect(canvasAngle(facts, 'A', 'D', 'O')?.valueDeg, '∠DAO = 30° (sin = R/2R)').toBeCloseTo(30, 1);
  });

  it('…and ∠BAD returns once «B ו-D באותו צד של AO» states the side', () => {
    const facts = factsOf([...tangent, 'B ו-D באותו צד של AO']);
    const pool = sharedSamples(facts);
    expect(pool.samples.length, 'the mirror branch fails the side requirement and leaves the pool').toBe(ADMISSIBLE_SEEDS);
    expect(canvasAngle(facts, 'A', 'B', 'D'), 'now knowledge').toBeDefined();
  });
});

describe('#434 — failing CLOSED, and the paths that must not change', () => {
  it('a set cut short by the budget is NOT determined: values and dots fall back to the ≥4 floor', () => {
    const facts = factsOf(['AB=BC=8']);
    const { jobs, finish } = samplingJobs(facts);
    jobs[0]();
    const cut = finish(false);
    expect(cut.determined).toBe(false);
    expect(cut.samples.length).toBeGreaterThan(0);
    const rel = detectRelationsAcross(cut.constructions, { positions: cut.samples, determined: cut.determined });
    expect(rel.definiteLengths, 'even the stated 8s wait for a complete set').toHaveLength(0);
  });

  it('a cross product over the cap returns null (no partial enumeration)', () => {
    const quarter = ['ABC משולש ישר זוית', 'AC=15', 'BC=10', 'O על AC', 'D על AB', 'OCD רבע מעגל'];
    const facts = factsOf(quarter);
    const c = replay(facts, firstSatisfyingSeed(facts)).construction;
    expect(admissibleRewrites(facts, c, 2), 'three seats over a cap of two').toBeNull();
    expect(admissibleRewrites(facts, c, ADMISSIBLE_REWRITE_CAP)!.length).toBe(3);
  });

  it('a bare square (rigid, no branch, no seat) keeps its right angles — one rewrite, three identical seeds', () => {
    const facts = factsOf(['ריבוע ABCD', 'AC']);
    const pool = sharedSamples(facts);
    expect(pool.determined).toBe(true);
    expect(pool.samples.length).toBe(ADMISSIBLE_SEEDS);
    expect(canvasAngle(facts, 'B', 'A', 'C')?.valueDeg).toBeCloseTo(90, 3);
  });

  it('an under-determined figure takes the 16-seed path exactly as before, and is not "determined"', () => {
    const facts = factsOf(['משולש ABC', 'AB=AC']);
    const pool = sharedSamples(facts);
    expect(pool.determined).toBe(false);
    expect(pool.samples.length).toBeGreaterThan(ADMISSIBLE_SEEDS);
    expect(detectAll(facts).relations.definiteAngles).toEqual([]);
  });

  it('the memo carries the flag: a second consumer of the same facts re-reads the same pool', () => {
    const facts = factsOf(['ריבוע ABCD']);
    expect(sharedSamples(facts)).toBe(sharedSamples(facts));
  });
});
