/**
 * A WHY IS A CODE, NOT A SENTENCE (#716).
 *
 * Every student-facing reason the engine produces — a claim verdict's why, the knowledge panel's
 * withholding reason, a measure's verdict line, a line the fold could not use — used to be composed
 * as a Hebrew string at the point of decision, deep in `solve/` and `replay/`. An English UI then
 * answered in Hebrew, because the engine had already chosen the words.
 *
 * The fix is the docs/17 chokepoint move: the engine publishes WHAT happened — a discriminated code
 * with the parameters that make it about the student's own statement — and the reading layer
 * (`replay/scene2.ts` `whyText`, the ADR-CX-015 seam) turns it into words through the product i18n,
 * in whichever language the UI is showing. Solver code never holds display prose again, in either
 * language; a new reason is a new code here, a key pair in `i18n/`, and a `whyText` arm — the
 * exhaustive switch makes forgetting one a type error.
 *
 * Names, sources and power texts ride as params UNTRANSLATED: they are the student's own words or
 * math notation, correct in every language.
 */

/** The two properties a claim can assert of a number. Worded by the reading layer, never here. */
export type Prop = 'real' | 'imaginary';

export type Why =
  // --- claim verdicts (solve/claims.ts) -------------------------------------
  | { readonly code: 'undecided-arg'; readonly name: string }
  | { readonly code: 'undecided-mod-pair'; readonly a: string; readonly b: string }
  | { readonly code: 'undecided-arg-pair'; readonly a: string; readonly b: string }
  | { readonly code: 'undecided-arg-irrational'; readonly name: string }
  | { readonly code: 'undecided-arg-pair-irrational'; readonly a: string; readonly b: string }
  | { readonly code: 'prop-holds'; readonly name: string; readonly prop: Prop }
  | { readonly code: 'prop-refuted'; readonly name: string; readonly prop: Prop }
  | { readonly code: 'conjugates-hold'; readonly a: string; readonly b: string }
  | { readonly code: 'moduli-differ' }
  | { readonly code: 'args-not-opposite' }
  | { readonly code: 'forall-holds'; readonly power: string; readonly prop: Prop }
  | { readonly code: 'forall-refuted'; readonly power: string; readonly prop: Prop }
  | { readonly code: 'minimal-none'; readonly name: string; readonly prop: Prop }
  | { readonly code: 'minimal-holds'; readonly name: string; readonly prop: Prop; readonly n: number }
  | { readonly code: 'minimal-refuted'; readonly name: string; readonly prop: Prop; readonly least: number }
  // --- knowledge withholding (model/knowledge.ts) ---------------------------
  | { readonly code: 'free-dof-remain' }
  | { readonly code: 'multi-config'; readonly configs: number }
  | { readonly code: 'undetermined' }
  // --- measure verdicts (replay/derive2.ts stage 3e) ------------------------
  | { readonly code: 'measure-uncomputable'; readonly src: string }
  | { readonly code: 'measure-holds'; readonly src: string }
  | { readonly code: 'measure-violated'; readonly src: string }
  // --- lines the fold could not use (app/deriveLines.ts) --------------------
  | { readonly code: 'line-unaccounted'; readonly items: string }
  | { readonly code: 'line-unrecognized' }
  | { readonly code: 'reserved-letter'; readonly letter: string; readonly equation: string };

/**
 * The translate seam the reading layer receives — shaped like the product i18n's `t`, so the App
 * passes it straight through, while the engine-side callers of `whyText` in tests can pass the
 * real instance's `getFixedT` and lock exact renderings per language.
 */
export type Translate = (key: string, params?: Record<string, unknown>) => string;
