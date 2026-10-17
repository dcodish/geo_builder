/**
 * #1912 ([ADR-3D-329](../docs/06b-decisions-3d.md#adr-3d-329)) — THE LOOK-ALIKE GLYPH FOLD, ONE
 * SPELLING FOR EVERY BUILDER.
 *
 * A mathematical symbol has several Unicode glyphs that render alike, and which one a student gets is
 * decided by the keyboard, the palette, or the PDF they pasted from — never by what they meant. ⟂
 * (U+27C2) and ⊥ (U+22A5) are both "perpendicular"; ∡ (U+2221) and ∢ (U+2222) are both the book's
 * angle sign ∠ (U+2220); ⁰ (U+2070), º (U+00BA) and ˚ (U+02DA) are all the degree sign °; and on a
 * keyboard with none of them, `<` is the angle sign and the word «שורש» is √.
 *
 * Measured on 2026-10-08 (the #1912 sweep) and again at pickup: 2-D folds ∡∢, the guarded `<`, ⁰ and
 * «שורש» at its own input boundary and reads ⟂ beside ⊥ inside each rule; analytic folds ∡∢ and ⁰ in
 * `orthography` and reads ⟂ in `REL_PERP_SYM`; **3-D folded none of them**, so «AC ⟂ AB», «∡ABC = 40°»,
 * «<ABC = 40°», «∠ABC = 40⁰» and «אורך AB הוא שורש 2» were all "not understood" there while their
 * canonical twins build. That is the class: *a look-alike glyph that one builder folds at its input
 * boundary reaches another builder's grammar unfolded, so a sentence it reads in the canonical glyph is
 * refused.* A per-rule fix leaves the next rule to reintroduce the miss, so the fold lives ONCE, here,
 * and every builder calls it at its parser boundary (2-D `normalizeUtterance`, 3-D `normalize3` and its
 * ask lane `parseQuery`, analytic `orthography`).
 *
 * **Complex is deliberately not a caller.** `src-complex/parser/normalize.ts` reads a superscript digit
 * as an explicit POWER («z²»), so folding ⁰ → ° there would turn an exponent into a degree sign.
 *
 * **The stored line is untouched.** This is the parser boundary only: the fact row keeps exactly the
 * glyph the student typed.
 *
 * THE `<` GUARD (2-D's, verbatim — issue #237, ADR-381). Students approximate the book's ∠ with `<`
 * («<ACB = 40»), and `<` is also the less-than sign. It reads as ∠ only when it is FOLLOWED by an
 * uppercase label run (1–3 labels, not part of a longer letter run) and NOT PRECEDED, ignoring
 * whitespace, by an operand — a label/measure letter, a digit, or a closing bracket. So «AB < CD»,
 * «α<β», «R<r», «k < 0», «0 < t < 1» and «60 < זווית SAB < 90» stay comparisons.
 *
 * THE DEGREE GUARD. ⁰ folds anywhere (a superscript zero is never a digit in this grammar), while º
 * and ˚ fold only directly after a digit: both are letter-like glyphs (a masculine ordinal indicator
 * and a combining-style ring) that can legitimately stand inside a word.
 *
 * THE LOOK-ALIKE LETTERS (#1919, the operator's ruling of 2026-10-08: *"Fold them silently"*). The
 * uppercase Cyrillic homoglyphs (А В С Е Н К М О Р Т Х) are the Latin letters they render as, so «משולש
 * КМО» is the triangle KMO in every builder — this was 2-D's private `CYRILLIC_TO_LATIN` until #1919
 * ruled, and it is the LAST row for the reason the order note below gives: it is exactly where 2-D has
 * always applied it. A non-Latin letter with NO Latin twin folds to nothing and is refused by name
 * instead — {@link unreadScriptRuns} in `shell/inputScript.ts`, which runs right after this table.
 */

/** One fold: the pattern, its replacement, and why the symbol is the same intent. */
export interface GlyphFold {
  readonly why: string;
  readonly apply: (s: string) => string;
}

/**
 * The uppercase Cyrillic letters that are visual twins of a Latin uppercase (#45 / ADR-299, #1919) —
 * only the unambiguous look-alikes, so a label pasted with a homoglyph reads as the letter it looks like.
 */
const LOOKALIKE_LETTERS: Record<string, string> = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X',
};

/**
 * Fold every look-alike LETTER onto its Latin twin — the letter half of the table, exported on its own
 * because the input-script check (`shell/inputScript.ts`) must fold the twins before it judges a
 * letter unreadable, and it serves complex too, which deliberately never calls {@link foldGlyphs}.
 */
export const foldLookalikeLetters = (s: string): string =>
  s.replace(/[АВСЕНКМОРТХ]/g, (ch) => LOOKALIKE_LETTERS[ch]);

