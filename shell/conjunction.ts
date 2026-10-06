/**
 * #1691 (ADR-AG-239) — THE SPACED «ו-» CONJUNCTION, ONE SPELLING FOR EVERY BUILDER.
 *
 * Hebrew writes "and" as the prefix «ו», and before a Latin name it is joined by a hyphen (the maqaf):
 * «AB ו-BC». Students type the hyphen with a space after it, before it, or both — «AB ו- BC», «AB ו -BC»,
 * «AB ו - BC» — and the operator's own sentence that started tangent support (#1501) was «l1 ו- l2».
 *
 * Measured on 2026-10-05 (the #1691 sweep): each builder's list readers spelled the conjunction on their own,
 * and the spaced spellings fell through different ones in each — analytic's tangency list read «ו-BC» but not
 * «ו- BC»; 2-D, 3-D and analytic all missed «ו -X» and «ו - X» in the points-on, perpendicular, midpoint and
 * equal-sides lists. A per-reader fix leaves the next list reader to reintroduce the miss, so the spelling is
 * folded ONCE, here, and every builder calls this at its parser boundary (2-D `normalizeUtterance`, 3-D
 * `normalize3`, analytic `orthography`).
 *
 * THE MINUS GUARD. A hyphen with a space BEFORE it may be a minus sign typed against its operand
 * («2 ו -3», «ו -y = x»), and folding it into the conjunction would drop the sign. So:
 *   - «ו- X» (the hyphen glued to the «ו») is always the conjunction → «ו-X»;
 *   - «ו -X» / «ו - X» fold only when X is a NAME-shaped token — it starts with a letter, carries no digit
 *     start, bracket or operator, and is not a lone lowercase letter (a parameter: «ו -a» may be "and −a").
 * Anything else is left exactly as typed. The «ו» must stand alone (start of text or after whitespace), so a
 * word that ends in «ו» («שלו -») is never touched.
 */

const HYPHEN = '[-־]';
/** A name-shaped operand: a letter-led token with no math in it, not a lone lowercase letter. */
const NAME_TOKEN = /^(?![a-z](?:[\s,.;:()]|$))[A-Za-zא-ת][^\s,;:=+\-*/^<>≤≥≠()]*(?=[\s,.;:()]|$)/;

const GLUED = new RegExp(`(^|\\s)ו${HYPHEN}\\s+(?=\\S)`, 'g');
const SPACED = new RegExp(`(^|\\s)ו\\s+${HYPHEN}\\s*(?=\\S)`, 'g');

export function foldConjunctionSpacing(s: string): string {
  return s
    .replace(GLUED, (_m, lead: string) => `${lead}ו-`)
    .replace(SPACED, (m, lead: string, off: number, str: string) =>
      NAME_TOKEN.test(str.slice(off + m.length)) ? `${lead}ו-` : m,
    );
}
