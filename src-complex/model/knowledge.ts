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
 *   2. **Otherwise, is the figure closed, and is its configuration set COMPLETE?** No remaining free
 *      degree of freedom, and every valid configuration known — the tier-1 branches times the numeric
 *      tier's roots (#1427, ADR-CX-049). Then the value is evaluated in EVERY configuration and printed
 *      iff they all agree. That is the doctrine itself — invariant across every valid configuration —
 *      asked of the whole set, not a proxy for it. The proxy it replaces, "exactly one configuration",
 *      counted configurations instead of comparing them: it printed `Im z₁ = 3` for a figure whose
 *      other root has −3 (the numeric tier had found only one of them), and withheld `Re z = 2`,
 *      which both roots share.
 *   3. **A set that is only a FLOOR** (a multi-start census, nothing proving it has every member) is
 *      never read as invariant: the value is withheld as «may have more than one possibility».
 *   4. **Otherwise it is not knowledge**, and the panel says so instead of printing a number.
 *
 * #1867 ([ADR-CX-066](../../docs/06d-decisions-complex.md#adr-cx-066), operator ruling B12, 2026-10-07: *"complex
 * should also show both values - so it should follow all of the tools"*) amends rule 2's withholding: a COMPLETE
 * set whose values number exactly TWO is not a value the student lacks — it is the exam's «שתי אפשרויות» answer.
 * The verdict stays `known: false` (no single value is knowledge) and carries the pair; stage 5d classifies it by
 * the one cross-builder rule (`shell/valueOptions`, W1: «±a» when opposites, else «a או b», through
 * {@link CX_ORDER}) and the row prints both. Three
 * or more keep `multi-config` (#1861: *"if there are 3 and more, dont show options"*), and a FLOOR never lists
 * (rule 3 — a census cannot prove there is no third).
 *
 * The comparison in rule 2 is NOT the sampling-variance shape ADR-421 forbids: the configurations are
 * enumerated (branches exactly, roots by a complete polynomial census), not sampled, so one agreeing
 * configuration means there IS only one — never that only one was looked at.
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
  /**
   * Why it is not knowledge, when it is not — a structured code (#716), worded by the reading
   * layer in the UI's language; never internal state, always the student's situation. `null`
   * exactly when `value` is present: a printed number needs no excuse.
   */
  readonly why: Why | null;
  /**
   * #1436 — the ≈ honesty floor: set when `value` is a ROUNDED DECIMAL of a quantity it does not
   * spell exactly, so the reading layer prints `≈` instead of `=` (the same rule stage 5d's
   * readings follow). Absent/false means the spelling IS the value — an integer, an exact
   * fraction, or an exact radical form.
   */
  readonly approx?: boolean;
  /**
   * #1867 (ADR-CX-066) — the quantity has exactly TWO values over a complete configuration set: `pm` says they
   * are opposites, so `value` (the positive one) prints «±value»; otherwise `or` is the second value, listed
   * after «או». Both absent ⇒ `value` is the one value.
   */
  readonly pm?: true;
  readonly or?: { readonly value: string; readonly approx?: boolean };
}


import type { Why } from './why';
import type { Cx } from '../value/value';

/**
 * How much the fold knows about its own configuration set (#1427, ADR-CX-049).
 *
 * `complete` — every valid configuration is enumerated: tier 1's branches exactly, and whatever the
 * numeric tier added proven complete by a polynomial certificate. `floor` — some numeric system was
 * censused by multi-start only, so a configuration may be missing.
 */
export type Completeness = 'complete' | 'floor';

/** The structural inputs the predicate reads. One definition, so no caller can ask a different question. */
export interface FigureClosure {
  /** free degrees of freedom tier 1 published, minus what the numeric tier consumed */
  readonly remainingDof: number;
  /**
   * How many valid configurations the fold holds — tier-1 kept branches × the numeric tier's distinct
   * solutions. A SIZE, not an existence claim (#698).
   */
  readonly configCount: number;
  /** whether {@link configCount} is every configuration or only the ones a census found */
  readonly completeness: Completeness;
}

/** Two values agree when they differ by no more than this, relative to their size. */
const AGREE = 1e-6;

const agree = (a: Cx, b: Cx): boolean =>
  Math.hypot(a.re - b.re, a.im - b.im) <= AGREE * Math.max(1, Math.hypot(a.re, a.im));

/**
 * THE ONE PREDICATE — is a value the figure computed printable as knowledge?
 *
 * `acrossConfigs` is the asked quantity evaluated in EVERY configuration of the set (one entry per
 * configuration; `null` where it cannot be evaluated). Every row kind — measures, ratios, expressions,
 * parameters — calls this, so none of them can ask a weaker question.
 *
 * `carriedExactly` is the first question because it outranks the others: an exact carrier is invariant
 * by construction, so a figure with free directions can still *know* a magnitude stated in a parameter.
 */
export function knowledgeOf(
  carriedExactly: boolean,
  c: FigureClosure,
  acrossConfigs: readonly (Cx | null)[],
): { readonly known: true } | { readonly known: false; readonly why: Why; readonly two?: readonly [Cx, Cx] } {
  if (carriedExactly) return { known: true };
  if (c.remainingDof > 0) return { known: false, why: { code: 'free-dof-remain' } };
  if (acrossConfigs.length === 0 || acrossConfigs.some((v) => v === null)) {
    return { known: false, why: { code: 'undetermined' } };
  }
  const values = acrossConfigs as readonly Cx[];
  const invariant = values.every((v) => agree(v, values[0]));
  // a census that differs is proof of two possibilities; one that agrees proves nothing if it is a floor
  if (!invariant && c.completeness === 'complete') {
    // #1867: exactly two values over the complete set are listed (B12); three or more are not (#1861)
    const distinct: Cx[] = [];
    for (const v of values) if (!distinct.some((d) => agree(d, v))) distinct.push(v);
    const two = distinct.length === 2 ? ([distinct[0], distinct[1]] as const) : null;
    return { known: false, why: { code: 'multi-config', configs: c.configCount }, ...(two ? { two } : {}) };
  }
  if (c.completeness === 'floor') return { known: false, why: { code: 'maybe-multi' } };
  return { known: true };
}

/**
 * How complex values compare for the shared two-value rule (`shell/valueOptions`'s `OptionAlgebra`, which this
 * layer may not import — stage 5d passes it): the same at {@link AGREE}, listed by real part then imaginary part.
 */
export const CX_ORDER = {
  same: agree,
  opposite: (a: Cx, b: Cx) => agree(a, { re: -b.re, im: -b.im }),
  compare: (a: Cx, b: Cx) => (agree({ re: a.re, im: 0 }, { re: b.re, im: 0 }) ? a.im - b.im : a.re - b.re),
};

/** A real scalar as the predicate's value type. */
export const realValue = (x: number | null): Cx | null => (x === null ? null : { re: x, im: 0 });

/**
 * The student-facing reason when the value could not even be computed here — their situation, never
 * our internals. With the value in hand, {@link knowledgeOf} gives the reason instead.
 */
export const whyNotKnowledge = (c: FigureClosure): Why => {
  if (c.remainingDof > 0) return { code: 'free-dof-remain' };
  return { code: 'undetermined' };
};
