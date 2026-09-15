/**
 * Lines → figure, in one place.
 *
 * The composition `parse → fold → evaluate` is the product's whole derivation, and it is written
 * once so that the app, the tests and (later) the save/load path all take the same route. A line
 * that fails is reported with its own index and its own words — never dropped, and never blamed on
 * a different line (the honesty invariant: an error message names the conflicting STATEMENT).
 */
import { fold, type ApplyError } from './apply';
import { reportedDof } from './carriers';
import { evaluate, viewBox, type Figure } from './evaluate';
import type { Box } from './curves';
import { parseLine, type ParseFailure } from '../parser/parseAnalytic';
import { EMPTY_CONSTRUCTION, type Construction, type Fact } from './types';

/** What went wrong with one line — a parse refusal or an apply refusal, with the line's own text. */
export interface LineFault {
  index: number;
  code: ParseFailure['code'] | ApplyError['code'];
  detail: string;
  /** For a name clash: what the name already holds, as a token the locale renders (#1046). */
  existing?: ApplyError['existing'];
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

  /** Which line stated each constraint, so an unsatisfiable one is blamed on the right words. */
  const constraintLine = new Map<string, number>();
  facts.forEach((f, i) => {
    if (f.t === 'constraint') {
      const key = JSON.stringify(f.k);
      if (!constraintLine.has(key)) constraintLine.set(key, owner[i]);
    }
  });

  const { construction, errors, effects } = fold(facts);
  errors.forEach((e, i) => {
    if (e) faults.push({ index: owner[i], code: e.code, detail: e.detail, existing: e.existing });
  });

  /**
   * A selector chooses among configurations, so a configuration that fails one is not a
   * contradiction — it is the wrong draw. Advance the seed until one holds, exactly as the sibling's
   * `firstSatisfyingSeed` does ([ADR-098](../../docs/06-decisions.md#adr-098)), and give up after a
   * bounded search rather than spinning: if «החלק החיובי» can never hold, that IS worth reporting.
   */
  let figure = evaluate(construction, seed);
  for (let extra = 1; extra <= 24 && !figure.selectorsOk; extra += 1) {
    const candidate = evaluate(construction, seed + extra);
    if (candidate.selectorsOk) figure = candidate;
  }

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
   * A constraint the solve could not meet is a FAULT, blamed on the line that stated it — the
   * figure is never shown as though it satisfied a given it does not
   * ([02c](../../docs/02c-requirements-analytic.md) honesty invariants).
   */
  for (const k of figure.unsatisfied) {
    const owner = constraintLine.get(JSON.stringify(k));
    if (owner === undefined) continue;
    faults.push({ index: owner, code: 'unsatisfiable', detail: lines[owner] });
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
  // refusal — the same rule `owner` already encodes for apply errors. A `param` fact has no id.
  const lineOf = new Map<string, number>();
  facts.forEach((f, i) => {
    if (f.t !== 'param' && f.t !== 'constraint' && f.t !== 'selector' && f.t !== 'declare' && !lineOf.has(f.id)) lineOf.set(f.id, owner[i]);
  });
  for (const v of figure.vacant) {
    if (v.reason === 'vacant') continue;
    const index = lineOf.get(v.id);
    if (index === undefined) continue; // no line owns it — nothing honest to say about it
    faults.push({ index, code: 'out-of-scope', detail: lines[index] });
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

  return { construction, figure, box: viewBox(figure), faults, outcomes };
}

export const EMPTY_DERIVATION: Derivation = {
  construction: EMPTY_CONSTRUCTION,
  figure: { env: {}, points: [], curves: [], segments: [], construction: [], vacant: [], unsatisfied: [], selectorsOk: true, carrierDof: 0, provenance: {} },
  box: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
  faults: [],
  outcomes: [],
};
