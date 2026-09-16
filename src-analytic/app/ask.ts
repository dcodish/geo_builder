/**
 * THE ASK LANE'S ENGINE — what the data panel answers when a student asks it a question (#1027).
 *
 * Operator, 2026-09-15: *"data panel should have a data entry option to query sizes and equations"*,
 * and [02c](../../docs/02c-requirements-analytic.md) R23–R27 specified it long before: **two
 * surfaces, one grammar** — the main input CONSTRUCTS, the panel ASKS, and an ask is evaluated
 * against the figure and discarded, never mutating it.
 *
 * ## One grammar, and it is the grammar that already exists
 *
 * An ask is a MEASURE EXPRESSION — the thing [ADR-AG-040](../../docs/06c-decisions-analytic.md#adr-ag-040)
 * built for «שטח ABC גדול פי 3 משטח CEF». So `AB`, `שטח ABC`, `AB + BC` and `2·AB` are all askable
 * because they were all already sayable, and neither surface needs a vocabulary of its own. A
 * question the tool cannot read is answered as a question, never as a failure to build something.
 *
 * ## The honesty gate is the same one
 *
 * An answer is a VALUE, so it passes `isKnowledge`: the same number in every configuration, or no
 * number at all. Asking «AB» on a figure that has not fixed it gets the open answer — which is
 * itself worth knowing, and is the truthful one.
 */
import { reportedDof } from '../engine/carriers';
import { derive, type Derivation } from '../engine/derive';
import { evalLengthExpr, parseLengthExpr } from '../engine/lengths';
import { isKnowledge, knownCurve } from '../engine/evaluate';
import { objectById, type Id } from '../engine/types';
import { traceDistance2pt, traceLine2pt } from '../engine/techniques';

/** What the panel shows for one asked question. */
export interface Answer {
  /** The student's own words, so the row says what was asked. */
  question: string;
  /** The answer, already formatted — or `null` when the figure does not determine it. */
  value: string | null;
  /** The question was not understood at all, which is different from having no answer. */
  unreadable?: boolean;
  /**
   * HOW THE ANSWER WAS REACHED (#1053) — the formula with this figure's values substituted.
   *
   * Operator: *"we don't just show the result — we show what to use to get to this result"*, at the
   * level he ruled (substituted, not worked through). Absent when the answer has no technique behind
   * it — a point's coordinates are read off the givens, not computed, and inventing a formula for
   * them would be noise dressed as teaching.
   */
  trace?: string;
}

/**
 * The question is EXACTLY one distance and nothing else — «AB», «הקטע AB», «AB אורך» (#1053).
 *
 * A compound expression is arithmetic the student assembled, not one named move, and the technique
 * table has nothing honest to say about it. The trace explains a ROW; it does not narrate a sum.
 */
const BARE_LENGTH = /^(?:ה?(?:קטע|צלע|אורך)\s+)?[A-Z][0-9]?[A-Z][0-9]?$/;

/** A single point's name, which is a question about its coordinates. */
const POINT_ONLY = /^[A-Z][0-9]?$/;

/** «משוואת …» / «the equation of …» — a question about a curve rather than a value. */
const EQUATION_OF = /^(?:ה?משוואת|[Tt]he\s+equation\s+of)\s+(?:ה?(?:ישר|מעגל|פרבולה|אליפסה|אלכסון)\s+)?(.+)$/;

/**
 * Answer one question against the figure the student has built.
 *
 * `fmt` and `describeCurve` are injected rather than imported: they are the CALLER's formatting, and
 * an answer row must read exactly as the inventory rows above it do — the same rounding, the same
 * equation text. A second formatter here is how two surfaces of one panel start disagreeing.
 */
