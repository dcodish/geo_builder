/**
 * #748: the ratio arithmetic of an ON-SEGMENT rider, in ONE place.
 *
 * A point-on-segment rider `R` on host `a–b` carries a parameter `t` (`R = a + t·(b−a)`). A statement
 * that relates the two HALVES of that host — `AE = 2·EA'`, `AE:EA' = 2:1`, `|AE| = 2|A'E|` — does not
 * *check* the rider, it **determines** it, in closed form and with no solving at all.
 *
 * The arithmetic lived inside the parser's `onSegment` rule, reachable only as a clause of the
 * declaration utterance («E על AA' כך ש-AE = 2EA'»). The same statement typed as its OWN fact — the
 * incremental interaction this product is built around — could not reach it and was refuted instead.
 * So the reading belongs to the RIDER, not to the utterance that happened to declare it: parse3 and
 * the apply reducer now share this one module (docs/17 — a capability bound to one code path rather
 * than to the concept).
 *
 * **A LENGTH pair is unordered; only a VECTOR pair is directed.** `|A'E|` and `|EA'|` are the same
 * number, so a length statement must accept either spelling of either side — the first cut of #748
 * demanded the `X→R`, `R→Y` chain everywhere and rejected «|AE| = 2|A'E|», which is the *same
 * statement* as the accepted «|AE| = 2|EA'|». Orientation is therefore the CALLER's business:
 * `riderPairsT` matches pairs as sets, and a directed caller (`vec-rel`) narrows the candidate rider
 * before calling. Deciding it here would either lose the vector reading or invent one.
 *
 * The arithmetic itself, for rider `R` between the host's `a` and `b` (`d = b − a`):
 *
 * - `|aR| = k·|Rb|`:  `t·d = k(1−t)·d`   ⇒  `t = k/(k+1)`
 * - `|bR| = k·|Ra|`:  `(t−1)·d = −k·t·d` ⇒  `t = 1/(k+1)`
 *
 * For the *directed* chain (`a→R = k·(R→b)`) those same two formulas fall out, which is exactly why a
 * chain-form vector statement and its length reading agree — and why the NON-chain vector spelling
 * `AE = 2·A'E` (vectors ⇒ t = 2, off the segment; lengths ⇒ t = ⅔) is deliberately not guessed at.
 */
import { sample } from './rng';
import type { Id } from './types';

/** A determined parameter, or `'invalid'` when the letters do not describe this rider's two halves. */
export type RiderT = number | 'invalid';

/**
 * `k > 0` is required, which is also why a ratio can never drive `t` outside the segment:
 * `k/(k+1)` and `1/(k+1)` both lie strictly in `(0,1)` for every positive `k`.
 */
function halvesT(a: Id, b: Id, outer1: Id, outer2: Id, k: number): RiderT {
  if (!Number.isFinite(k) || !(k > 0)) return 'invalid';
  if (outer1 === a && outer2 === b) return k / (k + 1);
  if (outer1 === b && outer2 === a) return 1 / (k + 1);
  return 'invalid'; // the outer letters are not this rider's host endpoints
}

/**
 * The statement `|p1·x| = k·|y·q1|` read as a given about rider `id` on host `a–b`.
 *
 * Both written pairs are matched as SETS: `id` must appear in each, and what remains of each pair must
 * be the host's two endpoints. Returns the determined `t`, or `'invalid'` — which callers must treat as
 * "not a ratio about this rider", never as a falsehood about it.
 */
export function riderPairsT(id: Id, a: Id, b: Id, p1: Id, x: Id, y: Id, q1: Id, k: number): RiderT {
  if ((p1 !== id && x !== id) || (y !== id && q1 !== id)) return 'invalid';
  const outer1 = p1 === id ? x : p1;
  const outer2 = y === id ? q1 : y;
  if (outer1 === id || outer2 === id) return 'invalid'; // a degenerate pair (|AE| = k·|EA|)
  return halvesT(a, b, outer1, outer2, k);
}

/**
 * #820 — THE RIDER'S SAMPLED PARAMETER, IN ONE PLACE.
 *
 * A free rider (`K על SB`, no ratio stated) has no determined `t`, so one is SAMPLED per seed. That
 * value is read in two layers now: the evaluator places the point at it, and the pivot uses it as the
 * START and the soft ANCHOR of the rider's solved unknown (ADR-3D-204). Two spellings of the same key
 * would put the solver's anchor on a different configuration than the one the evaluator draws — a
 * silent disagreement no test would name — so the key lives here, with the rest of the rider's
 * arithmetic, and both layers call it.
 *
 * `solve3` must not import `evaluate` (evaluate imports solve3), which is why this is not a private
 * helper in the evaluator.
 */
export function riderSampleT(seed: number, id: Id, a: Id, b: Id): number {
  return sample(seed, `t-${id}-${a}-${b}`, 0.22, 0.78);
}
