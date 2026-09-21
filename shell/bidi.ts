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

/**
 * Signs that may OPEN a technical run — the left-edge case the span selection was missing (#1296).
 *
 * Both spellings of the minus, because a paste from a PDF carries U+2212 and a keyboard carries U+002D,
 * and the plus for symmetry (it is never a maqaf, so it needs no exception; no case was measured for it,
 * but a run that opens with `+` is broken in exactly the same way and by exactly the same rule).
 *
 * NOT added to `BASE_CORE`, deliberately. A CORE character can START a run on its own, and a bare `-`
 * between two Hebrew words is a maqaf, not an expression — putting it in CORE would isolate «ציר ה-x»'s
 * hyphen away from the «ה» it belongs to and break every one of the correct rows in the lock table.
 */
const SIGNS = '-−+';

const LRI = '⁦'; // LEFT-TO-RIGHT ISOLATE
const PDI = '⁩'; // POP DIRECTIONAL ISOLATE

/**
 * THE invisible format controls — the ONE definition of the set, for every product.
 *
 * These are characters the APP injects for DISPLAY (`isolateLtrRuns` wraps LTR runs in
 * U+2066/U+2069 so an RTL paragraph lays out correctly), plus the controls a paste from a PDF or
 * another RTL editor carries. A student never types one.
 *
 * Written by CODE POINT, never literally: typed as themselves they are invisible in this source
 * file, so a later edit cannot see what it is changing — the same discipline the vector arrow
 * above is built under.
 *
 *   U+061C            ARABIC LETTER MARK
 *   U+200B .. U+200F  ZWSP, ZWNJ, ZWJ, LRM, RLM
 *   U+202A .. U+202E  LRE, RLE, PDF, LRO, RLO
 *   U+2066 .. U+2069  LRI, RLI, FSI, PDI   ← what `isolateLtrRuns` emits
 *   U+FEFF            BOM / ZWNBSP
 */
