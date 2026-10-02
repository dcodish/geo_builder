/**
 * PROOF TARGETS, ONCE (#1666, ADR-W-107) — is this line something the student is asked to PROVE?
 *
 * ## The defect it exists for
 *
 * A bagrut question has two kinds of sentence: what is GIVEN, and what the student must SHOW. Only the
 * first describes the figure. «הוכיחו כי AB ⊥ AC» typed into the box is a claim, and a builder that
 * reads it as a given forces the figure to satisfy the very thing the student was asked to prove —
 * the figure then "confirms" it for free. Measured on `main` e92b671f: 2-D committed every spelling as a
 * constraint (`set-perpendicular`), 3-D recorded `prove that …` / «הוכיחו כי …» as a driving given (its
 * ADR-3D-002 parser stripped the proof verb on purpose), and only analytic refused (#1618, ADR-AG-187).
 * Operator ruling, 2026-10-02 (#1649): *"all refused with explanation"*, in all three builders.
 *
 * ## Why it is in `shell/`
 *
 * Analytic had the only copy (`frameAnalytic.ts`); 2-D and 3-D each needed one. Three copies of one
 * rule drift (the #1356 lesson), so the rule lives here, knows no product and returns no strings. Each
 * builder calls it at its own submit gate, BEFORE its grammar, and words its own refusal. The shared
 * rows (`shell/__tests__/fixtures/proof-target-rows.ts`) drive every builder's REAL gate.
 *
 * ## What counts
 *
 * - **A proof verb with its complementizer** — «הוכיחו כי», «הוכח ש-», «הראו כי», «הראה ש», «נמקו כי»,
 *   «יש להוכיח כי», «צריך להראות ש», "prove that", "show that", "demonstrate that" — ANYWHERE in the line.
 *   The pair is specific: a given never contains it, so it is matched wherever it stands, which is what
 *   catches the exam's mixed line «נתון AB = AC. הוכיחו כי …» and a leading item marker («א.», «(1)»).
 * - **A bare proof verb** — «הוכיחו: …», «הוכח את הטענה», «יש להוכיח: …» — only where a SENTENCE STARTS
 *   (the line's start, or after `.` `;` `:` `,` `!` `?` or a line break, past an item marker).
 *
 * ## What does not
 *
 * - «הראו» / «הראה» WITHOUT «כי»/«ש» is the imperative "show me …" (`הראו את הזוויות`), a UI request each
 *   builder answers on its own — so the show-verbs always need their complementizer.
 * - «כי» and «ש» in their other senses — «נתון כי …», «ידוע ש …», «כך ש-AE = EB», «שבו», «שווה» — never
 *   trigger: they are matched only directly after a proof verb.
 *
 * The span is the proof SENTENCE: from the verb to the next sentence end (an item marker is left out),
 * so a refusal can name the student's own words.
 */

/** What {@link findProofTarget} found: the half-open span of the proof sentence in the input, and its text. */
export interface ProofTarget {
  readonly target: true;
  /** `[start, end)` into the string that was passed in — no folding changes an index. */
  readonly span: readonly [number, number];
  /** `text.slice(span)`, trimmed of a trailing sentence mark — the sentence a refusal quotes. */
  readonly sentence: string;
}

/** Invisible format controls a paste carries (bidi marks/isolates, ZW joiners, BOM) — skipped like a space. */
const GAP = String.raw`[\s\u00A0\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]`;
/** A Hebrew word may not continue into the verb from the left. */
const NOT_AFTER_HE = String.raw`(?<![\u05D0-\u05EA])`;
/** The conjunction «ו» glued to a verb («והוכיחו כי …»). */
const VAV = String.raw`ו?`;

/** The prove-verbs: imperative plural/singular/feminine, the future-imperative, and «נמקו» (justify). */
const PROVE = String.raw`(?:הוכיחו|הוכח|הוכיחי|תוכיחו|נמקו|נמק|נמקי)`;
/** The show-verbs — ALWAYS with a complementizer (bare, they are the "show me" imperative). */
const SHOW = String.raw`(?:הראו|הראה|הראי|תראו)`;
/** The modal forms: «יש להוכיח», «צריך להראות», «עליכם להוכיח», «נדרש להוכיח». */
const MODAL = String.raw`(?:יש|צריך|צריכים|צריכה|עליכם|עלייך|עליך|נדרש|נדרשים|נא)${GAP}+(?:ל)`;
const MODAL_PROVE = String.raw`${MODAL}הוכיח`;
const MODAL_SHOW = String.raw`${MODAL}הראות`;
/** A whole-word «כי» («כיצד» is "how", not "that"). */
const KI = String.raw`כי(?![\u05D0-\u05EA])`;
/** After a PROVE verb: «כי», «את ש-», or «ש» glued to anything («שהמשולש», «ש-AB», «שAB»). */
const PROVE_THAT = String.raw`(?:${GAP}+(?:${KI}|את${GAP}+ש)|${GAP}*ש)`;
/**
 * After a SHOW verb the «ש» must be the complementizer, not the first letter of a word: «הראו שני גבהים»
 * is "show two altitudes" (the imperative). So «ש» counts before a hyphen, a non-Hebrew character (a label,
 * a symbol, a space) or the article «ה» («שהזווית»); «כי» and «את ש» always count.
 */
