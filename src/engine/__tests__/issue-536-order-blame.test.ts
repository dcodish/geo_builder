/**
 * #536 — blame honesty for an infeasible stated ORDER.
 *
 * «ישר ABE» over a square's midpoint E (E = mid(AB), so the stated "B between A and E" cannot hold)
 * lowers to a collinear triple that HOLDS structurally plus a `collinear-order` that cannot. The refusal
 * used to blame the collinear member — «A, B, E collinear cannot hold» — accusing a relation that is
 * satisfied and misdirecting the student; `describeNewStatement`'s single-member shortcut never
 * consulted `violated`. When every violated NEW member is an order, the refusal now names the ORDER.
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

function build(steps: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const { construction, positions } = replay(facts);
    const r = parse(step, buildParseCtx(construction, positions));
    expect(r.ok, `step should parse: ${step}`).toBe(true);
    if (!r.ok) continue;
    const group = `g${g++}`;
    for (const cmd of r.commands)
      facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd: cmd as AnyCommand, enabled: true });
  }
  return replay(facts);
}

describe('an infeasible stated order is refused naming the ORDER, not a member that holds (#536)', () => {
  it('«ישר ABE» with E = mid(AB): the refusal names the order statement', () => {
    const fig = build(['ריבוע ABCD', 'E אמצע AB', 'ישר ABE']);
    const statuses = Object.values(fig.status);
    const refusal = statuses.find((s) => typeof s === 'string' && s.startsWith('over-constrained'));
    expect(refusal, 'the impossible order must refuse, not draw').toBeTruthy();
    expect(refusal).toContain('in order on a line');
    expect(refusal).not.toContain('collinear cannot hold');
  });

  it('the feasible mirror «ישר AEB» builds green (the order machinery itself is untouched)', () => {
    const fig = build(['ריבוע ABCD', 'E אמצע AB', 'ישר AEB']);
    for (const [id, st] of Object.entries(fig.status)) expect(st, `step ${id}`).toBe('ok');
  });
});
