/**
 * Bidi isolation for LTR technical runs inside RTL sentences — the shared core of #464 (2-D),
 * #468 (3-D) and now the complex builder, which shipped with NO isolation at all (docs/28 §1a).
 *
 * The third implementation of this mechanism, and the first SHARED one (ADR-W-016: bidi isolation
 * is in the shell seed set — implemented ≥2 times and settled). The algorithm is the 3-D
 * refinement (`src3d/i18n/bidi.ts`), which is the most evolved copy: it carries the partner-debt
 * growth and the balanced-hug absorption that the 2-D original learned later. The 2-D and 3-D
 * copies stay in place until Track B migrates those apps (docs/28 §5a).
 *
 * Why isolation is needed at all: almost every character of a technical run — `| = + ( ) ,`,
 * digits, `∠ ⊥ √` — is NEUTRAL to the Unicode bidi algorithm, which resolves it to the PARAGRAPH
 * direction; in an RTL paragraph that reverses the run. The original operator report was
 * `|BC| = 10` rendering as `10 = |BC|`.
 *
 * Why a factory: the run alphabet and the declaration-split rule are the two places the products
 * genuinely differ (3-D splits «הישר l: x=…» into a name island and an equation island; the others
 * must not), so they are PARAMETERS handed in by the caller — never a product branch in here
 * (ADR-W-003: "branching on product identity inside a shared module is a fork wearing a shared
 * file's name").
 */

/** Hebrew LETTERS (not the whole block — Hebrew punctuation and niqqud must not split a run). */
const HEBREW_LETTER = /[א-ת]/;

/**
 * The shared run alphabet: what makes a span worth isolating. Deliberately excludes bare
 * punctuation and whitespace, which keeps a trailing `.` or a leading `:` OUTSIDE the isolate.
 * The union of the settled 2-D and 3-D classes: Latin + digits, primes, `·`, `<`, fraction and
 * superscript glyphs, `ℓ`, the combining vector arrow (written `⃗`, never literally), the
 * Greek span `Α-ω` (π, α, β, θ live there), and the measure/relation glyphs.
 *
 * Characters between the first and last CORE character of a gap ride along (that is how `=`, `+`
 * and spaces inside `z1 = 3+4i` stay in the island), so expression operators need no entry here.
 */
// The combining vector arrow (U+20D7) is built by code point, never written literally — typed as
// itself it would combine with the preceding character in THIS source file (the src3d/i18n/bidi.ts
// lesson).
const VECTOR_ARROW = String.fromCharCode(0x20d7);
const BASE_CORE = "A-Za-z0-9'′·<½¾²³ℓ" + VECTOR_ARROW + 'Α-ω|∠∡∢⊥∥△▲√⌢°';

/**
 * Delimiters that HUG a run and belong inside the isolate with it — `(1, 2, -3)` is the shape
 * that makes this load-bearing. Not CORE, because a lone `(` in a Hebrew parenthetical must not
 * be isolated by itself; absorbed only as a balanced pair, or to settle a partner debt.
 */
const OPEN = '([{"';
const CLOSE = ')]}"';

const LRI = '⁦'; // LEFT-TO-RIGHT ISOLATE
const PDI = '⁩'; // POP DIRECTIONAL ISOLATE

/** Escape a character for safe inclusion in a regex character class. */
const escapeForClass = (s: string) => s.replace(/[\\\]^-]/g, (c) => `\\${c}`);

export interface BidiOptions {
  /**
   * Characters this product's run alphabet adds to the shared base — typically the product's own
   * symbol-palette vocabulary. #482's lesson: the alphabet must be derived from what the tool
   * OFFERS, so pair any extension with a drift lock asserting palette ⊆ run alphabet.
   */
  extraCore?: string;
  /**
   * Optional declaration-split rule: given the isolated span, return
   * `[name, separator, equation]` to render name and equation as SEPARATE islands (the 3-D
   * «הישר l: x=…» textbook layout), or null to keep one island. Absent = never split.
   */
  declSplit?: (span: string) => [string, string, string] | null;
}

