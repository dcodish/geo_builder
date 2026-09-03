/**
 * #281 — a satisfied ORDER given owns the RANGE, so it is enforced at every configuration.
 *
 * «משולש ABC» + «זווית ABC גדולה מ-40» refused **18 of 40** configurations on a given that holds, while
 * the STRONGER «גדולה מ-45» refused none. The weaker requirement failed more often, which is the tell.
 *
 * The default triangle has ∠ABC ≈ 42°. «> 45» is violated when typed, so the failure ladder runs and
 * puts C in charge of the angle; every later configuration re-solves through C. «> 40» is ALREADY TRUE
 * when typed, so nothing runs and nobody is in charge — later configurations reshuffle the triangle
 * freely, the angle drifts under the bar, and the given breaks with nothing able to fix it. An order
 * was therefore enforced only when it happened to be broken at the moment it was typed.
 *
 * `ensureOwnership` ([ADR-399](../../../docs/06-decisions.md#adr-399)) exists for exactly this class —
 * *"a constraint whose residual happens to be 0 at the accepted draw committed as an UNOWNED CHECK…
 * nothing re-solved per seed, and every sampled configuration violated it"* — and excluded order
 * constraints in one line.
 *
 * **Operator ruling 2026-09-03: option A — own the RANGE.** Not option B (own it like any other given),
 * which would freeze the carrier and break ADR-039/ADR-052 and is #416's complaint. The region half was
 * already built: `isOrderOnlySolve` (sample.ts) says a carrier driven ONLY by an order keeps its full
 * DOF and stays samplable, and `evaluate` re-enforces the order from each perturbed start. So lifting
 * the exclusion gives ownership, and the existing rule gives the range — which is why the fix is one
 * line and the test below is about the two halves BOTH holding.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { replay } from '../../store/geoStore';
import { freeDofCount } from '..';

/** ∠ABC at a configuration, in degrees. */
const angleAt = (seed: number, facts: ReturnType<typeof factsOf>): number | null => {
  const d = replay(facts, seed);
  if (d.positions.size === 0 || Object.values(d.status).some((v) => v !== 'ok')) return null;
  const A = d.positions.get('A')!;
  const V = d.positions.get('B')!;
  const B = d.positions.get('C')!;
  const raw = Math.atan2(A.y - V.y, A.x - V.x) - Math.atan2(B.y - V.y, B.x - V.x);
  return Math.abs((((raw * 180) / Math.PI + 540) % 360) - 180);
};
const sweep = (bound: number) => {
  const facts = factsOf(['משולש ABC', `זווית ABC גדולה מ-${bound}`]);
  const angles: number[] = [];
  let refused = 0;
  for (let seed = 0; seed < 40; seed++) {
    const a = angleAt(seed, facts);
    if (a === null) refused++;
    else angles.push(a);
  }
  return { refused, angles };
};

describe('#281 — the given holds at EVERY configuration', () => {
  it('«גדולה מ-40» refuses none (was 18 of 40)', () => {
    expect(sweep(40).refused).toBe(0);
  });

  it('and every configuration actually satisfies it', () => {
    // the bar is bound + MIN_GAP; nothing may sit below the bound itself
    expect(Math.min(...sweep(40).angles)).toBeGreaterThan(40);
  });

  it('«גדולה מ-45» is unchanged — it already recruited', () => {
    const { refused, angles } = sweep(45);
    expect(refused).toBe(0);
    expect(Math.min(...angles)).toBeGreaterThan(45);
  });
});

describe('#281 — it owns the RANGE, not the value (option A, not option B)', () => {
  it('the angle still VARIES across configurations — a frozen carrier would be option B', () => {
    const { angles } = sweep(40);
    const distinct = new Set(angles.map((a) => a.toFixed(2))).size;
    expect(distinct, 'the figure must keep visibly varying (ADR-052)').toBeGreaterThan(20);
  });

  it('…across a real spread, not a jitter', () => {
    const { angles } = sweep(40);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(10);
  });

  it('an order removes 0 DOF — the freedom cue is unchanged by adding it (ADR-039)', () => {
    const before = freeDofCount(replay(factsOf(['משולש ABC']), 0).construction);
    const after = freeDofCount(replay(factsOf(['משולש ABC', 'זווית ABC גדולה מ-40']), 0).construction);
    expect(after).toBe(before);
  });
});

describe('#281 — a later HARD given can still have the carrier', () => {
  // #416's worry: an order that holds must not claim a carrier exclusively. Ownership here is for
  // enforcement, and a hard constraint that needs the same carrier still gets its figure.
  it.each([['AB=AC'], ['זווית BAC = 50'], ['AB=6']])('«משולש ABC» + «> 40» + «%s» builds', (given) => {
    const d = replay(factsOf(['משולש ABC', 'זווית ABC גדולה מ-40', given]), 0);
    expect(Object.values(d.status).every((v) => v === 'ok'), given).toBe(true);
  });
});
