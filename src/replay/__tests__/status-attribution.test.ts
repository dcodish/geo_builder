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
 * The reproduction figure is #150's (bagrut Q27 — two chords through E, the small circle on diameter EO,
 * given EF=EG): the driven equality converges at seed 0 and diverges at most other seeds, which is
 * exactly the fold-ok / tail-broken split this defect lives in. Diagnosing #150 with `status` as the
 * instrument produced a wrong "64/64 converged" reading — the measurement trap this fix closes.
 */

import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenarios-harness';
import { meetsRequirements, replay } from '@/store/geoStore';

const Q27_CHORDS = [
  'מעגל O',
  'AB מיתר',
  'CD מיתר',
  'AB ו CD נחתכים בנקודה E',
  'P אמצע EO',
  'קוטר מעגל P הוא EO',
  'מעגל P חותך את AB בנקודה F',
  'מעגל P חותך את DC בנקודה G',
  'EF=EG',
];

describe('#360 — a per-seed evaluate failure is attributed to its owning fact row', () => {
  const facts = factsOf(Q27_CHORDS);
  const eqFact = facts.find((f) => f.cmd.type === 'set-equal')!;

  it('the reproduction still has both kinds of seed (guards against the test going vacuous)', () => {
    const kinds = new Set([0, 1, 2, 3].map((s) => (replay(facts, s).lastError === null ? 'clean' : 'broken')));
    expect(kinds).toEqual(new Set(['clean', 'broken']));
  });

  it('AGREEMENT: whenever lastError reports the failed equality, the EF=EG row carries it — and only that row', () => {
    for (const seed of [0, 1, 2, 3]) {
      const fig = replay(facts, seed);
      if (fig.lastError === null) {
        // a clean seed: every row ok, nothing over-attributed
        for (const f of facts) if (f.enabled) expect(fig.status[f.id], `seed ${seed}, "${f.utterance}"`).toBe('ok');
      } else {
        expect(fig.lastError).toContain('|EF| = |EG|');
        // the owning row carries the SAME error string the banner shows (the taste ruling)
        expect(fig.status[eqFact.id], `seed ${seed}: the set-equal row must not read green under a red banner`).toBe(fig.lastError);
        // …and attribution is PRECISE — no blanket reddening of innocent rows
        for (const f of facts) {
          if (f.enabled && f.id !== eqFact.id) expect(fig.status[f.id], `seed ${seed}, "${f.utterance}" is innocent`).toBe('ok');
        }
      }
    }
  });

  it('the ADR-397 displayability clause now does real work: a broken seed fails the every-fact-ok test itself', () => {
    for (const seed of [0, 1, 2, 3]) {
      const fig = replay(facts, seed);
      const allOk = facts.every((f) => !f.enabled || fig.status[f.id] === 'ok');
      // the headline #360 invariant: the two channels agree
      expect(allOk, `seed ${seed}: status and lastError must agree`).toBe(fig.lastError === null);
      if (!allOk) expect(meetsRequirements(facts, seed), `seed ${seed} must not be displayable`).toBe(false);
    }
  });
});
