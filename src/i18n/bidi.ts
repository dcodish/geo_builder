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
 *
 * #482 (reported against 3-D, fixed in both trees — copied pattern, docs/20 §12 rule 1): this class was
 * hand-authored against a GUESSED alphabet and had drifted from the one the app itself offers. Twelve of
 * the characters in `ui/symbols.ts` were absent — every Greek letter, `²`, `^`, `≅`, `~`, `<`, `_`. A
 * missing character does not merely fail to START a run, it SPLITS one, because `first`/`last` below scan
 * for CORE: `AB = x²` trimmed to `AB = x`, orphaning the `²`. `__tests__/bidi.test.ts` now asserts the
 * palette is a SUBSET of this class, so adding a button without teaching bidi about it fails the suite.
 */
const CORE = /[A-Za-z0-9^_~<≅²³½¾·Α-ω|∠∡∢⊥∥△▲√⌢°]/;

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

/**
 * The run alphabet, exported for the drift lock only (`__tests__/bidi.test.ts`) — nothing at runtime
 * should branch on these. The test asserts `ui/symbols.ts` ⊆ `RUN_CORE ∪ RUN_DELIMS`, which is what makes
 * "someone added a palette button" a test failure rather than a rendering bug found in prod.
 */
export const RUN_CORE = CORE;
export const RUN_DELIMS = OPEN + CLOSE;

const LRI = '⁦'; // LEFT-TO-RIGHT ISOLATE
const PDI = '⁩'; // POP DIRECTIONAL ISOLATE

/** One stretch of a message, tagged with the direction it must be laid out in. */
export interface BidiSegment {
  text: string;
  /** True for a technical run that must read left-to-right regardless of the surrounding direction. */
  ltr: boolean;
}

/**
 * Split `s` into directional segments — the one place that decides where a technical run begins and ends.
 *
 * A run is the span between two Hebrew letters (or string edges), trimmed to its first and last CORE
 * character, then extended over any balanced delimiter pair hugging it. Both consumers below are built on
 * this, so the browser and the .docx can never disagree about what counts as a run.
 */
export function bidiSegments(s: string, rtlParagraph = false): BidiSegment[] {
  // The Hebrew test is a proxy for "this text will be laid out RTL", which is right for a UI message
  // whose direction is derived from its own content. It is WRONG wherever the paragraph direction is
  // imposed from outside — the .docx export forces `w:bidi`, so an all-Latin given like `|BC| = 10` sits
  // in an RTL paragraph and scrambles even though it contains no Hebrew at all. Those callers say so.
  if (!rtlParagraph && !HEBREW_LETTER.test(s)) return s ? [{ text: s, ltr: false }] : [];

  const segs: BidiSegment[] = [];
  const push = (text: string, ltr: boolean) => {
    if (!text) return;
    const prev = segs[segs.length - 1];
    if (prev && prev.ltr === ltr) prev.text += text; // coalesce, so a Hebrew word is one segment
    else segs.push({ text, ltr });
  };

  let gap = ''; // the current non-Hebrew span, accumulated until a Hebrew letter closes it
  const flush = () => {
    let first = [...gap].findIndex((c) => CORE.test(c));
    if (first < 0) { push(gap, false); gap = ''; return; }
    let last = gap.length - 1;
    while (last > first && !CORE.test(gap[last])) last--;

    /** How many of `ch` sit inside the currently-selected span. */
    const countIn = (ch: string) => {
      let n = 0;
      for (let i = first; i <= last; i++) if (gap[i] === ch) n++;
      return n;
    };

    // #482: a delimiter whose PARTNER is inside the span belongs to the run too. `√(2/3)` trims to
    // `√(2/3` because a closer is not CORE, and the orphaned `)` is then a bidi NEUTRAL — it resolves to
    // the RTL paragraph, MIRRORS to `(`, and lands at the wrong end of the line. The hug loop below
    // cannot reach this: it only absorbs a pair wrapping the span END TO END, whereas here the opener
    // sits in the middle of the run. Grow the span over any partner it is owed first.
    // A quote is inert here (`"` is its own opener and closer, so the debt is always zero) — it stays the
    // hug loop's business, where balance is what identifies the pair.
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
    push(gap.slice(0, first), false);
    push(gap.slice(first, last + 1), true);
    push(gap.slice(last + 1), false);
    gap = '';
  };

  for (const ch of s) {
    if (HEBREW_LETTER.test(ch)) { flush(); push(ch, false); } else gap += ch;
  }
  flush();
  return segs;
}

/**
 * Wrap every LTR technical run in a bidi ISOLATE — the DOM rendering strategy.
 *
 * Suitable where the renderer honours the Unicode control characters and never draws them, which is true
 * of a browser. It is NOT true of Word: `.docx` shows U+2066/U+2069 as missing-glyph boxes, so the export
 * uses `bidiSegments` directly and marks direction per RUN instead ([ADR-431](../../docs/06-decisions.md#adr-431) Am. 1).
 */
export function isolateLtrRuns(s: string, rtlParagraph = false): string {
  if (s.includes(LRI)) return s; // already isolated — never nest
  return bidiSegments(s, rtlParagraph)
    .map((g) => (g.ltr ? LRI + g.text + PDI : g.text))
    .join('');
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
