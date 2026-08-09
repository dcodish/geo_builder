/**
 * Bidi isolation for LTR technical runs inside RTL sentences — issue #468, the 3-D half of #464.
 *
 * COPIED from `src/i18n/bidi.ts` as a PATTERN, never imported (docs/20 §12 rule 1 — `src3d/` never
 * imports from `src/`; a stray `@/` would typecheck while silently coupling the products).
 *
 * The UI is RTL Hebrew, and 3-D messages are unusually dense with exactly the content this mangles:
 * primed label runs (`A'B'C'D'`), coordinate triples, plane equations, parametric lines. Almost every
 * character in such a run — `| = + ( ) ,`, digits, `∠ ⊥ ∥ √` — is NEUTRAL to the Unicode bidi algorithm,
 * which resolves it to the PARAGRAPH direction; in an RTL paragraph that reverses the run. The 2-D
 * operator report was `|BC| = 10` rendering as `10 = |BC|`.
 *
 * Isolation belongs at RENDER time, not at the interpolation site: a run is usually composed from the
 * message template's own literals PLUS the value, so the complete run exists only in the rendered string.
 * Hence an i18next post-processor over this instance — one chokepoint, and messages written later are
 * covered without their author having to think about bidi, which is the whole defect class.
 */

/** Hebrew LETTERS (not the whole block — Hebrew punctuation and niqqud must not split a run). */
const HEBREW_LETTER = /[א-ת]/;

/**
 * What makes a span worth isolating. Deliberately excludes bare punctuation and whitespace, which is what
 * keeps a trailing `.` or a leading `:` OUTSIDE the isolate — pulling those in would move the sentence's
 * own punctuation to the wrong end, trading one rendering bug for another.
 *
 * `'` is included on top of the 2-D set: 3-D labels are primed (`A'`, `B'C'`), and a run ending in a prime
 * must keep it inside the isolate.
 */
const CORE = /[A-Za-z0-9'|∠∡∢⊥∥△▲√⌢°]/;

/**
 * Delimiters that HUG a run and belong inside the isolate with it — `(1, 2, -3)` is the 3-D case that
 * makes this load-bearing rather than cosmetic, since a coordinate triple is exactly this shape.
 *
 * Not CORE, because a lone `(` in a gap (a Hebrew parenthetical) must not be isolated by itself. Absorbed
 * only as a BALANCED pair immediately wrapping the core span, which is what marks them as part of the
 * technical run rather than the Hebrew sentence. Left outside, a bracket is a neutral and gets mirrored —
 * the pair renders inverted around content that is itself laid out LTR.
 */
const OPEN = '([{"';
const CLOSE = ')]}"';

const LRI = '⁦'; // LEFT-TO-RIGHT ISOLATE
const PDI = '⁩'; // POP DIRECTIONAL ISOLATE

/**
 * Wrap every LTR technical run of `s` in an isolate, leaving Hebrew and surrounding punctuation alone.
 * A string with no Hebrew is returned untouched; one already carrying isolates is never nested.
 */
export function isolateLtrRuns3(s: string): string {
  if (!HEBREW_LETTER.test(s)) return s;
  if (s.includes(LRI)) return s;

  let out = '';
  let gap = '';
  const flush = () => {
    let first = [...gap].findIndex((c) => CORE.test(c));
    if (first < 0) { out += gap; gap = ''; return; }
    let last = gap.length - 1;
    while (last > first && !CORE.test(gap[last])) last--;
    // absorb balanced delimiters that hug the run, outermost last: `("AB")` takes the quotes, then the
    // parens. An unbalanced one (its partner is elsewhere in the sentence) is left where it is.
    for (;;) {
      if (first === 0 || last + 1 >= gap.length) break;
      const o = OPEN.indexOf(gap[first - 1]);
      if (o < 0 || gap[last + 1] !== CLOSE[o]) break;
      first--;
      last++;
    }
    out += gap.slice(0, first) + LRI + gap.slice(first, last + 1) + PDI + gap.slice(last + 1);
    gap = '';
  };

  for (const ch of s) {
    if (HEBREW_LETTER.test(ch)) { flush(); out += ch; } else gap += ch;
  }
  flush();
  return out;
}

/** The i18next post-processor, registered on the 3-D instance in `./index.ts`. */
export const bidiPostProcessor3 = {
  type: 'postProcessor' as const,
  name: 'bidiIsolate3',
  process(value: string): string {
    return typeof value === 'string' ? isolateLtrRuns3(value) : value;
  },
};
