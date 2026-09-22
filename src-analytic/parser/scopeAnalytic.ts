/**
 * THE GUIDANCE REGISTER (#1353, slice (e) of #778 / [ADR-W-030](../../docs/06w-decisions-workspace.md#adr-w-030)).
 *
 * This tree had no register. 2-D has `src/parser/scope.ts` and 3-D has `src3d/parser/scope3.ts`;
 * analytic answered every unrecognised family with the same `not-handled`, so an input the tool could
 * have taught was indistinguishable from one it had never heard of.
 *
 * Its first member is the **imperative wrapper** — «הוסף …», «צייר …», «draw …». The operator's ruling:
 *
 * > *"When a user enters a command like add a line, draw a shape, we need to tell him to add the input
 * > as a textbook would… I don't want the tool to support the wrong text input because it teaches them
 * > wrong."*
 *
 * Measured at HEAD before this shipped: 42 of 1,470 wrapper × catalog pairs BUILT SILENTLY, so the
 * imperative form was recorded as the student's own sentence and read back to them from the fact list,
 * the saved file and the exported image.
 *
 * ## Why this is a lexicon and not a model call
 *
 * ADR-W-030 rejected routing the decision to the LLM, and the reason was policy stability rather than
 * cost: what counts as non-canonical input is a teaching decision the product owns, and a decision that
 * can drift with a model's mood is not a policy. The lexicon is closed and lives here, where a test can
 * read it.
 *
 * ## Why this module does not itself parse
 *
 * It produces CANDIDATES and nothing else. Whether a candidate is a real sentence is
 * {@link parseLine}'s question, and the caller ({@link decideSubmit}) asks it — so the teaching text is
 * always a string the parser has just accepted, and this module can never teach a form the tool would
 * reject. That property is what #778 wanted from deriving the sentence out of the commands; re-parsing
 * the exact string gets it more directly, with no renderer in between.
 */

/**
 * The closed imperative lexicon.
 *
 * ADR-W-030's list, plus `תצייר` — the form the operator's own prod utterance used
 * («תצייר לי משולש עם תיכון מ-A», the first live analytic LLM call, #1278). Exported so the coverage
 * test enumerates the real list rather than a copy of it.
 */
export const IMPERATIVE_VERBS_HE = [
  'הוסף', 'תוסיף', 'הוסיפו', 'להוסיף',
  'שרטט', 'תשרטט', 'שרטטו',
  'צייר', 'תצייר', 'ציירו', 'לצייר',
  'בנה', 'תבנה', 'בנו',
  'העבר', 'תעביר',
  'סמן', 'תסמן', 'סמנו', 'סימון',
  'הדגש', 'תדגיש',
  'הצג', 'תציג', 'הראה', 'הראו',
] as const;

export const IMPERATIVE_VERBS_EN = ['add', 'draw', 'mark', 'show', 'construct', 'highlight', 'plot'] as const;

/**
 * Particles that may sit between the verb and the sentence and carry no geometry —
 * «הוסף **את** המעגל», «תצייר **לי** משולש», «draw **me a** triangle».
 *
 * Stripping them is OPTIONAL, never assumed: {@link imperativeCandidates} offers both the stripped and
 * the unstripped remainder, and the caller keeps whichever one the parser accepts. A particle that is
 * really part of the sentence therefore costs nothing.
 */
const PARTICLES_HE = ['את', 'לי', 'לנו', 'נא', 'בבקשה'];
const PARTICLES_EN = ['me', 'a', 'an', 'the', 'us'];

/** One reading of a wrapped utterance: the verb the student wrote, and the sentence underneath it. */
export interface ImperativeCandidate {
  /** Verbatim, so a message can quote the student's own word back to them. */
  verb: string;
  /** The sentence to verify and teach. Never empty. */
  remainder: string;
}

const HE_VERB = new Set<string>(IMPERATIVE_VERBS_HE);
const EN_VERB = new Set<string>(IMPERATIVE_VERBS_EN);
const HE_PARTICLE = new Set(PARTICLES_HE);
const EN_PARTICLE = new Set(PARTICLES_EN);

/**
 * Every reading of `raw` as «imperative + sentence», most-stripped first, or `[]` when it does not
 * open with a verb from the lexicon.
 *
 * Most-stripped first matters: «draw me a triangle ABC» should be read as «triangle ABC» before
 * «me a triangle ABC», so the first candidate the parser accepts is the tightest sentence.
 */
export function imperativeCandidates(raw: string): ImperativeCandidate[] {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return []; // a bare verb states nothing to teach — it is not this rule's case
  const head = tokens[0];
  const lower = head.toLowerCase();
  const isHe = HE_VERB.has(head);
  const isEn = EN_VERB.has(lower);
  if (!isHe && !isEn) return [];

  const particles = isHe ? HE_PARTICLE : EN_PARTICLE;
  let after = 1;
  while (after < tokens.length - 1 && particles.has(isHe ? tokens[after] : tokens[after].toLowerCase())) after++;

  const out: ImperativeCandidate[] = [];
  const push = (from: number) => {
    const remainder = tokens.slice(from).join(' ');
    if (remainder && !out.some((c) => c.remainder === remainder)) out.push({ verb: head, remainder });
  };
  push(after); // particles stripped — the tightest reading
  push(1); // the verb alone removed, in case a "particle" was really part of the sentence
  return out;
}
