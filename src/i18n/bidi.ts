/**
 * Bidi isolation for LTR technical runs inside RTL sentences — issue #464.
 *
 * The UI is RTL Hebrew, and our messages constantly splice an LTR technical run into a Hebrew sentence:
 * `|BC| = 10`, `∠BAC = 50`, `DE ∥ BC`, `|AC| + |BA| = 9`. Almost every character in such a run —
 * `| = + · ×`, digits, parentheses, `∠ ⊥ ∥ △ √` — is NEUTRAL or weak to the Unicode bidi algorithm, which
 * resolves it to the PARAGRAPH direction. In an RTL paragraph that reverses the run: the operator saw
 * `|BC| = 10` rendered as `10 = |BC|`, and `|AC| + |BA| = 9` as `9 = |BA| + |AC|`.
 *
 * **Why this is a post-processor and not per-value escaping.** The first attempt isolated the
 * INTERPOLATED value at its call site. That cannot work in general, because the run is usually composed
 * from the template's own literals plus the value — `"|{{seg}}| = {{value}}"` builds its pipes and its
 * `=` in the message, not in the argument. The only place the complete run exists is the RENDERED string,
 * so that is where the isolation belongs. Registering it as an i18next post-processor makes it one
 * chokepoint for every `t()` call in the app, including messages written after this one.
 *
 * An isolate says "lay this substring out on its own, LTR, and do not let it interact with the
 * surrounding direction". Unlike the older LRE/PDF embeddings it cannot leak if the text is truncated.
 * Both characters are zero-width: they affect layout only, never the string's meaning — and note the
 * transformation never reorders anything itself, it only tells the renderer not to.
 */

/** Hebrew LETTERS (not the whole block — Hebrew punctuation and niqqud must not split a run). */
const HEBREW_LETTER = /[א-ת]/;

/**
 * The characters that make a span worth isolating: labels, numbers, and the geometry glyphs. Deliberately
 * excludes bare punctuation and whitespace, which is what keeps a trailing `.` or a leading `:` OUTSIDE
 * the isolate — isolating those would move the sentence's own punctuation to the wrong end.
 */
const CORE = /[A-Za-z0-9|∠∡∢⊥∥△▲√⌢°]/;

/**
 * Delimiters that HUG a run and belong inside the isolate with it — `(1, 2, -3)`, `("AB")`.
 *
 * They are not CORE, because a lone `(` in a gap (a Hebrew parenthetical, `הצורה (ראו ABC)`) must not be
 * isolated by itself. They are only absorbed as a BALANCED pair immediately wrapping the core span, which
 * is what tells us they belong to the technical run rather than to the Hebrew sentence around it. Left
 * outside, a bracket is a neutral and the algorithm mirrors it — the pair renders inverted around content
 * that is itself laid out LTR.
 */
const OPEN = '([{"';
const CLOSE = ')]}"';

const LRI = '⁦'; // LEFT-TO-RIGHT ISOLATE
const PDI = '⁩'; // POP DIRECTIONAL ISOLATE

/**
 * Wrap every LTR technical run of `s` in an isolate, leaving Hebrew and surrounding punctuation alone.
 *
 * A "run" is the span between two Hebrew letters (or string edges), trimmed to its first and last CORE
 * character. A string with no Hebrew at all is returned untouched — an English message is already laid
 * out in its own direction and needs nothing.
 */
export function isolateLtrRuns(s: string): string {
  if (!HEBREW_LETTER.test(s)) return s;
  if (s.includes(LRI)) return s; // already isolated — never nest

  let out = '';
  let gap = ''; // the current non-Hebrew span, accumulated until a Hebrew letter closes it
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

/**
 * The i18next post-processor. Registered globally in `./index.ts`, so it covers every message without
 * each call site having to remember — which is the point: the defect class was authors not thinking
 * about bidi, and a rule that relies on them thinking about it has not fixed the class.
 */
export const bidiPostProcessor = {
  type: 'postProcessor' as const,
  name: 'bidiIsolate',
  process(value: string): string {
    return typeof value === 'string' ? isolateLtrRuns(value) : value;
  },
};
