/**
 * ANGLES WRITTEN IN RADIANS, ONCE (#1837, ADR-710 / ADR-W-142) — is this line an angle measure written with π?
 *
 * ## The defect it exists for
 *
 * «∠ABC = π/2» is an angle given in radians. No plane-geometry builder read it as one, and each misread it
 * its own way (measured on `main` b0e9dbea): 2-D handed every spelling to the AI fallback (ADR-600 had
 * already stopped π committing as a free letter) and committed «∠ABC = pi/2» as **2°**; 3-D recorded
 * «∠ABC = π» and «∠ABC = 0.5π» as an angle mark LABELLED π; analytic recorded every one as a number of
 * DEGREES — «∠ABC = π/2» drew an angle of 1.57° with a green ✓.
 *
 * Operator rulings on #1837: 2026-10-07 *"Refuse and teach degrees"* (2-D and 3-D, analytic follows), and
 * 2026-10-08 *"analytics tool should not support radians at all. only the complex tool should"*. So radians
 * are complex-only notation: every plane-geometry builder refuses an angle measure written with π,
 * deterministically (never the model), and teaches degrees.
 *
 * ## Why it is in `shell/`
 *
 * Three builders need the same rule; three copies drift (the #1356 lesson). It lives here beside
 * `proofTarget.ts`, knows no product and returns no strings. Each builder calls it at the statement seam
 * where it calls `findProofTarget`, and words its own refusal. The complex builder does NOT call it:
 * «cis(π/3)» is its notation (#1754). The shared rows (`shell/__tests__/fixtures/radian-angle-rows.ts`)
 * drive every builder's REAL gate.
 *
 * ## What counts — an ANGLE MEASURE whose value is a π expression
 *
 * - **The angle**: `∠ABC` / `∡ABC` / `∢ABC` / `∠B`, «זווית ABC» / «זוית B» (with «ה», «ו», a «מרכזית» /
 *   «היקפית» adjective), "angle ABC", and «הזווית בין AB ל-AC» / "the angle between AB and AC" with two-letter
 *   SEGMENT operands — then a copula: «=», «שווה ל-», «היא», «הוא», «בת», "is", "equals", "of".
 * - **«בזווית π/3»** / "with angle π/3" — the measure a shape is given with («גזרה AOB בזווית 80»).
 * - **The value**: π, kπ, π/n, kπ/n, k/n π, with spaces and parentheses, π typed as the glyph or as the
 *   ASCII word `pi` («pi/2» committed 2° in 2-D — the same class in another spelling).
 *
 * ## What does not
 *
 * - **π as a number** — «AB = π», «מעגל O שהיקפו 6π», an equation coefficient: a length is not radians
 *   (the 2026-10-08 ruling, as the session read it).
 * - **π as a name** — 3-D's planes «π1», «π2» («B על המישור π2»): a π followed by a digit or letter is a name.
 * - **3-D's space angles with a plane operand** («הזווית בין AB למישור …»): the operands must be segments.
 * - **LaTeX `\pi`** — each builder keeps its own LaTeX answer (2-D's format guide).
 * - **An arc** «קשת AB = 4π» — an arc's length, #2032's rule.
 * - **A bare number** «∠ABC = 1.2» — degrees, as it always was: nothing in the line says radians.
 */

/** What {@link findRadianAngle} found: the half-open span of the angle measure, and the π value as typed. */
export interface RadianAngle {
  readonly radian: true;
  /** `[start, end)` into the string that was passed in. */
  readonly span: readonly [number, number];
  /** the value side as typed («π/2», «2π/3», «pi/2») — for logs, never a student string by itself */
  readonly value: string;
}

/** Invisible format controls a paste carries (bidi marks/isolates, ZW joiners, BOM) — skipped like a space. */
const G = String.raw`[\s ​-‏‪-‮⁦-⁩﻿]`;
/** A point name: a capital Latin letter, optionally primed or indexed (A', A1, A_1, A₁). */
const PT = String.raw`[A-Z](?:['′׳]{1,2}|_?\d{1,2}|[₀-₉]{1,2})?`;
/** One vertex or three points. */
const REF = String.raw`(?:${PT}${PT}${PT}|${PT})(?![A-Za-z0-9])`;
/** A segment operand: two points. */
const SEG = String.raw`${PT}${PT}(?![A-Za-z0-9])`;
/** A Hebrew word may not continue into the noun from the left. */
const NOT_AFTER_HE = String.raw`(?<![א-ת])`;
/** The angle noun, plene and defective, with the prefixes «ו», «ש», «ה» and an optional adjective. */
const NOUN_HE = String.raw`${NOT_AFTER_HE}(?:ו|ש)?ה?זו?וית(?:${G}+ה?(?:מרכזית|היקפית))?`;
const NOUN_EN = String.raw`(?<![A-Za-z])(?:[Tt]he${G}+)?(?:[Cc]entral${G}+|[Ii]nscribed${G}+)?[Aa]ngle`;

/** The angle, written every way a given names it. */
const ANGLE = String.raw`(?:[∠∡∢]${G}*${REF}|(?:${NOUN_HE}|${NOUN_EN})${G}+${REF}|(?:${NOUN_HE}${G}+בין${G}+${SEG}${G}*(?:ל|ו)-?${G}*${SEG}|${NOUN_EN}${G}+between${G}+${SEG}${G}+and${G}+${SEG}))`;
/** The copula between the angle and its measure. */
const COPULA = String.raw`${G}*(?:=|שווה${G}*ל-?|שווה|היא|הוא|בת|(?:is|equals|of)(?![A-Za-z]))${G}*`;
/** «בזווית π/3», "with angle π/3", "with an angle of π/3" — the measure a shape is given with. */
const WITH_ANGLE = String.raw`(?:${NOT_AFTER_HE}בזו?וית(?:${G}+של)?|(?<![A-Za-z])[Ww]ith${G}+(?:an${G}+)?angle(?:${G}+of)?)${G}*`;

/** π: the glyph, or the ASCII word `pi` (never LaTeX `\pi`); never a name such as «π1». */
const PI = String.raw`(?:π|(?<![\\A-Za-z])pi)(?![\p{L}\p{N}_])`;
const NUM = String.raw`\d+(?:[.,]\d+)?`;
/** kπ, π/n, kπ/n, k/n π, (π/2) — the value side. */
const PI_VALUE = String.raw`\(?${G}*(?:${NUM}${G}*(?:\/${G}*${NUM}${G}*)?\*?${G}*)?${PI}(?:${G}*\/${G}*${NUM})?${G}*\)?`;

const AS_GIVEN = new RegExp(String.raw`${ANGLE}${COPULA}(${PI_VALUE})`, 'u');
const AS_WITH = new RegExp(String.raw`${WITH_ANGLE}(${PI_VALUE})`, 'u');

/**
 * The first angle measure written with π in `text`, or `null`.
 *
 * Pure and product-free: the caller passes the line as typed; indices refer to that string.
 */
export function findRadianAngle(text: string): RadianAngle | null {
  if (!text || !/π|pi/.test(text)) return null;
  let best: RegExpExecArray | null = null;
  for (const re of [AS_GIVEN, AS_WITH]) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.index)) best = m;
  }
  if (!best) return null;
  return { radian: true, span: [best.index, best.index + best[0].length], value: best[1].trim() };
}

/** Convenience: does `text` give an angle in radians? */
export const isRadianAngle = (text: string): boolean => findRadianAngle(text) !== null;
