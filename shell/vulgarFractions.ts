/**
 * #2255 ([ADR-W-147](../docs/06w-decisions-workspace.md#adr-w-147)) — THE VULGAR-FRACTION SPELLING, ONE FOR EVERY
 * BUILDER THAT READS A GLYPH AS A NUMBER. Moved here byte-identical from 2-D's `src/parser/lexicon.ts` (which
 * re-exports it, so every 2-D import is unchanged) when 3-D became its second caller: 3-D's boundary spelled each
 * glyph as text with no separator, so «2½» became «21/2» = 10.5 in every slot that reads a number. Pure string
 * surgery with no product knowledge, composing `UNGLUED` from `indexedName`. Callers, each at its parser
 * boundary only (the stored line keeps the glyph as typed): 2-D `normalizeUtterance`, 3-D `normalize3`.
 * Analytic's own partial fold (`src-analytic/parser/frameAnalytic.ts`) is the open sibling.
 */

import { UNGLUED } from './indexedName';

/**
 * [ADR-632](../docs/06-decisions.md#adr-632) (#172), made total by [ADR-635](../docs/06-decisions.md#adr-635)
 * (#2008) — a Unicode VULGAR-FRACTION glyph spelled as the digits the number readers understand. A glyph carries
 * no digit, so every reader that looks for a number found none and fell back to its default: «שטח EFGH = ¼ משטח
 * ABCD» committed ratio 1, green, and «∠A = 22½°» drew 22°. Applied ONCE, at the parser boundary
 * (`normalizeUtterance`), so every rule AND every honesty gate reads the digits — a glyph some reader still drops
 * is then a dropped number that escalates, never a value that vanishes.
 *
 *  - the WHOLE Unicode block (½ ⅓ ⅔ ¼ ¾ ⅕ ⅖ ⅗ ⅘ ⅙ ⅚ ⅐ ⅛ ⅜ ⅝ ⅞ ⅑ ⅒);
 *  - a MIXED number («2½», «2 ½», «22½°») is ONE number: the exact decimal when the fraction terminates
 *    («2½» → `2.5`), else the improper fraction («2⅓» → `7/3`) — analytic's «10½» = 10.5 precedent, made total;
 *  - a lone glyph is `a/b` (the ADR-632 spelling), parenthesised under a root («√½» → `√(1/2)`, never `(√1)/2`)
 *    and kept apart from a glued letter or digit on either side;
 *  - a glyph multiplying a root moves below it («½√3» → `√3/2`, «¾√3» → `3√3/4`): the number grammar reads `1/2√3` as 1/(2√3).
 */
const VULGAR: Record<string, readonly [number, number]> = {
  '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3], '¼': [1, 4], '¾': [3, 4], '⅕': [1, 5], '⅖': [2, 5], '⅗': [3, 5], '⅘': [4, 5],
  '⅙': [1, 6], '⅚': [5, 6], '⅐': [1, 7], '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8], '⅞': [7, 8], '⅑': [1, 9], '⅒': [1, 10],
};
const VULGAR_GLYPH = `[${Object.keys(VULGAR).join('')}]`;
/** A fraction whose denominator has no prime factor but 2 and 5 has an exact decimal. */
const terminates = (d: number): boolean => {
  let x = d;
  for (const p of [2, 5]) while (x % p === 0) x /= p;
  return x === 1;
};
const MIXED_FRACTION = new RegExp(String.raw`${UNGLUED}(\d+) ?(${VULGAR_GLYPH})`, 'g');
const RADICAL_TIMES_FRACTION = new RegExp(String.raw`(${VULGAR_GLYPH})\s*[*·]?\s*√\s*(\([^()]*\)|\d+(?:\.\d+)?)`, 'g');
const LONE_FRACTION = new RegExp(String.raw`(√\s*)?(${VULGAR_GLYPH})`, 'g');
export const spellVulgarFractions = (s: string): string =>
  s
    .replace(MIXED_FRACTION, (_m, whole: string, g: string) => {
      const [n, d] = VULGAR[g];
      const w = parseInt(whole, 10);
      return terminates(d) ? String(w + n / d) : `${w * d + n}/${d}`;
    })
    // a glyph COEFFICIENT of a radical: «½√3» is √3/2, so it is spelled «√3/2» — never «1/2√3», which the
    // number grammar (ADR-298) rightly reads as 1/(2√3)
    .replace(RADICAL_TIMES_FRACTION, (_m, g: string, radicand: string) => {
      const [n, d] = VULGAR[g];
      return `${n === 1 ? '' : n}√${radicand}/${d}`;
    })
    .replace(LONE_FRACTION, (_m, root: string | undefined, g: string, at: number, all: string) => {
      const [n, d] = VULGAR[g];
      if (root) return `${root}(${n}/${d})`;
      const before = /[\p{L}\d.]/u.test(all[at - 1] ?? '') ? ' ' : '';
      const after = /[\d.]/.test(all[at + 1] ?? '') ? ' ' : '';
      return `${before}${n}/${d}${after}`;
    });
