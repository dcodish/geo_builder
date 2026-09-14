/**
 * #556 ([ADR-511](../../../docs/06-decisions.md#adr-511)) — a free point whose consuming construction
 * forces it into a REGION is sampled INSIDE that region, not guessed and discarded.
 *
 * The reported figure: two externally tangent circles, A on O1, two tangents from a FREE point B to O2.
 * At HEAD 9 of the first 24 seeds failed `meetsRequirements` — 7 of them because the sampler jittered B
 * into circle O2 and the Thales construction had no touch («cannot construct D: circles … do not meet»),
 * 2 because A landed on the circles' touch point M (a different, pre-existing class). The statement
 * itself forces «B outside O2» (ADR-052's lens); the secant rule already DECLARED its apex that way
 * (`point-circle-side` outside, ADR-254) while the tangent rules used a bare free point — and the sampler
 * honoured neither. Now the side record is recorded on the free point as its `region`, and `applySeed`
 * keeps every sample on that side (judged on the sampled figure's own circle, a prefix solve when the
 * full figure cannot build). One seam for the whole ADR-254 family: tangent apexes, secant apexes, a
 * student's own «M מחוץ למעגל» / «M בתוך המעגל».
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { meetsRequirements, pointsDistinct, replay } from '@/replay/core';
import { applySeed, evaluate } from '@/engine';
import type { FreePoint } from '@/engine';

const TWO_TANGENTS = ['שני מעגלים משיקים מבחוץ', 'A על מעגל O1', 'מנקודה B יוצאים שני משיקים למעגל O2 בנקודות D ו C'];
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('#556 — the reported two-tangents figure', () => {
  it('BUILDS at every seed 0–23: no seed puts the apex inside the target circle any more (was 7 of 24)', () => {
    const facts = factsOf(TWO_TANGENTS);
    for (let s = 0; s < 24; s++) {
      const f = replay(facts, s);
      expect(f.lastError, `seed ${s}`).toBeNull();
      const O2 = f.positions.get('O2')!, B = f.positions.get('B')!, r = f.circles.get('circle-O2')!.r;
      expect(dist(O2, B), `seed ${s}: B outside O2`).toBeGreaterThan(r);
    }
  }, 300_000);

  it('the seeds that still fail the requirement bar fail on a pair that is NOT the apex — the A-on-touch-point class, pre-existing', () => {
    const facts = factsOf(TWO_TANGENTS);
    const failing: number[] = [];
    for (let s = 0; s < 24; s++) {
      if (meetsRequirements(facts, s)) continue;
      failing.push(s);
      const f = replay(facts, s);
      expect(f.lastError).toBeNull();
      expect(pointsDistinct(f.construction, f.positions, f.coincidences), `seed ${s}: the only failing predicate is distinctness`).toBe(false);
      // and the apex is well clear of every other named point — the collision is elsewhere (A on M)
      const B = f.positions.get('B')!;
      for (const [id, p] of f.positions) if (id !== 'B' && !id.startsWith('~')) expect(dist(B, p), `seed ${s}: B vs ${id}`).toBeGreaterThan(1);
    }
    expect(failing.length, 'at most the two pre-existing A-on-M seeds (9 and 14 at HEAD)').toBeLessThanOrEqual(2);
  }, 300_000);

  it('«ישר ADB» keeps D a TRUE tangency point wherever the figure builds and meets its bar (the non-reproducing rider claim, asserted)', () => {
    const facts = factsOf([...TWO_TANGENTS, 'ישר ADB']);
    let checked = 0;
    for (let s = 0; s < 8; s++) {
      if (!meetsRequirements(facts, s)) continue;
      const f = replay(facts, s);
      const O2 = f.positions.get('O2')!, D = f.positions.get('D')!, C = f.positions.get('C')!, B = f.positions.get('B')!;
      expect(dist(O2, D), `seed ${s}: |O2D| = |O2C|`).toBeCloseTo(dist(O2, C), 6);
      expect((D.x - O2.x) * (B.x - D.x) + (D.y - O2.y) * (B.y - D.y), `seed ${s}: O2D ⟂ DB`).toBeCloseTo(0, 6);
      checked++;
    }
    expect(checked, 'a real sweep, not a vacuous one').toBeGreaterThanOrEqual(5);
  }, 300_000);

  it('the seed-0 drawing is untouched: the rule keeps its own apex default, the sampler never runs at seed 0', () => {
    const facts = factsOf(TWO_TANGENTS);
    const c = replay(facts, 0).construction;
    expect(applySeed(c, 0)).toBe(c);
    const B = c.objects.find((o) => o.id === 'B') as FreePoint;
    expect(B.region, 'the apex carries its declared region').toEqual([{ circle: 'circle-O2', side: 'outside' }]);
  });
});

describe('#556 — the class: every ADR-254 side record is a sampling region', () => {
  const allSeedsMeet = (seq: string[], n = 24) => {
    const facts = factsOf(seq);
    const fails: number[] = [];
    for (let s = 0; s < n; s++) if (!meetsRequirements(facts, s)) fails.push(s);
    return fails;
  };

  it('a single tangent from a new apex — no seed fails (seed 12 did)', () => {
    expect(allSeedsMeet(['מעגל O', 'מנקודה A מחוץ למעגל מעבירים משיק לנקודה D'])).toEqual([]);
  });

  it('a stated «M מחוץ למעגל» — every seed keeps M outside (seed 17 did not)', () => {
    expect(allSeedsMeet(['מעגל O', 'M מחוץ למעגל'])).toEqual([]);
  });

  it('a stated «M בתוך המעגל» — every seed keeps M inside', () => {
    expect(allSeedsMeet(['מעגל O', 'M בתוך המעגל'])).toEqual([]);
  });

  it('the secant apex, already declared before this fix, stays at no failing seed', () => {
    expect(allSeedsMeet(['מעגל O', 'מנקודה A מחוץ למעגל O ישר חותך את המעגל בנקודות C ו-B'])).toEqual([]);
  });

  it('the region is recorded ON the free point — one per circle, the latest side winning', () => {
    const facts = factsOf(['מעגל O', 'מעגל P', 'M מחוץ למעגל O', 'M בתוך מעגל P']);
    const M = replay(facts, 0).construction.objects.find((o) => o.id === 'M') as FreePoint;
    expect(M.region).toEqual([
      { circle: 'circle-O', side: 'outside' },
      { circle: 'circle-P', side: 'inside' },
    ]);
  });

  it('the sampler re-seats a wrong-side sample onto its side, and leaves a right-side sample alone', () => {
    const facts = factsOf(['מעגל O', 'M מחוץ למעגל']);
    const c = replay(facts, 0).construction;
    for (let s = 1; s < 24; s++) {
      const e = evaluate(applySeed(c, s));
      if (!e.ok) throw new Error(`seed ${s} did not evaluate`);
      const circ = e.circles.get('circle-O')!;
      expect(dist(e.positions.get('M')!, circ.center), `seed ${s}`).toBeGreaterThan(circ.r * 1.05);
    }
  });

  it('a genuinely contradicted side still refuses honestly — never a silent figure', () => {
    // «B inside» then two tangents FROM B: the tangents' own side record contradicts the student's.
    const facts = factsOf(['מעגל O', 'B בתוך המעגל', 'מנקודה B יוצאים שני משיקים למעגל בנקודות D ו C']);
    const f = replay(facts, 0);
    expect(f.lastError !== null || f.violations.length > 0, 'refused or flagged').toBe(true);
  });
});
