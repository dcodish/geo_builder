/**
 * TIER 2 — inequality FILTERS (stage 2 of [docs/LADDER-CX.md](../../docs/LADDER-CX.md)).
 *
 * Quadrant givens («z₀ ברביע הרביעי»), argument ranges («arg Z₂ < 45°»), sign and domain givens are
 * not equations and must never be solved as if they were: a whole region satisfies them, so they
 * determine nothing. What they do is **choose among configurations the equations already produced** —
 * which is the 3-D `Requirement3` rule, and the reason the §2b exemplar's `arg Z₂ < 45°` is a *branch
 * selector* rather than a driver ([ADR-CX-002](../../docs/06d-decisions-complex.md#adr-cx-002)).
 *
 * A filter that empties the branch set is an honest refusal — the givens describe no drawing — and
 * never a licence to relax the filter and show something that contradicts it.
 */

import type { Branch } from './tier1';
import { rat } from '../value/rational';
import { toDegrees } from '../value/angle';

import type { BranchFilter } from '../model/constraint';

export type { BranchFilter } from '../model/constraint';

const norm360 = (d: number): number => ((d % 360) + 360) % 360;

/**
 * Does a branch satisfy one filter?
 *
 * `null` means UNDECIDABLE at this sample — the angle carries a symbolic atom nobody has bound yet.
 * Undecidable is deliberately not "false": pruning a branch we cannot evaluate would hide a
 * configuration the student's givens allow, which is the same dishonesty as showing one they forbid.
 */
export function branchSatisfies(
  b: Branch,
  f: BranchFilter,
  sample: ReadonlyMap<string, number> = new Map(),
): boolean | null {
  const a = b.angles.get(f.name);
  if (!a) return null; // this branch does not fix that direction
  const degRaw = toDegrees(a, sample);
  if (degRaw === null) return null;
  const deg = norm360(degRaw);

  switch (f.kind) {
    case 'quadrant': {
      const lo = (f.q - 1) * 90;
      const hi = f.q * 90;
      return deg > lo + 1e-9 && deg < hi - 1e-9;
    }
    case 'range': {
      if (f.minDeg !== undefined && !(deg > Number(f.minDeg.n) / Number(f.minDeg.d) + 1e-9)) return false;
      if (f.maxDeg !== undefined && !(deg < Number(f.maxDeg.n) / Number(f.maxDeg.d) - 1e-9)) return false;
      return true;
    }
    case 'exact':
      return Math.abs(deg - norm360(Number(f.deg.n) / Number(f.deg.d))) < 1e-9;
  }
}

export interface FilterResult {
  readonly kept: readonly Branch[];
  /** branches no filter could decide — kept, and reported so the caller knows the answer is provisional */
  readonly undecided: readonly Branch[];
  /** the filter that emptied the set, when one did */
  readonly emptiedBy: BranchFilter | null;
}

/** Apply every filter; a branch survives only if no filter refutes it. */
export function filterBranches(
  branches: readonly Branch[],
  filters: readonly BranchFilter[],
  sample: ReadonlyMap<string, number> = new Map(),
): FilterResult {
  let kept = [...branches];
  const undecided: Branch[] = [];
  let emptiedBy: BranchFilter | null = null;

  for (const f of filters) {
    const next: Branch[] = [];
    for (const b of kept) {
      const verdict = branchSatisfies(b, f, sample);
      if (verdict === false) continue;
      if (verdict === null && !undecided.includes(b)) undecided.push(b);
      next.push(b);
    }
    if (next.length === 0 && kept.length > 0) {
      emptiedBy = f;
      kept = next;
      break;
    }
    kept = next;
  }

  return { kept, undecided, emptiedBy };
}

/** `ברביע הראשון` and friends, as a filter. */
export const quadrant = (name: string, q: 1 | 2 | 3 | 4): BranchFilter => ({ kind: 'quadrant', name, q });
/** `arg z < 45°`, as a filter. */
export const argBelow = (name: string, deg: number): BranchFilter => ({ kind: 'range', name, maxDeg: rat(deg) });
/** `arg z > 45°`, as a filter. */
export const argAbove = (name: string, deg: number): BranchFilter => ({ kind: 'range', name, minDeg: rat(deg) });
