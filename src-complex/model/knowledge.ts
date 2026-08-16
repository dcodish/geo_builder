/**
 * THE KNOWLEDGE PREDICATE — the one place that decides whether a number may be printed.
 *
 * The operator's ruling for S6 (#623): values print **only on request, and only when they are
 * knowledge** — invariant across every valid configuration, with the gauge pinned. The figure shows
 * everything; the panel prints only what was asked for and only what is known.
 *
 * ## Why this is a predicate and not a heuristic
 *
 * The tempting implementation is to sample a few configurations and print the value if it did not
 * move. [ADR-421](../../docs/06-decisions.md#adr-421) is a P1 that came out of exactly that shape: an
 * inference from sampling variance **inverts silently at N = 1**, because with one sample nothing
 * varies and therefore everything looks invariant. The failure is not that the rule is imprecise; it is
 * that the rule is *backwards* in precisely the case the student hits first — a figure they have only
 * just begun to specify.
 *
 * So the question asked here is structural and asked once:
 *
 *   1. **Is the value carried exactly?** Then it is knowledge, whatever else is free — `|z₁| = 9r` is
 *      knowledge *expressed in r*, which is the corpus's «הביעו באמצעות r» register, and the exponent
 *      vector carries it without any number being sampled.
 *   2. **Otherwise, is the figure closed?** No remaining free degree of freedom, and exactly one valid
 *      configuration. Then what the figure measures is what the givens force.
 *   3. **Otherwise it is not knowledge**, and the panel says so instead of printing a number.
 *
 * Rule 3 is deliberately conservative and will withhold values that *are* in fact invariant — an area
 * that happens to be the same in all four branches, for instance. That is the safe direction: a
 * withheld truth costs a student a hint, an asserted falsehood costs them the answer.
 */

/** What the figure knows about one requested quantity. */
export interface KnowledgeRow {
  /** the student's own words for what they asked about */
  readonly label: string;
  /**
   * The value, when it is knowledge — already formatted by the layer that owns exactness.
   * `null` means "the givens do not determine this", which is an ANSWER and is shown as one.
   */
  readonly value: string | null;
  /** why it is not knowledge, when it is not — never internal state, always the student's situation */
  readonly why: string;
}

/** The structural inputs the predicate reads. One definition, so no caller can ask a different question. */
export interface FigureClosure {
  /** free degrees of freedom tier 1 published, minus what the numeric tier consumed */
  readonly remainingDof: number;
  /** how many valid configurations the givens leave */
  readonly configCount: number;
}

/**
 * Is a value the figure computed printable as knowledge?
 *
 * `carriedExactly` is the first question because it outranks the others: an exact carrier is invariant
 * by construction, so a figure with free directions can still *know* a magnitude stated in a parameter.
 */
export const isKnowledge = (carriedExactly: boolean, c: FigureClosure): boolean =>
  carriedExactly || (c.remainingDof === 0 && c.configCount === 1);

/** The student-facing reason a value is withheld — their situation, never our internals. */
export const whyNotKnowledge = (c: FigureClosure): string => {
  if (c.remainingDof > 0) {
    return `הערך תלוי בדרגות החופש שנותרו — הוסיפו נתון שיקבע אותן`;
  }
  if (c.configCount > 1) {
    return `הערך משתנה בין ${c.configCount} התצורות — הוסיפו נתון שיבחר אחת מהן`;
  }
  return `הערך אינו נקבע מהנתונים שניתנו`;
};
