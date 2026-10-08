/**
 * #1692 (ADR-3D-305) — THE 3-D PRE-LLM SUBMIT DECISION, in one pure function.
 *
 * What the App does with a typed line before it would pay for a model call. Three steps, in App3's order:
 *
 *   1. `decideSubmit3` (the store's decision, #1394): rewrites, the #1666 proof-target refusal, the
 *      grammar with its #866 one-angle repair, the typed refusals, the honesty gates, twins, the
 *      candidate derive and the configuration search;
 *   2. on `not-understood` only, the #353 lowercase-label nudge — PROOF-BASED: the upper-cased
 *      candidate must itself parse, so a genuine gap stays a genuine gap;
 *   3. then the ADR-3D-040 guidance register (`classifyGuidance3`).
 *
 * Anything left is `not-understood`, the one verdict the App escalates to the LLM lane.
 *
 * Why this exists: `/log-triage` used to answer "is this still a gap?" by copying those steps by hand
 * (`session3d` called `parse3`, then the two registers). #1666 put its refusal in the store, the copy
 * never saw it, and «הוכיחו כי AB ⊥ AC» was reported as a LIVE gap while the App answered it on
 * purpose — the #35 / #243 / #829 class, where the mirror re-implements the decision instead of calling
 * it. App3 now DISPATCHES this verdict and the triage replay (`triageReplay3.ts`) CALLS it, so a step
 * added here reaches both the day it is written. Pure over `(facts, seed, raw)`: it sets nothing.
 */

import { parse3 } from '../parser/parse3';
import { classifyGuidance3, upperCasedLabelCandidate3, type ScopeMatch3 } from '../parser/scope3';
import { decideSubmit3, type StoreError3, type Fact3, type Verdict3 } from '../store/store3';
import type { EngineError3 } from '../engine/types';

export type DeterministicVerdict3 =
  | Verdict3
  /** The line is answered on purpose with a note and never reaches the model. `tag` is what the App logs. */
  | { readonly kind: 'guided'; readonly register: 'lowercase-labels'; readonly corrected: string; readonly tag: 'scope:lowercase-labels' }
  | { readonly kind: 'guided'; readonly register: 'scope'; readonly match: ScopeMatch3; readonly tag: string };

export function decideDeterministic3(
  st: { facts: Fact3[]; seed: number },
  raw: string,
  newId?: () => string,
): DeterministicVerdict3 {
  const v = decideSubmit3(st, raw, newId);
  if (v.kind !== 'not-understood') return v;
  const upper = upperCasedLabelCandidate3(raw);
  if (upper && parse3(upper).ok) return { kind: 'guided', register: 'lowercase-labels', corrected: upper, tag: 'scope:lowercase-labels' };
  const g = classifyGuidance3(raw);
  if (g) return { kind: 'guided', register: 'scope', match: g, tag: `scope:${g.category}` };
  return v;
}

/**
 * How a REFUSED line reads to the operator — the 3-D twin of 2-D's `Verdict2D.category`, which
 * `/log-triage` sorts by. `guided`: the product answers it on purpose (a pointer, never a gap);
 * `clarify`: it asks the student which one they meant; `refused`: a reasoned refusal, kept for review.
 *
 * A Record over every STORE-level code, so a new typed refusal cannot be added without deciding here
 * (the compiler says so). Engine statuses are all `refused`: they are about the figure, not the sentence.
 */
export type RefusalCategory3 = 'guided' | 'clarify' | 'refused';
type StoreOwnCode3 = Exclude<NonNullable<StoreError3>, EngineError3>['code'];
const STORE_CATEGORY3: Record<StoreOwnCode3, RefusalCategory3> = {
  'proof-target': 'guided', // #1666: what the student must PROVE, answered with the pointer (2-D's `scope:proof`)
  'ambiguous-vector-length': 'clarify',
  'param-roles-conflated': 'clarify',
  'ambiguous-main-diagonal': 'clarify',
  'ambiguous-angle-vertex': 'clarify',
  'not-understood': 'refused', // never a `refused` verdict — `decideSubmit3` returns it as its own kind
  'component-symbolic': 'refused', // recognised, not yet supported (#1547) — kept visible for review
  'inscribed-contradicts-noun': 'refused', // #1792: the #1554 ruling — the sentence contradicts itself
  'dropped-given': 'refused',
  'split-statements': 'guided', // #1888: a lost part — answered with the one-input-per-line pointer (2-D's `scope:split-statements`)
  'right-angle-vertex': 'guided', // #1888: the right-angle-at-vertex syntax, taught the two lines that build it
  'dependents-broken': 'refused',
  'rename-refused': 'refused',
  'swap-refused': 'refused',
  'bad-file': 'refused',
  'newer-schema': 'refused',
  'too-large': 'refused',
};

export function refusalCategory3(error: NonNullable<StoreError3>): RefusalCategory3 {
  return (STORE_CATEGORY3 as Record<string, RefusalCategory3>)[error.code] ?? 'refused';
}