const FORMAT_CONTROLS = /[\u061C\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Strip every invisible format control from a string.
 *
 * WHY THIS IS SHARED AND NOT THREE REGEXES: the set had three copies (2-D `normalizeUtterance`,
 * 3-D `normalize3`, and nothing at all on the store side), and a set spelled per site is a set
 * that drifts. Both parsers now read it from here, and so does every product store.
 *
 * WHERE IT BELONGS — two different jobs, deliberately both:
 *   - at the PARSER boundary, so a display transform can never reach the grammar (#531,
 *     ADR-3D-144);
 *   - at the STORE boundary, so a display transform can never reach the FACT LIST — the source of
 *     truth that is saved, logged, exported and compared (#751, ADR-W-029).
 * Cleaning only for the parser leaves the stored copy dirty, which is exactly the defect #751
 * reports: the .docx printed U+2066/U+2069 as missing-glyph boxes from a chip-seeded fact.
 */
export function stripFormatControls(s: string): string {
  return s.replace(FORMAT_CONTROLS, '');
}

const FSI = '\u2068'; // FIRST STRONG ISOLATE

/**
 * THE MIRROR OF `isolateLtrRuns`: an RTL NAME inside an LTR row (#1344).
 *
 * `isolateLtrRuns` protects a technical run inside an RTL paragraph. This protects the other
 * direction, which the analytic panel needs: its equations section is laid out `ltr`, and a display
 * name that mixes a Hebrew noun with a DIGIT — «ישר 3», «מעגל 1» — is not a self-contained island
 * there. Under the bidi algorithm a European number adjacent to a right-to-left run takes that run's
 * direction, so «ישר 3:» becomes ONE RTL run, displayed reversed, and it drags the colon and the
 * equation's leading digit in with it: «ישר 3: 3x + 2y − 2 = 0» rendered as «3 :3 ישרx + 2y - 2 = 0».
 * A Latin name (`l3`, `I`) never had the problem, which is why #1216 shipped digit-named circles
 * without anyone seeing it.
 *
 * **FSI, not RLI**: first-strong takes the direction from the name's own first letter, so this is
 * correct for a Hebrew name and harmless for any other — the caller does not have to classify.
 *
 * Applied only when there IS a Hebrew letter, so a Latin name carries no invisible characters at all.
 * Like every other isolate this kit emits, it is DISPLAY only: `stripFormatControls` already covers
 * U+2066–2069 at the parser and store boundaries, so it can never reach the grammar, the fact list or
 * the .docx export's run renderer (ADR-431 Am. 1, which cannot draw these code points).
 */
export function isolateRtlName(name: string): string {
  return HEBREW_LETTER.test(name) ? FSI + name + PDI : name;
}

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

/** One stretch of a line, tagged with the direction it must be laid out in. */
export interface BidiSegment {
  text: string;
  /** True for a technical run that must read left-to-right whatever the surrounding direction. */
  ltr: boolean;
}

export interface BidiKit {
  /**
   * Split a line into directional segments — THE one place that decides where a technical run
   * begins and ends. Every other member here is built on it, so no two surfaces of the same
   * product can disagree about what counts as a run.
   *
   * `rtlParagraph` is for callers whose direction is imposed from OUTSIDE rather than derived from
   * the text's own content: the .docx export forces `w:bidi`, so an all-Latin given like
   * `|BC| = 10` sits in an RTL paragraph and scrambles although it holds no Hebrew at all.
   */
  segments: (s: string, rtlParagraph?: boolean, liveTail?: boolean) => BidiSegment[];
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

  /**
   * THE run-boundary decision, and the only copy of it. `isolateLtrRuns` renders these segments as
   * Unicode isolates for a browser; the .docx export renders the SAME segments as OOXML runs with
   * per-run direction, because Word draws U+2066/U+2069 as missing-glyph boxes (ADR-431 Am. 1).
   */
  function segments(s: string, rtlParagraph = false, liveTail = false): BidiSegment[] {
    // The Hebrew test is a proxy for "this text will be laid out RTL", which is right for a UI
    // message whose direction comes from its own content and WRONG where the paragraph direction is
    // imposed from outside. Those callers pass `rtlParagraph`.
    if (!rtlParagraph && !HEBREW_LETTER.test(s)) return s ? [{ text: s, ltr: false }] : [];

    const segs: BidiSegment[] = [];
    const push = (text: string, ltr: boolean) => {
      if (!text) return;
      const prev = segs[segs.length - 1];
      if (prev && prev.ltr === ltr) prev.text += text; // coalesce, so a Hebrew word is one segment
      else segs.push({ text, ltr });
    };

    let gap = ''; // the current non-Hebrew span, accumulated until a Hebrew letter closes it
    /**
     * Does a Hebrew LETTER sit immediately before this gap? (#1296)
     *
     * A gap is closed by a Hebrew letter and the next one begins right after it, so every gap but the
     * first has one — and the first has nothing before it at all. That distinction is the whole maqaf
     * test: `-` after a Hebrew letter is the particle's hyphen («ציר ה-x», «ו-B», «מ-9»), and `-` after
     * anything else, or at the very start of the line, is a sign.
     */
    let gapAfterHebrew = false;
    const flush = (isFinal = false) => {
      let first = [...gap].findIndex((c) => CORE.test(c));
      if (first < 0) {
        push(gap, false);
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

      /**
       * A LEADING SIGN BELONGS TO THE RUN (#1296) — the span's left-edge case, and it runs HERE.
       *
       * `first` is the first CORE character, and the two loops around it only ever move over a
       * DELIMITER. So an expression that OPENS with an operator lost it: `(-2,4)` selected the span
       * `2,4`, which left `(`, `-` and `)` outside as bidi neutrals, the UBA resolved all three to the
       * RTL paragraph, and the student read «(2,4-)» — the operator's *"I cannot enter the coordinates
       * in a normal way"*. Measured across four products; an INTERIOR minus, `(2,-4)`, was always fine.
       *
       * ORDER IS LOAD-BEARING: this sits above the hug loop so `(-2,4)` first becomes the span `-2,4`,
       * and the hug loop then sees `(` and `)` adjacent and absorbs the pair — the same path `(2,4)`
       * already took. Below the hug loop it would be too late and the parens would stay outside.
       *
       * ONE character, never a loop. `--5` is not something a student writes, and repeating would start
       * eating the maqaf in «ל--» shapes for no gain.
       */
      if (
        first > 0 &&
        SIGNS.includes(gap[first - 1]) &&
        !(first - 1 > 0 ? HEBREW_LETTER.test(gap[first - 2]) : gapAfterHebrew)
      ) {
        first--;
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
      push(gap.slice(0, first), false);
      if (parts) {
        // name island · separator · equation island (the 3-D «הישר l: x=…» textbook layout)
        push(parts[0], true);
        push(parts[1], false);
        push(parts[2], true);
      } else push(span, true);
      push(gap.slice(last + 1), false);
      gap = '';
    };

    for (const ch of s) {
      if (HEBREW_LETTER.test(ch)) {
        flush();
        push(ch, false);
        gapAfterHebrew = true; // #1296 — the next gap opens against a Hebrew letter, so its `-` is a maqaf
      } else gap += ch;
    }
    flush(true);
    return segs;
  }

  function isolateLtrRuns(s: string, liveTail = false): string {
    if (s.includes(LRI)) return s; // never nest isolates
    return segments(s, false, liveTail)
      .map((g) => (g.ltr ? LRI + g.text + PDI : g.text))
      .join('');
  }

  return {
    segments,
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
