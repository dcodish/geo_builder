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
 * Signs that may OPEN a technical run (#1296) — the shared rule, ported from `shell/bidi.ts`.
 *
 * NOT in CORE: a CORE character can start a run on its own, and a bare `-` after a Hebrew letter is the
 * particle's maqaf («ציר ה-x», «ו-B», «מ-9»), which must stay with the Hebrew. The guard below is that
 * distinction and nothing else.
 *
 * This tree keeps its own copy until Track B migrates it (ADR-W-016); `shell/__tests__/bidi.test.ts`
 * runs ONE fixture table against all three kits, so the copies cannot drift apart on this rule.
 */
const SIGNS = '-−+';


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
export function bidiSegments(s: string, rtlParagraph = false, liveTail = false): BidiSegment[] {
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
  /** #1296 — does a Hebrew LETTER sit immediately before this gap? If so its leading `-` is a maqaf. */
  let gapAfterHebrew = false;
  const flush = (isFinal = false) => {
    let first = [...gap].findIndex((c) => CORE.test(c));
    if (first < 0) { push(gap, false); gap = ''; return; }
    let last = gap.length - 1;
    // #997 (ADR-504) — the LIVE-TAIL rule, the 3-D ADR-3D-123 Am. 2 rule one product over: a line being
    // TYPED has an incomplete run at its end — «…ABC (» half-way to «…ABC (AB=AC)» — never trailing sentence
    // punctuation, so the final run extends to the end of the string. Without it the unclosed `(` is trimmed
    // out of the run, resolves as a neutral in the RTL box, mirrors, and jumps to the far edge on every
    // keystroke until the paren closes. Only the live preview asks for it; rendered messages and the .docx
    // keep the trimmed run, byte-identical to before.
    if (!(liveTail && isFinal)) while (last > first && !CORE.test(gap[last])) last--;

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

    /**
     * A LEADING SIGN BELONGS TO THE RUN (#1296). `first` is the first CORE character and the loops around
     * it only move over DELIMITERS, so an expression opening with an operator lost it: `(-2,4)` selected
     * `2,4`, leaving `(`, `-` and `)` outside as neutrals to be flipped into the RTL paragraph — the
     * student read «(2,4-)». ABOVE the hug loop, so the parens are then absorbed as a pair. One character,
     * never a loop. A Hebrew letter before the sign means it is a maqaf and it stays out.
     */
    if (first > 0 && SIGNS.includes(gap[first - 1]) &&
        !(first - 1 > 0 ? HEBREW_LETTER.test(gap[first - 2]) : gapAfterHebrew)) {
      first--;
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
    if (HEBREW_LETTER.test(ch)) { flush(); push(ch, false); gapAfterHebrew = true; /* #1296 */ } else gap += ch;
  }
  flush(true);
  return segs;
}

/**
 * Wrap every LTR technical run in a bidi ISOLATE — the DOM rendering strategy.
 *
 * Suitable where the renderer honours the Unicode control characters and never draws them, which is true
 * of a browser. It is NOT true of Word: `.docx` shows U+2066/U+2069 as missing-glyph boxes, so the export
 * uses `bidiSegments` directly and marks direction per RUN instead ([ADR-431](../../docs/06-decisions.md#adr-431) Am. 1).
 */
export function isolateLtrRuns(s: string, rtlParagraph = false, liveTail = false): string {
  if (s.includes(LRI)) return s; // already isolated — never nest
  return bidiSegments(s, rtlParagraph, liveTail)
    .map((g) => (g.ltr ? LRI + g.text + PDI : g.text))
    .join('');
}

/**
 * #997 ([ADR-504](../../docs/06-decisions.md#adr-504)) — #482 half (b), the operator's 2026-08-10 ruling, in 2-D:
 * OPTION 3, a read-only live PREVIEW under the input while the student types.
 *
 * The box itself cannot be fixed: isolate characters inside an editable value corrupt what the student
 * typed and where their caret sits, and forcing `dir="ltr"` is what #118 reverted. So the box stays raw
 * and this seam feeds the shared `InputArea`'s preview with what the line MEANS, laid out correctly, while
 * it is being typed — the mechanism 3-D built for the same report (`inputPreview3`, ADR-3D-123 Am. 1) and
 * 2-D never adopted: the preview prop was wired for the maths renderer only.
 *
 * Returns the isolated text when isolation would CHANGE the layout of an RTL line, `null` otherwise — a
 * pure-Hebrew line renders correctly in the box, a pure-Latin line takes an LTR box (`textDir`), and
 * echoing either underneath is noise. The gate is the transform itself, so the preview appears exactly
 * when the box is lying about the layout.
 */
export const inputPreview = (s: string): string | null => {
  if (!HEBREW_LETTER.test(s)) return null; // an LTR box (textDir) is not lying
  const iso = isolateLtrRuns(s, true, true);
  return iso === s ? null : iso;
};

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
