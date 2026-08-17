/**
 * WHERE A FILTER'S WINDOW LANDS ONCE THE LINEAR TIER HAS CHOSEN A BASIS — LADDER-CX stage 2b.
 *
 * A filter states a window about a NAME («z₂ ברביע הראשון», «arg z₂ < 45°»). The sampler and the
 * minimiser, though, move a *basis*: the coordinates elimination could not remove. Those are only the
 * same thing while the filtered name happens to be the pivot.
 *
 * ## The hole this closes (#690)
 *
 * A filter had exactly two arms, and a name could fall between them:
 *
 * - `filterBranches` PRUNES enumerated branches — it reads `branch.angles`, so it reaches a name whose
 *   direction the equations fixed;
 * - the `windows` map BOUNDS the sample and the minimiser — it is keyed by name, so it reaches a name
 *   that is in the free basis.
 *
 * A name that is neither — one elimination made *dependent* on the basis — was reached by neither, and
 * the filter was silently dropped. «z₃ ברביע הראשון» with «arg z₃ + arg z₂ = 0» drew z₃ at 219.52°,
 * outside the quadrant it was stated to be in, with `unsatisfied` and `emptiedBy` both clean. Whether a
 * given holds depended on which name elimination happened to pivot on, which is invisible from the line
 * the student typed — so it is a class, not a case.
 *
 * ## Why projection rather than a new solver arm
 *
 * The linear tier leaves every dependent direction as an AFFINE function of the basis:
 * `arg(name) = K + Σ cᵢ·arg(basisᵢ)`. A window on the left is therefore a window on the right whenever
 * exactly one `cᵢ` is non-zero — which is the corpus case, because the exam relates directions in
 * pairs. Projecting it there means the existing `windows` map does both jobs it already did, for the
 * dependent name too: one `narrow()` call reaches the initial sample AND the minimiser bounds, because
 * both already read that map. No third arm, no case ladder — the tripwire LADDER-CX warns about.
 *
 * A filter still SELECTS and never DRIVES ([ADR-CX-002](../../docs/06d-decisions-complex.md#adr-cx-002)):
 * bounding the basis picks among the drawings the equations already allow, exactly as bounding a free
 * direction always did. It adds no row and determines nothing.
 *
 * When more than one basis coordinate carries the name — a window on a sum of two free directions is a
 * half-plane, not an interval — projection honestly declines, and
 * {@link violatesDeg} catches it at stage 3e instead. Declining is not dropping: the caller reports it.
 */

import type { BranchFilter } from '../model/constraint';

export interface Window {
  readonly min: number;
  readonly max: number;
}

/** `arg(name) = konstDeg + Σ coef·arg(basisName)`, in degrees — what the linear tier left. */
export interface AffineArg {
  readonly konstDeg: number;
  /** basis coordinate → coefficient. Turn unknowns are already folded into `konstDeg`. */
  readonly terms: ReadonlyMap<string, number>;
}

const norm360 = (d: number): number => ((d % 360) + 360) % 360;

/**
 * The window a filter states, in degrees, about its own name. `null` when it bounds nothing.
 *
 * A one-sided range is bounded at the turn it lives in — «arg z < 45°» is the direction sector
 * (0°, 45°), not the half-line (−∞, 45°). That is already how `filter.ts` reads it, which folds the
 * direction into [0°, 360°) before comparing; making it explicit here is what lets a window survive a
 * CHANGE OF BASIS. An unbounded end cannot: it has no turn to be a representative of, so shifting it
 * by a turn silently changes which directions it admits, and an intersection with it lands in the
 * wrong turn. That is a real failure mode and it is how the first cut of this module let «arg z2 < 45»
 * pass at 66.28° — bounding both ends is the fix, not a tidy-up.
 */
export function statedWindow(f: BranchFilter): Window | null {
  switch (f.kind) {
    case 'quadrant':
      return { min: (f.q - 1) * 90, max: f.q * 90 };
    case 'range': {
      const min = f.minDeg === undefined ? 0 : Number(f.minDeg.n) / Number(f.minDeg.d);
      const max = f.maxDeg === undefined ? 360 : Number(f.maxDeg.n) / Number(f.maxDeg.d);
      return { min, max };
    }
    case 'exact': {
      const d = Number(f.deg.n) / Number(f.deg.d);
      return { min: d, max: d };
    }
  }
}

