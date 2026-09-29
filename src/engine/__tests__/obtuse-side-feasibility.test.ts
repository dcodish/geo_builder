/**
 * #1441 — A PINNED LEG PAST THE SIDE OPPOSITE A PINNED ≥ 90° ANGLE IS A PROVEN CONTRADICTION.
 *
 * External review of prod: «משולש ישר זווית ABC · AB=3 · BC=4» took ~20 s in the recruit ladder
 * (and blew a COLD worker's 12 s search budget) proving numerically what the law of cosines proves
 * in microseconds: with the right angle at C, |AB| is the strictly longest side, so |BC| = 4 > 3
 * has no placement. The fourth metric-family member, beside ADR-417 / ADR-538 / ADR-540, with the
 * same one-way soundness. These locks CALL the prover — the same `obtuseSideImpossibility` call
 * `applyStep` makes — and then hold `applyStep` itself to the pre-ladder refusal.
 */
import { describe, expect, it } from 'vitest';
import { obtuseSideImpossibility, obtuseSideImpossibilityError } from '../metricFeasibility';
import { applyStep } from '../step';
import { lower } from '../lower';
import type { Command, Construction, Constraint, GeoObject } from '../types';
import { ctxOf, factsOf } from '../../__tests__/scenario-pipeline';
import { dryRunOutcome, replay, seatRescue } from '@/replay/core';
import { trialFacts } from '@/store/geoStore';
import { parse } from '@/parser';

const con = (arr: Constraint[]) => arr;
const D = (a: string, b: string, value: number): Constraint => ({ type: 'distance', a, b, value });
const A = (vertex: string, ray1: string, ray2: string, value: number, arcOf?: string): Constraint =>
  ({ type: 'angle', vertex, ray1, ray2, value, ...(arcOf ? { arcOf } : {}) });

describe('obtuseSideImpossibility — the members, from every pinned-angle source', () => {
  it('a stated 90° angle: the leg may not reach the hypotenuse', () => {
    const m = obtuseSideImpossibility([], con([A('C', 'A', 'B', 90), D('A', 'B', 3), D('C', 'B', 4)]));
    expect(m).not.toBeNull();
    expect(obtuseSideImpossibilityError(m!)).toBe(
      'impossible: the angle at C is 90°, so |AB| must be the longest side, but |AB| = 3 and |CB| = 4',
    );
  });

  it('a stated OBTUSE angle (120°): same law, the general wording', () => {
    const m = obtuseSideImpossibility([], con([A('B', 'A', 'C', 120), D('A', 'C', 5), D('B', 'A', 7)]));
    expect(m).not.toBeNull();
    expect(obtuseSideImpossibilityError(m!)).toBe(
      'impossible: the angle at B is 120°, so |AC| must be the longest side, but |AC| = 5 and |BA| = 7',
    );
  });

  it('a perpendicular sharing an endpoint (the ADR-223 shape) is a 90° wedge', () => {
    const perp: Constraint = { type: 'perpendicular', a: 'C', b: 'A', c: 'C', d: 'B' };
    expect(obtuseSideImpossibility([], con([perp, D('A', 'B', 3), D('C', 'B', 4)]))).not.toBeNull();
  });

  it('a structural right-triangle knee (perp-offset anchored at its own from) is a 90° wedge', () => {
    const objects: GeoObject[] = [{ kind: 'perp-offset', id: 'B', anchor: 'C', from: 'C', to: 'A', dist: 5 }];
    expect(obtuseSideImpossibility(objects, con([D('A', 'B', 3), D('C', 'B', 4)]))).not.toBeNull();
  });

  it('a FOOT is perpendicular to its line: legs from the foot may not reach the slant', () => {
    // F = foot of the perpendicular from P onto AB: ∠(P F A) = 90°, so |PA| > |FA|.
    const objects: GeoObject[] = [{ kind: 'foot', id: 'F', from: 'P', a: 'A', b: 'B' }];
    expect(obtuseSideImpossibility(objects, con([D('P', 'A', 3), D('F', 'A', 4)]))).not.toBeNull();
  });
});

describe('obtuseSideImpossibility — soundness: what must NOT fire', () => {
  it('lengths that fit are silent', () => {
    expect(obtuseSideImpossibility([], con([A('C', 'A', 'B', 90), D('A', 'B', 5), D('C', 'B', 4)]))).toBeNull();
  });

  it('equality passes (the flat/degenerate limit, the metric member’s own rule)', () => {
    expect(obtuseSideImpossibility([], con([A('C', 'A', 'B', 90), D('A', 'B', 4), D('C', 'B', 4)]))).toBeNull();
  });

  it('an ACUTE stated angle proves nothing here', () => {
    expect(obtuseSideImpossibility([], con([A('C', 'A', 'B', 60), D('A', 'B', 3), D('C', 'B', 4)]))).toBeNull();
  });

  it('a reflex value past 270° is geometrically acute again — excluded', () => {
    expect(obtuseSideImpossibility([], con([A('C', 'A', 'B', 280), D('A', 'B', 3), D('C', 'B', 4)]))).toBeNull();
  });

  it('a reflex value in (180°, 270°] still bounds — the true wedge is ≥ 90°', () => {
    expect(obtuseSideImpossibility([], con([A('C', 'A', 'B', 200), D('A', 'B', 3), D('C', 'B', 4)]))).not.toBeNull();
  });

  it('an ARC measure is not a vertex angle (the ADR-538 exclusion)', () => {
    expect(obtuseSideImpossibility([], con([A('O', 'A', 'B', 90, 'circle-O'), D('A', 'B', 3), D('O', 'B', 4)]))).toBeNull();
  });

  it('a perpendicular with NO shared endpoint pins no wedge', () => {
    const perp: Constraint = { type: 'perpendicular', a: 'A', b: 'B', c: 'C', d: 'D' };
    expect(obtuseSideImpossibility([], con([perp, D('A', 'B', 3), D('C', 'B', 4)]))).toBeNull();
  });
});

