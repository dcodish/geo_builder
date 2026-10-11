/**
 * #1919 ([ADR-626](../docs/06-decisions.md#adr-626), [ADR-3D-328](../docs/06b-decisions-3d.md#adr-3d-328))
 * — THE INPUT-SCRIPT RULE: the tool reads Hebrew and English, and a letter it cannot read is REFUSED BY
 * NAME, never silently replaced.
 *
 * The operator, 2026-10-08: *"we only support english or hebrew so any letter or mention of anything
 * that is not in these languages is rejected. in all tools"*, with two follow-ups the same day: *"Keep
 * Greek as math"* (α, β, γ, π, θ stay valid notation — only a POINT NAME must be Latin) and, for the
 * Cyrillic letters that are visual twins of a Latin uppercase, *"Fold them silently"* (`foldGlyphs`'
 * look-alike row, which runs first — «משולש КМО» is the triangle KMO, not a refusal).
 *
 * ## The class this closes
 *
 * Measured at `ad8df1d3` (#1919's re-measure, every builder's real door with the model mocked):
 * «משולש ДЖФ» COMMITTED triangle **A, B, C** in 2-D and recorded A, B, C in 3-D — the student's three
 * letters vanished and the figure carried three letters he never typed, with a green ✓. The same for
 * «ריבוע ДЖФИ», «מחומש ДЖФИЛ», «מקבילית ДЖФИ», «משולש ישר זווית ДЖФ», «triangle ДЖФ», «משולש ابج»
 * (Arabic) and «משולש ÉÜÇ» (accented Latin).
 *
 * The cause is one shape, in both trees: *a letter the label grammar does not read is invisible to every
 * gate that counts labels.* So a shape noun followed by such letters reads as UNLABELLED and the noun's
 * default names (A, B, C …) are drawn. In 2-D four gates miss it at once (`namesVertices`, the
 * fail-closed `shapeLeftover`, `statedLabelTokens`, the span accountant); in 3-D it is `declLeftover`.
 * Teaching eight tokenizers one script each leaves the ninth to reintroduce it, so the rule lives ONCE,
 * here, and every builder calls it at its statement seam — the `shell/proofTarget` precedent
 * (ADR-W-107): a pure rule in `shell/`, no strings, each builder wording its own refusal.
 *
 * ## What is readable
 *
 * - **Latin `A–Z a–z`** — the label alphabet and English. An ACCENTED Latin letter (É, Ü, Ç, À) is not
 *   English and is not a label, so it is refused: that is the measured «משולש ÉÜÇ» row.
 * - **Hebrew** (U+0590–U+05FF) — the input language. 2-D's own «משולש אבג» note (`input.scope.hebrew-labels`,
 *   ADR-497) still owns Hebrew LABELS: Hebrew is readable, and that sentence is about where it may stand.
 * - **Greek** (U+0370–U+03FF) — notation, by the ruling: «α = 30», «60 < α < 90», «π», «ΔABC». A Greek
 *   VERTEX NAME is a different question, and it is answered where it was already answered — 2-D's span
 *   accountant hands «משולש ΓΔΘ» to the model, and #1919 makes 3-D's `declLeftover` do the same.
 * - **Letterlike and mathematical alphanumeric symbols** (U+2100–U+214F, U+1D400–U+1D7FF) — ℓ, ℝ, ℏ: a
 *   math glyph that Unicode happens to class as a letter, never a word in another language.
 * - **Notation glyphs Unicode classes as letters** — every MODIFIER letter (`\p{Lm}`: ⁿ, ᵢ, ₖ, and the
 *   prime-like ʹ ʼ that 3-D's label reader folds) and the two ordinal indicators ª º. These are not
 *   judged at all: a superscript n is an exponent, and º is the degree sign the glyph fold reads
 *   (#1912) — refusing «∠ABC = 40º» as "not Hebrew or English" would be plainly false. Complex, which
 *   does not run the glyph fold, needs exactly this: its `xⁿ` and `zₖ` notation must reach its grammar.
 *
 * ## Which of the two ruled sentences
 *
 * The operator gave two, one for a NAME and one for a WORD, so the line is classed. A point name in this
 * grammar is ONE run of capitals, optionally with digits — so the line reads as a `name` when its
 * unreadable part is exactly one such run, and as a `word` otherwise:
 *
 * - **`name`** — a single run, no lowercase letter, at most {@link MAX_NAME_LETTERS} letters (a hexagon's
 *   vertex list is the longest run any builder's grammar reads): «ДЖФ», «ДЖФИЛ», «ابج», «ÉÜÇ», «Д1Ж1Ф1»,
 *   the «Д» of «נקודה Д». The refusal is the sentence the operator chose: *«"ДЖФ" אינו שם של נקודה. שם
 *   נקודה הוא אות לטינית גדולה, אפשר עם ספרה — למשל G או A1.»*
 * - **`word`** — a run with a lowercase letter («треугольник»), a run too long to be a vertex list, or
 *   SEVERAL unreadable runs («مثلث متساوي الساقين» — a sentence in another language, never a name). The
 *   refusal is the other ruled sentence: *«הכלי קורא עברית ואנגלית בלבד — "…" אינו באחת מהן.»*
 *
 * Both sentences are the operator's; which run gets which is the MECHANISM half (CLAUDE.md rule 7).
 *
 * **The stored line is untouched**, exactly as with the glyph fold: this judges a statement at the seam,
 * and a saved session that recorded «משולש ДЖФ» as A, B, C before the rule still loads as it did.
 */
