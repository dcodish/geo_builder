/**
 * THE DISPLAY-NUMBER FORMATTER (#723, operator ruling 2026-08-18: "decimal points, only two
 * numbers after the point. This is a rule for all of the tools we have").
 *
 * ONE chokepoint for turning a computed number into the digits a student reads — never per-call-site
 * rounding sweeps (docs/17). DISPLAY ONLY: the model always carries full precision ("internally, we
 * of course calculate the full number"); this is the typography of the read-out, exactly like a
 * ruler showing centimetres over an exact length. Exact symbolic forms (5, 1/2, √2, cis120°) never
 * pass through here — the rule is about decimal EXPANSIONS.
 *
 * The products' display formatters delegate here (#723): 2-D `formatMeasure`, 3-D `cleanNum`'s decimal
 * fallback, and the complex builder's reading composition. Each keeps its own product-specific tiers ABOVE
 * the decimal fallback — an exact fraction, a surd, a π form — because those are not decimal expansions
 * and the rule does not touch them; what none of them keeps is a private rounder.
 *
 * One holdout, deliberately: `src-complex/value/value.ts` keeps a private 3-decimal `fmtNum`. It CANNOT
 * import this file — `value/` is the declared bottom of its own tree and `import-direction.test.ts`
 * enforces that — so the delegation was reverted rather than the layering test weakened (#723, escalated).
 *
 * `DISPLAY_DECIMALS` is the house precision the operator's ruling names. It is a DEFAULT, not a ceiling
 * the signature can express: `maxDecimals` stays a parameter because one surface asks for more (the 3-D
 * canvas coordinate label, #491 — "precision is a property of the surface"), and that collision between
 * two rulings is the operator's to settle, not a round's to assume. Every other caller takes the default.
 */

/** The house display precision (operator ruling, 2026-08-18). */
export const DISPLAY_DECIMALS = 2;

/** Format for display: at most `maxDecimals` digits after the point, trailing zeros trimmed. */
export function fmtNum(x: number, maxDecimals = DISPLAY_DECIMALS): string {
  const r = Math.round(x * 10 ** maxDecimals) / 10 ** maxDecimals;
  return (Object.is(r, -0) ? 0 : r).toString();
}
