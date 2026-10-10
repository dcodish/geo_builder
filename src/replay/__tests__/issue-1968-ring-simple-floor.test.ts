/**
 * #1968 ([ADR-616](../../../docs/06-decisions.md#adr-616)) — A DECLARED RING IS NEVER OFFERED SELF-CROSSING.
 *
 * Measured on `main` @ e0f4260c through `firstSatisfyingSeed` + `searchAnotherView` (the press):
 * «מתומן ABCDEFGH חסום במעגל» drew the octagon CROSSED at 6 of 24 presses; the default view was simple.
 *
 * Root cause: `declaredRings` (ADR-472, #443) read a top-level `polygon` as "an arbitrary ring, which may
 * legitimately be concave" and exempted it from the requirement WHOLE — so the exemption bought the crossed
 * ring along with the concave one. Operator ruling 2026-10-10, option B: *"A crossed ring is not a drawing of
 * the shape under any reading, while a concave one may be exactly what the student wants."* The top-level ring
 * now carries the SIMPLE floor — the stated-concave branch's own `ringSimple` test (#441).
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { firstSatisfyingSeed, meetsRequirements, polygonsConvex, replay, type Fact } from '../../store/geoStore';
import { searchAnotherView } from '../core';
import { ringSimple, type AnyCommand, type Id, type Vec } from '../../engine';

const fact = (cmd: AnyCommand, i = 0): Fact => ({ id: `f${i}`, utterance: 'x', group: `g${i}`, cmd, enabled: true });
const pos = (pts: [Id, number, number][]) => new Map<Id, Vec>(pts.map(([id, x, y]) => [id, { x, y }]));

/** A convex pentagon, the same five points in a crossed order (a pentagram), and a simple concave one. */
const CONVEX = pos([['A', 0, 0], ['B', 4, 0], ['C', 5, 3], ['D', 2, 5], ['E', -1, 3]]);
const CONCAVE = pos([['A', 0, 0], ['B', 4, 0], ['C', 2, 1], ['D', 2, 5], ['E', -1, 3]]);
const PENTA = ['A', 'B', 'C', 'D', 'E'];
const STAR = ['A', 'C', 'E', 'B', 'D'];

describe('#1968 — the predicate: a top-level polygon may not cross', () => {
  it('a crossed top-level ring fails the view requirement (it used to pass: the ring was never read)', () => {
    expect(ringSimple(STAR.map((id) => CONVEX.get(id)!))).toBe(false);
    expect(polygonsConvex([fact({ type: 'polygon', ids: STAR })], CONVEX)).toBe(false);
  });

  it('the same points in ring order pass', () => {
    expect(polygonsConvex([fact({ type: 'polygon', ids: PENTA })], CONVEX)).toBe(true);
  });

  it('a stated-concave named shape keeps exactly #441’s exemption: the dart passes, the crossed ring does not', () => {
    const DART = pos([['A', 0, 0], ['B', 4, 2], ['C', 1, 0.2], ['D', 4, -2]]);
    const quad = fact({ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] });
    const concave = fact({ type: 'set-polygon-convexity', ids: ['A', 'B', 'C', 'D'], convex: false }, 1);
    expect(polygonsConvex([quad], DART), 'unstated: convex by default').toBe(false);
    expect(polygonsConvex([quad, concave], DART), 'stated concave: the dart is legal').toBe(true);
    const TANGLED = pos([['A', 0, 0], ['B', 4, 4], ['C', 4, 0], ['D', 0, 4]]);
    expect(polygonsConvex([quad, concave], TANGLED), 'stated concave never buys a crossing').toBe(false);
  });

  it('the CONCAVE ring is not this item’s question: the floor is simplicity, not convexity', () => {
    expect(ringSimple(PENTA.map((id) => CONCAVE.get(id)!))).toBe(true);
    expect(polygonsConvex([fact({ type: 'polygon', ids: PENTA })], CONCAVE)).toBe(true);
  });
});

describe('#1968 — the operator’s sequence: «מתומן ABCDEFGH חסום במעגל» and the button', () => {
  const ids = 'ABCDEFGH'.split('');
  it('the default and every one of 24 presses is a simple octagon that meets the givens', () => {
    const facts = factsOf(['מתומן ABCDEFGH חסום במעגל']);
    let cur = { facts, seed: firstSatisfyingSeed(facts) };
    expect(ringSimple(ids.map((id) => replay(cur.facts, cur.seed).positions.get(id)!)), 'default').toBe(true);
    let pressed = 0;
    for (let k = 0; k < 24; k++) {
      const next = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
      if (!next) break;
      cur = next;
      pressed++;
      expect(meetsRequirements(cur.facts, cur.seed)).toBe(true);
      expect(ringSimple(ids.map((id) => replay(cur.facts, cur.seed).positions.get(id)!)), `press ${k + 1} (seed ${cur.seed})`).toBe(true);
    }
    expect(pressed, 'the button still offers other views — the free angles stay free (ADR-052)').toBe(24);
  });

  it('the class at the other arities: «משושה ABCDEF חסום במעגל» and the bare «מתומן ABCDEFGH» are never offered crossed', () => {
    for (const [line, n] of [['משושה ABCDEF חסום במעגל', 6], ['מתומן ABCDEFGH', 8]] as [string, number][]) {
      const ring = 'ABCDEFGH'.slice(0, n).split('');
      const facts = factsOf([line]);
      let cur = { facts, seed: firstSatisfyingSeed(facts) };
      for (let k = 0; k < 24; k++) {
        expect(ringSimple(ring.map((id) => replay(cur.facts, cur.seed).positions.get(id)!)), `«${line}» view ${k}`).toBe(true);
        const next = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
        if (!next) break;
        cur = next;
      }
    }
  });

  it('the pentagram over a regular pentagon (ADR-608’s recorded gap) is no longer a displayable view', () => {
    // ADR-608 refuses the line at the submit door; a fold that reaches it anyway (a saved figure, a fact list
    // built past the door) now fails the view requirement instead of drawing it green.
    const facts = factsOf(['מחומש משוכלל ABCDE', 'מחומש ACEBD']);
    expect(ringSimple(STAR.map((id) => replay(facts, 0).positions.get(id)!)), 'the five points really do cross in that order').toBe(false);
    expect(meetsRequirements(facts, 0)).toBe(false);
  });
});
