/**
 * Issue #360 (ADR-398) — `status` and `lastError` must AGREE about the same step.
 *
 * `status` comes from the seed-independent fold (`statusByIndex` — what keeps the ADR-280 memo sound);
 * the per-seed `evaluate` failure had no per-fact home, so a seed where a stated given could not hold
 * showed EVERY row green while the error banner said the opposite. App.tsx's own contract ("the step
 * list and the error banner must tell the truth about what just happened") was betrayed by the data:
 * `status` only ever answered "did this step APPLY at fold time", never "does it HOLD at this seed".
 *
 * The fix: the fold records ownership (constraintKey → fact index, object id → fact index) as it
 * commits; `evaluate` returns the violated constraints / stuck objects structurally alongside its error
 * string; and the per-seed tail overrides the owning rows' statuses — the fold's memoized statusByIndex
 * is never touched, so ADR-280's caching is preserved. The overridden row shows the SAME error string a
 * fold-time failure would (the operator's taste ruling): to the student, "this given cannot hold in the
 * configuration being attempted" reads identically in both cases.
 *
 * REPRODUCTION HISTORY: the original lock used #150's Q27 chords figure (fold-ok / tail-broken on 63/64
 * seeds). ADR-399 (ownership at accept) + ADR-400 (the tail's warm-start basin retry) HEALED that figure
 * — it now evaluates at every seed, which this file's vacuous-guard correctly refused to ignore. The
 * lock now uses a figure whose per-seed failure survives both mechanisms BY CONSTRUCTION: a square with
 * E on AB and |CE| = 5.2 — feasible at the default side (5.2 ∈ [s, s√2]), but the sampled sides at some
 * seeds push 5.2 outside E's reachable range, and a 1-D bounded root that does not exist cannot be
 * rescued by any retry start. That is exactly the honest fold-ok / tail-broken split ADR-398 attributes.
 */

import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenarios-harness';
import { meetsRequirements, replay } from '@/store/geoStore';

const SQUARE_CE = ['ריבוע ABCD', 'נקודה E על AB', 'CE=5.2'];

describe('#360 — a per-seed evaluate failure is attributed to its owning fact row', () => {
  const facts = factsOf(SQUARE_CE);
  const eFact = facts.find((f) => f.cmd.type === 'point-on-segment')!;
  const squareFact = facts.find((f) => f.cmd.type === 'square')!;

  it('the reproduction still has both kinds of seed (guards against the test going vacuous)', () => {
    const kinds = new Set([0, 1, 2, 3, 4].map((s) => (replay(facts, s).lastError === null ? 'clean' : 'broken')));
    expect(kinds).toEqual(new Set(['clean', 'broken']));
  });

  it('AGREEMENT: whenever lastError reports the unplaceable point, its row carries it — and only its row', () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const fig = replay(facts, seed);
      if (fig.lastError === null) {
        // a clean seed: every row ok, nothing over-attributed
        for (const f of facts) if (f.enabled) expect(fig.status[f.id], `seed ${seed}, "${f.utterance}"`).toBe('ok');
      } else {
        expect(fig.lastError).toContain('cannot place E');
        // the owning row carries the SAME error string the banner shows (the taste ruling)
        expect(fig.status[eFact.id], `seed ${seed}: E's row must not read green under a red banner`).toBe(fig.lastError);
        // …and attribution is PRECISE — the untouched shape rows stay green
        expect(fig.status[squareFact.id], `seed ${seed}: the square is innocent`).toBe('ok');
        const red = facts.filter((f) => f.enabled && fig.status[f.id] !== 'ok');
        expect(red.length, `seed ${seed}: no blanket reddening`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('the ADR-397 displayability clause does real work: a broken seed fails the every-fact-ok test itself', () => {
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const fig = replay(facts, seed);
      const allOk = facts.every((f) => !f.enabled || fig.status[f.id] === 'ok');
      // the headline #360 invariant: the two channels agree
      expect(allOk, `seed ${seed}: status and lastError must agree`).toBe(fig.lastError === null);
      if (!allOk) expect(meetsRequirements(facts, seed), `seed ${seed} must not be displayable`).toBe(false);
    }
  });
});
