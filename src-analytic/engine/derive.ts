/**
 * Lines → figure, in one place.
 *
 * The composition `parse → fold → evaluate` is the product's whole derivation, and it is written
 * once so that the app, the tests and (later) the save/load path all take the same route. A line
 * that fails is reported with its own index and its own words — never dropped, and never blamed on
 * a different line (the honesty invariant: an error message names the conflicting STATEMENT).
 */
import { fold, existingKindOf, type ApplyError } from './apply';
import { reportedDof } from './carriers';
import { drawableAt, viewBox, type Figure } from './evaluate';
import type { Box } from './curves';
import { parseLine, type ParseFailure } from '../parser/parseAnalytic';
import { EMPTY_CONSTRUCTION, namesObject, objectById, type Construction, type Fact } from './types';
import { SOLVE_TOL } from './solve';

/** What went wrong with one line — a parse refusal or an apply refusal, with the line's own text. */
/** The point ids an incidence constraint is ABOUT — how a crossing is recognised (#1254). */
function incidenceIds(k: { t: string; id?: string }): string[] {
  return k.t === 'on-line-2pt' || k.t === 'on-curve' || k.t === 'on-line' ? [k.id ?? ''] : [];
}

export interface LineFault {
  index: number;
  code: ParseFailure['code'] | ApplyError['code'];
  detail: string;
  /** For a name clash: what the name already holds, as a token the locale renders (#1046). */
  existing?: ApplyError['existing'];
  /** For an unknown reference: what KIND was expected, so the message uses the right noun (#1179). */
  expected?: ApplyError['expected'];
  /** For a second naming: WHO already holds the position, so the refusal shows it (#1153). */
  holder?: ApplyError['holder'];
}

/**
 * What one LINE did — the per-line rollup of `applyFact`'s per-fact effect (#1045).
 *
 * A line can lower to several facts («AD תיכון לצלע BC» is four), so the rollup is deliberately
 * generous: the line COUNTS as contributing if any one of its facts created or narrowed something.
 * Only a line whose every fact was already known is `known`, which is the only case where dropping
 * the row is honest.
 */
export type LineOutcome = 'created' | 'known' | 'narrowed' | 'faulted';

export interface Derivation {
  construction: Construction;
  figure: Figure;
  box: Box;
  /**
   * WHICH CONFIGURATION THIS IS (#1176).
   *
   * A derivation is always OF a seed — the figure, the panel and every gate describe one
   * configuration — and not carrying it is what let the locus lane diverge from the canvas: `ask`
   * had no way to know which configuration it was answering about, so it traced at a hardcoded pair
   * and drew a curve belonging to a different value of the figure's free parameter.
   *
   * Carried rather than re-derived, so a consumer cannot disagree with its own figure by construction.
   */
  seed: number;
  /** One entry per failing line. An empty array means every line landed. */
  faults: LineFault[];
  /** One entry per input line, positionally — what that line actually did. */
  outcomes: LineOutcome[];
}

