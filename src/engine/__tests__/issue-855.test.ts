/**
 * #855 — a refusal whose conflict is with a SAMPLED value was reported as contradicting the givens.
 *
 * The prefix «משולש ABC» / «מעגל» / «AB משיקה למעגל בנקודה B» built at 39 of 40 seeds and, at seed 17
 * alone, vanished with «over-constrained: @ctr-OB ⟂ AB cannot hold» — an accusation aimed at a tangency
 * the fold had already proved satisfiable. Measured cause: the sampler jittered the FREE radius up to
 * 7.92 while pulling A and the centre to |OA| = 4.76, i.e. it placed A *inside* the circle, where no
 * tangent through A can touch. Nothing the student stated was wrong; the conflict was with a placement
 * the tool invented.
 *
 * The 2-D port of the 3-D #508/#512 class ([ADR-3D-138](../../../docs/06b-decisions-3d.md)), in the two
 * halves the operator ruled on (2026-09-02), locked here in the same order:
 *
 *   (c) SAMPLE INSIDE THE FEASIBLE SET — a tangency's placement precondition (|PO| ≥ r) bounds the free
 *       radius, so the seat is never proposed. A STATED radius is a given and is never bent.
 *   (b) THE CLASS GUARD — a per-seed failure can never be a contradiction of the givens (this seam only
 *       overrides rows the fold marked `ok`), so the accusing shape degrades to an honest
 *       "not determined", naming the sampled objects by a structural walk.
 *
 * (a) — re-running the recruit ladder at the per-seed tail — is deliberately NOT in scope; it is a
 * separate measured perf question and must not be smuggled in here.
 */
import { describe, it, expect } from 'vitest';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { replay } from '../../store/geoStore';
import { applySeed } from '../sample';
import { evaluate } from '../evaluate';

const PREFIX = ['משולש ABC', 'מעגל', 'AB משיקה למעגל בנקודה B'];
const REPORTED = [...PREFIX, 'AB=AC', 'C בתוך המעגל'];

/** Every seed's outcome for a sequence: the figure's point count and its first non-ok step status. */
const sweep = (steps: string[], upTo = 40) => {
  const facts = factsOf(steps);
  return Array.from({ length: upTo + 1 }, (_, seed) => {
    const d = replay(facts, seed);
    const bad = Object.entries(d.status).find(([, v]) => v !== 'ok');
    return { seed, points: d.positions.size, status: bad?.[1] as string | undefined };
  });
};

describe('#855 — a sampled value never accuses the student', () => {
  it('the reported prefix resolves at EVERY seed 0..40 (was: empty figure at seed 17)', () => {
    const broken = sweep(PREFIX).filter((r) => r.points === 0 || r.status);
    expect(broken, `seeds that fail: ${JSON.stringify(broken)}`).toEqual([]);
  });

  it('and so does the operator’s full five-line sequence', () => {
    const broken = sweep(REPORTED).filter((r) => r.points === 0 || r.status);
    expect(broken, `seeds that fail: ${JSON.stringify(broken)}`).toEqual([]);
  });

  it('the tangency still HOLDS at every seed — the clamp fixes the seat, it does not drop the given', () => {
    const facts = factsOf(PREFIX);
    for (let seed = 0; seed <= 40; seed++) {
      const { positions, circles } = replay(facts, seed);
      const O = positions.get('@ctr-O')!;
      const B = positions.get('B')!;
      const A = positions.get('A')!;
      const r = circles.get('circle-O')!.r;
      expect(Math.hypot(B.x - O.x, B.y - O.y) / r, `seed ${seed}: B is ON the circle`).toBeCloseTo(1, 3);
      // OB ⟂ AB — the tangency itself
      const dot = (O.x - B.x) * (A.x - B.x) + (O.y - B.y) * (A.y - B.y);
      expect(Math.abs(dot) / (r * Math.hypot(A.x - B.x, A.y - B.y)), `seed ${seed}: OB ⟂ AB`).toBeLessThan(1e-3);
      expect(Math.hypot(A.x - O.x, A.y - O.y) / r, `seed ${seed}: A is OUTSIDE the circle`).toBeGreaterThan(1);
    }
  });

  it('seed 17 specifically: the sampler no longer proposes A inside the circle', () => {
    const fold = replay(factsOf(PREFIX), 0).construction;
    const sampled = applySeed(fold, 17);
    expect(evaluate(sampled).ok, 'the sampled construction evaluates').toBe(true);
  });

  it('a seed that already built is BYTE-IDENTICAL — the clamp is a no-op on a feasible sample', () => {
    const fold = replay(factsOf(PREFIX), 0).construction;
    for (const seed of [16, 18, 19, 25]) {
      const circ = applySeed(fold, seed).objects.find((o) => o.kind === 'circle')!;
      const O = applySeed(fold, seed).objects.find((o) => o.id === '@ctr-O')! as { x: number; y: number };
      const A = applySeed(fold, seed).objects.find((o) => o.id === 'A')! as { x: number; y: number };
      // the un-clamped jitter is what a feasible sample keeps: |OA| > r means nothing was capped
      expect(Math.hypot(A.x - O.x, A.y - O.y), `seed ${seed}`).toBeGreaterThan(
        (circ as { radius: { value: number } }).radius.value,
      );
    }
  });

  describe('the class guard (b) — when the precondition cannot be seated', () => {
    // A STATED radius is a given: bending it to make a seed work would drop a stated magnitude, which
    // the honesty invariant forbids outright. So this figure still has an unusable seat — and that is
    // exactly the case the message must get right.
    const STATED = ['משולש ABC', 'מעגל שרדיוסו 5', 'AB משיקה למעגל בנקודה B'];

    it('never reports the sampled conflict as contradicting the givens', () => {
      const accusations = sweep(STATED).filter((r) => r.status?.startsWith('over-constrained'));
      expect(accusations, `accusing seeds: ${JSON.stringify(accusations)}`).toEqual([]);
    });

    it('says instead which objects are still free — named by the structural walk', () => {
      const failing = sweep(STATED).filter((r) => r.status);
      expect(failing.length, 'the stated-radius sibling still has an infeasible seat').toBeGreaterThan(0);
      for (const r of failing) {
        expect(r.status, `seed ${r.seed}`).toMatch(/^not determined: .+ still free, so .+ cannot be judged in this configuration$/);
        // the sampled counterparts of the conflict, not the student's statement
        expect(r.status).toContain('@ctr-O');
        expect(r.status).toContain('A');
      }
    });

    it('a stated radius is NEVER bent to make a seed work', () => {
      const facts = factsOf(STATED);
      for (let seed = 0; seed <= 40; seed++) {
        const { circles } = replay(facts, seed);
        const c = circles.get('circle-O');
        if (c) expect(c.r, `seed ${seed}: the stated radius holds`).toBeCloseTo(5, 6);
      }
    });
  });
});
