/**
 * #443 (ADR-479) — THE CONVEXITY DEFAULT REACHES THE SHAPES DECLARED THROUGH A MACRO.
 *
 * `polygonsConvex` enforces "every declared polygon draws convex unless the student said otherwise" —
 * its own doc says so — by iterating facts whose `cmd.type` is in `POLYGON_SHAPES`. A named shape
 * declared through a MACRO (kite, isosceles, iso-trapezoid, midsegment — ADR-138; every inscribed shape
 * — ADR-262) is a `shape-variant` / `inscribe` fact that becomes a polygon only at replay, so the guard
 * never saw its ring and the guarantee silently held for «מרובע ABCD» and not for «דלתון ABCD».
 *
 * Measured at HEAD before the fix: the bare kite draws CONCAVE — a dart — at 4 of the first 200 seeds,
 * and `polygonsConvex` returned `true` on a hand-built dart over its own ring while returning `false`
 * for the identical ring declared directly. Both halves are locked here: the guard SEES the ring, and
 * the requirement machinery therefore stops accepting those configurations.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { meetsRequirements, polygonsConvex, replay, ringConvexityProofs, ringOrderContradiction } from '../../store/geoStore';
import type { Id, Vec } from '../../engine';

/** A hand-built DART over A,B,C,D — concave whatever the figure's own sample happens to be. */
const DART = new Map<Id, Vec>([
  ['A', { x: 0, y: 0 }],
  ['B', { x: 4, y: 2 }],
  ['C', { x: 1, y: 0.2 }],
  ['D', { x: 4, y: -2 }],
]);
const inscribedDart = () => new Map<Id, Vec>([...DART, ...(['E', 'F', 'G', 'H'] as Id[]).map((id, i) => [id, [...DART.values()][i]] as [Id, Vec])]);

/** Is the drawn ring convex? The guard's own arithmetic, written independently. */
const isConvex = (ring: Id[], pos: Map<Id, Vec>): boolean => {
  const pts = ring.map((id) => pos.get(id)!);
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const o = pts[i], a = pts[(i + 1) % pts.length], b = pts[(i + 2) % pts.length];
    const turn = Math.sign((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x));
    if (turn === 0) return false;
    if (sign === 0) sign = turn;
    else if (turn !== sign) return false;
  }
  return true;
};

describe('#443 — a macro-declared ring is a declared polygon', () => {
  it('the guard REJECTS a dart over a kite’s ring (it used to never see it)', () => {
    expect(polygonsConvex(factsOf(['דלתון ABCD']), DART)).toBe(false);
  });

  it('…and over an INSCRIBED shape’s ring (ADR-262, the same blindness)', () => {
    const facts = factsOf(['ריבוע ABCD', 'ריבוע EFGH חסום בריבוע ABCD']);
    expect(facts.some((f) => f.cmd.type === 'inscribe'), 'the sequence really produces an inscribe fact').toBe(true);
    expect(polygonsConvex(facts, inscribedDart())).toBe(false);
  });

  it('the directly-declared ring is unchanged — it was always guarded', () => {
    expect(polygonsConvex(factsOf(['מרובע ABCD']), DART)).toBe(false);
  });

  /**
   * The end-to-end half. Seeds 68, 71, 104 and 169 were MEASURED (#443) to draw the bare kite as a dart and
   * to pass every requirement while doing it; the fix made them fail the requirement, which kept the
   * resampler and the config search from offering them. Since #2797 (ADR-816) the driven solver's convex
   * pass no longer falls through to the relaxed pass at those seeds — its LM rescue rung finds the convex
   * kite there — so they now draw CONVEX and meet the requirements (measured: with the rung off they are
   * still the four darts, rejected). The invariant is locked over the whole range instead: no seed in
   * 0..199 is a dart that meets the requirements, and the four former darts are convex kites.
   */
  it('no seed draws a dart that meets the requirements; the measured darts now draw convex (ADR-816)', () => {
    const facts = factsOf(['דלתון ABCD']);
    for (let seed = 0; seed < 200; seed++) {
      if (!meetsRequirements(facts, seed)) continue;
      expect(isConvex(['A', 'B', 'C', 'D'], replay(facts, seed).positions), `seed ${seed} meets the requirements, so it is convex`).toBe(true);
    }
    for (const seed of [68, 71, 104, 169]) {
      expect(isConvex(['A', 'B', 'C', 'D'], replay(facts, seed).positions), `seed ${seed}, a measured dart before ADR-816`).toBe(true);
      expect(meetsRequirements(facts, seed)).toBe(true);
    }
  }, 300_000);

  it('a seed that draws convex still meets them', () => {
    const facts = factsOf(['דלתון ABCD']);
    expect(isConvex(['A', 'B', 'C', 'D'], replay(facts, 0).positions)).toBe(true);
    expect(meetsRequirements(facts, 0)).toBe(true);
  });

  /**
   * #441's exemption must survive the widening: a ring the student STATED concave is exempt from the
   * default — otherwise the requirement would be unsatisfiable and the dart the student asked for could
   * never draw. It is now reachable for a macro ring too, which it was not before (the guard did not
   * see the ring at all, so the exemption was moot there).
   */
  it('a kite stated CONCAVE is exempt — the student’s statement wins', () => {
    expect(polygonsConvex(factsOf(['דלתון קעור ABCD']), DART)).toBe(true);
  });

  it('a triangle-shaped macro is untouched (nothing to be concave about)', () => {
    const facts = factsOf(['משולש שווה שוקיים ABC']);
    expect(meetsRequirements(facts, 0)).toBe(true);
  });
});

