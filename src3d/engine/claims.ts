/**
 * Claim verification (docs/20 §5, §6.2): a claim is the STUDENT'S ANSWER, checked
 * against the figure — reproduce & verify, never solve. Verification is numeric
 * and runs across SEVERAL sampled configurations (different seeds), so a claim
 * that only happens to hold in one drawing of an under-determined figure — a
 * coincidence, not a truth — is refuted. This is the multi-sample discipline the
 * 2-D tool's relation detection uses, applied to answers.
 */

import { evaluate3, lineAtParam, planeAtParam } from './evaluate';
import { evalExpr } from './vecExpr';
import { cross3, dot3, norm3, sub3, v3 } from './vec3';
import type { Claim3, Construction3, Positions3 } from './types';

const REL_TOL = 1e-7;

/** Seeds checked for every claim: the display seed plus fixed offsets (deterministic). */
export const claimSeeds = (seed: number): number[] => [seed, seed + 1013, seed + 2027, seed + 4057];

function holdsAt(claim: Claim3, c: Construction3, pos: Positions3): boolean {
  switch (claim.type) {
    case 'vec-eq': {
      const l = evalExpr(claim.lhs, c, pos);
      const r = evalExpr(claim.rhs, c, pos);
      if (!l || !r) return false;
      const scale = Math.max(norm3(l), norm3(r), 1e-12);
      return norm3(sub3(l, r)) <= REL_TOL * Math.max(scale, 1);
    }
    case 'perp-plane': {
      const [s1, s2] = claim.seg.map((id) => pos.get(id)!);
      const [p1, p2, p3] = claim.plane.map((id) => pos.get(id)!);
      if (!s1 || !s2 || !p1 || !p2 || !p3) return false;
      const d = sub3(s2, s1);
      const e1 = sub3(p2, p1);
      const e2 = sub3(p3, p1);
      // the two plane directions must be independent, and d ⟂ both
      if (norm3(cross3(e1, e2)) <= REL_TOL * Math.max(norm3(e1) * norm3(e2), 1e-12)) return false;
      const ok1 = Math.abs(dot3(d, e1)) <= REL_TOL * Math.max(norm3(d) * norm3(e1), 1);
      const ok2 = Math.abs(dot3(d, e2)) <= REL_TOL * Math.max(norm3(d) * norm3(e2), 1);
      return ok1 && ok2;
    }
    case 'collinear3': {
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.some((p) => !p)) return false;
      const [a, b] = [ps[0]!, ps[1]!];
      const ab = sub3(b, a);
      for (let i = 2; i < ps.length; i++) {
        const ac = sub3(ps[i]!, a);
        if (norm3(cross3(ab, ac)) > REL_TOL * Math.max(norm3(ab) * norm3(ac), 1)) return false;
      }
      return true;
    }
    case 'length-eq': {
      const a = pos.get(claim.a);
      const b = pos.get(claim.b);
      if (!a || !b) return false;
      return Math.abs(norm3(sub3(b, a)) - claim.value) <= REL_TOL * Math.max(Math.abs(claim.value), 1);
    }
    case 'area-eq': {
      const ps = claim.ids.map((id) => pos.get(id));
      if (ps.some((p) => !p)) return false;
      const area = 0.5 * norm3(cross3(sub3(ps[1]!, ps[0]!), sub3(ps[2]!, ps[0]!)));
      return Math.abs(area - claim.value) <= REL_TOL * Math.max(Math.abs(claim.value), 1);
    }
    case 'coords-eq': {
      const p = pos.get(claim.id);
      if (!p) return false;
      const target = v3(claim.x, claim.y, claim.z);
      return norm3(sub3(p, target)) <= REL_TOL * Math.max(norm3(target), 1);
    }
    case 'never-parallel': {
      // "ℓ ∦ π for EVERY parameter value" (2024-Q2 א): parallel ⟺ dir(m)·n(m) = 0,
      // so the claim holds iff that residual has NO zero over the scanned range —
      // sign changes AND near-zero touches both refute it. Parameter-scan, seed-free.
      let prev: number | null = null;
      for (let m = -25; m <= 25 + 1e-9; m += 0.01) {
        const ln = lineAtParam(c, claim.line, m);
        if (!ln) return false;
        const pl = planeAtParam(c, claim.plane, m);
        const scale = Math.max(norm3(ln.dir) * norm3(pl.n), 1e-12);
        const r = dot3(ln.dir, pl.n) / scale;
        if (Number.isNaN(r) || Math.abs(r) < 1e-4) return false; // touches parallel
        if (prev !== null && prev * r < 0) return false; // crosses parallel between samples
        prev = r;
      }
      return true;
    }
  }
}

/** True iff the claim holds in EVERY sampled configuration. */
export function verifyClaim(claim: Claim3, c: Construction3, seed: number): boolean {
  return claimSeeds(seed).every((s) => holdsAt(claim, c, evaluate3(c, s)));
}