export interface BidiKit {
  /** Wrap every LTR technical run in an isolate; Hebrew and surrounding punctuation untouched. */
  isolateLtrRuns: (s: string, liveTail?: boolean) => string;
  /** Base direction by CONTENT — any Hebrew letter ⇒ RTL (`dir="auto"` keys off the FIRST strong
   *  character and gets «C במרחק…» wrong; the #118/ADR-312 lesson). */
  textDir: (s: string) => 'rtl' | 'ltr';
  /** The live-preview seam: the isolated text when isolation would CHANGE the layout, else null. */
  inputPreview: (s: string) => string | null;
  /** An i18next post-processor over this kit, for `createProductI18n`. */
  postProcessor: (name: string) => {
    type: 'postProcessor';
    name: string;
    process: (value: string) => string;
  };
  /** The run alphabet, exported for drift locks ONLY — nothing at runtime branches on these. */
  RUN_CORE: RegExp;
  RUN_DELIMS: string;
}

export function makeBidi(options: BidiOptions = {}): BidiKit {
  const CORE = new RegExp(`[${BASE_CORE}${escapeForClass(options.extraCore ?? '')}]`);
  const declSplit = options.declSplit;

  function isolateLtrRuns(s: string, liveTail = false): string {
    if (!HEBREW_LETTER.test(s)) return s;
    if (s.includes(LRI)) return s; // never nest isolates

    let out = '';
    let gap = '';
    const flush = (isFinal = false) => {
      let first = [...gap].findIndex((c) => CORE.test(c));
      if (first < 0) {
        out += gap;
        gap = '';
        return;
      }
      let last = gap.length - 1;
      // A finished sentence's trailing non-CORE characters are punctuation and stay outside the
      // run — but a line BEING TYPED ends in an incomplete expression, so the final gap's run
      // extends to the end of the string (the preview's liveTail mode).
      if (!(liveTail && isFinal)) while (last > first && !CORE.test(gap[last])) last--;

      /** How many of `ch` sit inside the currently-selected span. */
      const countIn = (ch: string) => {
        let n = 0;
        for (let i = first; i <= last; i++) if (gap[i] === ch) n++;
        return n;
      };

      // A delimiter whose PARTNER is inside the span belongs to the run too: `t(m+2,m,m-2)` trims
      // to an orphaned `)` otherwise, which mirrors and lands at the far edge of the row. Grow the
      // span over any partner it is owed. A quote is inert here (its own opener and closer, debt
      // always zero) — it stays the hug loop's business, where balance identifies the pair.
      for (;;) {
        let grew = false;
        if (last + 1 < gap.length) {
          const c = CLOSE.indexOf(gap[last + 1]);
          if (c >= 0 && countIn(OPEN[c]) > countIn(CLOSE[c])) {
            last++;
            grew = true;
          }
        }
        if (first > 0) {
          const o = OPEN.indexOf(gap[first - 1]);
          if (o >= 0 && countIn(CLOSE[o]) > countIn(OPEN[o])) {
            first--;
            grew = true;
          }
        }
        if (!grew) break;
      }

      // Absorb balanced delimiters that hug the run, outermost last: `("AB")` takes the quotes,
      // then the parens. An unbalanced one (partner elsewhere in the sentence) stays where it is.
      for (;;) {
        if (first === 0 || last + 1 >= gap.length) break;
        const o = OPEN.indexOf(gap[first - 1]);
        if (o < 0 || gap[last + 1] !== CLOSE[o]) break;
        first--;
        last++;
      }

      const span = gap.slice(first, last + 1);
      const parts = declSplit?.(span) ?? null;
      const body = parts
        ? LRI + parts[0] + PDI + parts[1] + LRI + parts[2] + PDI // name island · separator · equation island
        : LRI + span + PDI;
      out += gap.slice(0, first) + body + gap.slice(last + 1);
      gap = '';
    };

    for (const ch of s) {
      if (HEBREW_LETTER.test(ch)) {
        flush();
        out += ch;
      } else gap += ch;
    }
    flush(true);
    return out;
  }

  return {
    isolateLtrRuns,
    textDir: (s) => (HEBREW_LETTER.test(s) ? 'rtl' : 'ltr'),
    inputPreview: (s) => {
      const iso = isolateLtrRuns(s, true);
      return iso === s ? null : iso;
    },
    postProcessor: (name) => ({
      type: 'postProcessor' as const,
      name,
      process: (value: string) => (typeof value === 'string' ? isolateLtrRuns(value) : value),
    }),
    RUN_CORE: CORE,
    RUN_DELIMS: OPEN + CLOSE,
  };
}
