/**
 * THE ANALYTIC TREE'S DISPLAY FORMATTER — exact tiers above the shared decimal fallback (#1120).
 *
 * **Operator, playing PR #1116 T29:** *"in the data panel, the slope of 4/3 is written as 1.33 which
 * is wrong"* — and again, unprompted, the next day. *Wrong* is the right word rather than
 * *imprecise*: in analytic geometry the slope of that line **is** 4/3. `1.33` is a different number,
 * and the panel was stating it as the value. **Ruling, 2026-09-16: "exact forms".**
 *
 * It also sat badly beside this product's own promise: #1053 shows the FORMULA behind an answer so a
 * student sees the method, and the method here yields 4/3. Showing the working and then rounding the
 * result teaches them to write `1.33` on an exam that wants `4/3`.
 *
 * ## This is the tier three sibling trees already have, and this one never got
 *
 * [`shell/format.ts`](../shell/format.ts)'s own docblock describes the architecture: *"Exact symbolic
 * forms (5, 1/2, √2, cis120°) never pass through here — the rule is about decimal EXPANSIONS … Each
 * keeps its own product-specific tiers ABOVE the decimal fallback."* Measured:
 *
 * | tree | exact tier |
 * | --- | --- |
 * | 2-D | `exactFormOf` — rational · √ · π ([ADR-410](../docs/06-decisions.md)) |
 * | 3-D | `cleanNum` — integer · `p/q` (q ≤ 24) · surd |
 * | complex | exactness carried structurally in the value model |
 * | **analytic** | **none — `fmtNum` directly** |
 *
 * So the defect is not that the shared formatter rounds. It is that this tree is the one that never
 * built the tier above it, and a cross-product disparity of that shape is a wiring smell.
 *
 * ## Recognition, not carriage — and what makes that honest
 *
 * The value reaching display is a `number`; the exactness of `4/3` lives in the equation the student
 * typed, several layers up. Both siblings that print exact forms RECOGNISE them from the float, and
 * each is disciplined about it in the same two ways, which are reproduced here:
 *
 *  - **a tight, relative tolerance and a small denominator** — `4/3` is recognised, `1.3333` typed by
 *    a student is not, and `7.34` stays `7.34`. With a large enough denominator every float is
 *    "rational" and the tier would become the lie the issue warned about;
 *  - **the caller has already gated on invariance.** An exact form is printed only where a value is
 *    printed at all, and in this tree that means it passed `isKnowledge` — the same number in every
 *    admissible configuration. A sampled coincidence never reaches here.
 *
 * Copied rather than imported: `src-analytic/CLAUDE.md` boundary 1 — the trees share rulings, never
 * code, and 2-D's lives in `src/`, which this tree may not import.
 */
import { fmtNum } from '../shell/format';

/**
 * How close a float must be to a rational, RELATIVE to its own size, to be shown as that rational.
 * 2-D's `EXACT_TOL`, for 2-D's reason: a value solved to `SOLVE_TOL` carries error proportional to
 * its magnitude, so an absolute bar would accept too much on a large value and too little on a small.
 */
const EXACT_TOL = 1e-6;

/**
 * The largest denominator a value may be dressed in.
 *
 * Twelve, matching 2-D. Exam slopes, ratios and coordinates are small rationals; past that the tier
 * stops being recognition and becomes a search that always succeeds.
 */
const MAX_DENOM = 12;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * `v` as `p/q` with a small denominator, or null.
 *
 * An INTEGER is not a fraction and returns null here — it needs no dressing, and `fmtNum` already
 * prints it exactly.
 */
export function fractionText(v: number): string | null {
  if (!Number.isFinite(v) || v === 0) return null;
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  const bar = EXACT_TOL * Math.max(a, 1);
  if (Math.abs(a - Math.round(a)) <= bar) return null; // an integer; not this tier's business
  for (let q = 2; q <= MAX_DENOM; q += 1) {
    const p = Math.round(a * q);
    if (p < 1) continue;
    if (Math.abs(a - p / q) <= bar) {
      const d = gcd(p, q);
      const num = p / d;
      const den = q / d;
      // A denominator that reduced to 1 means the value was an integer after all.
      return den === 1 ? null : `${sign}${num}/${den}`;
    }
  }
  return null;
}

/**
 * The number a student reads, in this tree.
 *
 * ONE function, so the panel and the canvas cannot print the same value two ways — `fmtNum`'s own
 * rule («never per-call-site rounding sweeps») applied one level up. Exact first, decimals after.
 *
 * For a number sitting INSIDE an equation, see {@link fractionClearingFactor} — a bare `4/3` is right
 * as a standalone value and ambiguous as a coefficient.
 */
export function fmtAnalytic(v: number): string {
  const z = Math.abs(v) < 1e-12 ? 0 : v;
  return fractionText(z) ?? fmtNum(z);
}

/** `v` as a small rational in lowest terms, or null. The integer case returns denominator 1. */
function asRational(v: number): { num: number; den: number } | null {
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) < 1e-12) return { num: 0, den: 1 };
  const sign = v < 0 ? -1 : 1;
  const a = Math.abs(v);
  const bar = EXACT_TOL * Math.max(a, 1);
  for (let q = 1; q <= MAX_DENOM; q += 1) {
    const p = Math.round(a * q);
    if (p < 1) continue;
    if (Math.abs(a - p / q) <= bar) {
      const d = gcd(p, q);
      return { num: (sign * p) / d, den: q / d };
    }
  }
  return null;
}

const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);

/**
 * WHAT TO MULTIPLY AN EQUATION BY SO NO COEFFICIENT IS A FRACTION (#1180). `1` when none is; `null`
 * when some coefficient is not a small rational at all and scaling would achieve nothing.
 *
 * **Operator ruling, 2026-09-17:** an exact fraction is right as a standalone value — the slope row
 * reads `4/3` — and wrong as a **coefficient**, for two reasons that compound:
 *
 *  - **`4/3x` is ambiguous.** It reads as `4/(3x)` at least as naturally as `(4/3)x`, so the panel was
 *    printing an equation a student can misread. A misreadable correct equation is indistinguishable
 *    from a wrong one, which is worse than the rounding #1120 was filed to fix.
 *  - **the panel typesets its rows**, so the fraction stacked vertically mid-equation — cramped between
 *    the sign and the `x`, which is what he actually saw.
 *
 * Asked to choose between bracketing it (`-(4/3)x + y = 0`) and clearing it, he chose **clearing**:
 * `-4x + 3y = 0`, the form a textbook prints.
 *
 * **It rewrites the row, and that is already what the row does.** Measured before building: a line the
 * student states as «משוואת הישר AB היא y=(4/3)x» carries `eqSrc = null` and is rendered from its
 * CLASSIFIED coefficients into `ax + by + c = 0` — the panel has never echoed the student's own form
 * here. So clearing fractions is the same kind of act as the normalisation already happening, applied
 * to every equation row alike, and no stated-vs-derived distinction is needed.
 *
 * The sign is left alone: `-4/3x + y = 0` becomes `-4x + 3y = 0`, exactly as the ruling wrote it. A
 * convention that also flipped signs would be a second decision nobody has made.
 */
export function fractionClearingFactor(values: readonly number[]): number | null {
  let factor = 1;
  for (const v of values) {
    const r = asRational(v);
    if (!r) return null; // a surd, an irrational — scaling cannot clear it
    factor = lcm(factor, r.den);
    if (factor > MAX_DENOM * MAX_DENOM) return null; // runaway; leave the equation as it is
  }
  return factor;
}
