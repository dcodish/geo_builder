/**
 * #1235 — THE CROSSING MODULE JUDGES DEGENERACY RELATIVELY, NOT WITH ABSOLUTE THRESHOLDS.
 *
 * Two defects, one sentence: *a crossing is offered for a pair of objects that do not cross, because
 * the degeneracy tests are written as absolute thresholds on quantities that carry the figure's scale,
 * so they never fire.*
 *
 * **Defect 1 — `meet()`'s guard.** `|det| < 1e-12` on the raw determinant, which scales with both
 * lines' coefficient magnitudes. Measured on a figure where a segment and a stated line were the same
 * line to solver tolerance: `det = -2.07e-7`, five orders of magnitude above the guard, while the
 * normalised value — the sine of the angle between them — was `-6.65e-8`, an angle of 3.8e-6 degrees.
 * The guard's own comment said it was there to catch "parallel, or the same line". It did not.
 *
 * **Defect 2 — two answers to one question.** The straight×straight loop deduped against existing
 * points with a hard-coded `1e-6` while the straight×conic loop four lines below used `apart()`, the
 * relative tolerance #1113 was filed to introduce. A ring offered on top of a point that already has a
 * letter is how a second and third name reach one location.
 *
 * ## Why this became reachable rather than staying a curiosity
 *
 * Before the 2026-09-19 ruling (ADR-AG-111) a student could not deliberately hold both a segment and
 * its infinite line. Now «משוואת הצלע CE …» then «משוואת הישר CE …» is an ordinary two-line sequence —
 * and it is exactly the near-zero-determinant pair. The operator met it on his first pass through the
 * feature, pressed the offered rings, and the tool wrote
 * «P נקודת החיתוך של הישר CE עם הישר CE» into his givens list.
 *
 * ## What is deliberately NOT here
 *
 * The same sentence **TYPED** by the student is [#1255](https://github.com/dcodish/geo_builder/issues/1255),
 * which is `needs-operator`: refuse it, or read it as «P על הישר AB»? That is a question about what the
 * sentence MEANS, not about a threshold, and it is not this issue's to settle. The split is clean — the
 * tool must never AUTHOR a meaningless given on the student's behalf (here), and what to do when they
 * write one themselves is the open ruling (there).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { crossingsOf } from '../engine/crossings';

const ringsOf = (lines: readonly string[], seed = 0) => {
  const d = derive(lines, seed);
  return crossingsOf(d.figure, d.construction);
};

describe('#1235 — a line and its own segment offer NO ring', () => {
  /** The deliberate pair ADR-AG-111 made ordinary, and the one the operator actually hit. */
  const TWIN = ['A(0,0)', 'B(6,2)', 'C(1,5)', 'D(5,-1)', 'הקטע AB', 'משוואת הישר AB היא y=x/3'];

  it.each([0, 1, 2, 3])('seed %i offers no self-crossing', (seed) => {
    const rings = ringsOf(TWIN, seed);
    expect(rings.filter((r) => r.first === r.second)).toEqual([]);
  });

  /**
   * And the property that matters more than the count: **no ring the tool offers may name one object
   * twice.** Asserted over the whole offer list rather than as a ring count, so a later change that
   * adds legitimate rings cannot make this vacuous.
   */
  it('no offered ring anywhere names the same object on both sides', () => {
    for (let seed = 0; seed < 8; seed += 1) {
      for (const r of ringsOf(TWIN, seed)) expect(r.first).not.toBe(r.second);
    }
  });
});

/**
 * THE NEGATIVE CONTROL, which is what keeps the fix from being "offer nothing". A genuine crossing
 * still offers its ring, and still names both carriers.
 */
describe('#1235 — genuine crossings are untouched', () => {
  it('two segments that really cross still offer exactly one ring', () => {
    const rings = ringsOf(['A(0,0)', 'B(6,2)', 'C(1,5)', 'D(5,-1)', 'הקטע AB', 'הקטע CD']);
    expect(rings).toHaveLength(1);
    expect(rings[0].first).not.toBe(rings[0].second);
  });

  /**
   * THE ANGULAR TABLE — the ring disappears AT the tolerance and not before. Each row is one pair of
   * lines through the origin at a known angle; the sine of that angle is what `meet()` now judges, so
   * the rows step across `CROSS_MIN_SINE = 1e-6` from both sides.
   *
   * They sit an order of magnitude either side of the bar rather than ON it. A row at exactly 1e-6 is
   * decided by the last bit of the coefficient normalisation, so it would lock floating-point rounding
   * rather than the decision — and the claim here is that the bar exists and works, not where its
   * final ulp falls.
   */
  it.each([
    ['1 degree apart', 'y=0.017455x', true],
    ['0.001 degree apart', 'y=0.0000174533x', true],
    ['5.7e-4 degrees — an order above the bar', 'y=0.00001x', true],
    ['5.7e-6 degrees — an order below it', 'y=0.0000001x', false],
    ['the same line', 'y=0x', false],
  ])('%s: a ring is offered = %s', (_name, second, expected) => {
    const rings = ringsOf(['נתון הישר y=0x', `נתון הישר ${second}`]);
    expect(rings.length > 0).toBe(expected);
  });
});

/**
 * DEFECT 2 — one occupancy question, one answer.
 *
 * The gap between the two tolerances is where the bug lived: on a figure spanning 6, the old absolute
 * `1e-6` was six times tighter than `apart()`. A point placed inside that gap was invisible to the
 * straight loop and visible to the conic loop — the same figure answered two ways.
 */
describe('#1235 — a crossing that already has a letter offers no ring', () => {
  /**
   * `E` sits 3e-6 from where `AB` and `CD` cross, on a figure spanning 6 — inside the old `1e-6`
   * guard's blind spot and inside `apart()` (6e-6). The precondition is asserted first, so the row
   * cannot quietly become a test of something else if the fixture drifts.
   */
  const OCCUPIED = ['A(0,0)', 'B(6,6)', 'C(0,6)', 'D(6,0)', 'E(3.000003,3)', 'הקטע AB', 'הקטע CD'];

  it('the fixture really is in the old guard’s blind spot', () => {
    const d = derive(OCCUPIED);
    const e = d.figure.points.find((p) => p.id === 'E')!;
    const gap = Math.hypot(e.x - 3, e.y - 3);
    expect(gap).toBeGreaterThan(1e-6); // the old absolute guard would have missed it
    expect(gap).toBeLessThan(6 * 1e-6); // and apart() catches it
  });

  it('no ring is offered on top of it', () => {
    expect(ringsOf(OCCUPIED)).toEqual([]);
  });

  it('but move the point away and the ring comes back', () => {
    const free = ['A(0,0)', 'B(6,6)', 'C(0,6)', 'D(6,0)', 'E(1,5)', 'הקטע AB', 'הקטע CD'];
    expect(ringsOf(free)).toHaveLength(1);
  });
});