export function ask(
  d: Derivation,
  question: string,
  fmt: (v: number) => string,
  describeCurve: (name: string, c: NonNullable<ReturnType<typeof knownCurve>>) => string,
): Answer {
  const text = question.trim();
  if (!text) return { question, value: null, unreadable: true };

  // --- a point, by name: its coordinates ---
  if (POINT_ONLY.test(text)) {
    const o = objectById(d.construction, text);
    if (!o) return { question, value: null, unreadable: true };
    const kx = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === text)?.x ?? null);
    const ky = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === text)?.y ?? null);
    return {
      question,
      value: kx.known && ky.known ? `(${fmt(kx.value)}, ${fmt(ky.value)})` : null,
    };
  }

  // --- a curve, by name: its equation ---
  const eq = EQUATION_OF.exec(text);
  if (eq) {
    const name = eq[1].trim();
    const curve = d.construction.objects.find(
      (o) => o.kind === 'curve' && (o.label.name === name || o.id === `line-${name}` || o.id === `circle-${name}`),
    );
    if (!curve) return { question, value: null, unreadable: true };
    const known = knownCurve(d.construction, curve.id);
    /**
     * A LINE NAMED BY TWO POINTS gets the move that produces it (#1053) — the operator's second
     * case: *"when I select to see … an equation of a line"*.
     *
     * Only when the name IS two points. «הישר l1» was given by its equation, so there is no
     * technique behind it: the student wrote it down, and printing a derivation for a given would be
     * the tool explaining the student to themselves.
     */
    let trace: string | undefined;
    const pair = /^([A-Z][0-9]?)([A-Z][0-9]?)$/.exec(name);
    if (pair && known?.kind === 'line') {
      const a0 = d.figure.points.find((q) => q.id === pair[1]);
      const b0 = d.figure.points.find((q) => q.id === pair[2]);
      if (a0 && b0) trace = traceLine2pt(a0, b0, fmt);
    }
    return {
      question,
      value: known ? describeCurve('', known) : null,
      ...(trace && known ? { trace } : {}),
    };
  }

  // --- anything else: a measure expression, through the one grammar ---
  const measure = parseLengthExpr(text);
  if (!measure) return { question, value: null, unreadable: true };
  // Every point it names must exist, or the question is about a figure the student has not drawn.
  const missing = measure.terms
    .flatMap((t) => (t.kind === 'area' ? t.ids : [t.a, t.b]))
    .find((id: Id) => !objectById(d.construction, id));
  if (missing !== undefined) return { question, value: null, unreadable: true };

  const k = isKnowledge(d.construction, (f) =>
    evalLengthExpr(measure, (id) => f.points.find((q) => q.id === id) ?? null, f.env),
  );
  /**
   * A PLAIN DISTANCE gets its formula (#1053).
   *
   * Only a single bare length — «AB». A compound expression like «AB + 2·CD» is arithmetic the
   * student assembled, not one named move, and the technique table has nothing honest to say about
   * it. The trace explains a row; it does not narrate a calculation.
   */
  const one = measure.terms.length === 1 ? measure.terms[0] : null;
  const plain = one && one.kind !== 'area' ? one : null;
  let trace: string | undefined;
  // BARE_LENGTH, not "one term": «AB + AB» also folds to one term but is 2·AB, and a formula for the
  // distance would then be explaining something the student did not ask for.
  if (plain && k.known && BARE_LENGTH.test(text)) {
    const a = d.figure.points.find((q) => q.id === plain.a);
    const b = d.figure.points.find((q) => q.id === plain.b);
    if (a && b) trace = traceDistance2pt(a, b, fmt);
  }
  return { question, value: k.known ? fmt(k.value) : null, ...(trace ? { trace } : {}) };
}

/**
 * Is the figure open enough that an unanswerable question is EXPECTED?
 *
 * Used only to choose the wording: on a figure with freedom left, "not determined yet" is a fact
 * about the figure, while on a pinned one it means the question named something the tool cannot
 * measure. Two different things, and telling the student which is which is the difference between a
 * hint and a dead end.
 */
export const figureIsOpen = (d: Derivation): boolean =>
  reportedDof(d.construction, d.figure.carrierDof) > 0;

/** The empty figure, for a caller that asks before anything is drawn. */
export const EMPTY_ASK: Derivation = derive([], 0);
