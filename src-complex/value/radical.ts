/**
 * WHICH characters of a spelled number are a radical INDEX (#727).
 *
 * The exam typography from #702 spells an n-th root the way the sheet does — `⁵√5`, `⁴√7`, `¹⁰√11` —
 * with Unicode superscript digits. Those glyphs are drawn around 0.58 em and hairline thin, and at
 * the canvas's 13 px the operator read «⁵√5·cis10.63°» as the RETIRED `~` mark (2026-08-18). The
 * value was right; the index was unreadable.
 *
 * The spelling itself does not change: `value/modulus.format` is the ONE spelling of a number — the
 * canvas, the data panel and any export call it, and they must not be able to disagree (the
 * ADR-3D-156 lesson that formatter's own doc states). So the treatment is display-level, and what
 * lives here is the part both display surfaces must agree on: WHERE the index is. The React
 * renderers sit in `render/`, which is allowed to read this layer.
 *
 * Bottom layer, so no imports — the same rule every other `value/` module keeps.
 */

/** Unicode superscript digits, and the plain digit each one stands for. */
const PLAIN: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

/**
 * A superscript run that INDEXES a radical — it must be immediately followed by `√`.
 *
 * A superscript anywhere else is an EXPONENT (`z²`) and is deliberately left alone: an exponent sits
 * at the top of the line with clear space around it, where it was always legible. Only the index is
 * cramped against the radical sign, and only the index is hard to read.
 */
const INDEX = /([⁰¹²³⁴⁵⁶⁷⁸⁹]+)(?=√)/g;
/** The same pattern WITHOUT `g`, for the presence check. `RegExp.test` on a global regex advances
 *  `lastIndex`, and `String.matchAll` resumes from it — sharing one global regex between the two made
 *  `splitRadical` skip the very match `hasRadicalIndex` had just found. Two regexes, no shared state. */
const INDEX_ONCE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+(?=√)/;

export type RadicalPart = { readonly index: string } | { readonly text: string };

/** Split a spelled number into plain text and radical INDEX runs, in order. */
export function splitRadical(text: string): RadicalPart[] {
  const parts: RadicalPart[] = [];
  let last = 0;
  INDEX.lastIndex = 0;
  for (const m of text.matchAll(INDEX)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ index: [...m[1]].map((c) => PLAIN[c] ?? c).join('') });
    last = m.index + m[1].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Does this reading carry a radical index at all? The common case pays nothing for the treatment. */
export const hasRadicalIndex = (text: string): boolean => INDEX_ONCE.test(text);
