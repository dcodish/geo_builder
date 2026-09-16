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
import { traceDistance2pt, traceLine2pt, tracePointLine } from '../engine/techniques';

/**
 * The line a NAME refers to, as this configuration drew it (#1048).
 *
 * Two spellings mean two different things and both are legal: «l1» is a curve the student named, and
 * «AB» is the line through two points they placed — which need not have been stated as a line at all.
 * Resolving both here keeps `lengths.ts` free of any knowledge about objects.
 */
function lineNamed(f: Derivation['figure'], name: string): { a: number; b: number; c: number } | null {
  const curve = f.curves.find((c) => c.label.name === name || c.id === `line-${name}` || c.id === `circle-${name}`);
  if (curve && curve.curve.kind === 'line') return { a: curve.curve.a, b: curve.curve.b, c: curve.curve.c };
  const pair = /^([A-Z][0-9]?)([A-Z][0-9]?)$/.exec(name);
  if (pair) {
    const p = f.points.find((q) => q.id === pair[1]);
    const q2 = f.points.find((q) => q.id === pair[2]);
    if (p && q2) {
      // Through two points: the line whose normal is perpendicular to P→Q.
      const a = q2.y - p.y;
      const b = -(q2.x - p.x);
      if (Math.hypot(a, b) > 1e-12) return { a, b, c: -(a * p.x + b * p.y) };
    }
  }
  return null;
}

/** The question is EXACTLY one point-to-line distance, for the same reason `BARE_LENGTH` exists. */
const POINT_LINE_ONLY = /^(?:ה?מרחק|[Dd]istance)\s+\S.*$/;