export function derive(lines: readonly string[], seed = 0): Derivation {
  const facts: Fact[] = [];
  const faults: LineFault[] = [];
  /** Which line produced each fact, so an apply refusal can be blamed on the right one. */
  const owner: number[] = [];

  lines.forEach((line, index) => {
    const r = parseLine(line);
    if (!r.ok) {
      faults.push({ index, code: r.code, detail: r.detail });
      return;
    }
    for (const f of r.facts) {
      facts.push(f);
      owner.push(index);
    }
  });

  const { construction, errors, effects, constraintFact } = fold(facts);
  errors.forEach((e, i) => {
    if (e) faults.push({ index: owner[i], code: e.code, detail: e.detail, existing: e.existing, expected: e.expected, holder: e.holder });
  });

  /**
   * A selector chooses among configurations, so a configuration that fails one is not a
   * contradiction — it is the wrong draw. Advance the seed until one holds, exactly as the sibling's
   * `firstSatisfyingSeed` does ([ADR-098](../../docs/06-decisions.md#adr-098)), and give up after a
   * bounded search rather than spinning: if «החלק החיובי» can never hold, that IS worth reporting.
   */
  /**
   * The figure SHOWN is the one the gates judge (#1083).
   *
   * This loop and `isKnowledge` used to advance the seed by different rules, so the panel could
   * report on a configuration the canvas never drew. One sampler now answers both — and it also
   * prefers a configuration in which every object the student NAMED exists, which is the half the
   * operator found: «אלכסוני המרובע נפגשים בנקודה O» has no `O` when the diagonals cross only when
   * extended, and drawing that figure while another has the point is a poor choice rather than an
   * honest one.
   */
  let figure = drawableAt(construction, seed);

  /**
   * A selector that can NEVER hold is reported — the docblock above has always said so, and nothing
   * did it (#1069).
   *
   * «D על הצלע BC» with «BD = 18» on a 10-unit side is impossible: `D` lands beyond `C`, the
   * betweenness selector is false, and the figure was drawn anyway with `D` outside the side the
   * student named. That is a figure contradicting its own givens, which is the one thing this product
   * may not do.
   *
   * The predicate is #1058's: **a figure with no freedom left has no other configuration to try**, so
   * a failing selector there is a permanent fact rather than an unlucky seed. When the figure still
   * has freedom, 24 exhausted seeds are evidence and not proof — reporting then could refuse a
   * satisfiable figure, which is the opposite defect. That half is
   * [#1071](https://github.com/dcodish/geo_builder/issues/1071)'s measurement question and is
   * deliberately left alone here.
   */
  if (!figure.selectorsOk && reportedDof(construction, figure.carrierDof) === 0) {
    const blamed = new Set<number>();
    facts.forEach((f, i) => {
      if (f.t === 'selector') blamed.add(owner[i]);
    });
    for (const index of blamed) {
      faults.push({ index, code: 'unsatisfiable', detail: lines[index] });
    }
  }

  /**
   * THE RING-FAULT ARM IS FURTHER DOWN, after the vacancy loop — see
   * [#1170](https://github.com/dcodish/geo_builder/issues/1170) and ADR-AG-129.
   *
   * It cannot run here. Its one hard requirement is that a line already carrying a truer message
   * does not get a second one, and the messages it must not double — `does-not-exist` above all —
   * are pushed below this point.
   */

  /**
   * A constraint the solve could not meet is a FAULT, blamed on the line that stated it — the
   * figure is never shown as though it satisfied a given it does not
   * ([02c](../../docs/02c-requirements-analytic.md) honesty invariants).
   */
  for (const k of figure.unsatisfied) {
    /**
     * Which constraint IS this, in the construction (#1079)?
     *
     * By identity, because `evaluate` reports the very objects it measured. A CHOICE is the one
     * exception: what it measures is the OPTION the seed selected, which is not itself in the
     * list, so the choice holding it is what carries the blame — and that is right, because the
     * line the student wrote is the one that opened the choice.
     */
    let at = construction.constraints.indexOf(k);
    if (at < 0) {
      at = construction.constraints.findIndex(
        (c) => c.t === 'choice' && c.options.includes(k),
      );
    }
    const fact = at >= 0 ? constraintFact[at] : undefined;
    const line = fact === undefined ? undefined : owner[fact];
    if (line === undefined) continue;
    faults.push({ index: line, code: 'unsatisfiable', detail: lines[line] });
  }

  /**
   * The third place a line can fail (#896): it parsed, it applied, and only at EVALUATION did the
   * conic classifier find it outside the product's scope — a rotated conic, a translated one, a
   * hyperbola. `src-analytic/CLAUDE.md` states the contract ("refuses each by name"), and until
   * this ran the refusal was computed and discarded: the line committed, drew nothing and said
   * nothing, which is a stated given vanishing.
   *
   * A `vacant` reason is deliberately NOT a fault. An empty circle at this parameter value is the
   * documented "not at this value", and reporting it as a refusal would be the opposite defect.
   */
  // First writer wins: if two lines name the same object, the one that introduced it owns the
  // refusal — the same rule `owner` already encodes for apply errors. Which facts NAME an object is
  // `namesObject`, one positive list rather than a second copy of the exclusions (#1049).
  const lineOf = new Map<string, number>();
  facts.forEach((f, i) => {
    if (namesObject(f) && !lineOf.has(f.id)) lineOf.set(f.id, owner[i]);
  });
  /**
   * VACANCY NEEDS A PREDICATE (#1058).
   *
   * [ADR-AG-008](../../docs/06c-decisions-analytic.md#adr-ag-008) rules that a degenerate
   * configuration is vacant and **never a fault**: an empty circle at this parameter value is "not at
   * this value", and reporting it as a refusal would be the opposite defect. That is right — and it is
   * a statement about a figure that still has FREEDOM LEFT. "Not at this value" presupposes there are
   * other values.
   *
   * A fully determined figure has none. «מפגש האלכסונים» on a concave quadrilateral is absent at every
   * seed, because there is only one configuration and the diagonals do not cross in it. Staying silent
   * there tells the student nothing about a point they named, and «הציגו תצורה אחרת» can never help.
   *
   * So the distinction keeps its rule and gains its predicate: **silent while the figure can still
   * move, reported once it cannot.** The class is wider than the diagonals — three collinear points
   * have no circumcentre, for ever, and behaved the same way.
   */
  const freedom = reportedDof(construction, figure.carrierDof);

  /**
   * A NAMED CROSSING THAT IS A POINT THE FIGURE ALREADY HAS (#1254, the operator’s T18 ruling).
   *
   * *"if P and B must be on the same location … it should be refused. The only case where P and B can
   * fall [together] is if one of them has a degree of freedom … even if they do fall on the same point
   * by chance … the system should not show them on top of each other."*
   *
   * [#1175](https://github.com/dcodish/geo_builder/issues/1175) answered the STRUCTURAL member — two
   * lines named by two points each that share a written letter meet at that letter, whatever the
   * configuration — and pre-declared the positional one an escalation rather than an expansion. This
   * is that escalation, ruled: «P נקודת החיתוך של הישר AB עם הישר CD» on his own figure put P exactly on
   * B, with `faults: []`, and the sheet used that very figure as its CONTROL.
   *
   * **The freedom predicate is the vacancy pass’s, for the same reason** (right above): silent while
   * the figure can still move — another configuration may separate them, and #1273 is what will prefer
   * it — reported once it cannot. That is the ruling’s own two branches, and it is why this sits here
   * rather than in the parser: whether a coincidence is FORCED is a question about the figure.
   *
   * Scoped to a point a sentence CROSSED into being — two incidences and a declaration. A midpoint or
   * a foot landing on an existing point is the same family and is deliberately left for the wider
   * ruling; refusing them here would reach past what was measured.
   */
  if (freedom === 0) {
    const xs = figure.points.map((q) => q.x);
    const ys = figure.points.map((q) => q.y);
    const span = Math.max(1e-9, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    // Relative to the figure (ADR-AG-021), with a floor tied to the SOLVE's own tolerance rather than
    // an arbitrary small number: a figure whose points all sit at the origin has no span, and the
    // solver leaves its crossing ~1e-9 away from the point it coincides with. #1276 is the same lesson
    // — an absolute threshold below the residual the solver actually leaves behind decides nothing.
    const near = Math.max(span * 1e-6, SOLVE_TOL * 10);
    // Counted off the CONSTRAINTS, not the objects: a crossing is `declare`d and does not carry the
    // `point` kind, which is what made a first version of this check find nothing at all.
    const incidences = new Map<string, number>();
    for (const k of construction.constraints)
      for (const id of incidenceIds(k)) incidences.set(id, (incidences.get(id) ?? 0) + 1);
    const crossed = new Set([...incidences].filter(([, n]) => n >= 2).map(([id]) => id));
    // A CROSSING is `declare`d, which `namesObject` does not cover — so `lineOf`, built for naming
    // facts, has no entry for it. The owning line is read here rather than by widening that map, whose
    // shape the vacancy pass below depends on.
    const declaredOn = new Map<string, number>();
    facts.forEach((f, i) => {
      const t = (f as { t: string }).t;
      const id = (f as { id?: string }).id;
      if (t === 'declare' && id && !declaredOn.has(id)) declaredOn.set(id, owner[i]);
    });
    const ownerLine = (id: string) => declaredOn.get(id) ?? lineOf.get(id);
    for (const pt of figure.points) {
      if (!crossed.has(pt.id)) continue;
      const index = ownerLine(pt.id);
      if (index === undefined) continue;
      const holder = figure.points.find((q) => {
        if (q.id === pt.id) return false;
        const qi = ownerLine(q.id);
        if (qi !== undefined && qi > index) return false; // only a point that was ALREADY there
        return Math.hypot(q.x - pt.x, q.y - pt.y) < near;
      });
      if (holder) faults.push({ index, code: 'crossing-already-named', detail: lines[index], holder: holder.id });
    }
  }
  for (const v of figure.vacant) {
    const index = lineOf.get(v.id);
    if (index === undefined) continue; // no line owns it — nothing honest to say about it
    if (v.reason !== 'vacant') {
      faults.push({ index, code: 'out-of-scope', detail: lines[index] });
      continue;
    }
    if (freedom > 0) continue; // another configuration may yet have it
    const o = objectById(construction, v.id);
    faults.push({
      index,
      code: 'does-not-exist',
      detail: lines[index],
      existing: o ? existingKindOf(o) : undefined,
    });
  }

  /**
   * A SHAPE NOUN PROMISES A RING, AND THESE PINNED POINTS ARE NOT THAT RING (#1170, ADR-AG-129).
   *
   * **Operator ruling, 2026-09-17: refuse the line.** He hit it by accident playing round #1169 —
   * typed `D(1,0)` instead of the sheet’s `D(0,4)`, which put `D` on segment `AB`, and reported
   * *"a quad should have been rejected for this case"* without knowing he was looking at a known
   * gap. He was offered draw-with-a-notice and chose the refusal.
   *
   * `ringFaultsOf` has SEEN this since #1158/#1166; `drawableAt` uses it to choose a configuration,
   * which is what fixed both of those. What was missing is the case where there is nothing to
   * choose: every figure this fires on has **`reportedDof = 0`**, because with the preference in the
   * search a figure that still has freedom never arrives here carrying a ring fault. The student
   * pinned the coordinates, and those coordinates are what make the ring collapsed or crossed.
   *
   * That is also why the message is about the RING and not about a failed search:
   * «לא נמצאה תצורה שבה מתקיים» would be false on a determined figure — there was only ever one
   * configuration, and it is the one they described.
   *
   * **Both members, on the ruling’s own reach.** He ruled on a degenerate pinned ring; a crossed one
   * (four pinned points in a bow-tie order) is the same sentence — *a shape noun promises a ring, and
   * these points are not that ring* — and splitting them would leave that half silent for no reason
   * either of us has given.
   *
   * **One message per line, and the truer one wins.** «P מפגש האנכים האמצעיים במשולש ABC» on three
   * collinear points declares the triangle AND asks for its circumcentre, so one line carries both a
   * ring fault and ADR-AG-008’s `does-not-exist`. `does-not-exist` names what the student actually
   * asked for and is the better answer; a second, differently-worded refusal on the same line is
   * noise rather than honesty. This is why the arm runs here, below every other fault: it can see
   * what has already been said.
   */
  if (figure.ringFaults.length > 0 && reportedDof(construction, figure.carrierDof) === 0) {
    /** Which line declared each polygon — the line the refusal belongs on (#1145). */
    const declaredPolygonOn = new Map<string, number>();
    facts.forEach((f, i) => {
      if (f.t === 'polygon' && !declaredPolygonOn.has(f.id)) declaredPolygonOn.set(f.id, owner[i]);
    });
    const alreadyFaulted = new Set(faults.map((f) => f.index));
    for (const rf of figure.ringFaults) {
      const index = declaredPolygonOn.get(rf.id);
      if (index === undefined) continue; // no line owns it — nothing honest to say about it
      if (alreadyFaulted.has(index)) continue;
      alreadyFaulted.add(index);
      faults.push({ index, code: 'ring-contradicts-noun', detail: lines[index] });
    }
  }
  /**
   * Roll the per-FACT effects up to per-LINE outcomes (#1045).
   *
   * A faulted line is faulted whatever else it did. Otherwise the line counts as contributing if
   * any of its facts created or narrowed something, so a multi-fact line («AD תיכון לצלע BC») is
   * never called "already known" on the strength of one of its four facts being a repeat.
   */
  const outcomes: LineOutcome[] = lines.map(() => "known");
  facts.forEach((_, i) => {
    const line = owner[i];
    const e = effects[i];
    if (e === "created" || outcomes[line] === "created") outcomes[line] = "created";
    else if (e === "narrowed") outcomes[line] = "narrowed";
  });
  lines.forEach((_, i) => {
    if (!facts.some((_f, j) => owner[j] === i)) outcomes[i] = "faulted";
  });
  for (const f of faults) outcomes[f.index] = "faulted";

  return { construction, figure, box: viewBox(figure), seed, faults, outcomes };
}

export const EMPTY_DERIVATION: Derivation = {
  construction: EMPTY_CONSTRUCTION,
  figure: { env: {}, points: [], curves: [], segments: [], construction: [], vacant: [], unsatisfied: [], selectorsOk: true, ringFaults: [], carrierDof: 0, provenance: {} },
  box: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
  seed: 0,
  faults: [],
  outcomes: [],
};