/**
 * #2813 (ADR-823, operator ruling 2026-11-10 (b): a stated polygon angle is always the INTERIOR angle). The view floor
 * never seats a stated corner as the reflex corner of a dent, on a ring held only to simplicity; and the stated interior
 * angles that leave no room for a reflex corner — Σ ≥ (n − 3)·180° — prove the ring is in convex position.
 */
describe('#2813 — a stated corner angle is the interior angle', () => {
  const twoOrders = ['מרובע ABCD', 'מרובע ABDC'];

  it('the dart with its stated corner reflex fails the floor; with the stated corner convex it passes', () => {
    // DART is reflex at C (ring ABCD); ABCD and ABDC both yield to simplicity, so the dart passed before #2813
    expect(polygonsConvex(factsOf(twoOrders), DART), 'no stated angle: the dart is a view').toBe(true);
    expect(polygonsConvex(factsOf([...twoOrders, 'זווית DAB = 70']), DART), 'A is stated, and A turns with the ring').toBe(true);
    expect(polygonsConvex(factsOf([...twoOrders, 'זווית BCD = 110']), DART), 'C is stated, and C is the dent').toBe(false);
    expect(polygonsConvex(factsOf([...twoOrders, 'BC מאונך ל-CD']), DART), 'a stated right angle at C reads the same').toBe(false);
  });

  it('the proof: stated interior angles summing to (n − 3)·180° or more, equality included, at n = 4, 5, 6', () => {
    const proved = (lines: string[]) => ringConvexityProofs(factsOf(lines)).map((p) => p.ring.join(''));
    expect(proved(['מרובע ABCD', 'זווית DAB = 70', 'זווית BCD = 110'])).toEqual(['ABCD']);
    expect(proved(['מרובע ABCD', 'זווית DAB = 70', 'זווית BCD = 100']), '170° leaves room for a dent at B or D').toEqual([]);
    expect(proved(['מרובע ABCD', 'זווית ABD = 70', 'זווית BCD = 110']), 'a diagonal angle is not a corner').toEqual([]);
    expect(proved(['מחומש ABCDE', 'זווית EAB = 120', 'זווית ABC = 120', 'זווית BCD = 120'])).toEqual(['ABCDE']);
    expect(proved(['מחומש ABCDE', 'זווית EAB = 120', 'זווית ABC = 120', 'זווית BCD = 119'])).toEqual([]);
    expect(proved(['משושה ABCDEF', 'זווית FAB = 135', 'זווית ABC = 135', 'זווית BCD = 135', 'זווית CDE = 135'])).toEqual(['ABCDEF']);
    expect(proved(['משושה ABCDEF', 'AB = 4', 'זווית ABC = 120', 'זווית BCD = 120', 'זווית CDE = 120', 'זווית DEF = 120'])).toEqual([]);
  });

  it('ringOrderContradiction blames the line that completes it, in every order, and never an unrelated line', () => {
    const prior = (lines: string[]) => factsOf(lines);
    const cmds = (line: string, before: string[]) => factsOf([...before, line]).slice(prior(before).length).map((f) => f.cmd);
    const hit = (before: string[], line: string) => ringOrderContradiction(prior(before), cmds(line, before));
    const angles = ['זווית DAB = 70', 'זווית BCD = 110'];
    expect(hit(['מרובע ABCD', ...angles], 'מרובע ABDC')).toMatchObject({ ring: ['A', 'B', 'C', 'D'], other: ['A', 'B', 'D', 'C'] });
    expect(hit(['מרובע ABCD', 'מרובע ABDC', angles[0]], angles[1])?.proof.facts.length).toBe(2);
    expect(hit(['מרובע ABDC', ...angles], 'מרובע ABCD'), 'the proved ring declared last').not.toBeNull();
    expect(hit(['מרובע ABCD', 'מרובע ABDC', ...angles], 'AB = 5'), 'a saved contradiction is never blamed on an unrelated line').toBeNull();
    expect(hit(['מרובע ABCD', 'זווית DAB = 70', 'זווית BCD = 100'], 'מרובע ABDC'), 'no proof, no structural refusal').toBeNull();
  });
});
