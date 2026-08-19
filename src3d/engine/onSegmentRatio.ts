/**
 * #748: the ratio arithmetic of an ON-SEGMENT rider, in ONE place.
 *
 * A point-on-segment rider `R` on host `a–b` carries a parameter `t` (`R = a + t·(b−a)`). A statement
 * that relates the two HALVES of that host — `AE = 2·EA'`, `AE:EA' = 2:1`, `|AE| = 2|EA'|` — does not
 * *check* the rider, it **determines** it, in closed form and with no solving at all.
 *
 * The arithmetic lived inside the parser's `onSegment` rule, reachable only as a clause of the
 * declaration utterance («E על AA' כך ש-AE = 2EA'»). The same statement typed as its OWN fact — the
 * incremental interaction this product is built around — could not reach it and was refuted instead.
 * So the reading belongs to the RIDER, not to the utterance that happened to declare it: parse3 and
 * the apply reducer now share this one function (docs/17 — a capability bound to one code path rather
 * than to the concept).
 *
 * **The CHAIN form is the whole contract.** The rider must be the shared middle letter, and the two
 * outer letters must be the host's endpoints: `a→R` against `R→b`, in either orientation. That single
 * shape is what makes the vector reading and the length reading agree, so `vec-rel`, `length-rel` and
 * the `length-ratio` claim all land on one semantics:
 *
 * - `a→R = k·(R→b)`:  t·d = k(1−t)·d  ⇒  t = k/(k+1)      (`|aR| = k·|Rb|` gives the same t)
 * - `b→R = k·(R→a)`:  (t−1)·d = −k·t·d  ⇒  t = 1/(k+1)
 *
 * The non-chain spellings (`AE = 2·A'E`) are deliberately NOT read: there the vector and length
 * readings diverge, so believing either one would be a guess.
 */
import type { Id } from './types';

/** A determined parameter, or `'invalid'` when the letters do not form the chain. */
export type RiderT = number | 'invalid';

/**
 * `id` rides host `a–b`; the statement relates pair `p1→x` to `k·(y→q1)`.
 *
 * Returns the determined `t`, or `'invalid'` when this is not the chain form over that host — which
 * callers must treat as "not a ratio about this rider", never as a falsehood about it.
 *
 * `k > 0` is required, which is also why a ratio can never drive `t` outside the segment:
 * `k/(k+1)` and `1/(k+1)` both lie strictly in `(0,1)` for every positive `k`.
 */
export function riderChainT(id: Id, a: Id, b: Id, p1: Id, x: Id, y: Id, q1: Id, k: number): RiderT {
  if (x !== id || y !== id) return 'invalid'; // the rider must be the shared MIDDLE letter
  if (!Number.isFinite(k) || !(k > 0)) return 'invalid';
  if (p1 === a && q1 === b) return k / (k + 1);
  if (p1 === b && q1 === a) return 1 / (k + 1);
  return 'invalid'; // the outer letters are not this rider's host endpoints
}
