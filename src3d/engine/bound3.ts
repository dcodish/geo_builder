/**
 * #1524 ([ADR-3D-477](../../docs/06b-decisions-3d.md#adr-3d-477)) — A LETTER'S STATED RANGE, the one shape every
 * sign reader reads.
 *
 * A sign («t > 0», «k חיובי») was a boolean `positive`, and each of its ten readers wrote its own `v > 1e-9` /
 * `v < -1e-9` test and its own half-window to sample in. A range («t ≥ 0», «k ≤ 3», «2 ≤ k ≤ 5») is the same statement
 * with a different end, so it is one interval here and every reader asks this module: does a value hold
 * ({@link boundHolds3}), which window does a free value draw from ({@link boundWindow3}), where does a soft anchor
 * park ({@link boundAnchor3}). A strict sign at 0 is the interval (0, ∞) / (−∞, 0), and over the readers' own
 * symmetric windows it reproduces the half-windows they drew before, bit for bit.
 */

/** An interval on the real line: a missing end is unbounded; a strict end excludes its value. */
export interface Bound3 {
  lo: number | null;
  hi: number | null;
  loStrict: boolean;
  hiStrict: boolean;
}

/** The tolerance every sign test used (`v > 1e-9`): a strict end must be cleared by it, a closed end may be missed by it. */
export const BOUND_EPS3 = 1e-9;

/** A sign as an interval: positive is (0, ∞), negative is (−∞, 0). */
export const signBound3 = (positive: boolean): Bound3 =>
  positive ? { lo: 0, hi: null, loStrict: true, hiStrict: false } : { lo: null, hi: 0, loStrict: false, hiStrict: true };

/** Does `v` lie in the interval? A non-finite value never does. */
export function boundHolds3(b: Bound3, v: number): boolean {
  if (!Number.isFinite(v)) return false;
  if (b.lo !== null && !(b.loStrict ? v > b.lo + BOUND_EPS3 : v >= b.lo - BOUND_EPS3)) return false;
  if (b.hi !== null && !(b.hiStrict ? v < b.hi - BOUND_EPS3 : v <= b.hi + BOUND_EPS3)) return false;
  return true;
}

/** Is the interval empty (no real number holds it)? */
export function boundEmpty3(b: Bound3): boolean {
  if (b.lo === null || b.hi === null) return false;
  if (b.lo > b.hi + BOUND_EPS3) return true;
  return Math.abs(b.lo - b.hi) <= BOUND_EPS3 && (b.loStrict || b.hiStrict);
}

/** The intersection of two intervals (the tighter end on each side; equal ends keep the strict one). */
export function intersectBounds3(a: Bound3, b: Bound3): Bound3 {
  let lo = a.lo, loStrict = a.loStrict;
  if (b.lo !== null && (lo === null || b.lo > lo || (b.lo === lo && b.loStrict))) [lo, loStrict] = [b.lo, b.loStrict];
  let hi = a.hi, hiStrict = a.hiStrict;
  if (b.hi !== null && (hi === null || b.hi < hi || (b.hi === hi && b.hiStrict))) [hi, hiStrict] = [b.hi, b.hiStrict];
  return { lo, hi, loStrict, hiStrict };
}

/**
 * The stated range of ONE letter: every statement about it, intersected in the order stated. A statement that would
 * empty the range is left out here, so the figure is drawn under the earlier ones and the verifier refuses the newer,
 * contradicting statement — never the older one it contradicts.
 */
export function foldBounds3(entries: readonly Bound3[]): Bound3 | undefined {
  let acc: Bound3 | undefined;
  for (const b of entries) {
    const next = acc ? intersectBounds3(acc, b) : b;
    if (!boundEmpty3(next)) acc = next;
  }
  return acc;
}

/**
 * The window a FREE value is drawn from under its range (ADR-052: an unstated value is sampled, and a stated range
 * restricts what is sampled). The reader's default window `[a, z]` narrowed to the range and kept `margin` clear of
 * each stated end; when that leaves less than a tenth of the default, a window of the default's width beside the
 * stated end (or the range itself, when both ends are stated). A sign at 0 over a window symmetric about 0 gives
 * `[margin, z]` / `[a, -margin]` — the half-windows the sign readers drew.
 */
export function boundWindow3(b: Bound3 | undefined, a: number, z: number, margin: number): [number, number] {
  if (!b) return [a, z];
  const m = b.lo !== null && b.hi !== null ? Math.min(margin, (b.hi - b.lo) / 4) : margin;
  const lo = b.lo === null ? -Infinity : b.lo + m;
  const hi = b.hi === null ? Infinity : b.hi - m;
  const l = Math.max(a, lo), h = Math.min(z, hi);
  if (h - l >= (z - a) / 10) return [l, h];
  if (b.lo !== null && b.hi !== null) return [lo, hi];
  return b.lo !== null ? [lo, lo + (z - a)] : [hi - (z - a), hi];
}

/** True when the range bounds a value from above only — a reader that mirrors its draw for a negative sign keeps doing so. */
export const boundUpperOnly3 = (b: Bound3 | undefined): boolean => !!b && b.hi !== null && b.lo === null;

/**
 * Where a SOFT anchor parks inside the range: `raw` (a seeded value in `[-span, span]`) shifted clear of a one-sided
 * range by `margin` (lo + margin + |raw| / hi − margin − |raw|, the sign readers' rule), or mapped into a two-sided one.
 */
export function boundAnchor3(b: Bound3 | undefined, raw: number, span: number, margin: number): number {
  if (!b || (b.lo === null && b.hi === null)) return raw;
  if (b.lo !== null && b.hi !== null) {
    const m = Math.min(margin, (b.hi - b.lo) / 4);
    const frac = Math.min(1, Math.max(0, (raw + span) / (2 * span)));
    return b.lo + m + frac * Math.max(0, b.hi - b.lo - 2 * m);
  }
  return b.lo !== null ? b.lo + margin + Math.abs(raw) : b.hi! - margin - Math.abs(raw);
}

/** The folded range of one letter from a construction's stated signs and ranges (undefined: nothing stated about it). */
export const symBound3 = (c: { paramSigns: readonly { sym: string; bound: Bound3 }[] }, sym: string | null | undefined): Bound3 | undefined =>
  sym ? foldBounds3(c.paramSigns.filter((g) => g.sym === sym).map((g) => g.bound)) : undefined;

/**
 * A value inside the range to walk a violating value `v` towards: its reflection about the violated end (for a sign
 * at 0 that is −v, the walk the sign readers took), clamped inside a two-sided range.
 */
export function boundReflect3(b: Bound3, v: number): number {
  let t = v;
  if (b.lo !== null && !boundHolds3({ ...b, hi: null }, t)) t = b.lo + Math.abs(t - b.lo);
  if (b.hi !== null && !boundHolds3({ ...b, lo: null }, t)) t = b.hi - Math.abs(t - b.hi);
  if (b.lo !== null && b.hi !== null && !boundHolds3(b, t)) t = (b.lo + b.hi) / 2;
  return t;
}