const SHOW_THAT = String.raw`(?:${GAP}+(?:${KI}|את${GAP}+ש)|${GAP}*ש(?:-|(?=ה)|(?![\u05D0-\u05EA])))`;

/** Verb + complementizer, Hebrew — matched anywhere a word starts. */
const HE_WITH_THAT = new RegExp(
  String.raw`${NOT_AFTER_HE}${VAV}(?:(?:${PROVE}|${MODAL_PROVE})${PROVE_THAT}|(?:${SHOW}|${MODAL_SHOW})${SHOW_THAT})(?=${GAP}*\S)`,
  'u',
);
/** Verb + "that", English — matched anywhere a word starts. */
const EN_WITH_THAT = /(?<![A-Za-z])(?:prove|show|demonstrate)\s+that\b/iu;
/** A bare prove-verb (no complementizer) — accepted only where a sentence starts. */
const HE_BARE = new RegExp(String.raw`^${VAV}(?:${PROVE}|${MODAL_PROVE})(?=${GAP}|:|$)`, 'u');
const EN_BARE = /^prove\b(?=\s|:|$)/iu;

/**
 * An item marker before a sentence: «א.», «א)», «(א)», «ב'», «(1)», «1.», «1)», «i.» — and a bullet.
 * Skipped, so a bare verb after it still reads as a sentence start. The span never includes it.
 */
const ITEM = new RegExp(
  String.raw`^(?:${GAP}*(?:\(\s*(?:[\u05D0-\u05EA]{1,2}|\d{1,2}|[ivx]{1,4})\s*\)|(?:[\u05D0-\u05EA]{1,2}|\d{1,2}|[ivx]{1,4})['׳]?[.)]|[\u05D0-\u05EA]['׳]|[·•∙*-](?=\s)))+`,
  'u',
);

/** Where a sentence may start: the line's start, or right after one of these marks. */
const SENTENCE_START = /[.;:,!?\n]/gu;
/** Where the proof sentence ends: a full stop, `;`, `!` or `?` followed by a space/end, or a line break. */
const SENTENCE_END = /[.;!?](?=\s|$)|\n/u;

/** Trailing/leading invisible controls and spaces are not part of the quoted sentence. */
const EDGE_GAP = new RegExp(String.raw`^${GAP}+|${GAP}+$`, 'gu');
const ONE_GAP = new RegExp(GAP, 'u');

function spanFrom(text: string, from: number): ProofTarget {
  const end = SENTENCE_END.exec(text.slice(from));
  const stop = end ? from + (end.index ?? 0) : text.length;
  return { target: true, span: [from, stop], sentence: text.slice(from, stop).replace(EDGE_GAP, '') };
}

/**
 * The proof target in `text`, or `null`.
 *
 * Pure and product-free: the caller passes the line as typed (any folding of its own is its business,
 * and indices refer to whatever string it passes). The first target wins.
 */
export function findProofTarget(text: string): ProofTarget | null {
  if (!text) return null;
  const hits: number[] = [];
  const he = HE_WITH_THAT.exec(text);
  if (he) hits.push(he.index);
  const en = EN_WITH_THAT.exec(text);
  if (en) hits.push(en.index);
  // A bare prove-verb, at each sentence start (past an item marker).
  const starts = [0, ...[...text.matchAll(SENTENCE_START)].map((m) => (m.index ?? 0) + 1)];
  for (const s of starts) {
    let at = s;
    const tail = text.slice(at);
    const item = ITEM.exec(tail);
    if (item) at += item[0].length;
    while (at < text.length && ONE_GAP.test(text[at])) at++;
    const rest = text.slice(at);
    if (HE_BARE.test(rest) || EN_BARE.test(rest)) {
      hits.push(at);
      break;
    }
  }
  if (hits.length === 0) return null;
  return spanFrom(text, Math.min(...hits));
}

/** Convenience: does `text` carry a proof target at all? */
export const isProofTarget = (text: string): boolean => findProofTarget(text) !== null;
