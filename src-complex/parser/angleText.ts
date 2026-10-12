/**
 * #1754 ([ADR-CX-064](../../docs/06d-decisions-complex.md#adr-cx-064)) — THE ANGLE AS TYPED: the one
 * place an angle's text becomes an exact number of degrees.
 *
 * Textbooks state an argument in degrees (`2cis45`) and in radians (`2cis(π/4)`), and the two must be
 * the same number by construction, not by two readers that happen to agree. Every reader of a `cis`
 * angle asks this module: the expression grammar's polar literal (`2cis(π/4)`, `√2cis(π/4)`), the
 * symbolic-modulus polar form (`r cis(π/4)`), and the trigonometric form's same-angle test
 * (`2(cos(π/4) + i sin(π/4))`, which is rewritten to `cis` only when both slots state ONE angle).
 *
 * The grammar, deliberately small — exactly what a textbook prints:
 * - **degrees**: a signed decimal, `45`, `-30`, `22.5` (the `°` is already gone — normalize.ts);
 * - **radians**: a signed RATIONAL multiple of π, `π`, `2π`, `π/4`, `3π/4`, `-π/3`, `3/4π`, `1.5π`,
 *   with `pi` as the Latin spelling of `π` and an optional `*`. A slash belongs to the angle only where
 *   the angle is parenthesised (`cis(π/4)`); bare `cis π/4` is left to the grammar that reads it today.
 *
 * Converted EXACTLY: `kπ` is `180k°` as a rational, so `π/4` and `45` are the same `Rat` and lower to
 * the same facts. π is never a VALUE here — this reads angles only; «z1 = π» is not an angle slot.
 */
import { rat, type Rat } from '../value/rational';

/** π, or its Latin spelling `pi` as a whole word (lowercase: `Pi` is a point label times i). */
export const PI = String.raw`(?:π|(?<![A-Za-z])pi(?![A-Za-z\d]))`;

const DECIMAL = String.raw`\d+(?:\.\d+)?`;

/** A radian angle WITHOUT a slash — `π`, `2π`, `2*π` — safe in a bare (unparenthesised) slot. */
export const RADIAN_BARE = String.raw`(?:${DECIMAL}\s*\*?\s*)?${PI}`;

/** A radian angle that may carry a slash — `π/4`, `3π/4`, `3/4π` — for a parenthesised slot. */
export const RADIAN = String.raw`(?:(?:${DECIMAL}\s*\*?\s*)?${PI}(?:\s*/\s*\d+)?|\d+\s*/\s*\d+\s*\*?\s*${PI})`;

const decimal = (t: string): Rat => {
  const [w, f = ''] = t.split('.');
  return rat(BigInt(w + f), 10n ** BigInt(f.length));
};

const RX_DEGREES = new RegExp(String.raw`^(-?)(${DECIMAL})$`, 'u');
const RX_KPI_D = new RegExp(String.raw`^(-?)(?:(${DECIMAL})\*?)?(?:π|pi)(?:/(\d+))?$`, 'u');
const RX_A_D_PI = new RegExp(String.raw`^(-?)(\d+)/(\d+)\*?(?:π|pi)$`, 'u');

/** Does this angle text state radians — `π`, or the lowercase word `pi`? */
export const isRadianText = (text: string): boolean => new RegExp(PI, 'u').test(text);

/**
 * The exact signed degrees an angle's text states, or null when it is not a numeric angle (a symbolic
 * letter `theta`, a sum `π/4 + 1`, a zero denominator). Whitespace and enclosing parentheses are the
 * student's punctuation: `( -π / 3 )` ≡ `-π/3` = −60°.
 */
export function angleDegrees(text: string): Rat | null {
  let t = text.replace(/\s+/g, '');
  while (/^\(.*\)$/.test(t)) t = t.slice(1, -1);
  const sign = (s: string, r: Rat): Rat => (s ? rat(-r.n, r.d) : r);
  // a sign in front of a parenthesised angle: `-(π/3)`
  if (/^-\(.*\)$/.test(t)) {
    const inner = angleDegrees(t.slice(1));
    return inner && sign('-', inner);
  }
  const deg = t.match(RX_DEGREES);
  if (deg) return sign(deg[1], decimal(deg[2]));
  const kpi = t.match(RX_KPI_D);
  if (kpi) {
    const k = kpi[2] ? decimal(kpi[2]) : rat(1);
    const d = kpi[3] ? BigInt(kpi[3]) : 1n;
    if (d === 0n) return null;
    return sign(kpi[1], rat(180n * k.n, k.d * d));
  }
  const adpi = t.match(RX_A_D_PI);
  if (adpi) {
    const d = BigInt(adpi[3]);
    if (d === 0n) return null;
    return sign(adpi[1], rat(180n * BigInt(adpi[2]), d));
  }
  return null;
}
