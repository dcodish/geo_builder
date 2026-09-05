/**
 * #912 — THE ADR-052 DOF-HONESTY AUDIT, ANSWERED BY MEASUREMENT AND THEN MADE PERMANENT.
 *
 * The invariant ([ADR-052](docs/06-decisions.md#adr-052)): *every unstated magnitude is a free degree of
 * freedom, never a fixed value.* CLAUDE.md names the conformance smell exactly — **a value counted by
 * `rawMovableDof` but absent from the samplable `freeDofs` is a default masquerading as fixed**: it
 * inflates the DOF cue, it is never sampled, and "show another configuration" silently cannot move it.
 *
 * The audit swept the whole scenario corpus (318 scenarios, every one replayed through the real
 * parse → fact → replay path) asking whether any figure claims freedom the sampler cannot deliver:
 *
 *     scenarios replayed: 318 / 318
 *     cue > 0 with nothing samplable:  0
 *
 * **The set is complete.** That is the result, and a confirmation is a real result — it turns an
 * assumption into a checked fact. The one the backlog flagged to double-check, a circle's free CENTRE
 * (drivable since ADR-103 — but samplable?), is asserted below: it is.
 *
 * The audit itself does not stay a claim in a doc. `dofHonesty` in `scenarios-harness.ts` now runs the
 * figure-level invariant on EVERY scenario in the corpus, co-located with the other oracles at no replay
 * cost — so a future carrier kind that is counted and not sampled fails the suite instead of waiting for
 * someone to read the code again.
 *
 * Objects counted by `rawMovableDof` and absent from `freeDofs` DO occur (measured over the corpus:
 * on-circle 113, circle 22, on-segment 22, perp-offset 19, scaled-offset 5, on-line 2, rotated 1) — in
 * every case because a constraint CONSUMED that carrier, which `freeDofCount` subtracts through
 * `dofRemoved`. That is the design, not the smell; see the note on `dofHonesty` for why the invariant is
 * stated at the figure level rather than per object.
 */

import { describe, expect, it } from 'vitest';
import { run } from '../../__tests__/scenarios-corpus';
import { freeDofs, freeDofCount } from '@/engine';

describe("#912 — a circle's free CENTRE is samplable, not just drivable", () => {
  it('a bare circle: the centre AND the free radius are both in the samplable set', () => {
    const { construction: c } = run(['מעגל שמרכזו O']);
    const sampled = new Set(freeDofs(c));
    expect([...sampled].includes('O'), 'the free centre is sampled').toBe(true);
    const circle = c.objects.find((o) => o.kind === 'circle')!;
    expect(sampled.has(circle.id), 'the free radius is sampled (ADR-051)').toBe(true);
  });

  it('a STATED radius removes the radius from the samplable set — and only the radius', () => {
    const { construction: c } = run(['מעגל שמרכזו O ורדיוסו 5']);
    const sampled = new Set(freeDofs(c));
    expect(sampled.has('O'), 'the centre is still free — the student stated a size, not a place').toBe(true);
    const circle = c.objects.find((o) => o.kind === 'circle')!;
    expect(sampled.has(circle.id), 'the stated radius is no longer a free DOF').toBe(false);
  });

  it('a point put ON the circle joins the samplable set as its own parametric DOF', () => {
    const { construction: c } = run(['מעגל O', 'A על המעגל']);
    expect(new Set(freeDofs(c)).has('A')).toBe(true);
  });
});

describe('#912 — the invariant the corpus sweep confirmed', () => {
  /** Figures spanning the carrier families: free point, on-circle, on-segment, on-line, shape scalar. */
  const FIGURES: [string, string[]][] = [
    ['a bare triangle', ['משולש ABC']],
    ['a circle with a point on it', ['מעגל O', 'A על המעגל']],
    ['a point on a segment', ['משולש ABC', 'D על AB']],
    ['a square', ['ריבוע ABCD']],
    ['a triangle with one stated side', ['משולש ABC', 'AB = 6']],
    ['a triangle with a stated angle', ['משולש ABC', 'זוית A ישרה']],
    ['an inscribed quad', ['מעגל O', 'מרובע ABCD חסום במעגל']],
  ];

  for (const [name, steps] of FIGURES) {
    it(`${name}: freedom the cue CLAIMS is freedom the sampler HAS`, () => {
      const { construction: c } = run(steps);
      const cue = freeDofCount(c);
      if (cue > 0)
        expect(
          freeDofs(c).length,
          `the cue reports ${cue} free DOF but nothing is samplable — an unstated magnitude would be asserted as a given`,
        ).toBeGreaterThan(0);
      // …and the converse is NOT asserted: a samplable DOF on a cue-0 figure is the similarity gauge
      // (place/rotate/scale), which is deliberately sampled and deliberately not counted as knowledge.
    });
  }
});
