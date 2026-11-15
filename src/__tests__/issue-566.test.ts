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
import { cyclableSeat, findValidConfig, meetsRequirements, replay, searchAnotherView } from '@/replay/core';

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
    // #569 (ADR-481): TIGHTENED from "either outcome is acceptable" to the refusal path outright.
    // This accepted both a found-but-unflipped config and an exhausted search, so a green here proved
    // nothing about which one actually happened — and #569's whole question was which one does.
    // Measured at HEAD before the change and again after: null both times. The honest outcome is the
    // exhausted search, and the App surfaces `figure.noValidConfig` for it (#566's second half).
    expect(found, 'a pinned impossible seat must EXHAUST, never draw a near-collapse').toBeNull();
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

/**
 * #569 half 2 (ADR-481) — the SEAT is a cyclable configuration.
 *
 * «הציגו תצורה אחרת» cycled branch and variant; the right-angle seat was not among its dimensions, so
 * no number of presses could move the angle off the default vertex. findValidConfig COULD move it, but
 * that is a post-commit repair the student never asked for — ADR-052 says an unstated choice must be
 * reachable ON PURPOSE. Measured before the change: rot stayed 0 and the angle stayed at C at every
 * press.
 */
describe('#569 — «הציגו תצורה אחרת» reaches the right-angle seat (ADR-481)', () => {
  const seatOf = (facts: Parameters<typeof replay>[0], seed: number): string => {
    const fig = replay(facts, seed);
    const [A, B, C] = ['A', 'B', 'C'].map((id) => at(fig, id));
    const cos = (P: typeof A, Q: typeof A, R: typeof A) =>
      Math.abs(((Q.x - P.x) * (R.x - P.x) + (Q.y - P.y) * (R.y - P.y)) / (d(P, Q) * d(P, R)));
    const at3: [string, number][] = [['A', cos(A, B, C)], ['B', cos(B, A, C)], ['C', cos(C, A, B)]];
    return at3.reduce((m, x) => (x[1] < m[1] ? x : m))[0];
  };

  it('a resample cycle reaches a seat OTHER than the default', () => {
    const facts = factsOf(['משולש ישר זווית ABC', 'משולש ABC חסום במעגל']);
    expect(seatOf(facts, 0), 'the default seat is the last id').toBe('C');
    const seen = new Set<string>([seatOf(facts, 0)]);
    let cur: { facts: typeof facts; seed: number } = { facts, seed: 0 };
    for (let i = 0; i < 4; i++) {
      const next = searchAnotherView(cur.facts, cur.seed);
      if (!next) break;
      seen.add(seatOf(next.facts, next.seed));
      cur = next;
    }
    // Before ADR-481 this set was {C} however many times it was pressed.
    expect([...seen].sort().join(''), 'the student can reach another seat deliberately').not.toBe('C');
  });

  it('the BUTTON can reach it: `cyclableSeat` is the predicate App and the search share', () => {
    // The half-2 bug found by driving the real UI: the search learned the seat while the App's
    // `canCycle` still asked only about branch/variant/free-DOFs, so on a DETERMINED right-triangle
    // figure — exactly where the seat is the only choice left — «הציגו תצורה אחרת» stayed DISABLED and
    // the new dimension was unreachable. One exported predicate, both callers, so it cannot drift.
    const open = factsOf(['משולש ישר זווית ABC', 'משולש ABC חסום במעגל']);
    expect(cyclableSeat(open), 'an unstated seat is cyclable — the button must enable').toBeDefined();

    const pinned = factsOf(['משולש ישר זווית ABC', 'זווית ACB = 90', 'משולש ABC חסום במעגל']);
    expect(cyclableSeat(pinned), 'a seat the student stated is NOT a free choice').toBeUndefined();
  });

  it('a seat the student PINNED is never cycled out from under them', () => {
    const facts = factsOf(['משולש ישר זווית ABC', 'זווית ACB = 90', 'משולש ABC חסום במעגל']);
    let cur: { facts: typeof facts; seed: number } = { facts, seed: 0 };
    for (let i = 0; i < 4; i++) {
      const next = searchAnotherView(cur.facts, cur.seed);
      if (!next) break;
      expect(seatOf(next.facts, next.seed), `press ${i}: the pinned seat holds`).toBe('C');
      cur = next;
    }
  });
});
