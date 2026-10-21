/**
 * #2237 ([ADR-742](../../../docs/06-decisions.md#adr-742) Am. 1, [ADR-476](../../../docs/06-decisions.md#adr-476) Am. 1) —
 * THE SAMPLER STAYS INSIDE THE FEASIBLE SET OF A ONE-CARRIER TANGENCY, AND A REGION SEAT IS CONFIRMED ON THE FIGURE
 * IT MAKES.
 *
 * ADR-742 made the newer circle's own radius the only carrier of a free-radius tangency, so the OLDER circle's free
 * radius is no longer consumed and `applySeed` samples it (0.45×–1.6×) independently of the spun, jittered centres.
 * Measured on the ADR-742 tip (97f6364a, 24 seeds): a sampled radius ≥ the centre gap d left the carrier d − r ≤ 0,
 * and the figure failed to build («not determined: M coincides with its constructed target») at seeds 6 and 21 of
 * «שני מעגלים משיקים מבחוץ», 22 of «מעגל O» · «מעגל P משיק למעגל O», 17 and 22 of the stated pair, and 9 and 14 of the
 * #556 figure — none on `main` @ 37800b85. The cure is a clause of ADR-476's precondition clamp, derived from the
 * device's own geometry (external ⇒ the other radius < d; the inner circle carrying an internal one ⇒ the outer
 * radius > d).
 *
 * The same commit's second half: in the #556 figure plus «ישר ADB», the collinearity is carried by the circle O2's
 * centre, so re-seating the apex B outside O2 re-solved O2 back beside B (|BO2| ≈ 1.004·r) and the view was
 * discarded — 4 of seeds 0–7 met the bar (main: 6). The region seat now confirms its move on the re-solved figure.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { meetsRequirements, replay } from '@/replay/core';
import { applySeed } from '@/engine';
import type { Construction, GeoObject } from '@/engine';

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const errorSeeds = (seq: string[]): number[] => {
  const facts = factsOf(seq);
  return SEEDS.filter((s) => replay(facts, s).lastError !== null);
};

const EXTERNAL: string[][] = [
  ['שני מעגלים משיקים מבחוץ'],
  ['שני מעגלים משיקים'],
  ['מעגל O', 'מעגל P משיק למעגל O'],
  ['מעגל O', 'מעגל P', 'המעגלים O ו-P משיקים מבחוץ'],
  ['מעגל O', 'מעגל P', 'מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P'],
];
const INTERNAL: string[][] = [
  ['שני מעגלים משיקים מבפנים'],
  ['מעגל O', 'מעגל P משיק למעגל O מבפנים'],
  ['מעגל O', 'מעגל P', 'המעגלים O ו-P משיקים מבפנים'],
];
const FIG_556 = ['שני מעגלים משיקים מבחוץ', 'A על מעגל O1', 'מנקודה B יוצאים שני משיקים למעגל O2 בנקודות D ו C'];

describe('#2237 — a one-carrier tangency builds at every sampled seed (24-seed sweep, docs/17 §9)', () => {
  for (const seq of [...EXTERNAL, ...INTERNAL])
    it(`«${seq.join('» · «')}»: no seed 0–23 fails to build`, () => {
      expect(errorSeeds(seq)).toEqual([]);
    }, 120_000);

  it('the #556 figure: no seed 0–23 fails to build (ADR-742 tip: 9, 14)', () => {
    expect(errorSeeds(FIG_556)).toEqual([]);
  }, 120_000);
});

describe('#2237 — the clamp clause is derived from the device, and a no-op on a feasible sample', () => {
  const circ = (c: Construction, id: string) => c.objects.find((o) => o.id === id) as Extract<GeoObject, { kind: 'circle' }>;
  const pt = (c: Construction, id: string) => c.objects.find((o) => o.id === id) as Extract<GeoObject, { kind: 'free-point' }>;

  it('external: the uncarried free radius is sampled strictly below the centre gap, at every seed', () => {
    const c = replay(factsOf(['מעגל O', 'מעגל P משיק למעגל O']), 0).construction;
    expect((circ(c, 'circle-P') as { solve?: unknown }).solve, 'the newer P carries the tangency').toBeDefined();
    expect((circ(c, 'circle-O') as { solve?: unknown }).solve, 'the older O carries nothing').toBeUndefined();
    for (const s of SEEDS.slice(1)) {
      const sc = applySeed(c, s);
      const o = circ(sc, 'circle-O');
      const d = Math.hypot(pt(sc, 'O').x - pt(sc, 'P').x, pt(sc, 'O').y - pt(sc, 'P').y);
      expect(o.radius.via === 'free' && o.radius.value, `seed ${s}`).toBeLessThanOrEqual(0.95 * d + 1e-9);
    }
  });

  it('a feasible sample is left untouched (the clamp only bounds; it never re-centres a good draw)', () => {
    const c = replay(factsOf(['מעגל O', 'מעגל P משיק למעגל O']), 0).construction;
    let untouched = 0;
    for (const s of SEEDS.slice(1)) {
      const sc = applySeed(c, s);
      const d = Math.hypot(pt(sc, 'O').x - pt(sc, 'P').x, pt(sc, 'O').y - pt(sc, 'P').y);
      const v = (circ(sc, 'circle-O').radius as { value: number }).value;
      if (v < 0.95 * d - 1e-9) untouched++;
    }
    expect(untouched, 'most seeds are feasible as drawn').toBeGreaterThan(12);
  });

  it('the older circle never carries a sampled clamp it does not need: seed 0 is the canonical figure', () => {
    const c = replay(factsOf(['מעגל O', 'מעגל P משיק למעגל O']), 0).construction;
    expect(applySeed(c, 0)).toBe(c);
  });
});

describe('#2237 — the region seat is confirmed on the figure it makes (#556 + «ישר ADB»)', () => {
  it('seeds 0–23: at least as many views meet the bar as on main (main 18 of 24; the ADR-742 tip 15), each with B clear of O2 and D a true touch', () => {
    const facts = factsOf([...FIG_556, 'ישר ADB']);
    let meets = 0;
    for (const s of SEEDS) {
      if (!meetsRequirements(facts, s)) continue;
      meets++;
      const f = replay(facts, s);
      const O2 = f.positions.get('O2')!, B = f.positions.get('B')!, D = f.positions.get('D')!;
      const r = f.circles.get('circle-O2')!.r;
      expect(Math.hypot(B.x - O2.x, B.y - O2.y), `seed ${s}: B outside O2`).toBeGreaterThan(r * 1.02);
      expect((D.x - O2.x) * (B.x - D.x) + (D.y - O2.y) * (B.y - D.y), `seed ${s}: O2D ⟂ DB`).toBeCloseTo(0, 6);
    }
    expect(meets).toBeGreaterThanOrEqual(18);
  }, 300_000);
});