/** The figure of every line but the last, and the last line's engine commands. */
function split(steps: string[]): { prior: Construction; last: Command[] } {
  const facts = factsOf(steps as never);
  const prior = replay(facts.slice(0, -1)).construction;
  const last = lower([facts[facts.length - 1].cmd]) as Command[];
  return { prior, last };
}

describe('#1441 — the reported sequences through applyStep', () => {
  it('repro 2 (explicit seat): «זווית C = 90 · AB=3» then «BC=4» refuses BEFORE the ladder', () => {
    const { prior, last } = split(['משולש ABC', 'זווית C = 90', 'AB=3', 'BC=4']);
    let cur = prior;
    let refusal: { error: string; ladder?: string[] } | null = null;
    for (const cmd of last) {
      const r = applyStep(cur, cmd);
      if (!r.ok) {
        refusal = { error: r.error, ladder: (r as { ladder?: string[] }).ladder };
        break;
      }
      cur = r.construction;
    }
    expect(refusal, 'the impossible leg is refused').not.toBeNull();
    expect(refusal!.error).toBe(
      'impossible: the angle at C is 90°, so |AB| must be the longest side, but |AB| = 3 and |BC| = 4',
    );
    // The proof, not the ladder: `pre:impossible` is what makes the refusal instant (the ~20 s class).
    expect(refusal!.ladder).toEqual(['pre:impossible']);
  });

  it('repro 1 (default seat): the structural knee also proves fast at ITS seat — the seat search does the rescue', () => {
    const { prior, last } = split(['משולש ישר זווית ABC', 'AB=3', 'BC=4']);
    let cur = prior;
    let refusal: { error: string; ladder?: string[] } | null = null;
    for (const cmd of last) {
      const r = applyStep(cur, cmd);
      if (!r.ok) {
        refusal = { error: r.error, ladder: (r as { ladder?: string[] }).ladder };
        break;
      }
      cur = r.construction;
    }
    expect(refusal, 'at the default seat C the leg is impossible — proven, not ladder-burned').not.toBeNull();
    expect(refusal!.ladder).toEqual(['pre:impossible']);
  });

  it('control: «משולש ישר זווית ABC · AB=5 · BC=4» builds green (nothing newly refused)', () => {
    const fig = replay(factsOf(['משולש ישר זווית ABC', 'AB=5', 'BC=4'] as never));
    expect(fig.lastError).toBeNull();
  });
});

/**
 * #1441 arm 3 (ADR-551 Am. 1) — THE SEAT YIELDS AT THE GATE. The pre-ladder proof turned the
 * reviewer's figure from a 19 s PENDING into an instant error, and the submit gate then REFUSED a
 * default-seat figure the designed ADR-445 rescue admits (caught by the round-#1510 pre-played
 * sheet, case T11). The gate consults the SAME seat sweep as `findValidConfig` (one helper), so a
 * seat-curable error commits — the post-commit autoResolve lands the reseat — while a pinned seat
 * keeps its honest refusal.
 */
describe('#1441 arm 3 — the seat yields at the gate (ADR-551 Am. 1)', () => {
  const cmdsOf = (facts: ReturnType<typeof factsOf>, line: string) => {
    const p = parse(line, ctxOf(facts));
    expect(p.ok, `«${line}» parses`).toBe(true);
    return p.ok ? [...p.commands] : [];
  };

  it('default seat: «BC=4» is PRODUCED at the gate — never refused', () => {
    const facts = factsOf(['משולש ישר זווית ABC', 'AB=3'] as never);
    expect(dryRunOutcome(facts, cmdsOf(facts, 'BC=4'), 0).produced).toBe(true);
  });

  it('the shared sweep finds the reseat the autoResolve applies, stated lengths exact', () => {
    const facts = factsOf(['משולש ישר זווית ABC', 'AB=3'] as never);
    const all = trialFacts(facts, cmdsOf(facts, 'BC=4'));
    const found = seatRescue(all, Date.now() + 10_000);
    expect(found, 'a flipped seat admits the whole figure').not.toBeNull();
    const fig = replay(found!.facts, found!.seed);
    expect(fig.lastError).toBeNull();
    const p = fig.positions;
    const d = (a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);
    expect(d('A', 'B')).toBeCloseTo(3, 3);
    expect(d('B', 'C')).toBeCloseTo(4, 3);
  });

  it('an EXPLICIT seat still refuses at the gate — the sweep never flips a stated 90°', () => {
    const facts = factsOf(['משולש ABC', 'זווית C = 90', 'AB=3'] as never);
    const out = dryRunOutcome(facts, cmdsOf(facts, 'BC=4'), 0);
    expect(out.produced).toBe(false);
    expect(!out.produced && out.reason).toBe('error');
  });
});
