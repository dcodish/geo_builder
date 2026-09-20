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

/** What went wrong with one line — a parse refusal or an apply refusal, with the line's own text. */
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
   * THERE IS DELIBERATELY NO RING-FAULT ARM HERE — see [#1170](https://github.com/dcodish/geo_builder/issues/1170).
   *
   * `figure.ringFaults` says a declared polygon is drawn as a ring its noun does not promise
   * (#1158, #1166). `drawableAt` uses it to CHOOSE a configuration, which is what fixed both reported
   * bugs. Reporting the leftovers here was the plan's second arm, and it was built, measured and
   * withdrawn: with the choice in place, every figure it fires on has **`reportedDof = 0`** — the
   * student pinned the coordinates, and those coordinates are what make the ring crossed or
   * collapsed. There is no configuration search to have failed, so
   * «לא נמצאה תצורה שבה מתקיים» would not even be a true sentence about such a figure.
   *
   * Both obvious gates are argued against in this file already: gating on `reportedDof === 0` is
   * exactly the three `derived.test.ts` locks that encode ADR-AG-008's `does-not-exist` answer, and
   * gating on `reportedDof > 0` is what the selector arm above refuses to do, for #1071's reason —
   * with freedom left, 24 exhausted seeds are evidence and not proof. #1166 foresaw this case and
   * ruled it *"out of scope here"*; #1170 carries the ruling it needs.
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