/** What the panel shows for one asked question. */
export interface Answer {
  /** The student's own words, so the row says what was asked. */
  question: string;
  /** The answer, already formatted — or `null` when the figure does not determine it. */
  value: string | null;
  /** The question was not understood at all, which is different from having no answer. */
  unreadable?: boolean;
  /**
   * THE FIGURE HAS NO SUCH OBJECT (#1111) — a third failure, and not the same as either neighbour.
   *
   * «מרחק של C מ-AB» on a figure with no `C` used to answer «לא הבנתי את השאלה» — *I did not
   * understand the question*. The student's Hebrew was understood perfectly; the tool simply has no
   * `C`, and it KNEW that: the code found which id was missing and then collapsed it into
   * `unreadable`. A student told their sentence was not understood will rewrite the sentence for
   * ever, because the sentence was never the problem.
   *
   * CLAUDE.md's standing rule: error messages name the conflicting STATEMENT, never internal state.
   * Here the conflicting statement is in hand, so it is carried rather than discarded.
   */
  missing?: { name: string; kind: 'point' | 'curve' };
  /**
   * HOW THE ANSWER WAS REACHED (#1053) — the formula with this figure's values substituted.
   *
   * Operator: *"we don't just show the result — we show what to use to get to this result"*, at the
   * level he ruled (substituted, not worked through). Absent when the answer has no technique behind
   * it — a point's coordinates are read off the givens, not computed, and inventing a formula for
   * them would be noise dressed as teaching.
   */
  trace?: string;
  /**
   * THE PERPENDICULAR THE ANSWER IS ABOUT (#1048) — in WORLD coordinates, for the canvas to draw.
   *
   * Operator: *"the canvas should show the height from the point to the line"*. A distance reported
   * as `4.24` teaches nothing; the perpendicular dropped from the point, with its right angle at the
   * foot, is what the student must actually construct — the same argument ADR-AG-014 makes, and the
   * reason this is worth more than the number beside it.
   *
   * DECORATION, never an object: no id, no letter, never in the fact list, and an ask never mutates
   * the figure (02c R24). It is carried on the ANSWER rather than in the figure because it exists
   * for exactly as long as the question does.
   *
   * Present only when the distance is KNOWLEDGE. On an under-determined figure the point sits at a
   * sampled position, and drawing a height there would assert a magnitude the student never gave
   * (ADR-052) — the one thing this product may not do.
   */
  mark?: { from: { x: number; y: number }; foot: { x: number; y: number } };
  /**
   * Is the mark currently DRAWN? (#1118, operator ruling 2026-09-16.)
   *
   * The row and the drawing have separate lifetimes, and that is his ruling: *"once the distance …
   * is asked for and appears in the data panel, it should stay there. just remove the dotted line if
   * asked on the canvas."* The panel is a RECORD of what was asked and answered; the canvas is a
   * VIEW, and a student clearing the figure to see it is not withdrawing the question.
   *
   * Absent means drawn — a freshly asked measurement shows itself.
   */
  shown?: boolean;
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

/**
 * «שיפוע הישר l1» — the third thing the operator named for a line (#1048).
 *
 * A slope is shown in the data panel already, but could not be ASKED for, so the click menu had
 * nothing to put behind the option he described. One grammar, two surfaces — the rule the crossings
 * and the ask lane already follow.
 */
const SLOPE_OF = /^(?:ה?שיפוע|[Tt]he\s+slope\s+of)\s+(?:של\s+)?(?:ה?(?:ישר|קטע|צלע)\s+)?(.+)$/;

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
    // Understood perfectly; the figure simply has no such point (#1111).
    if (!o) return { question, value: null, missing: { name: text, kind: 'point' } };
    const kx = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === text)?.x ?? null);
    const ky = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === text)?.y ?? null);
    return {
      question,
      value: kx.known && ky.known ? `(${fmt(kx.value)}, ${fmt(ky.value)})` : null,
    };
  }

  /**
   * --- a line, by name: its SLOPE (#1048) ---
   *
   * Before the equation rule, because «שיפוע הישר l1» and «משוואת הישר l1» are different
   * questions about the same object and only the leading noun separates them.
   */
  const sl = SLOPE_OF.exec(text);
  if (sl) {
    const name = sl[1].trim();
    const line = lineNamed(d.figure, name);
    if (!line) return { question, value: null, missing: { name, kind: 'curve' } };
    // A vertical line HAS no slope, and that is an answer about the figure rather than a failure.
    if (Math.abs(line.b) < 1e-12) return { question, value: null };
    const k = isKnowledge(d.construction, (f) => {
      const l = lineNamed(f, name);
      return l && Math.abs(l.b) > 1e-12 ? -l.a / l.b : null;
    });
    return { question, value: k.known ? fmt(k.value) : null };
  }

  // --- a curve, by name: its equation ---
  const eq = EQUATION_OF.exec(text);
  if (eq) {
    const name = eq[1].trim();
    const curve = d.construction.objects.find(
      (o) => o.kind === 'curve' && (o.label.name === name || o.id === `line-${name}` || o.id === `circle-${name}`),
    );
    if (!curve) return { question, value: null, missing: { name, kind: 'curve' } };
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
    .flatMap((t) => (t.kind === 'area' ? t.ids : t.kind === 'point-line' ? [t.p] : [t.a, t.b]))
    .find((id: Id) => !objectById(d.construction, id));
  if (missing !== undefined) return { question, value: null, missing: { name: missing, kind: 'point' } };

  const k = isKnowledge(d.construction, (f) =>
    evalLengthExpr(
      measure,
      (id) => f.points.find((q) => q.id === id) ?? null,
      f.env,
      // The NAMED line this configuration drew (#1048) — see `lineNamed`.
      (nm) => lineNamed(f, nm),
    ),
  );
  /**
   * A PLAIN DISTANCE gets its formula (#1053).
   *
   * Only a single bare length — «AB». A compound expression like «AB + 2·CD» is arithmetic the
   * student assembled, not one named move, and the technique table has nothing honest to say about
   * it. The trace explains a row; it does not narrate a calculation.
   */
  const one = measure.terms.length === 1 ? measure.terms[0] : null;
  const plain = one && one.kind !== 'area' && one.kind !== 'point-line' ? one : null;
  let trace: string | undefined;
  let mark: Answer['mark'];
  /**
   * THE POINT-TO-LINE DISTANCE now has a surface, so it gets its technique entry (#1048 completing
   * #1053's third move). ADR-AG-062 deliberately left it unauthored while nothing could ask for it.
   */
  if (one?.kind === 'point-line' && k.known && POINT_LINE_ONLY.test(text)) {
    const pt = d.figure.points.find((q) => q.id === one.p);
    const l = lineNamed(d.figure, one.line);
    if (pt && l) {
      trace = tracePointLine(pt, l, one.line, fmt);
      /**
       * The FOOT of the perpendicular, from the same line the distance was measured against — so the
       * drawing and the number cannot disagree. `t` is the signed offset along the unit normal:
       * `foot = p − n·(a·x₀ + b·y₀ + c)/(a² + b²)`.
       */
      const n2 = l.a * l.a + l.b * l.b;
      if (n2 > 1e-12) {
        const t = (l.a * pt.x + l.b * pt.y + l.c) / n2;
        mark = { from: { x: pt.x, y: pt.y }, foot: { x: pt.x - l.a * t, y: pt.y - l.b * t } };
      }
    }
  }
  // BARE_LENGTH, not "one term": «AB + AB» also folds to one term but is 2·AB, and a formula for the
  // distance would then be explaining something the student did not ask for.
  if (plain && k.known && BARE_LENGTH.test(text)) {
    const a = d.figure.points.find((q) => q.id === plain.a);
    const b = d.figure.points.find((q) => q.id === plain.b);
    if (a && b) trace = traceDistance2pt(a, b, fmt);
  }
  return {
    question,
    value: k.known ? fmt(k.value) : null,
    ...(trace ? { trace } : {}),
    ...(mark ? { mark } : {}),
  };
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
