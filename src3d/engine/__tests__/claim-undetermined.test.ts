/**
 * #909 — a claim the givens leave FREE is UNDETERMINED, not refuted.
 *
 * `verifyClaim` answers a yes/no question, and yes/no cannot separate "the givens forbid this" from
 * "the givens leave this free". Collapsing them tells a student who states a correct claim before
 * pinning the figure that they are wrong — for entering a problem line by line, which is the defining
 * interaction of every builder in this suite.
 *
 * This is a CLASS fix, not a fourth special case. `store3.ts` already carried three narrow versions of
 * exactly this argument — #508 (a free plane), #552 (a free line), #512 (a sampled placement) — each
 * naming one carrier. #508's own comment states the principle: *"Reporting `claim-refuted` there is a
 * false accusation."* Those three still run first, because naming the responsible object is a better
 * message; `claimVerdict` is the rule beneath them, so a carrier nobody has special-cased degrades
 * honestly instead of accusing.
 *
 * The load-bearing test is the first one. The rest pin the boundaries the fix must not move: a
 * genuinely false claim must still refute, and a forced claim must still verify — otherwise this
 * "fix" would have bought honesty by making the tool useless as a checker.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../apply';
import { claimVerdict, verifyClaim } from '../claims';
import { emptyConstruction3, type Command3, type Construction3 } from '../types';

function build(cmds: Command3[]): Construction3 {
  let c = emptyConstruction3();
  for (const cmd of cmds) {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(`apply failed: ${JSON.stringify(r.error)}`);
    c = r.next;
  }
  return c;
}

/** A cube of stated size: everything about its shape is forced, so every seed resolves the same. */
const DETERMINED: Command3[] = [
  { type: 'solid', kind: 'box', ids: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
  { type: 'set-dim', solid: 'ABCDEFGH', dim: 'a', value: 2 },
  { type: 'set-dim', solid: 'ABCDEFGH', dim: 'b', value: 2 },
  { type: 'set-dim', solid: 'ABCDEFGH', dim: 'c', value: 2 },
];

/** The same box with its height UNSTATED — an unstated dimension is a free, resampled DOF (ADR-052). */
const FREE_HEIGHT: Command3[] = [
  { type: 'solid', kind: 'box', ids: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
  { type: 'set-dim', solid: 'ABCDEFGH', dim: 'a', value: 2 },
  { type: 'set-dim', solid: 'ABCDEFGH', dim: 'b', value: 2 },
];

describe('#909 — the three-valued verdict', () => {
  it('a claim about an UNSTATED dimension is undetermined, not refuted', () => {
    const c = build(FREE_HEIGHT);
    // |AE| is the box's height, and nothing has stated it. Some sampled configurations make it 3,
    // others do not — so the student's answer is unanswered, never wrong.
    const v = claimVerdict({ type: 'length-eq', a: 'A', b: 'E', value: 3 }, c, 0);
    expect(
      v,
      'a claim resting on freedom the student has not pinned must not come back "refuted" — that ' +
        'tells them their correct answer is wrong because they had not finished entering the question',
    ).toBe('undetermined');
  });

  it('a claim the givens FORBID still refutes — the checker still checks', () => {
    const c = build(DETERMINED);
    expect(claimVerdict({ type: 'length-eq', a: 'A', b: 'B', value: 7 }, c, 0)).toBe('refuted');
  });

  it('a claim the givens FORCE still verifies', () => {
    const c = build(DETERMINED);
    expect(claimVerdict({ type: 'length-eq', a: 'A', b: 'B', value: 2 }, c, 0)).toBe('verified');
  });

  it('verifyClaim keeps its old meaning — "verified" and nothing else is true', () => {
    const determined = build(DETERMINED);
    const free = build(FREE_HEIGHT);
    const forced = { type: 'length-eq', a: 'A', b: 'B', value: 2 } as const;
    const undecided = { type: 'length-eq', a: 'A', b: 'E', value: 3 } as const;
    expect(verifyClaim(forced, determined, 0)).toBe(true);
    // The old boolean cannot tell this case from a refutation. That is the defect, stated: it is why
    // the store now asks claimVerdict instead, and why this assertion documents rather than blesses it.
    expect(verifyClaim(undecided, free, 0)).toBe(false);
    expect(claimVerdict(undecided, free, 0)).not.toBe('refuted');
  });
});