/**
 * #2069 ([ADR-W-145](../docs/06w-decisions-workspace.md#adr-w-145)) — THE PARALLEL LOOK-ALIKES, «‖» (U+2016 DOUBLE
 * VERTICAL LINE) and two ASCII bars «||», as ∥ (U+2225 PARALLEL TO). Both are also a WRAPPING notation — the norm
 * «‖u‖» and two absolute values «|AB||CD|» — so the fold is INFIX only: an operand directly before it (a label, a
 * line or vector name, a digit, a closing bracket) and an operand directly after it (a letter or «(»), ignoring
 * whitespace, and no unclosed bar of the same kind before it on the line. «‖u‖ = 5», «|AB||CD|» and «|AB|·|CD|»
 * are never turned into a parallel.
 */
const PAR_OPERAND_BEFORE = /[A-Za-zα-ω0-9'ℓ)\]]$/;
const PAR_OPERAND_AFTER = /^[A-Za-zα-ωℓ(]/;
const foldParallelLookalike =
  (glyph: RegExp, bar: string) =>
  (s: string): string => {
    // left to right, so a bar already read as ∥ is not counted as a wrapper («AB ‖ CD ‖ EF» folds both)
    let out = '';
    let last = 0;
    for (const m of s.matchAll(glyph)) {
      const off = m.index ?? 0;
      out += s.slice(last, off);
      last = off + m[0].length;
      const unclosed = out.split(bar).length % 2 === 0; // an open bar of the same kind: this one closes a wrapper
      const infix =
        !unclosed &&
        PAR_OPERAND_BEFORE.test(out.replace(/\s+$/, '')) &&
        PAR_OPERAND_AFTER.test(s.slice(last).replace(/^\s+/, ''));
      out += infix ? '∥' : m[0];
    }
    return out + s.slice(last);
  };

/** The keyboard `<` as the angle sign — 2-D's guard (ADR-381), the one place it is spelled. */
const foldKeyboardAngle = (s: string): string =>
  s.replace(/</g, (m, off: number, str: string) => {
    if (!/^\s*(?:[A-Z]\d*){1,3}(?![A-Za-z])/.test(str.slice(off + 1))) return m;
    const before = str.slice(0, off).replace(/\s+$/, '');
    return /[A-Za-z0-9α-ωΑ-Ω)\]}|]$/.test(before) ? m : '∠';
  });

/**
 * The table, in the order 2-D has always applied it — ∡∢ → `<` → ⁰, with the glyph-for-glyph rows
 * (⟂, º, ˚) beside the twin they fold to and «שורש» last, where 2-D keeps it. The order is part of the
 * contract: a later row must never be able to create an operand an earlier row's guard would have read.
 */
export const GLYPH_FOLDS: readonly GlyphFold[] = [
  {
    why: '⟂ (U+27C2) is ⊥ (U+22A5): every builder’s symbol palette inserts ⊥, and a line copied from a book or another builder may carry either',
    apply: (s) => s.replace(/⟂/g, '⊥'),
  },
  {
    why: '«‖» (U+2016 DOUBLE VERTICAL LINE) between two operands is ∥ (U+2225), the parallel sign (#2069, FR-SU-17) — never as the norm’s wrapping pair «‖u‖»',
    apply: foldParallelLookalike(/‖/g, '‖'),
  },
  {
    why: 'two ASCII bars «||» between two operands are ∥ (#2069, FR-SU-17), the keyboard spelling 3-D and analytic already read — never inside an absolute value («|AB||CD|»)',
    apply: foldParallelLookalike(/\|\|/g, '|'),
  },
  {
    why: '∡ (MEASURED ANGLE) and ∢ (SPHERICAL ANGLE) are the book’s ∠ (#45, ADR-299)',
    apply: (s) => s.replace(/[∡∢]/g, '∠'),
  },
  {
    why: 'the keyboard-natural `<` before a label run is ∠ (#237, ADR-381) — guarded on both sides, so a comparison stays a comparison',
    apply: foldKeyboardAngle,
  },
  {
    why: 'the SUPERSCRIPT ZERO ⁰ typed for degrees is ° (#45, ADR-299)',
    apply: (s) => s.replace(/⁰/g, '°'),
  },
  {
    why: 'º (MASCULINE ORDINAL INDICATOR) and ˚ (RING ABOVE) after a digit are ° — the two glyphs an OS keyboard offers in its place',
    apply: (s) => s.replace(/(?<=\d)\s*[º˚]/g, '°'),
  },
  {
    why: 'the Hebrew word «שורש» before a number or «(» is √ (#105) — «שורש של», where no value follows, is left to the rules',
    apply: (s) => s.replace(/שורש\s*(?=[\d(])/g, '√'),
  },
  {
    why: 'an uppercase CYRILLIC homoglyph (А/В/С/…) is the Latin letter it renders as (#45, #1919) — the student typed a label, not a Russian word',
    apply: foldLookalikeLetters,
  },
];

/** Fold every look-alike glyph onto the symbol it renders as. Pure; call it at a parser boundary. */
export function foldGlyphs(s: string): string {
  return GLYPH_FOLDS.reduce((acc, f) => f.apply(acc), s);
}
