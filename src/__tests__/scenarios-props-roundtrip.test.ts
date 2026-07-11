import { describe, it, expect } from 'vitest';
import { replay, useGeoStore } from '@/store/geoStore';
import { SCENARIOS, factsOf } from './scenarios-corpus';
import type { Fact } from '@/store/geoStore';

/**
 * E7 / TST-4 — algebraic ROUND-TRIP properties over the scenario corpus (ADR-206). Store ops mutate
 * facts via JSON/string rewriting — historically the highest-density bug area (ADR-122's relabel
 * corruption; the review's S1 partial structured-id rename) — yet only example-based tests existed.
 * The ~130 real scenarios ARE the generator (no fast-check needed): for a sampled slice, assert
 *   1. swap(a,b) ∘ swap(a,b) = identity (commands AND utterances byte-equal);
 *   2. rename A→Z9 ∘ rename Z9→A = identity;
 *   3. disable-then-re-enable a fact restores the exact figure (replay is deterministic in content);
 *   4. permuting two trailing constraint-only sibling groups leaves the figure verifier-clean
 *      (ADR-104 order-independence, exercised on real corpora).
 * Sampled (not exhaustive) for suite-time: the slice is deterministic, diverse, and documented — a
 * larger sweep adds runtime, not new op shapes.
 */
describe('E7 — algebraic round-trip properties (store ops over the scenario corpus)', () => {
  const SLICE = 40; // deterministic prefix of the corpus — every op shape appears well within it
  const pointLabelsOf = (facts: Fact[]): string[] => {
    const set = new Set<string>();
    for (const f of facts)
      for (const [k, v] of Object.entries(f.cmd)) {
        if (k === 'expr' || k === 'type') continue;
        for (const e of Array.isArray(v) ? v : [v]) if (typeof e === 'string' && /^[A-Z]\d*$/.test(e)) set.add(e);
      }
    return [...set];
  };
  const store = () => useGeoStore.getState();
  const snapshot = (facts: Fact[]) => JSON.stringify(facts.map((f) => ({ cmd: f.cmd, utterance: f.utterance, enabled: f.enabled })));

  it('swap∘swap and rename∘rename⁻¹ are identities on every sampled scenario', () => {
    const skipped: string[] = [];
    let swapped = 0;
    let renamed = 0;
    for (const sc of SCENARIOS.slice(0, SLICE)) {
      const facts = factsOf(sc.steps);
      const labels = pointLabelsOf(facts);
      if (labels.length < 2) {
        skipped.push(sc.id);
        continue;
      }
      const [a, b] = labels;
      const before = snapshot(facts);
      // swap∘swap
      useGeoStore.setState({ facts });
      if (store().swap(a, b).ok) {
        store().swap(a, b);
        expect(snapshot(store().facts), `[${sc.id}] swap(${a},${b}) twice must be the identity`).toBe(before);
        swapped++;
      }
      // rename there-and-back (Z9 is never a scenario label)
      useGeoStore.setState({ facts });
      if (store().rename(a, 'Z9').ok) {
        expect(store().rename('Z9', a).ok).toBe(true);
        expect(snapshot(store().facts), `[${sc.id}] rename ${a}→Z9→${a} must be the identity`).toBe(before);
        renamed++;
      }
      useGeoStore.getState().clear();
    }
    // No silent caps: the properties must have actually exercised a healthy slice.
    expect(swapped).toBeGreaterThan(SLICE / 2);
    expect(renamed).toBeGreaterThan(SLICE / 2);
  });

  it('disable-then-re-enable restores the exact figure (deterministic replay, toggle round-trip)', () => {
    for (const sc of SCENARIOS.slice(0, 12)) {
      const facts = factsOf(sc.steps);
      if (facts.length < 2) continue;
      const before = replay(facts, 0);
      useGeoStore.setState({ facts, seed: 0 });
      const target = store().facts[store().facts.length - 1];
      store().toggle(target.id);
      store().toggle(target.id);
      const after = replay(store().facts, 0);
      expect(after.lastError, `[${sc.id}] re-enable must restore a clean build`).toBe(before.lastError);
      for (const [id, p] of before.positions) {
        const q = after.positions.get(id);
        expect(q, `[${sc.id}] ${id} exists after the round-trip`).toBeTruthy();
        expect(Math.hypot(p.x - q!.x, p.y - q!.y), `[${sc.id}] ${id} restored`).toBeLessThan(1e-9);
      }
      useGeoStore.getState().clear();
    }
  });

  it('permuting two trailing constraint-only groups keeps the figure verifier-clean (ADR-104)', () => {
    let exercised = 0;
    const CAP = 8; // enough distinct figures to make the property real; each costs two replays
    const isConstraintOnly = (f: Fact) => f.cmd.type.startsWith('set-');
    // Scan the WHOLE corpus for qualifying tails (they're sparse — most scenarios end in a check or a
    // construct), capped so suite time stays bounded. Non-qualifying scenarios skip before any replay.
    for (const sc of SCENARIOS) {
      if (exercised >= CAP) break;
      if (sc.expectViolations) continue; // a documented-amber scenario has no clean baseline to preserve
      let facts: Fact[];
      try {
        facts = factsOf(sc.steps);
      } catch {
        continue; // a scenario whose steps need its own harness quirks — not this property's concern
      }
      const n = facts.length;
      if (n < 3) continue;
      // the last two facts must be constraint-only AND from different groups (swapping inside a group is a no-op)
      const [x, y] = [facts[n - 2], facts[n - 1]];
      if (!isConstraintOnly(x) || !isConstraintOnly(y) || x.group === y.group) continue;
      const base = replay(facts, 0);
      if (base.lastError !== null || base.violations.length) continue; // only meaningful on a clean baseline
      const permuted = [...facts.slice(0, n - 2), y, x];
      const fig = replay(permuted, 0);
      expect(fig.lastError, `[${sc.id}] trailing-constraint order must not matter`).toBeNull();
      expect(fig.violations, `[${sc.id}] permuted figure stays verifier-clean`).toEqual([]);
      exercised++;
    }
    // The corpus genuinely contains such scenarios; if this hits zero the property silently died.
    expect(exercised).toBeGreaterThan(0);
  });
});
