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
import { isKnowledge, knownCurve, knownOptions, type Figure } from '../engine/evaluate';
import { locusOf } from '../engine/locus';

import { objectById, type Id } from '../engine/types';
import { traceDistance2pt, traceLine2pt, tracePointLine } from '../engine/techniques';
import { isVerticalLine } from '../engine/lines';
import { asPair, lineNamed } from './lines';
import { curveParts, locusEquation } from './curveText';

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
   * THE FIGURE DETERMINES THE ANSWER, AND THE ANSWER IS THAT THERE IS NONE (#1223).
   *
   * A fourth outcome, and the one `null` was quietly carrying. `value: null` means *the figure does
   * not fix this*, and the component picks its wording from `figureIsOpen` — so on a DETERMINED
   * figure a vertical slope was reported as «לא ניתן לחשב מהנתונים», telling the student their own
   * givens were insufficient when they were complete.
   *
   * Operator, 2026-09-19: *"when i ask for שיפוע PB it says it cannot be claculated which is wrong.
   * its just that the slope is not defined"* — with a screenshot whose panel read
   * «הכול נקבע על-ידי הנתונים» four rows above it.
   *
   * A TOKEN, not a sentence, for the reason ADR-AG-085 gives: this module is the lane's engine and
   * holds no locale. `vertical` is the only member today; the field exists so the next fact-shaped
   * answer joins it rather than collapsing into `null` again (#1227 is already queued behind it).
   *
   * #1205 adds 'lines-cross': two lines that INTERSECT have no single distance between them — it is
   * zero at the crossing and grows without bound away from it. That is a fact about the figure, not a
   * gap in the givens, so it belongs here rather than in `null`. **Operator ruling, 2026-09-19:** asked
   * whether the intersecting case should answer 0 or refuse, he chose refuse-and-explain — the refusal
   * teaches the concept, while 0 lets the misconception stand.
   */
  fact?: 'vertical' | 'lines-cross' | 'points';
  /**
   * THE POINT SET a degenerate locus answers with (#1227, ADR-AG-136): «המקום הגיאומטרי של M» on a
   * determined M is M's position, or its finite set of positions — one entry per resolution-aware
   * option (#1259). Present exactly when `fact === 'points'`; the component words the count.
   */
  points?: { x: number; y: number }[];
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
   * THE מקום גיאומטרי — the traced curve, in WORLD coordinates, for the canvas (#1137).
   *
   * The SECOND ARM of the "draw only when it is knowledge" gate, and it is the inverse of `mark`
   * above, not an exception to it. That gate exists because drawing a distance on an under-determined
   * figure would assert a magnitude the student never gave. A locus is honest **precisely because**
   * the figure is under-determined: it draws every position the point can take rather than one. The
   * gate as written would have suppressed the trace on exactly the figures it exists for, and *"every
   * surface that prints a number is gated, and remembering only one is the recurring failure"* is this
   * tree's own documented trap — so it gets a second arm rather than a bypass (ADR-AG-072 §8).
   *
   * Decoration, like `mark`: no id, no letter, never in the fact list, and an ask never mutates the
   * figure (02c R24).
   */
  locus?: { points: Array<{ x: number; y: number }>; closed: boolean };
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
 * «המקום הגיאומטרי של P» · «locus of P» — the question this whole lane exists for (#1137).
 *
 * The set-former phrasing («המקום הגיאומטרי של כל הנקודות M המקיימות…») is deliberately NOT here:
 * ADR-AG-072 §1 rules it sugar over the same thing, to be added later, not a prerequisite. What this
 * must read is the question a student asks ABOUT a point they have already stated.
 */
/**
 * BOTH SPELLINGS OF «גיאומטרי», because both are how it is written (#1210).
 *
 * Operator: «המקום הגאומטרי של M» returned «לא הבנתי את השאלה» while «המקום הגיאומטרי» worked. The
 * yud is optional in Hebrew orthography — *ktiv male* «גיאומטרי» and *ktiv haser* «גאומטרי** are the
 * same word, and a student who omits it has not made a mistake. Refusing one of them teaches a
 * spelling rather than answering a question, which is the defect #1156/#1183 named.
 *
 * `י?` rather than a second alternation: one character, at the one place they differ.
 *
 * THE EXAM'S OWN PHRASING IS «משוואת המקום הגיאומטרי של B» (#1301, ADR-AG-141).
 *
 * Operator, 2026-09-20: *"when i write משוואת המקום הגיאומטרי של A i get not determined"* — measured,
 * it was worse than that: this pattern admitted no lead-in at all, so `EQUATION_OF` below (whose noun
 * group is optional) swallowed «המקום הגיאומטרי של B» as a curve NAME and the tool answered «אין
 * בשרטוט ישר או מעגל בשם המקום הגיאומטרי של B» — the student's whole question repeated back as the
 * name of a line they forgot to draw. Exactly one spelling worked, and it was not the exam's.
 *
 * The locus row already answers with an EQUATION when it knows one, so «המקום הגיאומטרי של B» and
 * «משוואת המקום הגיאומטרי של B» are one question, not two. The lead-ins are admitted INTO this pattern
 * — no second branch, no pre-stripping — so the spellings share one code path (ADR-W-053), and they
 * are ENUMERATED, never `.*`: the imperative/interrogative openers a student writes («מצא את»,
 * «מצאי את», «חשב את», «מהו», «מה הוא», «מהי», «find», «what is»), then the equation-of prefix. This
 * pattern sits ABOVE `EQUATION_OF` and must stay there; the anti-widening lock in
 * `issue-1301-locus-question-spellings.test.ts` is what makes the greedier pattern safe.
 */
const LOCUS_OF =
  /^(?:(?:מצא(?:י|ו)?|חשב(?:י|ו)?)\s+את\s+|מה(?:ו|י)\s+|מה\s+ה(?:וא|יא)\s+|[Ff]ind\s+|[Ww]hat\s+is\s+)?(?:(?:ה?משוואת|[Tt]he\s+equation\s+of|[Ee]quation\s+of)\s+)?(?:ה?מקום\s+ה?גי?אומטרי|[Tt]he\s+locus|[Ll]ocus)\s+(?:של\s+|of\s+)?(?:ה?נקודה\s+)?(.+)$/;

/**
 * Answer one question against the figure the student has built.
 *
 * `fmt` is injected rather than imported: it is the CALLER's precision, and an answer row must read
 * exactly as the inventory rows above it do. A second formatter here is how two surfaces of one panel
 * start disagreeing.
 *
 * The curve text was injected for the same reason until #1212 moved it INTO this layer. Injection had
 * a cost the reasoning missed: every test but one passed a stub (`() => ''`), so the equation an
 * answer gives was never actually asserted through `ask`. Importing it makes the shared formatting a
 * fact rather than a convention the callers have to keep.
 */
/**
 * The signature after #1212 met #1137.
 *
 * `describeCurve` is GONE, not dropped: #1212 moved curve text into `app/curveText.ts`, which this
 * module can simply import — and its argument for doing so was that injection let every test pass a
 * stub, so the lock could never assert what an answer actually said.
 *
 * `kindWord` stays injected, because it is pure LOCALE and this module holds none (ADR-AG-085). It
 * maps a resolved curve kind to the student's noun — «מעגל», «ישר». Defaulting to the internal kind
 * means a caller that forgets shows `circle` rather than «מעגל»: visibly wrong rather than silently
 * absent, which is the direction this tree prefers to fail in.
 */
export function ask(
  d: Derivation,
  question: string,
  fmt: (v: number) => string,
  kindWord: (kind: NonNullable<ReturnType<typeof knownCurve>>['kind']) => string = (k) => k,
): Answer {
  const text = question.trim();
  if (!text) return { question, value: null, unreadable: true };

  /**
   * --- «המקום הגיאומטרי של P» — the locus lane (#1137) ---
   *
   * BEFORE the point rule, because «P» and «המקום הגיאומטרי של P» are different questions about the
   * same point and only the leading phrase separates them — the same ordering `SLOPE_OF` needs against
   * `EQUATION_OF`, for the same reason.
   *
   * There is NO locus grammar in the construction lane, and that is ADR-AG-072 §1: the student states
   * the point and its property with sentences the tool already has, and the locus falls out of the
   * DOF. This phrase is a QUESTION, which is why it lives here.
   */
  const loc = LOCUS_OF.exec(text);
  if (loc) {
    const name = loc[1].trim();
    const o = objectById(d.construction, name);
    if (!o) return { question, value: null, missing: { name, kind: 'point' } };
    /**
     * TRACED AT THE CONFIGURATION BEING SHOWN (#1176), not at a fixed pair.
     *
     * This read `[0, 1]`, hardcoded, while the figure sits at the session's seed — so from the first
     * press of «הציגו תצורה אחרת» the drawn locus belonged to a different configuration. On a
     * parameterised figure that means **the canvas drawing a curve that does not contain the point it
     * claims to be the locus of**, which is the one thing this product may not do. Measured on
     * «A(-9a,0)» «B(41a,0)»: the traced circle was identical at every seed (centre ≈ (55, 0), r ≈ 86.4)
     * while `P` moved with `a`, ending 36 units off it.
     *
     * The SECOND seed is what the determinacy gate compares sets against, so it stays a second
     * *different* configuration — `seed + 1` rather than a constant, or the comparison would drift
     * back to describing a figure nobody is looking at.
     */
    const res = locusOf(d.construction, name, [d.seed, d.seed + 1], d.box);
    if (!res || !res.shape) {
      /**
       * A DETERMINED POINT'S LOCUS IS THAT POINT, OR THAT FINITE SET (#1227, ADR-AG-136).
       *
       * Operator, 2026-09-19: *"saying M cannot be calculated is wrong … refer to the location of
       * point M"*. «M» on `x = 4` with |MA| = 5 has no curve for a locus because it has exactly two
       * positions — and the tool held both in `knownOptions` while answering «לא ניתן לחשב מהנתונים».
       * That is #1223's false absence on a second surface, so it takes the same `fact` seam #1223 built:
       * the answer is a FACT about the figure, carried as the point set for the component to word.
       *
       * The count is the resolution-aware set's (#1259), never a sample length: at a tangency the solves
       * cluster inside the solver's resolution and `knownOptions` answers "not a set", so the single
       * point comes from the knowledge gate — which is what makes the tangential figure answer ONE
       * point rather than six. A point the gate cannot fix on either coordinate falls through to the
       * lane's own `value: null`, which the component words as open or uncomputable as before.
       */
      const readPt = (f: Figure) => {
        const p = f.points.find((q) => q.id === name);
        return p ? [p.x, p.y] : null;
      };
      const set = knownOptions(d.construction, readPt);
      if (set) return { question, value: null, fact: 'points', points: set.map(([x, y]) => ({ x, y })) };
      const kx = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === name)?.x ?? null);
      const ky = isKnowledge(d.construction, (f) => f.points.find((q) => q.id === name)?.y ?? null);
      if (kx.known && ky.known) return { question, value: null, fact: 'points', points: [{ x: kx.value, y: ky.value }] };
      // No locus is a TRUE answer about the figure, not a failure to understand: the point's freedom is
      // not a curve, or the figure is still open. `value: null` is the lane's own way of saying «the
      // figure does not determine this», and it is the honest one here too.
      return { question, value: null };
    }
    const eq = locusEquation(res.shape, fmt);
    return {
      question,
      // The KIND always; the EQUATION only when the two configurations agreed on it (ADR-AG-072 §4,
      // §5). «מעגל» on its own is a complete, true answer — and it is what חורף 25 actually asks for.
      value: eq ? `${kindWord(res.shape.curve.kind)} · ${eq}` : kindWord(res.shape.curve.kind),
      locus: { points: res.trace.points, closed: res.trace.closed },
    };
  }

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
    /**
     * A vertical line HAS no slope, and that is an answer about the figure rather than a failure.
     *
     * The comment said exactly this before #1223 and the return contradicted it: `value: null` is the
     * failure channel, so the row read «לא ניתן לחשב מהנתונים» — *your givens are insufficient* — on a
     * figure where every point is fixed. `fact: 'vertical'` is the outcome the sentence always meant.
     */
    // #1276: relatively, through the one shared answer — `|b| < 1e-12` called a solved vertical line
    // NOT vertical (its `b` carries the solver's residual) and answered with a slope of a billion.
    if (isVerticalLine(line.a, line.b)) return { question, value: null, fact: 'vertical' };
  const k = isKnowledge(d.construction, (f) => {
      const l = lineNamed(f, name);
      return l && !isVerticalLine(l.a, l.b) ? -l.a / l.b : null;
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
    /**
     * A LINE THROUGH TWO POINTS IS A LINE TO THIS QUESTION TOO (#1148).
     *
     * It was not, and that was the whole defect: on «משולש ABC» the figure holds no curve object for
     * `AB`, so this branch reported the name MISSING while «שיפוע AB» answered `0` and «AB» answered
     * `6` — three resolvers, one of which could not see what the other two could.
     *
     * It now resolves through `lineNamed`, the same path the slope branch and the measure grammar
     * use, so the three cannot disagree again. The honesty gate comes with it in the shape that
     * branch already uses: an equation is printed only when the coefficients are the SAME in every
     * configuration (ADR-052). An under-determined line stays open — it does not get one sampled
     * configuration's equation printed as though it were the answer.
     */
    if (!curve) {
      const here = lineNamed(d.figure, name);
      if (!here) return { question, value: null, missing: { name, kind: 'curve' } };
      const ka = isKnowledge(d.construction, (f) => lineNamed(f, name)?.a ?? null);
      const kb = isKnowledge(d.construction, (f) => lineNamed(f, name)?.b ?? null);
      const kc = isKnowledge(d.construction, (f) => lineNamed(f, name)?.c ?? null);
      const known = ka.known && kb.known && kc.known;
      const pair = asPair(name);
      let trace: string | undefined;
      if (known && pair) {
        const a0 = d.figure.points.find((q) => q.id === pair[0]);
        const b0 = d.figure.points.find((q) => q.id === pair[1]);
        if (a0 && b0) trace = traceLine2pt(a0, b0, fmt);
      }
      return {
        question,
        value: known ? curveParts({ kind: 'line', a: ka.value, b: kb.value, c: kc.value }).equation : null,
        ...(trace ? { trace } : {}),
      };
    }
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
    const pair = asPair(name);
    if (pair && known?.kind === 'line') {
      const a0 = d.figure.points.find((q) => q.id === pair[0]);
      const b0 = d.figure.points.find((q) => q.id === pair[1]);
      if (a0 && b0) trace = traceLine2pt(a0, b0, fmt);
    }
    return {
      question,
      value: known ? curveParts(known).equation : null,
      ...(trace && known ? { trace } : {}),
    };
  }

  // --- anything else: a measure expression, through the one grammar ---
  const measure = parseLengthExpr(text);
  if (!measure) return { question, value: null, unreadable: true };
  /**
   * EVERY operand must resolve — including the LINE (#1151).
   *
   * Only the points were checked, so «המרחק בין C ל-QR» on a figure with no `QR` answered `null`:
   * «לא ניתן לחשב מהנתונים» — a statement ABOUT the figure, for a question naming something the
   * figure has not got. #1111 built the missing-object message for exactly this, and one operand
   * was walking past it.
   */
  const missingPoint = measure.terms
    // #1205: a line-line term names no POINT — both its operands are lines, checked just below.
    .flatMap((t) => (t.kind === 'area' ? t.ids : t.kind === 'point-line' ? [t.p] : t.kind === 'line-line' ? [] : [t.a, t.b]))
    .find((id: Id) => !objectById(d.construction, id));
  if (missingPoint !== undefined)
    return { question, value: null, missing: { name: missingPoint, kind: 'point' } };
  const missingLine = measure.terms
    .flatMap((t) => (t.kind === 'point-line' ? [t.line] : t.kind === 'line-line' ? [t.u, t.v] : []))
    .find((name) => !lineNamed(d.figure, name));
  if (missingLine !== undefined) return { question, value: null, missing: { name: missingLine, kind: 'curve' } };

    /**
   * TWO LINES THAT CROSS HAVE NO SINGLE DISTANCE (#1205).
   *
   * Asked BEFORE the knowledge gate, because this is not a gap in the givens that more information
   * would close — it is a fact about the figure, true at every configuration where the two lines are
   * not parallel. Left to fall through it reaches «לא ניתן לחשב מהנתונים», which tells the student their
   * own givens are insufficient when the question simply has no single answer — #1223’s lesson, on a
   * second surface.
   *
   * Judged on the NORMALISED cross term — the sine of the angle between the two lines — never a raw
   * determinant, which carries their coefficient magnitudes and is a threshold on nothing
   * (ADR-AG-021; ADR-AG-130 one module over, for the same reason).
   */
  const crossing = measure.terms.find((t) => {
    if (t.kind !== 'line-line') return false;
    const lu = lineNamed(d.figure, t.u);
    const lv = lineNamed(d.figure, t.v);
    if (!lu || !lv) return false;
    const nu = Math.hypot(lu.a, lu.b);
    const nv = Math.hypot(lv.a, lv.b);
    if (nu < 1e-12 || nv < 1e-12) return false;
    return Math.abs(lu.a * lv.b - lv.a * lu.b) / (nu * nv) > 1e-6;
  });
  if (crossing) return { question, value: null, fact: 'lines-cross' };


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
  const plain = one && one.kind !== 'area' && one.kind !== 'point-line' && one.kind !== 'line-line' ? one : null;
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
