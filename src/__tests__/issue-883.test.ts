/**
 * #883 — a stated magnitude that happens to EQUAL the sampled default is still a given.
 *
 * Operator, playing round #878 (T8): «מעגל» / «מעגל» / «רדיוס המעגל O הוא 5» was rejected with
 * «זה כבר קיים באיור — אין מה להוסיף», and the line never entered the fact list. The first unnamed
 * circle's default free radius is exactly 5, so the figure did not move.
 *
 * That is the honesty invariant in its stated form — *no stated magnitude is ever silently dropped* —
 * and it failed twice over: the given vanished, AND the radius stayed a free DOF, so «הציגו תצורה
 * אחרת» could resize the very circle the student had just fixed.
 *
 * The cause is not that the no-op guard uses a bad signal. It uses `dofReduced`, which is right, and
 * `freeDofCount` is right too — it counts freedom UP TO SIMILARITY, so two circles read 2 and a lone
 * circle reads 0 (its radius IS the gauge). The FIRST absolute magnitude removes no similarity DOF, so
 * the count cannot see it. `scalePinned` is the question that can, and it already existed (ADR-237).
 *
 * So this locks the CLASS — any first absolute magnitude, not the radius that was reported.
 */
import { describe, expect, it } from 'vitest';
import { factsOf, ctxOf } from './scenario-pipeline';
import { parse } from '@/parser';
import { replay } from '@/store/geoStore';
import { dryRunOutcome } from '@/replay/core';

const TWO_CIRCLES = ['מעגל', 'מעגל'];
/** What the submit path decides about a line: `produced` false ⇒ «already drawn» and the given is lost. */
const outcomeOf = (prefix: string[], line: string) => {
  const facts = factsOf(prefix);
  const r = parse(line, ctxOf(facts));
  expect(r.ok, `«${line}» must parse`).toBe(true);
  return r.ok ? dryRunOutcome(facts, r.commands, 0) : null;
};

describe('#883 — a given equal to the default still commits', () => {
  it('the default that made this reachable: the first unnamed circle IS radius 5', () => {
    // if this ever changes, the reported case stops being the colliding one — but the class remains
    expect(replay(factsOf(TWO_CIRCLES), 0).circles.get('circle-O')!.r).toBeCloseTo(5, 6);
  });

  it('«רדיוס המעגל O הוא 5» — the reported line — is PRODUCED, not «already drawn»', () => {
    expect(outcomeOf(TWO_CIRCLES, 'רדיוס המעגל O הוא 5')).toEqual({ produced: true });
  });

  it('…and a non-colliding value is unchanged', () => {
    expect(outcomeOf(TWO_CIRCLES, 'רדיוס המעגל O הוא 7')).toEqual({ produced: true });
  });

  it('the radius then HOLDS at every seed — the freedom is really gone', () => {
    const facts = factsOf([...TWO_CIRCLES, 'רדיוס המעגל O הוא 5']);
    for (let seed = 0; seed <= 40; seed++) {
      expect(replay(facts, seed).circles.get('circle-O')!.r, `seed ${seed}`).toBeCloseTo(5, 6);
    }
  });

  it('the CLASS, not the instance: a first LENGTH equal to its default commits too', () => {
    // the same shape one measure over — a triangle side stated at whatever it already drew
    const base = ['משולש ABC'];
    const drawn = replay(factsOf(base), 0);
    const A = drawn.positions.get('A')!;
    const B = drawn.positions.get('B')!;
    const len = Math.round(Math.hypot(A.x - B.x, A.y - B.y) * 100) / 100;
    expect(outcomeOf(base, `AB=${len}`), `AB=${len} is the drawn length`).toEqual({ produced: true });
  });

  it('a genuinely VACUOUS restatement is still «already drawn» — the guard is not gutted', () => {
    // re-declaring a shape that exists adds nothing and pins no scale
    expect(outcomeOf(['משולש ABC'], 'משולש ABC')).toEqual({ produced: false, reason: 'empty' });
  });

  it('and a SECOND magnitude, with the scale already pinned, still goes by the geometry', () => {
    // scale is pinned by the first; this one must be judged on whether it changes anything
    expect(outcomeOf([...TWO_CIRCLES, 'רדיוס המעגל O הוא 5'], 'רדיוס המעגל O הוא 5')).toEqual({
      produced: false,
      reason: 'empty',
    });
  });
});