/**
 * Is a drawn direction OUTSIDE what the filter states? — the stage-3e backstop.
 *
 * Read on the value the figure actually drew, so it is the one check that cannot be evaded by a change
 * of basis: whatever route the number took, this asks the student's question about the student's point.
 * Compared modulo a turn, because a direction is a direction and `-35°` is `325°`.
 */
export function violatesDeg(f: BranchFilter, deg: number): boolean {
  const w = statedWindow(f);
  if (w === null || !Number.isFinite(deg)) return false;
  const d = norm360(deg);
  // A window may be stated across the 0° seam (`arg z > 350`), so test the drawn direction against
  // every turn-equivalent placement of the window rather than folding one of them arbitrarily.
  for (const shift of [-360, 0, 360]) {
    const lo = w.min + shift;
    const hi = w.max + shift;
    if (w.min === w.max ? Math.abs(d - lo) < 1e-6 : d > lo + 1e-9 && d < hi - 1e-9) return false;
  }
  return true;
}

/**
 * A filter in the student's register, for when it carries no source text of its own.
 *
 * The parser sets `src` from the line as typed, which is what a refusal should quote. This is the
 * fallback for a filter built in code — never internal state, because a violated filter is reported to
 * the student and «`{"kind":"quadrant"}`» is not a sentence about their figure.
 */
export function describeFilter(f: BranchFilter): string {
  switch (f.kind) {
    case 'quadrant':
      return `${f.name} ברביע ה${['ראשון', 'שני', 'שלישי', 'רביעי'][f.q - 1]}`;
    case 'range': {
      const parts: string[] = [];
      if (f.minDeg !== undefined) parts.push(`> ${Number(f.minDeg.n) / Number(f.minDeg.d)}°`);
      if (f.maxDeg !== undefined) parts.push(`< ${Number(f.maxDeg.n) / Number(f.maxDeg.d)}°`);
      return `arg ${f.name} ${parts.join(' ו-')}`;
    }
    case 'exact':
      return `arg ${f.name} = ${Number(f.deg.n) / Number(f.deg.d)}°`;
  }
}

/** Overlap of two windows, treating infinities as the open ends they are. */
const overlap = (a: Window, b: Window): number =>
  Math.max(0, Math.min(a.max, b.max) - Math.max(a.min, b.min));

/**
 * Project a window stated about a name onto the ONE basis coordinate that carries it.
 *
 * `null` when the name is not carried by exactly one basis coordinate — fully determined (nothing to
 * bound, and stage 3e verifies it) or carried by several (not an interval).
 *
 * The projected window is chosen modulo a turn of the basis coordinate: `arg(name)` is periodic, so
 * `arg(basis)` has a whole family of windows that put the name in its stated one. The representative
 * kept is the one that overlaps `current` most — the window the basis coordinate is already confined
 * to, or a full turn when it is unconstrained — so an accumulated intersection stays non-empty instead
 * of depending on which turn the arithmetic happened to land in.
 */
export function projectWindow(
  w: Window,
  a: AffineArg,
  windowOf: (name: string) => Window | undefined = () => undefined,
): { readonly name: string; readonly min: number; readonly max: number } | null {
  const live = [...a.terms].filter(([, c]) => Math.abs(c) > 1e-12);
  if (live.length !== 1) return null;
  const [name, c] = live[0];
  // what that coordinate is already confined to — a full turn when nothing has confined it yet
  const current: Window = windowOf(name) ?? { min: 0, max: 360 };

  // arg(name) = K + c·arg(name_basis)  ⟹  arg(name_basis) = (arg(name) − K) / c
  const ends = [(w.min - a.konstDeg) / c, (w.max - a.konstDeg) / c];
  const base: Window = { min: Math.min(...ends), max: Math.max(...ends) };

  // one turn of `name` is 360/|c| of the basis coordinate
  const period = 360 / Math.abs(c);
  if (!Number.isFinite(period) || !Number.isFinite(base.min) || !Number.isFinite(base.max)) {
    return { name, min: base.min, max: base.max };
  }

  let best = base;
  let bestOverlap = -Infinity;
  // enough turns either way to reach any representative the default and any accumulated window can hold
  for (let k = -3; k <= 3; k++) {
    const cand = { min: base.min + k * period, max: base.max + k * period };
    const score = overlap(cand, current);
    if (score > bestOverlap) {
      bestOverlap = score;
      best = cand;
    }
  }
  return { name, min: best.min, max: best.max };
}
