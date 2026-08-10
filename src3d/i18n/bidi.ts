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
 *
 * #482: this class was hand-authored against a GUESSED alphabet and drifted from the one the tool itself
 * offers — 13 of the 18 characters in `ui/symbols3.ts` were missing, including every Greek letter and `ℓ`,
 * which are how planes and lines are NAMED here. A missing character does not merely fail to start a run:
 * it SPLITS one, because `first`/`last` below scan for CORE, so `מישור π1: …` isolated from the `1` and
 * left the `π` outside as its own stray LTR run. The additions are exactly the palette's own vocabulary
 * (Greek letters, `ℓ`, `′`, `·`, `½`, `¾`, `<`, the combining vector arrow) plus the superscripts that end
 * a measure (`x²`), and `__tests__/bidi3.test.ts` now asserts the palette is a SUBSET of this class, so the
 * two cannot drift apart again.
 */
// The combining vector arrow is written as `⃗`, never literally: typed as itself it would combine
// with the preceding character in THIS source file, making the class unreadable and easy to break by
// accident. `Α-ω` is the Greek letter span (Α…ω) — π, α, β, γ, δ, θ all live in it.
const CORE = /[A-Za-z0-9'′·<½¾²³ℓ\u20D7Α-ω|∠∡∢⊥∥△▲√⌢°]/;

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

/**
 * The run alphabet, exported for the drift lock only (`__tests__/bidi3.test.ts`) — nothing at runtime
 * should branch on these. The test asserts `ui/symbols3.ts` ⊆ `RUN_CORE ∪ RUN_DELIMS`, which is what
 * makes "someone added a palette button" a test failure rather than a rendering bug found in prod.
 */
export const RUN_CORE = CORE;
export const RUN_DELIMS = OPEN + CLOSE;

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

    /** How many of `ch` sit inside the currently-selected span. */
    const countIn = (ch: string) => {
      let n = 0;
      for (let i = first; i <= last; i++) if (gap[i] === ch) n++;
      return n;
    };

    // #482, and the defect the HUG loop below could never reach: a delimiter whose PARTNER is inside the
    // span belongs to the run too. `t(m+2,m,m-2)` trims to `t(m+2,m,m-2` because a closer is not CORE,
    // and the orphaned `)` is then a bidi NEUTRAL — it resolves to the RTL paragraph, MIRRORS to `(`, and
    // lands at the far left of the row. That is the stray paren the operator screenshotted. The hug loop
    // cannot fix it: it only absorbs a pair wrapping the span END TO END, and here the opener sits in the
    // middle of the run (after `t`), not before it. Grow the span over any partner it is owed instead.
    // A quote is deliberately inert here (`"` is its own opener and closer, so the debt is always zero) —
    // it stays the hug loop's business, where balance is what identifies the pair.
    for (;;) {
      let grew = false;
      if (last + 1 < gap.length) {
        const c = CLOSE.indexOf(gap[last + 1]);
        if (c >= 0 && countIn(OPEN[c]) > countIn(CLOSE[c])) { last++; grew = true; }
      }
      if (first > 0) {
        const o = OPEN.indexOf(gap[first - 1]);
        if (o >= 0 && countIn(CLOSE[o]) > countIn(OPEN[o])) { first--; grew = true; }
      }
      if (!grew) break;
    }

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
