/**
 * #566 ([ADR-445](../../docs/06-decisions.md#adr-445)) — the RIGHT-ANGLE SEAT yields, and an
 * exhausted config search is never silent.
 *
 * Operator (2026-08-13, prod-reachable): «משולש ישר זווית ABC» + «משולש ABC חסום במעגל» +
 * «קשת AB = קשת BC» collapsed C onto A at EVERY seed with every status green. With the right angle
 * defaulted at C (the last id), AB is a diameter, so the arc equality is satisfiable only
 * degenerately; at the seat B the real isosceles figure exists — but nothing searched that
 * dimension. This file replays the EXACT utterance sequence through the real parse path (factsOf),
 * then asserts the search rescue — the lock lives at this layer because the fix lives in
 * `findValidConfig`, below the app's autoResolve, which the scenario harness's plain replay does
 * not run (recorded in the ADR).
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from './scenarios-harness';
import { findValidConfig, meetsRequirements, replay } from '@/replay/core';

const STEPS = ['משולש ישר זווית ABC', 'משולש ABC חסום במעגל', 'קשת AB = קשת BC'];

const at = (fig: ReturnType<typeof replay>, id: string) => {
  const p = fig.positions.get(id);
  if (!p) throw new Error(`no position for ${id}`);
  return p;
};
const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);

describe('#566 — the unstated right-angle seat yields to a later constraint (ADR-052)', () => {
  it('the prod sequence: findValidConfig flips the seat to B and every requirement holds', () => {
    const facts = factsOf(STEPS);
    // the defect precondition, locked so the test keeps meaning: the DEFAULT seat admits no valid view
    expect(meetsRequirements(facts, 0), 'default seat: collapsed view (the bug precondition)').toBe(false);
    const found = findValidConfig(facts, 0);
    expect(found, 'a real configuration exists at another seat — must be found').not.toBeNull();
    const fig = replay(found!.facts, found!.seed);
    const [A, B, C] = ['A', 'B', 'C'].map((id) => at(fig, id));
    const span = Math.max(d(A, B), d(B, C), d(A, C));
    // no collapse: all three vertices genuinely distinct
    expect(d(A, C) / span, '|AC| is a real side, not a collapse').toBeGreaterThan(0.1);
    expect(d(A, B) / span).toBeGreaterThan(0.1);
    expect(d(B, C) / span).toBeGreaterThan(0.1);
    // the right angle moved to B — the only seat where the arc equality has a non-degenerate solution
    const dot = (B.x - A.x) * (B.x - C.x) + (B.y - A.y) * (B.y - C.y);
    expect(Math.abs(dot) / (d(A, B) * d(B, C)), 'right angle at B').toBeLessThan(1e-4);
    // the stated given genuinely drives: equal arcs ⇒ equal chords
    expect(Math.abs(d(A, B) - d(B, C)) / span, 'equal arcs ⇒ |AB| = |BC|').toBeLessThan(1e-4);
    // and the chosen view passes the full requirement bar (distinctness included)
    expect(meetsRequirements(found!.facts, found!.seed)).toBe(true);
  });

  it('an EXPLICITLY pinned seat is never flipped — the honest outcome is an exhausted search', () => {
    // «זווית ACB = 90» pins the seat at C (the ADR-163 channel); the arc equality is then genuinely
    // satisfiable only degenerately, and the search must NOT undo the student's own statement.
    const facts = factsOf(['משולש ישר זווית ABC', 'זווית ACB = 90', 'משולש ABC חסום במעגל', 'קשת AB = קשת BC']);
    const found = findValidConfig(facts, 0);
    if (found) {
      // if anything was found it must NOT be a seat flip — C keeps the right angle
      const fig = replay(found.facts, found.seed);
      const [A, B, C] = ['A', 'B', 'C'].map((id) => at(fig, id));
      const dot = (C.x - A.x) * (C.x - B.x) + (C.y - A.y) * (C.y - B.y);
      expect(Math.abs(dot) / (d(A, C) * d(B, C)), 'the pinned right angle stays at C').toBeLessThan(1e-3);
    } else {
      // exhausted — the App surfaces figure.noValidConfig (the #566 silent-green fix's second half)
      expect(found).toBeNull();
    }
  });

  it('no behaviour change when the default seat is fine: the figure without the arc given', () => {
    const facts = factsOf(['משולש ישר זווית ABC', 'משולש ABC חסום במעגל']);
    expect(meetsRequirements(facts, 0), 'nothing to search — the default view is valid').toBe(true);
  });

  it("the operator's EXACT round-#561 play sequence (two circles, ADR-443 binds): rescued, not collapsed", () => {
    // The full play-sheet figure — circumcircle + incircle + tangent-at-B — reaches the same latent
    // defect through the #546 anonymous-reference binds; the seat rescue must hold there too.
    const facts = factsOf([
      'משולש ישר זווית ABC',
      'משולש ABC חסום במעגל',
      'מעגל חסום במשולש ABC',
      'משיק למעגל בנקודה B',
      'קשת AB = קשת BC',
    ]);
    const found = findValidConfig(facts, 0);
    expect(found, 'a real configuration exists at the seat B — must be found').not.toBeNull();
    const fig = replay(found!.facts, found!.seed);
    const [A, B, C] = ['A', 'B', 'C'].map((id) => at(fig, id));
    const span = Math.max(d(A, B), d(B, C), d(A, C));
    expect(d(A, C) / span, 'no collapse').toBeGreaterThan(0.1);
    const dot = (B.x - A.x) * (B.x - C.x) + (B.y - A.y) * (B.y - C.y);
    expect(Math.abs(dot) / (d(A, B) * d(B, C)), 'right angle at B').toBeLessThan(1e-4);
    expect(Math.abs(d(A, B) - d(B, C)) / span, 'equal arcs ⇒ |AB| = |BC|').toBeLessThan(1e-4);
    expect(meetsRequirements(found!.facts, found!.seed)).toBe(true);
  });
});
