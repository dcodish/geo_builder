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
 * Adopted by the complex builder's reading composition first; 2-D and 3-D sweep onto it under #723.
 */

/** Format for display: at most `maxDecimals` digits after the point, trailing zeros trimmed. */
export function fmtNum(x: number, maxDecimals = 2): string {
  const r = Math.round(x * 10 ** maxDecimals) / 10 ** maxDecimals;
  return (Object.is(r, -0) ? 0 : r).toString();
}