import { foldLookalikeLetters } from './glyphFold';

/** How many letters a run may carry and still read as a point-name run — a hexagon's vertex list. */
export const MAX_NAME_LETTERS = 6;

/** Which ruled sentence a run is refused with: a point name, or a word in another language. */
export type UnreadKind = 'name' | 'word';

/**
 * A letter this tool reads. Everything outside these ranges is another language's script — or an
 * accented Latin letter, which is no more a label than a Cyrillic one.
 */
const READABLE_LETTER = /[A-Za-z\u0590-\u05FF\uFB1D-\uFB4F\u0370-\u03FF\u2100-\u214F\u{1D400}-\u{1D7FF}]/u;

/** A glyph Unicode calls a letter but mathematics calls notation — never judged (see the header). */
const NOTATION_LETTER = /[\p{Lm}ªº]/u;

/** A word-shaped run: letters, their combining marks, digits, and the prime/apostrophe 3-D labels use. */
const RUNS = /[\p{L}\p{M}\p{N}'’]+/gu;

const LETTERS = /\p{L}/gu;

/**
 * Every run of `text` the tool cannot read, in the order typed — empty when the whole line is readable.
 *
 * The look-alike letters are folded FIRST (the ruling: they are read as their Latin twins, silently), so
 * «משולש КМО» returns nothing and «משולש ДЖФ» returns `['ДЖФ']`. Pure; call it at a statement seam, after
 * the glyph fold and BEFORE the grammar and the model — a refusal here is never a paid call.
 */
export function unreadScriptRuns(text: string): readonly string[] {
  const out: string[] = [];
  for (const [run] of foldLookalikeLetters(text).matchAll(RUNS)) {
    const letters = (run.match(LETTERS) ?? []).filter((ch) => !NOTATION_LETTER.test(ch));
    if (letters.length === 0 || letters.every((ch) => READABLE_LETTER.test(ch))) continue;
    out.push(run);
  }
  return out;
}

/**
 * The one refusal a statement seam needs: which ruled sentence, and the student's own letters for it —
 * `null` when the line is readable, so a seam reads as one `if`.
 *
 * Several runs are joined by «, », the way every builder joins a list it names.
 */
export function unreadScript(text: string): { readonly kind: UnreadKind; readonly detail: string } | null {
  const runs = unreadScriptRuns(text);
  if (runs.length === 0) return null;
  const lettersOf = (run: string) => (run.match(LETTERS) ?? []).filter((ch) => !NOTATION_LETTER.test(ch));
  const isName = runs.length === 1 && !/\p{Ll}/u.test(runs[0]) && lettersOf(runs[0]).length <= MAX_NAME_LETTERS;
  return { kind: isName ? 'name' : 'word', detail: runs.join(', ') };
}
