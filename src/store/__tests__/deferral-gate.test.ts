/**
 * The submit deferral gate (issue #207, ADR-385): a cleanly-parsed constraint that FAILED against the
 * current figure commits for ADR-104 deferral ONLY when the failure is genuinely pending (the relation
 * still flexes — later givens can drive it). A CONCLUDED contradiction — the quarter circle whose
 * |OC|=|OD| is structurally impossible with D on the far leg — must take the honest-refusal route,
 * never park as «waiting for givens». `deferralWorthwhile` IS the replay classifier's gate
 * (`hasDeferrableConstraint` + `constraintIsPending`), exported so App.submit and `classify` can
 * never diverge (the ADR-346 shared-seam discipline).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, deferralWorthwhile, firstSatisfyingSeed } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const ctxOf = (facts: Fact[]) => {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
};
const factsOf = (steps: string[]): Fact[] => {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const r = parse(step, ctxOf(facts));
    if (!r.ok) throw new Error(`step did not parse: ${step}`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd, enabled: true });
  }
  return facts;
};
const lastCmds = (facts: Fact[], utterance: string): AnyCommand[] => {
  const r = parse(utterance, ctxOf(facts));
  if (!r.ok) throw new Error(`no parse: ${utterance}`);
  return r.commands as AnyCommand[];
};

describe('deferralWorthwhile (#207, ADR-385)', () => {
  it('the infeasible quarter circle (D on the LEG) is NOT deferral-worthy — the honest refusal route', () => {
    const prefix = factsOf(['ABC משולש ישר זוית', 'AC=15', 'BC=10', 'O על AC', 'D על CB']);
    expect(deferralWorthwhile(prefix, lastCmds(prefix, 'רבע מעגל ODC'))).toBe(false);
  });

  it('an early ⟂ typed before its pinning givens IS deferral-worthy (the ADR-104 bet stays)', () => {
    const prefix = factsOf(['שני מעגלים נחתכים בנקודות A ו-B', 'C על המעגל הראשון', 'E על המעגל השני']);
    expect(deferralWorthwhile(prefix, lastCmds(prefix, 'CE אנך ל AB'))).toBe(true);
  });

  it('a command group with no relation constraint at all is never deferral-worthy', () => {
    const prefix = factsOf(['AB']);
    expect(deferralWorthwhile(prefix, lastCmds(prefix, 'CD'))).toBe(false);
  });

  it('the feasible twin — D on the HYPOTENUSE — still builds to the closed form r = 6', () => {
    const facts = factsOf(['ABC משולש ישר זוית', 'AC=15', 'BC=10', 'O על AC', 'D על AB', 'רבע מעגל ODC']);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status ${id}`).toBe('ok');
    const P = (id: string) => fig.positions.get(id)!;
    expect(Math.hypot(P('O').x - P('C').x, P('O').y - P('C').y)).toBeCloseTo(6, 1);
  });
});
